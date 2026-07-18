"""Business logic for pantry, inventory events, rescue scoring, and recipes."""

from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from enum import Enum
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from dotenv import load_dotenv
from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

try:
    from groq import Groq
except ImportError:
    Groq = None  # type: ignore[assignment]

from .models import (
    EventType,
    Household,
    InventoryEvent,
    PantryItem,
    PantryStatus,
)
from .schemas import (
    EventCreate,
    GroqRecipePayload,
    PantryItemUpdate,
    RecipeRead,
    RecipeSuggestionRequest,
    RecipeSuggestionResponse,
    UrgentPantryItemRead,
)


load_dotenv()


DEFAULT_GROQ_RECIPE_MODEL = "openai/gpt-oss-20b"

RECIPE_SAFETY_NOTE = (
    "Expiry dates are planning signals, not a food-safety guarantee. "
    "Before cooking, discard anything with an unusual smell, colour, "
    "texture, damaged packaging, or other signs of spoilage."
)


# ============================================================
# Shared helpers
# ============================================================


def make_json_safe(value: Any) -> Any:
    """
    Convert Python and SQLAlchemy values into JSON-serializable values.

    PostgreSQL JSON columns cannot directly store Python date, datetime,
    or Enum objects.
    """

    if isinstance(value, (date, datetime)):
        return value.isoformat()

    if isinstance(value, Enum):
        return value.value

    if isinstance(value, dict):
        return {
            key: make_json_safe(item)
            for key, item in value.items()
        }

    if isinstance(value, (list, tuple, set)):
        return [
            make_json_safe(item)
            for item in value
        ]

    return value


def get_item_or_404(
    db: Session,
    item_id: str,
) -> PantryItem:
    """Return a pantry item or raise a 404 error."""

    item = db.get(PantryItem, item_id)

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pantry item not found",
        )

    return item


# ============================================================
# Pantry updates
# ============================================================


def update_item(
    db: Session,
    item: PantryItem,
    changes: PantryItemUpdate,
) -> PantryItem:
    """Update a pantry item and record a JSON-safe audit event."""

    values = changes.model_dump(
        exclude_unset=True
    )

    if not values:
        return item

    new_purchase_date = values.get(
        "purchase_date",
        item.purchase_date,
    )
    new_expiry_date = values.get(
        "expiry_date",
        item.expiry_date,
    )

    if (
        new_expiry_date is not None
        and new_purchase_date is not None
        and new_expiry_date
        < new_purchase_date
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                "expiry_date must be on or "
                "after purchase_date"
            ),
        )

    # API fields are friendlier than storage-column names.
    mapped_values: dict[str, Any] = {}

    for field, value in values.items():
        if field == "quantity":
            mapped_values[
                "quantity_remaining"
            ] = value

            if value > item.quantity_initial:
                mapped_values[
                    "quantity_initial"
                ] = value

        elif field == "price":
            if value is None:
                mapped_values[
                    "price_amount"
                ] = None
                mapped_values[
                    "currency"
                ] = None
            else:
                mapped_values[
                    "price_amount"
                ] = value["amount"]
                mapped_values[
                    "currency"
                ] = value[
                    "currency"
                ].upper()

        else:
            mapped_values[field] = value

    previous_values: dict[str, Any] = {}
    changed_values: dict[str, Any] = {}

    for field, new_value in (
        mapped_values.items()
    ):
        current_value = getattr(
            item,
            field,
        )

        if current_value == new_value:
            continue

        previous_values[field] = (
            make_json_safe(
                current_value
            )
        )
        changed_values[field] = (
            make_json_safe(
                new_value
            )
        )

        setattr(
            item,
            field,
            new_value,
        )

    if not previous_values:
        return item

    old_quantity = float(
        previous_values.get(
            "quantity_remaining",
            item.quantity_remaining,
        )
    )
    new_quantity = float(
        item.quantity_remaining
    )

    if item.quantity_remaining <= 0:
        item.quantity_remaining = 0
        item.status = (
            PantryStatus.consumed
        )
    else:
        item.status = PantryStatus.active

    quantity_delta = (
        old_quantity - new_quantity
    )

    if quantity_delta > 1e-9:
        event_type = EventType.consumed
        event_quantity = quantity_delta
        event_notes = (
            "Pantry quantity reduced"
        )

    elif quantity_delta < -1e-9:
        event_type = EventType.adjusted
        event_quantity = new_quantity
        event_notes = (
            "Pantry quantity increased"
        )

    else:
        event_type = EventType.updated
        event_quantity = None
        event_notes = (
            "Pantry item details updated"
        )

    db_event = InventoryEvent(
        pantry_item=item,
        event_type=event_type,
        quantity=event_quantity,
        occurred_at=datetime.now(
            timezone.utc
        ),
        notes=event_notes,
        previous_values={
            "before": previous_values,
            "after": changed_values,
        },
    )

    db.add(db_event)

    try:
        db.commit()
        db.refresh(item)

        # Keep the household-specific ML snapshot aligned with editable
        # pantry details. A quantity reduction to zero is a real consumed
        # outcome and therefore becomes label 0 for family retraining.
        from .ml import (
            ensure_training_sample,
            maybe_retrain_household_model,
            resolve_training_outcome,
        )

        ensure_training_sample(
            db,
            item,
        )

        outcome_resolved = False

        if (
            item.quantity_remaining <= 0
            and event_type == EventType.consumed
        ):
            outcome_resolved = resolve_training_outcome(
                db,
                item,
                EventType.consumed.value,
            )

        if outcome_resolved:
            maybe_retrain_household_model(
                db,
                item.household_id,
            )

        db.commit()
        db.refresh(item)

    except Exception:
        db.rollback()
        raise

    return item


