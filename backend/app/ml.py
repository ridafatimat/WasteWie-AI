"""Waste-risk prediction, household training data, and family model retraining."""

from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    balanced_accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sqlalchemy.orm import Session

from .models import HouseholdModel, MLTrainingSample, PantryItem, utc_now
from .services import risk_for


BASE_DIR = Path(__file__).resolve().parents[1]

MODEL_PATH = Path(
    os.getenv(
        "MODEL_PATH",
        str(BASE_DIR / "artifacts" / "waste_risk_model.joblib"),
    )
)

HOUSEHOLD_MODEL_DIR = Path(
    os.getenv(
        "HOUSEHOLD_MODEL_DIR",
        str(BASE_DIR / "artifacts" / "households"),
    )
)

GLOBAL_TRAINING_DATA_PATH = Path(
    os.getenv(
        "GLOBAL_TRAINING_DATA_PATH",
        str(BASE_DIR / "training" / "food_expiry_tracker.csv"),
    )
)

MIN_NEW_OUTCOMES_FOR_TIMED_RETRAIN = int(
    os.getenv("MIN_NEW_OUTCOMES_FOR_TIMED_RETRAIN", "5")
)
IMMEDIATE_RETRAIN_OUTCOMES = int(
    os.getenv("IMMEDIATE_RETRAIN_OUTCOMES", "25")
)
RETRAIN_INTERVAL_DAYS = int(
    os.getenv("RETRAIN_INTERVAL_DAYS", "2")
)
FAMILY_SAMPLE_WEIGHT = float(
    os.getenv("FAMILY_SAMPLE_WEIGHT", "4.0")
)

FEATURE_COLUMNS = [
    "purchase_month",
    "purchase_day_of_week",
    "days_until_expiry",
    "quantity",
    "item_beverage",
    "item_dairy",
    "item_fruit",
    "item_grain",
    "item_meat",
    "item_snack",
    "item_vegetable",
    "storage_freezer",
    "storage_fridge",
    "storage_pantry",
]

CATEGORY_COLUMNS = {
    "beverage",
    "dairy",
    "fruit",
    "grain",
    "meat",
    "snack",
    "vegetable",
}

STORAGE_COLUMNS = {
    "freezer",
    "fridge",
    "pantry",
}


@lru_cache(maxsize=1)
def load_global_model():
    """Load and cache the Kaggle-trained global model artifact."""
    if not MODEL_PATH.exists():
        return None

    try:
        return joblib.load(MODEL_PATH)
    except Exception as exc:
        raise RuntimeError(
            f"Could not load waste-risk model from {MODEL_PATH}"
        ) from exc


@lru_cache(maxsize=128)
def _load_household_model_cached(
    household_id: str,
    artifact_path: str,
    modified_at: float,
):
    del household_id, modified_at
    return joblib.load(artifact_path)


def load_household_model(
    db: Session,
    household_id: str,
):
    """Return the active household artifact, or None when unavailable."""
    state = (
        db.query(HouseholdModel)
        .filter_by(household_id=household_id, is_active=True)
        .first()
    )

    if state is None or not state.artifact_path:
        return None

    path = Path(state.artifact_path)
    if not path.exists():
        return None

    try:
        return _load_household_model_cached(
            household_id,
            str(path),
            path.stat().st_mtime,
        )
    except Exception:
        return None


def pantry_features(
    item: PantryItem,
    today: date,
) -> pd.DataFrame:
    """Convert a pantry item into the exact global training feature space."""
    category = (item.category or "").strip().lower()
    storage = (item.storage_location or "").strip().lower()

    if item.expiry_date:
        days_until_expiry = max(0, (item.expiry_date - today).days)
    else:
        days_until_expiry = 30

    quantity = max(1.0, min(float(item.quantity_remaining), 10.0))
    normalized_quantity = (quantity - 1.0) / 9.0

    features: dict[str, float | int] = {
        "purchase_month": (item.purchase_date.month - 1) / 11,
        "purchase_day_of_week": item.purchase_date.weekday() / 6,
        "days_until_expiry": min(days_until_expiry, 121) / 121,
        "quantity": normalized_quantity,
    }

    features.update(
        {
            f"item_{name}": int(name == category)
            for name in CATEGORY_COLUMNS
        }
    )
    features.update(
        {
            f"storage_{name}": int(name == storage)
            for name in STORAGE_COLUMNS
        }
    )

    return pd.DataFrame([features]).reindex(
        columns=FEATURE_COLUMNS,
        fill_value=0,
    )


