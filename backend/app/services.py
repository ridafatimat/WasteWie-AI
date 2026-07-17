"""Business logic for pantry items, inventory events, and rescue scoring."""

from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .models import EventType, InventoryEvent, PantryItem, PantryStatus
from .schemas import EventCreate, PantryItemUpdate


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


def update_item(
    db: Session,
    item: PantryItem,
    changes: PantryItemUpdate,
) -> PantryItem:
    """Update a pantry item and record a JSON-safe audit event."""

    values = changes.model_dump(exclude_unset=True)
    if not values:
        return item

    new_purchase_date = values.get("purchase_date", item.purchase_date)
    new_expiry_date = values.get("expiry_date", item.expiry_date)
    if (
        new_expiry_date is not None
        and new_purchase_date is not None
        and new_expiry_date < new_purchase_date
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="expiry_date must be on or after purchase_date",
        )

    # API fields are friendlier than the storage-column names.
    mapped_values: dict[str, Any] = {}
    for field, value in values.items():
        if field == "quantity":
            mapped_values["quantity_remaining"] = value
            if value > item.quantity_initial:
                mapped_values["quantity_initial"] = value
        elif field == "price":
            if value is None:
                mapped_values["price_amount"] = None
                mapped_values["currency"] = None
            else:
                mapped_values["price_amount"] = value["amount"]
                mapped_values["currency"] = value["currency"].upper()
        else:
            mapped_values[field] = value

    previous_values: dict[str, Any] = {}
    changed_values: dict[str, Any] = {}
    for field, new_value in mapped_values.items():
        current_value = getattr(item, field)
        if current_value == new_value:
            continue
        previous_values[field] = make_json_safe(current_value)
        changed_values[field] = make_json_safe(new_value)
        setattr(item, field, new_value)

    if not previous_values:
        return item

    old_quantity = float(
        previous_values.get(
            "quantity_remaining",
            item.quantity_remaining,
        )
    )
    new_quantity = float(item.quantity_remaining)

    if item.quantity_remaining <= 0:
        item.quantity_remaining = 0
        item.status = PantryStatus.consumed
    else:
        item.status = PantryStatus.active

    quantity_delta = old_quantity - new_quantity

    if quantity_delta > 1e-9:
        event_type = EventType.consumed
        event_quantity = quantity_delta
        event_notes = "Pantry quantity reduced"
    elif quantity_delta < -1e-9:
        event_type = EventType.adjusted
        event_quantity = new_quantity
        event_notes = "Pantry quantity increased"
    else:
        event_type = EventType.updated
        event_quantity = None
        event_notes = "Pantry item details updated"

    db_event = InventoryEvent(
        pantry_item=item,
        event_type=event_type,
        quantity=event_quantity,
        occurred_at=datetime.now(timezone.utc),
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
    except Exception:
        db.rollback()
        raise

    return item


def record_event(
    db: Session,
    item: PantryItem,
    event: EventCreate,
) -> InventoryEvent:
    """Record a quantity event and update the pantry batch."""

    if event.event_type == "updated":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Use PATCH to update pantry item details",
        )
    if event.quantity is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="quantity is required for inventory events",
        )
    if event.quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Event quantity must be greater than zero",
        )

    event_type = EventType(event.event_type)
    if event.event_type != "adjusted" and event.quantity > item.quantity_remaining:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Event quantity cannot exceed the remaining quantity",
        )

    previous_values = {
        "quantity_remaining": make_json_safe(item.quantity_remaining),
        "status": make_json_safe(item.status),
    }

    if event.event_type == "adjusted":
        item.quantity_remaining = event.quantity
        if event.quantity > item.quantity_initial:
            item.quantity_initial = event.quantity
    else:
        item.quantity_remaining -= event.quantity

    if item.quantity_remaining < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Remaining quantity cannot be negative",
        )

    if item.quantity_remaining == 0:
        item.status = (
            PantryStatus.consumed
            if event.event_type == "adjusted"
            else PantryStatus(event.event_type)
        )
    else:
        item.status = PantryStatus.active

    db_event = InventoryEvent(
        pantry_item=item,
        event_type=event_type,
        quantity=event.quantity,
        occurred_at=event.occurred_at or datetime.now(timezone.utc),
        notes=event.notes,
        previous_values=previous_values,
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
            ["Already past its expiry date"],
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
            [f"Expires in {days} days"],
        )

    if days <= 7:
        return (
            0.45,
            [f"Expires in {days} days"],
        )

    return (
        0.10,
        ["Expiry date is more than a week away"],
    )