# ============================================================
# Inventory events
# ============================================================


def record_event(
    db: Session,
    item: PantryItem,
    event: EventCreate,
) -> InventoryEvent:
    """Record a quantity event and update the pantry batch."""

    if event.event_type == "updated":
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                "Use PATCH to update pantry "
                "item details"
            ),
        )

    if event.quantity is None:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                "quantity is required for "
                "inventory events"
            ),
        )

    if event.quantity <= 0:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                "Event quantity must be "
                "greater than zero"
            ),
        )

    event_type = EventType(
        event.event_type
    )

    if (
        event.event_type != "adjusted"
        and event.quantity
        > item.quantity_remaining
    ):
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                "Event quantity cannot exceed "
                "the remaining quantity"
            ),
        )

    previous_values = {
        "quantity_remaining": (
            make_json_safe(
                item.quantity_remaining
            )
        ),
        "status": make_json_safe(
            item.status
        ),
    }

    if event.event_type == "adjusted":
        item.quantity_remaining = (
            event.quantity
        )

        if (
            event.quantity
            > item.quantity_initial
        ):
            item.quantity_initial = (
                event.quantity
            )

    else:
        item.quantity_remaining -= (
            event.quantity
        )

    if item.quantity_remaining < 0:
        raise HTTPException(
            status_code=(
                status.HTTP_422_UNPROCESSABLE_ENTITY
            ),
            detail=(
                "Remaining quantity cannot "
                "be negative"
            ),
        )

    if item.quantity_remaining == 0:
        item.status = (
            PantryStatus.consumed
            if event.event_type
            == "adjusted"
            else PantryStatus(
                event.event_type
            )
        )
    else:
        item.status = PantryStatus.active

    db_event = InventoryEvent(
        pantry_item=item,
        event_type=event_type,
        quantity=event.quantity,
        occurred_at=(
            event.occurred_at
            or datetime.now(
                timezone.utc
            )
        ),
        notes=event.notes,
        previous_values=(
            previous_values
        ),
    )

    db.add(db_event)

    try:
        db.commit()
        db.refresh(db_event)
        db.refresh(item)
    except Exception:
        db.rollback()
        raise

    return db_event


# ============================================================
# Rescue scoring
# ============================================================


def risk_for(
    item: PantryItem,
    today: date,
) -> tuple[float, list[str]]:
    """
    Return a transparent rules-based waste-risk score and explanation.
    """

    if not item.expiry_date:
        return (
            0.15,
            ["No expiry date recorded"],
        )

    days = (
        item.expiry_date - today
    ).days

    if days < 0:
        return (
            1.0,
            [
                "Already past its "
                "expiry date"
            ],
        )

    if days == 0:
        return (
            0.95,
            ["Expires today"],
        )

    if days == 1:
        return (
            0.90,
            ["Expires in 1 day"],
        )

    if days <= 3:
        return (
            0.75,
            [
                f"Expires in {days} days"
            ],
        )

    if days <= 7:
        return (
            0.45,
            [
                f"Expires in {days} days"
            ],
        )

    return (
        0.10,
        [
            "Expiry date is more than "
            "a week away"
        ],
    )


