import enum
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utc_now() -> datetime:
    """Return the current UTC datetime."""

    return datetime.now(timezone.utc)


class PantryStatus(str, enum.Enum):
    active = "active"
    consumed = "consumed"
    wasted = "wasted"
    expired = "expired"


class EventType(str, enum.Enum):
    consumed = "consumed"
    wasted = "wasted"
    expired = "expired"
    adjusted = "adjusted"
    updated = "updated"


class GroceryListStatus(str, enum.Enum):
    draft = "draft"
    shopping = "shopping"
    completed = "completed"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    memberships: Mapped[list["HouseholdMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Household(Base):
    __tablename__ = "households"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(120))
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Karachi")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    members: Mapped[list["HouseholdMember"]] = relationship(
        back_populates="household", cascade="all, delete-orphan"
    )
    grocery_lists: Mapped[list["GroceryList"]] = relationship(
        back_populates="household", cascade="all, delete-orphan"
    )


class HouseholdMember(Base):
    __tablename__ = "household_members"
    __table_args__ = (
        UniqueConstraint("household_id", "user_id", name="uq_household_user"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    household_id: Mapped[str] = mapped_column(
        ForeignKey("households.id"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(24), default="owner")

    household: Mapped[Household] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


class PantryItem(Base):
    __tablename__ = "pantry_items"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    household_id: Mapped[str] = mapped_column(
        String(36), default="demo-household", index=True
    )
    product_name: Mapped[str] = mapped_column(String(160), index=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    quantity_initial: Mapped[float] = mapped_column(Float)
    quantity_remaining: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(32))
    purchase_date: Mapped[date] = mapped_column(Date)
    expiry_date: Mapped[date | None] = mapped_column(
        Date, nullable=True, index=True
    )
    storage_location: Mapped[str | None] = mapped_column(
        String(80), nullable=True
    )
    price_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    status: Mapped[PantryStatus] = mapped_column(
        Enum(PantryStatus), default=PantryStatus.active
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    events: Mapped[list["InventoryEvent"]] = relationship(
        back_populates="pantry_item", cascade="all, delete-orphan"
    )


class InventoryEvent(Base):
    __tablename__ = "inventory_events"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    pantry_item_id: Mapped[str] = mapped_column(
        ForeignKey("pantry_items.id"), index=True
    )
    event_type: Mapped[EventType] = mapped_column(Enum(EventType))
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    previous_values: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    pantry_item: Mapped[PantryItem] = relationship(back_populates="events")


class ProcessedReceipt(Base):
    """Stores a hash and metadata for each successfully processed receipt."""

    __tablename__ = "processed_receipts"
    __table_args__ = (
        UniqueConstraint(
            "household_id",
            "file_hash",
            name="uq_processed_receipt_household_hash",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    household_id: Mapped[str] = mapped_column(
        ForeignKey("households.id"), index=True
    )
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    original_filename: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    content_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    merchant_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    total_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    extracted_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )


class GroceryList(Base):
    """One active or historical grocery list for a household."""

    __tablename__ = "grocery_lists"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    household_id: Mapped[str] = mapped_column(
        ForeignKey("households.id"), index=True
    )
    coverage_days: Mapped[int] = mapped_column(Integer, default=7)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[GroceryListStatus] = mapped_column(
        Enum(GroceryListStatus), default=GroceryListStatus.draft, index=True
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    household: Mapped[Household] = relationship(back_populates="grocery_lists")
    items: Mapped[list["GroceryListItem"]] = relationship(
        back_populates="grocery_list",
        cascade="all, delete-orphan",
        order_by="GroceryListItem.created_at",
    )
    meal_plans: Mapped[list["MealPlan"]] = relationship(
        back_populates="grocery_list",
        cascade="all, delete-orphan",
        order_by="MealPlan.created_at",
    )


class GroceryListItem(Base):
    """One editable, explainable item in a grocery list."""

    __tablename__ = "grocery_list_items"
    __table_args__ = (
        UniqueConstraint(
            "grocery_list_id",
            "normalized_name",
            "unit",
            name="uq_grocery_list_item_product_unit",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    grocery_list_id: Mapped[str] = mapped_column(
        ForeignKey("grocery_lists.id"), index=True
    )
    product_name: Mapped[str] = mapped_column(String(160))
    normalized_name: Mapped[str] = mapped_column(String(160), index=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    required_quantity: Mapped[float] = mapped_column(Float, default=0)
    pantry_quantity: Mapped[float] = mapped_column(Float, default=0)
    purchase_quantity: Mapped[float] = mapped_column(Float, default=0)
    purchased_quantity: Mapped[float] = mapped_column(Float, default=0)
    average_daily_consumption: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    estimated_days_remaining: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )
    unit: Mapped[str] = mapped_column(String(32))
    priority: Mapped[str] = mapped_column(String(32), default="running_low")
    source_type: Mapped[str] = mapped_column(String(32), default="consumption")
    reason: Mapped[str | None] = mapped_column(String(700), nullable=True)
    selected: Mapped[bool] = mapped_column(Boolean, default=True)
    user_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    is_purchased: Mapped[bool] = mapped_column(Boolean, default=False)
    source_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    grocery_list: Mapped[GroceryList] = relationship(back_populates="items")


class MealPlan(Base):
    """A user-requested meal whose missing ingredients feed a grocery list."""

    __tablename__ = "meal_plans"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    grocery_list_id: Mapped[str] = mapped_column(
        ForeignKey("grocery_lists.id"), index=True
    )
    original_request: Mapped[str] = mapped_column(String(500))
    dish_name: Mapped[str] = mapped_column(String(160))
    servings: Mapped[int] = mapped_column(Integer, default=4)
    times: Mapped[int] = mapped_column(Integer, default=1)
    recipe_source: Mapped[str] = mapped_column(String(32), default="groq")
    ingredients: Mapped[list] = mapped_column(JSON, default=list)
    assumptions: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now
    )

    grocery_list: Mapped[GroceryList] = relationship(back_populates="meal_plans")