def ensure_training_sample(
    db: Session,
    item: PantryItem,
) -> MLTrainingSample:
    """Create a pending household training sample for a pantry item."""
    sample = (
        db.query(MLTrainingSample)
        .filter_by(pantry_item_id=item.id)
        .first()
    )

    features = pantry_features(item, item.purchase_date).iloc[0].to_dict()

    if sample is None:
        sample = MLTrainingSample(
            household_id=item.household_id,
            pantry_item_id=item.id,
            product_name=item.product_name,
            category=item.category,
            storage_location=item.storage_location,
            purchase_date=item.purchase_date,
            expiry_date=item.expiry_date,
            quantity_initial=item.quantity_initial,
            quantity_remaining=item.quantity_remaining,
            feature_values=features,
            outcome="pending",
            label=None,
        )
        db.add(sample)
    elif sample.label is None:
        sample.product_name = item.product_name
        sample.category = item.category
        sample.storage_location = item.storage_location
        sample.purchase_date = item.purchase_date
        sample.expiry_date = item.expiry_date
        sample.quantity_initial = item.quantity_initial
        sample.quantity_remaining = item.quantity_remaining
        sample.feature_values = features
        sample.updated_at = utc_now()

    state = (
        db.query(HouseholdModel)
        .filter_by(household_id=item.household_id)
        .first()
    )
    if state is None:
        db.add(HouseholdModel(household_id=item.household_id))

    return sample


def resolve_training_outcome(
    db: Session,
    item: PantryItem,
    event_type: str,
) -> bool:
    """Resolve a sample when the real consumed/wasted/expired outcome is known."""
    sample = ensure_training_sample(db, item)
    sample.quantity_remaining = item.quantity_remaining

    normalized_event = str(event_type).split(".")[-1].lower()

    if normalized_event == "wasted":
        sample.outcome = "wasted"
        sample.label = 1
    elif normalized_event == "expired":
        sample.outcome = "expired"
        sample.label = 1
    elif normalized_event == "consumed" and item.quantity_remaining <= 0:
        sample.outcome = "consumed"
        sample.label = 0
    else:
        return False

    sample.resolved_at = utc_now()
    sample.updated_at = utc_now()
    return True


def resolve_expired_samples(
    db: Session,
    household_id: str | None = None,
    today: date | None = None,
) -> int:
    """Mark active samples as waste when expiry passed with quantity remaining."""
    today = today or date.today()
    query = (
        db.query(MLTrainingSample)
        .join(PantryItem, PantryItem.id == MLTrainingSample.pantry_item_id)
        .filter(
            MLTrainingSample.label.is_(None),
            PantryItem.expiry_date.is_not(None),
            PantryItem.expiry_date < today,
            PantryItem.quantity_remaining > 0,
        )
    )

    if household_id:
        query = query.filter(MLTrainingSample.household_id == household_id)

    samples = query.all()
    for sample in samples:
        sample.outcome = "expired"
        sample.label = 1
        sample.resolved_at = utc_now()
        sample.updated_at = utc_now()

    return len(samples)


def _load_global_training_frame() -> tuple[pd.DataFrame, pd.Series] | None:
    if not GLOBAL_TRAINING_DATA_PATH.exists():
        return None

    frame = pd.read_csv(GLOBAL_TRAINING_DATA_PATH)
    source_target = "used_before_expiry"
    required = FEATURE_COLUMNS + [source_target]
    if any(column not in frame.columns for column in required):
        return None

    x = frame[FEATURE_COLUMNS].copy()
    for column in FEATURE_COLUMNS:
        if x[column].dtype == object:
            normalized = x[column].astype(str).str.strip().str.lower()
            if normalized.isin({"true", "false", "1", "0"}).all():
                x[column] = normalized.isin({"true", "1"}).astype(float)
            else:
                x[column] = pd.to_numeric(x[column], errors="coerce")
        else:
            x[column] = pd.to_numeric(x[column], errors="coerce")

    y_source = pd.to_numeric(frame[source_target], errors="coerce")
    valid = x.notna().all(axis=1) & y_source.notna()
    x = x.loc[valid].astype(float)
    y = (1 - y_source.loc[valid].astype(int)).astype(int)

    if len(x) == 0 or y.nunique() < 2:
        return None

    return x, y


def _family_training_frame(
    db: Session,
    household_id: str,
) -> tuple[pd.DataFrame, pd.Series]:
    samples = (
        db.query(MLTrainingSample)
        .filter(
            MLTrainingSample.household_id == household_id,
            MLTrainingSample.label.is_not(None),
        )
        .order_by(MLTrainingSample.resolved_at)
        .all()
    )

    rows: list[dict[str, float]] = []
    labels: list[int] = []
    for sample in samples:
        values = sample.feature_values or {}
        rows.append(
            {
                column: float(values.get(column, 0.0))
                for column in FEATURE_COLUMNS
            }
        )
        labels.append(int(sample.label))

    return pd.DataFrame(rows, columns=FEATURE_COLUMNS), pd.Series(labels, dtype=int)


