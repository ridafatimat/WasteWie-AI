"""Main FastAPI application for WasteWise AI."""

from __future__ import annotations

import os
from datetime import date

from dotenv import load_dotenv
from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Response,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .auth import (
    create_access_token,
    get_current_household_id,
    get_current_user,
    hash_password,
    verify_password,
)
from .database import Base, engine, get_db
from .ml import predict_risk
from .grocery_routes import router as grocery_router
from .models import (
    Household,
    HouseholdMember,
    InventoryEvent,
    PantryItem,
    User,
)
from .receipt_routes import router as receipt_router
from .schemas import (
    EventCreate,
    EventRead,
    LoginRequest,
    PantryItemCreate,
    PantryItemRead,
    PantryItemUpdate,
    RegisterRequest,
    TokenRead,
    UserRead,
)
from .services import (
    get_item_or_404,
    record_event,
    risk_for,
    update_item,
)


# Load values from backend/.env.
load_dotenv()

# Create database tables that do not already exist.
Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="WasteWise API",
    version="0.2.0",
    openapi_url="/api/v1/openapi.json",
    docs_url="/docs",
)


# Read comma-separated frontend origins from .env.
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        (
            "http://localhost:5173,"
            "http://127.0.0.1:5173,"
            "http://localhost:8080,"
            "http://127.0.0.1:8080"
        ),
    ).split(",")
    if origin.strip()
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    # Allows temporary Lovable preview subdomains during development.
    allow_origin_regex=r"https://.*\.lovable\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Register receipt-scanning routes.
#
# receipt_routes.py already uses:
#     prefix="/receipts"
#
# This additional prefix creates:
#     POST /api/v1/receipts/scan
app.include_router(
    receipt_router,
    prefix="/api/v1",
)

# Register grocery-list and meal-planning routes.
app.include_router(
    grocery_router,
    prefix="/api/v1",
)


def get_risk_band(score: float) -> str:
    """Convert a risk probability into a user-facing risk band."""

    if score >= 0.70:
        return "high"

    if score >= 0.40:
        return "medium"

    return "low"


@app.get("/")
def root():
    """Basic API information."""

    return {
        "message": "WasteWise API is running",
        "docs": "/docs",
        "health": "/api/v1/health",
        "receipt_scan": "/api/v1/receipts/scan",
        "grocery_lists": "/api/v1/grocery-lists/active",
    }


@app.get("/api/v1/health")
def health():
    """Return API health status."""

    return {
        "status": "ok",
        "database": engine.dialect.name,
    }


@app.post(
    "/api/v1/auth/register",
    response_model=TokenRead,
    status_code=status.HTTP_201_CREATED,
)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
):
    """Register a user and create their first household."""

    email = payload.email.strip().lower()

    existing_user = (
        db.query(User)
        .filter_by(email=email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
    )

    household = Household(
        name=payload.household_name.strip(),
    )

    db.add_all([user, household])
    db.flush()

    membership = HouseholdMember(
        user_id=user.id,
        household_id=household.id,
        role="owner",
    )

    db.add(membership)
    db.commit()
    db.refresh(user)

    return TokenRead(
        access_token=create_access_token(user),
    )


@app.post(
    "/api/v1/auth/login",
    response_model=TokenRead,
)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    """Authenticate a user and issue a bearer token."""

    email = payload.email.strip().lower()

    user = (
        db.query(User)
        .filter_by(email=email)
        .first()
    )

    if (
        user is None
        or not verify_password(
            payload.password,
            user.password_hash,
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={
                "WWW-Authenticate": "Bearer",
            },
        )

    return TokenRead(
        access_token=create_access_token(user),
    )


@app.get(
    "/api/v1/auth/me",
    response_model=UserRead,
)
def me(
    user: User = Depends(get_current_user),
):
    """Return the currently authenticated user."""

    return user


@app.get(
    "/api/v1/pantry-items",
    response_model=list[PantryItemRead],
)
def list_pantry_items(
    household_id: str = Depends(
        get_current_household_id
    ),
    db: Session = Depends(get_db),
):
    """Return pantry items belonging to the active household."""

    return (
        db.query(PantryItem)
        .filter_by(household_id=household_id)
        .order_by(
            PantryItem.expiry_date.is_(None),
            PantryItem.expiry_date,
        )
        .all()
    )


@app.post(
    "/api/v1/pantry-items",
    response_model=PantryItemRead,
    status_code=status.HTTP_201_CREATED,
)
def create_pantry_item(
    payload: PantryItemCreate,
    household_id: str = Depends(
        get_current_household_id
    ),
    db: Session = Depends(get_db),
):
    """Create a pantry item for the active household."""

    item = PantryItem(
        product_name=payload.product_name.strip(),
        category=payload.category,
        quantity_initial=payload.quantity,
        quantity_remaining=payload.quantity,
        unit=payload.unit,
        purchase_date=payload.purchase_date,
        expiry_date=payload.expiry_date,
        storage_location=payload.storage_location,
        price_amount=(
            payload.price.amount
            if payload.price
            else None
        ),
        currency=(
            payload.price.currency
            if payload.price
            else None
        ),
        household_id=household_id,
    )

    db.add(item)
    db.commit()
    db.refresh(item)

    return item


@app.get(
    "/api/v1/pantry-items/{item_id}",
    response_model=PantryItemRead,
)
def get_pantry_item(
    item_id: str,
    household_id: str = Depends(
        get_current_household_id
    ),
    db: Session = Depends(get_db),
):
    """Return one pantry item."""

    item = get_item_or_404(
        db,
        item_id,
    )

    if item.household_id != household_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pantry item not found",
        )

    return item


@app.patch(
    "/api/v1/pantry-items/{item_id}",
    response_model=PantryItemRead,
)
def patch_pantry_item(
    item_id: str,
    payload: PantryItemUpdate,
    household_id: str = Depends(
        get_current_household_id
    ),
    db: Session = Depends(get_db),
):
    """Update supplied pantry-item fields."""

    item = get_item_or_404(
        db,
        item_id,
    )

    if item.household_id != household_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pantry item not found",
        )

    return update_item(
        db,
        item,
        payload,
    )