# ============================================================
# Groq expiry-rescue recipes
# ============================================================


def _household_today(
    db: Session,
    household_id: str,
) -> date:
    """Return today's date in the household's configured timezone."""

    household = db.get(
        Household,
        household_id,
    )

    timezone_name = (
        household.timezone
        if household
        else "Asia/Karachi"
    )

    try:
        return datetime.now(
            ZoneInfo(timezone_name)
        ).date()
    except (
        ZoneInfoNotFoundError,
        ValueError,
    ):
        return date.today()


def _recipe_urgency(
    days_until_expiry: int,
) -> str:
    if days_until_expiry == 0:
        return "today"

    if days_until_expiry == 1:
        return "tomorrow"

    return "day_after_tomorrow"


def _round_recipe_quantity(
    value: float,
) -> float:
    rounded = round(
        float(value),
        2,
    )

    if abs(
        rounded - round(rounded)
    ) < 1e-9:
        return float(
            int(round(rounded))
        )

    return rounded


def get_urgent_recipe_items(
    db: Session,
    household_id: str,
    today: date | None = None,
) -> list[UrgentPantryItemRead]:
    """
    Return usable items expiring today, tomorrow, or the day after.

    Already expired, consumed, wasted, zero-quantity, and inactive items
    are excluded from recipe suggestions.
    """

    current_date = (
        today
        or _household_today(
            db,
            household_id,
        )
    )
    end_date = current_date + (
        timedelta(days=2)
    )

    rows = (
        db.query(PantryItem)
        .filter(
            PantryItem.household_id
            == household_id,
            PantryItem.status
            == PantryStatus.active,
            PantryItem.quantity_remaining
            > 0,
            PantryItem.expiry_date
            >= current_date,
            PantryItem.expiry_date
            <= end_date,
        )
        .order_by(
            PantryItem.expiry_date.asc(),
            PantryItem.product_name.asc(),
        )
        .all()
    )

    # Only exact Smart Pantry names are grouped together.
    grouped: dict[
        tuple[str, str],
        dict[str, Any],
    ] = defaultdict(
        lambda: {
            "pantry_item_ids": [],
            "product_name": "",
            "category": None,
            "quantity": 0.0,
            "unit": "",
            "expiry_date": None,
        }
    )

    for item in rows:
        exact_name = (
            item.product_name.strip()
        )
        exact_unit = item.unit.strip()

        key = (
            exact_name.lower(),
            exact_unit.lower(),
        )

        record = grouped[key]
        record[
            "pantry_item_ids"
        ].append(item.id)
        record[
            "product_name"
        ] = exact_name
        record["category"] = (
            item.category
        )
        record["quantity"] += float(
            item.quantity_remaining
        )
        record["unit"] = exact_unit

        if (
            record["expiry_date"]
            is None
            or item.expiry_date
            < record["expiry_date"]
        ):
            record[
                "expiry_date"
            ] = item.expiry_date

    urgent_items: list[
        UrgentPantryItemRead
    ] = []

    for record in grouped.values():
        expiry_date = record[
            "expiry_date"
        ]
        days_until_expiry = (
            expiry_date
            - current_date
        ).days

        urgent_items.append(
            UrgentPantryItemRead(
                pantry_item_id=",".join(
                    record[
                        "pantry_item_ids"
                    ]
                ),
                product_name=record[
                    "product_name"
                ],
                category=record[
                    "category"
                ],
                quantity=(
                    _round_recipe_quantity(
                        record[
                            "quantity"
                        ]
                    )
                ),
                unit=record["unit"],
                expiry_date=(
                    expiry_date
                ),
                days_until_expiry=(
                    days_until_expiry
                ),
                urgency=(
                    _recipe_urgency(
                        days_until_expiry
                    )
                ),
            )
        )

    urgent_items.sort(
        key=lambda item: (
            item.expiry_date,
            item.product_name.lower(),
        )
    )

    return urgent_items