def _evaluate_candidate(
    model: Any,
    x_test: pd.DataFrame,
    y_test: pd.Series,
) -> dict[str, float]:
    predictions = model.predict(x_test)
    probabilities = model.predict_proba(x_test)[:, 1]
    metrics = {
        "balanced_accuracy": round(
            float(balanced_accuracy_score(y_test, predictions)), 4
        ),
        "waste_precision": round(
            float(precision_score(y_test, predictions, zero_division=0)), 4
        ),
        "waste_recall": round(
            float(recall_score(y_test, predictions, zero_division=0)), 4
        ),
        "waste_f1": round(
            float(f1_score(y_test, predictions, zero_division=0)), 4
        ),
    }
    metrics["roc_auc"] = (
        round(float(roc_auc_score(y_test, probabilities)), 4)
        if y_test.nunique() == 2
        else 0.0
    )
    return metrics


def should_retrain_household(
    db: Session,
    household_id: str,
    now: datetime | None = None,
) -> tuple[bool, str, int]:
    """Apply the 25 outcomes OR 2 days plus 5 outcomes trigger."""
    now = now or datetime.now(timezone.utc)
    state = (
        db.query(HouseholdModel)
        .filter_by(household_id=household_id)
        .first()
    )
    if state is None:
        state = HouseholdModel(household_id=household_id)
        db.add(state)
        db.flush()

    total_resolved = (
        db.query(MLTrainingSample)
        .filter(
            MLTrainingSample.household_id == household_id,
            MLTrainingSample.label.is_not(None),
        )
        .count()
    )
    new_outcomes = max(0, total_resolved - state.samples_at_last_training)

    if new_outcomes >= IMMEDIATE_RETRAIN_OUTCOMES:
        return True, "25_new_outcomes", new_outcomes

    reference_time = state.last_trained_at or state.created_at
    if reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=timezone.utc)

    if (
        now - reference_time >= timedelta(days=RETRAIN_INTERVAL_DAYS)
        and new_outcomes >= MIN_NEW_OUTCOMES_FOR_TIMED_RETRAIN
    ):
        return True, "two_days_and_five_outcomes", new_outcomes

    return False, "threshold_not_reached", new_outcomes


def retrain_household_model(
    db: Session,
    household_id: str,
    force: bool = False,
) -> dict[str, Any]:
    """Train and save one household-specific model."""
    should_train, reason, new_outcomes = should_retrain_household(
        db, household_id
    )
    if not force and not should_train:
        return {
            "trained": False,
            "reason": reason,
            "new_outcomes": new_outcomes,
        }

    family_x, family_y = _family_training_frame(db, household_id)
    if len(family_x) < MIN_NEW_OUTCOMES_FOR_TIMED_RETRAIN:
        return {
            "trained": False,
            "reason": "not_enough_family_outcomes",
            "new_outcomes": new_outcomes,
        }
    if family_y.nunique() < 2:
        return {
            "trained": False,
            "reason": "both_consumed_and_wasted_outcomes_required",
            "new_outcomes": new_outcomes,
        }

    global_data = _load_global_training_frame()
    if global_data is not None:
        global_x, global_y = global_data
        x = pd.concat([global_x, family_x], ignore_index=True)
        y = pd.concat([global_y, family_y], ignore_index=True)
        sample_weight = pd.Series(
            [1.0] * len(global_x)
            + [FAMILY_SAMPLE_WEIGHT] * len(family_x),
            dtype=float,
        )
    else:
        x, y = family_x, family_y
        sample_weight = pd.Series([1.0] * len(x), dtype=float)

    stratify = y if y.value_counts().min() >= 2 else None
    if len(x) >= 10 and stratify is not None:
        x_train, x_test, y_train, y_test, w_train, _ = train_test_split(
            x,
            y,
            sample_weight,
            test_size=0.20,
            random_state=42,
            stratify=stratify,
        )
    else:
        x_train, y_train, w_train = x, y, sample_weight
        x_test, y_test = family_x, family_y

    model = Pipeline(
        [
            ("scale", StandardScaler()),
            (
                "model",
                LogisticRegression(
                    max_iter=2000,
                    random_state=42,
                    class_weight="balanced",
                ),
            ),
        ]
    )
    model.fit(x_train, y_train, model__sample_weight=w_train)
    metrics = _evaluate_candidate(model, x_test, y_test)

    state = (
        db.query(HouseholdModel)
        .filter_by(household_id=household_id)
        .first()
    )
    if state is None:
        state = HouseholdModel(household_id=household_id)
        db.add(state)
        db.flush()

    version = state.version + 1 if state.artifact_path else 1
    household_dir = HOUSEHOLD_MODEL_DIR / household_id
    household_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = household_dir / f"waste_risk_model_v{version}.joblib"
    metrics_path = artifact_path.with_suffix(".metrics.json")

    artifact = {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "model_version": f"household-{household_id[:8]}-v{version}",
        "household_id": household_id,
        "positive_class": "not_used_before_expiry",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "family_samples": int(len(family_x)),
        "family_sample_weight": FAMILY_SAMPLE_WEIGHT,
        "metrics": metrics,
    }
    joblib.dump(artifact, artifact_path)
    metrics_path.write_text(json.dumps(artifact["metrics"], indent=2), encoding="utf-8")

    state.version = version
    state.artifact_path = str(artifact_path)
    state.total_family_samples = int(len(family_x))
    state.samples_at_last_training = int(len(family_x))
    state.last_trained_at = utc_now()
    state.metrics = metrics
    state.is_active = True
    state.updated_at = utc_now()

    _load_household_model_cached.cache_clear()

    return {
        "trained": True,
        "reason": reason,
        "new_outcomes": new_outcomes,
        "version": version,
        "artifact_path": str(artifact_path),
        "metrics": metrics,
    }


