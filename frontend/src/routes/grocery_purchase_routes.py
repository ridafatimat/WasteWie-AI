"""Shopping-mode purchase routes for WasteWise AI."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from .auth import get_current_household_id
from .database import get_db
from .models import (
    GroceryList,
    GroceryListItem,
    GroceryListStatus,
    PantryItem,
    PantryStatus,
)
from .schemas import GroceryListRead


router = APIRouter(
    prefix="/grocery-lists",
    tags=["grocery-lists"],
)


ALLOWED_CATEGORIES = {
    "beverage",
    "dairy",
    "fruit",
    "grain",
    "meat",
    "snack",
    "vegetable",
    "other",
}

CATEGORY_DEFAULTS: dict[str, tuple[str, int]] = {
    "beverage": ("fridge", 30),
    "dairy": ("fridge", 14),
    "fruit": ("fridge", 7),
    "grain": ("pantry", 60),
    "meat": ("fridge", 3),
    "snack": ("pantry", 60),
    "vegetable": ("fridge", 7),
    "other": ("pantry", 30),
}

# Product-specific estimates take priority over the broad category defaults.
# These dates are intentionally editable estimates, not manufacturer claims.
PRODUCT_DEFAULTS: tuple[
    tuple[tuple[str, ...], str | None, str, int],
    ...,
] = (
    (("frozen",), None, "freezer", 90),
    (("yogurt", "yoghurt"), "dairy", "fridge", 14),
    (("milk",), "dairy", "fridge", 7),
    (("cheese",), "dairy", "fridge", 30),
    (("egg",), "dairy", "fridge", 21),
    (("chicken",), "meat", "fridge", 3),
    (("beef", "mutton", "lamb", "fish", "meat"), "meat", "fridge", 3),
    (
        ("strawberry", "blueberry", "raspberry", "berries"),
        "fruit",
        "fridge",
        5,
    ),
    (("banana",), "fruit", "pantry", 5),
    (("apple", "orange"), "fruit", "fridge", 14),
    (("bread", "pita", "naan", "bun"), "grain", "pantry", 7),
    (
        ("rice", "pasta", "flour", "beans", "lentil", "daal", "dal"),
        "grain",
        "pantry",
        180,
    ),
    (("tomato", "cucumber", "pepper"), "vegetable", "fridge", 7),
    (("potato", "onion", "garlic"), "vegetable", "pantry", 30),
)


def _read_list(
    db: Session,
    list_id: str,
    household_id: str,
) -> GroceryList:
    grocery_list = (
        db.query(GroceryList)
        .options(
            selectinload(GroceryList.items),
            selectinload(GroceryList.meal_plans),
        )
        .filter(
            GroceryList.id == list_id,
            GroceryList.household_id == household_id,
        )
        .first()
    )

    if grocery_list is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grocery list not found",
        )

    return grocery_list


def _category_value(value: Any) -> str:
    """Return a supported pantry category string."""

    raw_value = getattr(value, "value", value)
    normalized = str(raw_value or "other").strip().lower()

    if normalized not in ALLOWED_CATEGORIES:
        return "other"

    return normalized


def _infer_pantry_defaults(
    product_name: str,
    category_value: Any,
    purchase_date: date,
) -> tuple[str, str, date]:
    """Infer category, storage and an editable estimated expiry date."""

    normalized_name = product_name.strip().lower()
    category = _category_value(category_value)

    for keywords, inferred_category, storage, shelf_life_days in PRODUCT_DEFAULTS:
        if any(keyword in normalized_name for keyword in keywords):
            if category == "other" and inferred_category:
                category = inferred_category

            return (
                category,
                storage,
                purchase_date + timedelta(days=shelf_life_days),
            )

    storage, shelf_life_days = CATEGORY_DEFAULTS[category]

    return (
        category,
        storage,
        purchase_date + timedelta(days=shelf_life_days),
    )


def _source_breakdown(item: GroceryListItem) -> dict[str, Any]:
    value = item.source_breakdown

    if isinstance(value, dict):
        return dict(value)

    return {}


def _find_linked_pantry_batch(
    db: Session,
    item: GroceryListItem,
    household_id: str,
) -> PantryItem | None:
    """Find the pantry batch created for a purchased grocery-list item."""

    source_breakdown = _source_breakdown(item)
    pantry_item_id = source_breakdown.get("purchased_pantry_item_id")

    if pantry_item_id:
        linked_item = (
            db.query(PantryItem)
            .filter(
                PantryItem.id == str(pantry_item_id),
                PantryItem.household_id == household_id,
            )
            .first()
        )

        if linked_item is not None:
            return linked_item

    # Fallback for purchases created before pantry_item_id was stored.
    candidates = (
        db.query(PantryItem)
        .filter(
            PantryItem.household_id == household_id,
            func.lower(PantryItem.product_name)
            == item.product_name.strip().lower(),
            PantryItem.status == PantryStatus.active,
        )
        .order_by(
            PantryItem.purchase_date.desc(),
            PantryItem.id.desc(),
        )
        .all()
    )

    if not candidates:
        return None

    expected_quantity = float(
        item.purchased_quantity
        or item.purchase_quantity
        or 0,
    )

    for candidate in candidates:
        candidate_quantity = float(
            candidate.quantity_initial or 0,
        )

        if abs(candidate_quantity - expected_quantity) <= 1e-6:
            return candidate

    return candidates[0]


def _repair_purchased_pantry_batch(
    db: Session,
    item: GroceryListItem,
    household_id: str,
) -> bool:
    """Fill missing storage/expiry data on a previously created batch."""

    pantry_item = _find_linked_pantry_batch(
        db,
        item,
        household_id,
    )

    if pantry_item is None:
        return False

    purchase_date = pantry_item.purchase_date or date.today()
    category, storage, expiry_date = _infer_pantry_defaults(
        item.product_name,
        item.category,
        purchase_date,
    )

    changed = False

    if _category_value(pantry_item.category) == "other" and category != "other":
        pantry_item.category = category
        changed = True

    current_storage = str(
        getattr(pantry_item.storage_location, "value", pantry_item.storage_location)
        or ""
    ).strip().lower()

    if current_storage in {"", "unknown", "none"}:
        pantry_item.storage_location = storage
        changed = True

    if pantry_item.expiry_date is None:
        pantry_item.expiry_date = expiry_date
        changed = True

    source_breakdown = _source_breakdown(item)

    if source_breakdown.get("purchased_pantry_item_id") != pantry_item.id:
        source_breakdown["purchased_pantry_item_id"] = pantry_item.id
        item.source_breakdown = source_breakdown
        changed = True

    return changed


@router.post(
    "/{list_id}/return-to-draft",
    response_model=GroceryListRead,
)
def return_grocery_list_to_draft(
    list_id: str,
    db: Session = Depends(get_db),
    household_id: str = Depends(get_current_household_id),
) -> GroceryList:
    """Leave shopping mode and return the active list to planning mode.

    Already purchased items stay purchased and remain in Smart Pantry.
    Older pantry batches with missing storage/expiry values are also repaired.
    """

    grocery_list = _read_list(
        db,
        list_id,
        household_id,
    )

    if grocery_list.status == GroceryListStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A completed grocery list cannot return to planning mode",
        )

    for item in grocery_list.items:
        if item.is_purchased:
            _repair_purchased_pantry_batch(
                db,
                item,
                household_id,
            )

    grocery_list.status = GroceryListStatus.draft
    grocery_list.completed_at = None

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return _read_list(
        db,
        list_id,
        household_id,
    )


@router.post(
    "/{list_id}/items/{item_id}/purchase",
    response_model=GroceryListRead,
)
def mark_grocery_item_purchased(
    list_id: str,
    item_id: str,
    db: Session = Depends(get_db),
    household_id: str = Depends(get_current_household_id),
) -> GroceryList:
    """Mark one item as bought and insert it into Smart Pantry."""

    grocery_list = _read_list(
        db,
        list_id,
        household_id,
    )

    if grocery_list.status != GroceryListStatus.shopping:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Start shopping before marking items as bought",
        )

    item = (
        db.query(GroceryListItem)
        .filter(
            GroceryListItem.id == item_id,
            GroceryListItem.grocery_list_id == grocery_list.id,
        )
        .with_for_update()
        .first()
    )

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Grocery-list item not found",
        )

    if not item.selected:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This item is not selected for shopping",
        )

    # Idempotent: repeat requests repair data but never create duplicates.
    if item.is_purchased:
        changed = _repair_purchased_pantry_batch(
            db,
            item,
            household_id,
        )

        if changed:
            try:
                db.commit()
            except Exception:
                db.rollback()
                raise

        return _read_list(
            db,
            list_id,
            household_id,
        )

    quantity = float(item.purchase_quantity or 0)

    if quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Purchase quantity must be greater than zero",
        )

    purchase_date = date.today()
    category, storage_location, expiry_date = _infer_pantry_defaults(
        item.product_name,
        item.category,
        purchase_date,
    )

    pantry_item = PantryItem(
        product_name=item.product_name.strip(),
        category=category,
        quantity_initial=quantity,
        quantity_remaining=quantity,
        unit=item.unit,
        purchase_date=purchase_date,
        expiry_date=expiry_date,
        storage_location=storage_location,
        price_amount=None,
        currency=None,
        household_id=household_id,
        status=PantryStatus.active,
    )

    db.add(pantry_item)
    db.flush()

    source_breakdown = _source_breakdown(item)
    source_breakdown["purchased_pantry_item_id"] = pantry_item.id
    item.source_breakdown = source_breakdown
    item.purchased_quantity = quantity
    item.is_purchased = True

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return _read_list(
        db,
        list_id,
        household_id,
    )