@app.delete(
    "/api/v1/pantry-items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_pantry_item(
    item_id: str,
    household_id: str = Depends(
        get_current_household_id
    ),
    db: Session = Depends(get_db),
):
    """Delete a pantry item belonging to the active household."""

    item = get_item_or_404(
        db,
        item_id,
    )

    if item.household_id != household_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pantry item not found",
        )

    db.delete(item)
    db.commit()

    return Response(
        status_code=status.HTTP_204_NO_CONTENT
    )


@app.post(
    "/api/v1/pantry-items/{item_id}/events",
    response_model=EventRead,
    status_code=status.HTTP_201_CREATED,
)
def create_event(
    item_id: str,
    payload: EventCreate,
    household_id: str = Depends(
        get_current_household_id
    ),
    db: Session = Depends(get_db),
):
    """Record consumption, waste, expiry, or adjustment."""

    item = get_item_or_404(
        db,
        item_id,
    )

    if item.household_id != household_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pantry item not found",
        )

    return record_event(
        db,
        item,
        payload,
    )


@app.get(
    "/api/v1/pantry-items/{item_id}/events",
    response_model=list[EventRead],
)
def list_events(
    item_id: str,
    household_id: str = Depends(
        get_current_household_id
    ),
    db: Session = Depends(get_db),
):
    """Return the event history for one pantry item."""

    item = get_item_or_404(
        db,
        item_id,
    )

    if item.household_id != household_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pantry item not found",
        )

    return (
        db.query(InventoryEvent)
        .filter_by(pantry_item_id=item_id)
        .order_by(
            InventoryEvent.occurred_at.desc()
        )
        .all()
    )


@app.get("/api/v1/dashboard/rescue-mode")
def rescue_mode(
    household_id: str = Depends(
        get_current_household_id
    ),
    db: Session = Depends(get_db),
):
    """
    Return the rules-based Rescue Mode view.

    The ML prediction endpoint remains available separately.
    """

    candidates = []

    active_items = (
        db.query(PantryItem)
        .filter_by(
            status="active",
            household_id=household_id,
        )
        .all()
    )

    for item in active_items:
        score, reasons = risk_for(
            item,
            date.today(),
        )

        if score >= 0.40:
            candidates.append(
                (
                    item,
                    score,
                    reasons,
                )
            )

    candidates.sort(
        key=lambda candidate: candidate[1],
        reverse=True,
    )

    items = [
        {
            "pantry_item_id": item.id,
            "product_name": item.product_name,
            "risk_score": round(score, 4),
            "risk_band": get_risk_band(score),
            "reasons": reasons,
        }
        for item, score, reasons in candidates
    ]

    estimated_value = sum(
        (
            item.price_amount or 0
        )
        * (
            item.quantity_remaining
            / item.quantity_initial
        )
        for item, _, _ in candidates
        if item.quantity_initial
    )

    actions = []

    if items:
        product_names = ", ".join(
            item["product_name"]
            for item in items[:3]
        )

        actions.append(
            {
                "type": "recipe",
                "title": (
                    f"Use {product_names} soon"
                ),
                "reason": (
                    "Prioritizes pantry items "
                    "approaching expiry"
                ),
            }
        )

    return {
        "summary": (
            f"{len(items)} items need attention"
        ),
        "estimated_value_at_risk": {
            "amount": round(
                float(estimated_value),
                2,
            ),
            "currency": "PKR",
        },
        "items": items,
        "actions": actions,
    }


@app.get("/api/v1/predictions/waste-risk")
def waste_risk_predictions(
    household_id: str = Depends(
        get_current_household_id
    ),
    db: Session = Depends(get_db),
):
    """Return ML and Rescue Mode risk predictions."""

    predictions = []

    active_items = (
        db.query(PantryItem)
        .filter_by(
            status="active",
            household_id=household_id,
        )
        .all()
    )

    for item in active_items:
        score, model_version, reasons = (
            predict_risk(
                item,
                date.today(),
            )
        )

        predictions.append(
            {
                "pantry_item_id": item.id,
                "product_name": item.product_name,
                "risk_score": round(score, 4),
                "risk_band": get_risk_band(score),
                "model_version": model_version,
                "reasons": reasons,
            }
        )

    return sorted(
        predictions,
        key=lambda prediction: (
            prediction["risk_score"]
        ),
        reverse=True,
    )