def maybe_retrain_household_model(
    db: Session,
    household_id: str,
) -> dict[str, Any]:
    """Run a lightweight trigger check and retrain only when eligible."""
    return retrain_household_model(db, household_id, force=False)


def apply_rescue_rules(
    model_score: float,
    item: PantryItem,
    today: date,
) -> tuple[float, list[str]]:
    """Apply deterministic expiry and storage safeguards."""
    adjusted_score = model_score
    adjustment_reasons: list[str] = []

    if not item.expiry_date:
        return round(adjusted_score, 4), adjustment_reasons

    days_until_expiry = (item.expiry_date - today).days
    storage = (item.storage_location or "").strip().lower()

    if days_until_expiry < 0:
        required_score = 0.98
        if adjusted_score < required_score:
            adjusted_score = required_score
            adjustment_reasons.append(
                "Risk increased because the item is already past expiry"
            )
    elif days_until_expiry == 0:
        required_score = 0.90
        if adjusted_score < required_score:
            adjusted_score = required_score
            adjustment_reasons.append(
                "Risk increased because the item expires today"
            )
    elif days_until_expiry == 1:
        required_score = 0.80
        if adjusted_score < required_score:
            adjusted_score = required_score
            adjustment_reasons.append(
                "Risk increased because only 1 day remains before expiry"
            )
    elif days_until_expiry <= 3:
        required_score = 0.70
        if adjusted_score < required_score:
            adjusted_score = required_score
            adjustment_reasons.append(
                f"Risk increased because only {days_until_expiry} days remain before expiry"
            )
    elif storage == "freezer" and days_until_expiry > 14 and adjusted_score > 0.35:
        adjusted_score = 0.35
        adjustment_reasons.append(
            "Risk reduced because the item is frozen and has more than 14 days before expiry"
        )

    return round(max(0.0, min(adjusted_score, 1.0)), 4), adjustment_reasons


def predict_risk(
    item: PantryItem,
    today: date,
    db: Session | None = None,
) -> tuple[float, str, list[str]]:
    """Predict risk using the household model first and global model as fallback."""
    artifact = None
    if db is not None:
        artifact = load_household_model(db, item.household_id)

    if artifact is None:
        artifact = load_global_model()

    if artifact is None:
        score, reasons = risk_for(item, today)
        return score, "rules-v1", reasons + ["Trained model is not available yet"]

    model = artifact["model"]
    columns = artifact["feature_columns"]
    features = pantry_features(item, today).reindex(columns=columns, fill_value=0)

    class_one_probability = float(model.predict_proba(features)[0][1])
    if artifact.get("positive_class") == "not_used_before_expiry":
        model_score = class_one_probability
    else:
        model_score = 1 - class_one_probability

    model_score = round(model_score, 4)
    final_score, adjustment_reasons = apply_rescue_rules(
        model_score=model_score,
        item=item,
        today=today,
    )

    reasons = [
        f"ML model estimates a {model_score:.0%} chance this item will go unused before expiry"
    ]
    if item.expiry_date:
        days = (item.expiry_date - today).days
        if days < 0:
            reasons.append("Already past expiry")
        elif days == 0:
            reasons.append("Expires today")
        else:
            reasons.append(f"Expires in {days} day{'s' if days != 1 else ''}")

    reasons.extend(adjustment_reasons)
    if final_score != model_score:
        reasons.append(f"Final Rescue Mode risk adjusted to {final_score:.0%}")

    return final_score, artifact["model_version"], reasons