def _build_recipe_prompt(
    urgent_items: list[
        UrgentPantryItemRead
    ],
    request: RecipeSuggestionRequest,
    today: date,
) -> str:
    pantry_rows = [
        {
            "product_name": (
                item.product_name
            ),
            "quantity": item.quantity,
            "unit": item.unit,
            "category": item.category,
            "expiry_date": (
                item.expiry_date.isoformat()
            ),
            "days_until_expiry": (
                item.days_until_expiry
            ),
            "urgency": item.urgency,
        }
        for item in urgent_items
    ]

    cuisine = (
        request.cuisine.strip()
        if request.cuisine
        else "Any practical cuisine"
    )

    dietary_preferences = (
        request.dietary_preferences.strip()
        if request.dietary_preferences
        else (
            "No dietary preference "
            "was supplied"
        )
    )

    return f"""
You are the recipe-planning engine for WasteWise AI.

Today is {today.isoformat()}.

Create exactly {request.recipe_count} practical household recipes for
{request.servings} servings.

The recipes must collectively prioritise and use the pantry items below
because they expire today, tomorrow, or the day after tomorrow.

Urgent pantry items:
{json.dumps(pantry_rows, ensure_ascii=False, indent=2)}

Preferences:
- Cuisine: {cuisine}
- Dietary preferences: {dietary_preferences}

Rules:
1. Preserve every pantry product name exactly as supplied.
2. Collectively use every urgent product at least once whenever it is
   sensible and safe.
3. Prioritise products expiring today, then tomorrow, then in two days.
4. Do not force unrelated foods into one strange recipe. Use separate
   recipes when needed.
5. Treat only salt, water, cooking oil, and common spices as basic staples.
6. Put every other ingredient not in the urgent pantry list into
   missing_ingredients.
7. Keep the recipes realistic and suitable for a normal home kitchen.
8. Never claim that the recorded expiry date proves food is safe.
9. Include a short waste_reduction_tip for every recipe.
10. Return JSON only in this exact structure:

{{
  "recipes": [
    {{
      "title": "string",
      "description": "string",
      "servings": {request.servings},
      "prep_minutes": 10,
      "cook_minutes": 20,
      "difficulty": "easy",
      "used_urgent_items": [
        "Exact Smart Pantry product name"
      ],
      "ingredients": [
        {{
          "name": "Exact Smart Pantry product name or another ingredient",
          "quantity": 1,
          "unit": "piece",
          "from_urgent_pantry": true,
          "pantry_item_name": "Exact Smart Pantry product name"
        }}
      ],
      "steps": [
        "Step 1",
        "Step 2"
      ],
      "missing_ingredients": [
        "Ingredient not found in the urgent pantry list"
      ],
      "waste_reduction_tip": "string"
    }}
  ]
}}
""".strip()


def _ground_recipe_names(
    recipe: RecipeRead,
    exact_names: dict[
        str,
        str,
    ],
) -> RecipeRead:
    """Ground Groq output in exact Smart Pantry product names."""

    cleaned_used: list[str] = []

    for supplied_name in (
        recipe.used_urgent_items
    ):
        exact_name = exact_names.get(
            supplied_name
            .strip()
            .lower()
        )

        if (
            exact_name
            and exact_name
            not in cleaned_used
        ):
            cleaned_used.append(
                exact_name
            )

    for ingredient in (
        recipe.ingredients
    ):
        pantry_name = (
            ingredient.pantry_item_name
        )

        if not pantry_name:
            ingredient.from_urgent_pantry = (
                False
            )
            continue

        exact_name = exact_names.get(
            pantry_name
            .strip()
            .lower()
        )

        if not exact_name:
            ingredient.pantry_item_name = (
                None
            )
            ingredient.from_urgent_pantry = (
                False
            )
            continue

        ingredient.pantry_item_name = (
            exact_name
        )
        ingredient.name = exact_name
        ingredient.from_urgent_pantry = (
            True
        )

        if (
            exact_name
            not in cleaned_used
        ):
            cleaned_used.append(
                exact_name
            )

    recipe.used_urgent_items = (
        cleaned_used
    )

    return recipe


