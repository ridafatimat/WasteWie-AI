import os
import tempfile
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.gettempdir()}/wastewise-test.db"
os.environ["GROQ_API_KEY"] = ""

from fastapi.testclient import TestClient

from app.database import Base, SessionLocal, engine
from app.grocery_service import reconcile_receipt_changes
from app.main import app


client = TestClient(app)


def setup_function():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


def auth_headers():
    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Rida",
            "email": "rida-grocery@example.com",
            "password": "safe-password",
            "household_name": "Rida's home",
        },
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_item(headers, name, quantity, unit, category="other"):
    today = date.today()
    response = client.post(
        "/api/v1/pantry-items",
        headers=headers,
        json={
            "product_name": name,
            "category": category,
            "quantity": quantity,
            "unit": unit,
            "purchase_date": (today - timedelta(days=6)).isoformat(),
            "expiry_date": (today + timedelta(days=30)).isoformat(),
            "storage_location": "pantry",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_rule_based_list_is_reused_and_locked_edits_survive():
    headers = auth_headers()
    milk_id = create_item(headers, "Milk", 10, "l", "dairy")
    event = client.post(
        f"/api/v1/pantry-items/{milk_id}/events",
        headers=headers,
        json={
            "event_type": "consumed",
            "quantity": 7,
            "occurred_at": (datetime.now(timezone.utc) - timedelta(days=6)).isoformat(),
        },
    )
    assert event.status_code == 201, event.text

    first = client.post(
        "/api/v1/grocery-lists/generate",
        headers=headers,
        json={"coverage_days": 7},
    )
    assert first.status_code == 200, first.text
    payload = first.json()
    list_id = payload["id"]
    milk = next(item for item in payload["items"] if item["product_name"] == "Milk")
    assert milk["unit"] == "l"
    assert milk["purchase_quantity"] == 5
    assert milk["source_type"] == "consumption"

    patch = client.patch(
        f"/api/v1/grocery-lists/{list_id}/items/{milk['id']}",
        headers=headers,
        json={"purchase_quantity": 9},
    )
    assert patch.status_code == 200
    assert patch.json()["user_locked"] is True

    second = client.post(
        "/api/v1/grocery-lists/generate",
        headers=headers,
        json={"coverage_days": 14},
    )
    assert second.status_code == 200
    assert second.json()["id"] == list_id
    locked_milk = next(item for item in second.json()["items"] if item["id"] == milk["id"])
    assert locked_milk["purchase_quantity"] == 9


def test_dynamic_groq_meal_subtracts_pantry_and_merges_into_final_list(monkeypatch):
    headers = auth_headers()
    create_item(headers, "Tomatoes", 250, "g", "vegetable")

    generated = client.post(
        "/api/v1/grocery-lists/generate",
        headers=headers,
        json={"coverage_days": 7},
    )
    list_id = generated.json()["id"]

    async def fake_parse_meal_request(_message):
        return {
            "dish_name": "Mutton Nihari",
            "servings": 6,
            "times": 2,
            "recipe_source": "groq_web",
            "ingredients": [
                {
                    "product_name": "Mutton",
                    "quantity": 3000,
                    "unit": "g",
                    "category": "meat",
                },
                {
                    "product_name": "Tomatoes",
                    "quantity": 1000,
                    "unit": "g",
                    "category": "vegetable",
                },
            ],
            "assumptions": ["Recipe research sources: example.com."],
        }

    monkeypatch.setattr(
        "app.grocery_routes.parse_meal_request",
        fake_parse_meal_request,
    )

    response = client.post(
        f"/api/v1/grocery-lists/{list_id}/meals",
        headers=headers,
        json={"message": "I plan to make mutton nihari twice for 6 people"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["meal_plans"][0]["dish_name"] == "Mutton Nihari"
    assert payload["meal_plans"][0]["recipe_source"] == "groq_web"

    tomato = next(item for item in payload["items"] if item["product_name"] == "Tomatoes")
    mutton = next(item for item in payload["items"] if item["product_name"] == "Mutton")
    assert tomato["unit"] == "kg"
    assert tomato["pantry_quantity"] == 0.25
    assert tomato["purchase_quantity"] == 0.75
    assert tomato["source_type"] == "meal_plan"
    assert mutton["unit"] == "kg"
    assert mutton["purchase_quantity"] == 3


def test_manual_item_receipt_reconciliation_completes_list():
    headers = auth_headers()
    generated = client.post(
        "/api/v1/grocery-lists/generate",
        headers=headers,
        json={"coverage_days": 7},
    )
    list_id = generated.json()["id"]

    manual = client.post(
        f"/api/v1/grocery-lists/{list_id}/items",
        headers=headers,
        json={
            "product_name": "Eggs",
            "purchase_quantity": 6,
            "unit": "pieces",
            "category": "dairy",
        },
    )
    assert manual.status_code == 201, manual.text

    me = client.get("/api/v1/auth/me", headers=headers).json()
    # Resolve the household through the generated list while using the real DB service.
    with SessionLocal() as db:
        from app.models import GroceryList

        grocery_list = db.get(GroceryList, list_id)
        assert grocery_list is not None
        reconcile_receipt_changes(
            db,
            grocery_list.household_id,
            [
                SimpleNamespace(
                    action="created",
                    product_name="Eggs",
                    quantity_added=6,
                    unit="pieces",
                )
            ],
        )

    active = client.get("/api/v1/grocery-lists/active", headers=headers)
    assert active.status_code == 200
    assert active.json() is None
    history = client.get("/api/v1/grocery-lists/history", headers=headers)
    assert history.status_code == 200
    assert history.json()[0]["id"] == list_id
    assert history.json()[0]["items"][0]["is_purchased"] is True
