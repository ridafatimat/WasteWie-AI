"""API routes for rule-based grocery lists and Groq-assisted meal planning."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .auth import get_current_household_id
from .database import get_db
from .groq_service import MealPlanParseError, parse_meal_request
from .grocery_service import (
    add_meal_plan,
    canonicalize_quantity,
    complete_grocery_list,
    get_active_grocery_list,
    get_grocery_list_or_404,
    normalize_product_name,
    regenerate_grocery_list,
    remove_meal_plan,
    start_shopping,
)
from .models import GroceryList, GroceryListItem, GroceryListStatus
from .schemas import (
    GroceryListGenerateRequest,
    GroceryListHistoryItem,
    GroceryListItemCreate,
    GroceryListItemRead,
    GroceryListItemUpdate,
    GroceryListRead,
    MealPlanCreateRequest,
)


router = APIRouter(prefix="/grocery-lists", tags=["Grocery lists"])


def _ensure_editable(grocery_list: GroceryList) -> None:
    if grocery_list.status == GroceryListStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A completed grocery list cannot be changed",
        )


@router.get("/active", response_model=GroceryListRead | None)
def active_grocery_list(
    household_id: str = Depends(get_current_household_id),
    db: Session = Depends(get_db),
):
    """Return the one active draft/shopping list, or null when none exists."""

    return get_active_grocery_list(db, household_id)


@router.post("/generate", response_model=GroceryListRead)
def generate_grocery_list(
    payload: GroceryListGenerateRequest,
    household_id: str = Depends(get_current_household_id),
    db: Session = Depends(get_db),
):
    """Create or refresh the household's active explainable grocery list."""

    return regenerate_grocery_list(db, household_id, payload.coverage_days)


@router.get("/history", response_model=list[GroceryListHistoryItem])
def grocery_list_history(
    household_id: str = Depends(get_current_household_id),
    db: Session = Depends(get_db),
):
    """Return completed grocery lists, newest first."""

    return (
        db.query(GroceryList)
        .options(
            selectinload(GroceryList.items),
            selectinload(GroceryList.meal_plans),
        )
        .filter(
            GroceryList.household_id == household_id,
            GroceryList.status == GroceryListStatus.completed,
        )
        .order_by(GroceryList.completed_at.desc(), GroceryList.created_at.desc())
        .all()
    )


@router.get("/{list_id}", response_model=GroceryListRead)
def read_grocery_list(
    list_id: str,
    household_id: str = Depends(get_current_household_id),
    db: Session = Depends(get_db),
):
    return get_grocery_list_or_404(db, list_id, household_id)


@router.post("/{list_id}/meals", response_model=GroceryListRead)
async def add_meal(
    list_id: str,
    payload: MealPlanCreateRequest,
    household_id: str = Depends(get_current_household_id),
    db: Session = Depends(get_db),
):
    """Parse a meal request, add its shortages, and merge duplicate products."""

    grocery_list = get_grocery_list_or_404(db, list_id, household_id)
    _ensure_editable(grocery_list)

    try:
        parsed = await parse_meal_request(payload.message)
    except MealPlanParseError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    return add_meal_plan(db, grocery_list, payload.message, parsed)


@router.delete(
    "/{list_id}/meals/{meal_id}",
    response_model=GroceryListRead,
)
def delete_meal(
    list_id: str,
    meal_id: str,
    household_id: str = Depends(get_current_household_id),
    db: Session = Depends(get_db),
):
    grocery_list = get_grocery_list_or_404(db, list_id, household_id)
    _ensure_editable(grocery_list)
    return remove_meal_plan(db, grocery_list, meal_id)