def _call_groq_for_recipes(
    model: str,
    prompt: str,
) -> GroqRecipePayload:
    """Call Groq and validate its JSON response."""

    if Groq is None:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "The Groq SDK is not installed. "
                "Run: python -m pip install groq"
            ),
        )

    api_key = os.getenv(
        "GROQ_API_KEY"
    )

    if not api_key:
        raise HTTPException(
            status_code=(
                status.HTTP_503_SERVICE_UNAVAILABLE
            ),
            detail=(
                "GROQ_API_KEY is not configured "
                "in backend/.env"
            ),
        )

    client = Groq(
        api_key=api_key
    )

    try:
        completion = (
            client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Return one valid JSON "
                            "object only. Do not add "
                            "markdown or commentary."
                        ),
                    },
                    {
                        "role": "user",
                        "content": prompt,
                    },
                ],
                temperature=0.3,
                response_format={
                    "type": "json_object"
                },
            )
        )

        content = (
            completion
            .choices[0]
            .message
            .content
        )

        if not content:
            raise ValueError(
                "Groq returned an "
                "empty response"
            )

        return (
            GroqRecipePayload
            .model_validate(
                json.loads(content)
            )
        )

    except (
        json.JSONDecodeError,
        ValidationError,
        ValueError,
        IndexError,
    ) as error:
        raise HTTPException(
            status_code=(
                status.HTTP_502_BAD_GATEWAY
            ),
            detail=(
                "Groq returned an invalid "
                "recipe response. Please "
                "try again."
            ),
        ) from error

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=(
                status.HTTP_502_BAD_GATEWAY
            ),
            detail=(
                "Groq could not generate "
                "recipes right now. Please "
                "try again."
            ),
        ) from error


def generate_expiry_rescue_recipes(
    db: Session,
    household_id: str,
    request: RecipeSuggestionRequest,
) -> RecipeSuggestionResponse:
    """
    Generate recipes from usable household items expiring within three days.
    """

    today = _household_today(
        db,
        household_id,
    )
    window_end = today + (
        timedelta(days=2)
    )

    urgent_items = (
        get_urgent_recipe_items(
            db,
            household_id,
            today,
        )
    )

    model = (
        os.getenv(
            "GROQ_RECIPE_MODEL"
        )
        or os.getenv(
            "GROQ_MODEL"
        )
        or DEFAULT_GROQ_RECIPE_MODEL
    )

    if not urgent_items:
        return (
            RecipeSuggestionResponse(
                generated_at=(
                    datetime.now(
                        timezone.utc
                    )
                ),
                model=model,
                date_window_start=(
                    today
                ),
                date_window_end=(
                    window_end
                ),
                urgent_items=[],
                recipes=[],
                message=(
                    "Nothing expires today, "
                    "tomorrow, or the day "
                    "after tomorrow."
                ),
                safety_note=(
                    RECIPE_SAFETY_NOTE
                ),
            )
        )

    prompt = _build_recipe_prompt(
        urgent_items,
        request,
        today,
    )

    parsed = (
        _call_groq_for_recipes(
            model,
            prompt,
        )
    )

    exact_names = {
        item.product_name
        .strip()
        .lower(): item.product_name
        for item in urgent_items
    }

    recipes = [
        _ground_recipe_names(
            recipe,
            exact_names,
        )
        for recipe in parsed.recipes[
            : request.recipe_count
        ]
    ]

    covered_names = {
        name
        for recipe in recipes
        for name in (
            recipe.used_urgent_items
        )
    }

    all_names = {
        item.product_name
        for item in urgent_items
    }

    uncovered_names = sorted(
        all_names - covered_names
    )

    if uncovered_names:
        message = (
            f"{len(recipes)} recipes generated. "
            "These urgent products were not "
            "combined naturally: "
            f"{', '.join(uncovered_names)}."
        )
    else:
        message = (
            f"{len(recipes)} recipes generated "
            "using all urgent pantry products."
        )

    return RecipeSuggestionResponse(
        generated_at=datetime.now(
            timezone.utc
        ),
        model=model,
        date_window_start=today,
        date_window_end=window_end,
        urgent_items=urgent_items,
        recipes=recipes,
        message=message,
        safety_note=(
            RECIPE_SAFETY_NOTE
        ),
    )