@router.post(
    "/{list_id}/items",
    response_model=GroceryListItemRead,
    status_code=status.HTTP_201_CREATED,
)
def add_manual_item(
    list_id: str,
    payload: GroceryListItemCreate,
    household_id: str = Depends(get_current_household_id),
    db: Session = Depends(get_db),
):
    """Add a manual item or merge it into the matching existing row."""

    grocery_list = get_grocery_list_or_404(db, list_id, household_id)
    _ensure_editable(grocery_list)

    normalized_name = normalize_product_name(payload.product_name)
    _, base_unit = canonicalize_quantity(payload.product_name, 1, payload.unit)
    existing = None
    for row in grocery_list.items:
        _, row_base_unit = canonicalize_quantity(row.product_name, 1, row.unit)
        if normalize_product_name(row.product_name) == normalized_name and row_base_unit == base_unit:
            existing = row
            break

    if existing is not None:
        payload_base_quantity, _ = canonicalize_quantity(
            payload.product_name, payload.purchase_quantity, payload.unit
        )
        one_existing_unit_in_base, _ = canonicalize_quantity(
            existing.product_name, 1, existing.unit
        )
        quantity_in_existing_unit = (
            payload_base_quantity / one_existing_unit_in_base
            if one_existing_unit_in_base
            else payload.purchase_quantity
        )
        existing.purchase_quantity = round(
            existing.purchase_quantity + quantity_in_existing_unit, 4
        )
        existing.required_quantity = max(
            existing.required_quantity,
            existing.purchase_quantity + existing.pantry_quantity,
        )
        existing.selected = payload.selected
        existing.user_locked = True
        existing.priority = "manual" if existing.source_type == "manual" else existing.priority
        existing.source_type = "manual" if existing.source_type == "manual" else "combined"
        breakdown = dict(existing.source_breakdown or {})
        manual = dict(breakdown.get("manual", {}))
        manual["added_quantity"] = round(
            float(manual.get("added_quantity", 0)) + quantity_in_existing_unit, 4
        )
        manual["unit"] = existing.unit
        breakdown["manual"] = manual
        existing.source_breakdown = breakdown
        existing.reason = (
            (existing.reason + " " if existing.reason else "")
            + "The user manually increased this item."
        )
        db.commit()
        db.refresh(existing)
        return existing

    item = GroceryListItem(
        grocery_list=grocery_list,
        product_name=payload.product_name.strip(),
        normalized_name=normalized_name,
        category=payload.category,
        required_quantity=payload.purchase_quantity,
        pantry_quantity=0,
        purchase_quantity=payload.purchase_quantity,
        purchased_quantity=0,
        unit=payload.unit.strip(),
        priority="manual",
        source_type="manual",
        reason="Added manually by the user.",
        selected=payload.selected,
        user_locked=True,
        source_breakdown={
            "manual": {
                "added_quantity": payload.purchase_quantity,
                "unit": payload.unit.strip(),
            }
        },
    )
    db.add(item)
    try:
        db.commit()
        db.refresh(item)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This product is already on the grocery list",
        ) from exc
    return item


@router.patch(
    "/{list_id}/items/{item_id}",
    response_model=GroceryListItemRead,
)
def update_grocery_item(
    list_id: str,
    item_id: str,
    payload: GroceryListItemUpdate,
    household_id: str = Depends(get_current_household_id),
    db: Session = Depends(get_db),
):
    grocery_list = get_grocery_list_or_404(db, list_id, household_id)
    _ensure_editable(grocery_list)
    item = next((row for row in grocery_list.items if row.id == item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Grocery-list item not found")

    values = payload.model_dump(exclude_unset=True)
    changed_core_field = any(
        field in values for field in ("product_name", "purchase_quantity", "unit", "category")
    )
    for field, value in values.items():
        if field == "product_name" and value is not None:
            value = value.strip()
        if field == "unit" and value is not None:
            value = value.strip()
        setattr(item, field, value)

    item.normalized_name = normalize_product_name(item.product_name)
    if changed_core_field and "user_locked" not in values:
        item.user_locked = True
    item.is_purchased = (
        item.purchase_quantity > 0
        and item.purchased_quantity + 1e-6 >= item.purchase_quantity
    )

    try:
        db.commit()
        db.refresh(item)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another matching product already exists on this list",
        ) from exc
    return item


@router.delete(
    "/{list_id}/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_grocery_item(
    list_id: str,
    item_id: str,
    household_id: str = Depends(get_current_household_id),
    db: Session = Depends(get_db),
):
    grocery_list = get_grocery_list_or_404(db, list_id, household_id)
    _ensure_editable(grocery_list)
    item = next((row for row in grocery_list.items if row.id == item_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Grocery-list item not found")
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{list_id}/start-shopping", response_model=GroceryListRead)
def mark_shopping(
    list_id: str,
    household_id: str = Depends(get_current_household_id),
    db: Session = Depends(get_db),
):
    grocery_list = get_grocery_list_or_404(db, list_id, household_id)
    return start_shopping(db, grocery_list)


@router.post("/{list_id}/complete", response_model=GroceryListRead)
def complete_list(
    list_id: str,
    household_id: str = Depends(get_current_household_id),
    db: Session = Depends(get_db),
):
    grocery_list = get_grocery_list_or_404(db, list_id, household_id)
    return complete_grocery_list(db, grocery_list)
