# WasteWise API

Backend slice for account authentication, household-isolated pantry tracking, inventory audit events, expiry-based Rescue Mode, and an offline waste-risk model.

## Run locally

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for Swagger. The local default is SQLite (`wastewise.db`); set `DATABASE_URL` to a PostgreSQL connection string when the shared database is ready.

## Authentication

Register with `POST /api/v1/auth/register`, copy its `access_token`, then use Swagger's **Authorize** button to enter `Bearer <access_token>`. Pantry, event, dashboard, and prediction endpoints are limited to the household created with that account.

Set a long random `JWT_SECRET` before deployment (see `.env.example`).

## Train and evaluate the model

The supplied CSV contains 500 preprocessed rows and a `used_before_expiry` label. The training pipeline converts the positive class to `not_used_before_expiry`, because that is the waste outcome the API needs to score.

From the backend directory:

```powershell
python training/train.py --data "C:\path\to\food_expiry_tracker.csv"
```

The command:

1. validates the dataset;
2. creates an 80/20 stratified train/test split;
3. trains a class-balanced logistic-regression baseline;
4. trains a class-balanced XGBoost model;
5. evaluates waste precision, recall, F1, ROC-AUC, balanced accuracy, and confusion matrices;
6. selects the stronger model unless `--model` forces one;
7. saves `artifacts/waste_risk_model.joblib` and `artifacts/waste_risk_model.metrics.json`.

Force XGBoost for an experiment with:

```powershell
python training/train.py --data "C:\path\to\food_expiry_tracker.csv" --model xgboost
```

With the currently supplied dataset, the balanced logistic baseline performs better than XGBoost on the hold-out set, although both models are still weak. Treat the model as an experimental POC until more informative household consumption data is available.

## Test predictions

Restart the API after training:

```powershell
python -m uvicorn app.main:app --reload
```

Then:

1. register or log in;
2. authorize Swagger with `Bearer <access_token>`;
3. create pantry items with category and storage values matching the training categories;
4. call `GET /api/v1/predictions/waste-risk`.

The separate `GET /api/v1/dashboard/rescue-mode` endpoint continues to use transparent expiry rules as the safe live fallback.

## Personalisation roadmap

The database already records `household_id`, pantry items, and inventory events. These events should later be converted into completed outcomes such as consumed, wasted, or expired. Periodic retraining can then combine the general dataset with real household behaviour. A household-specific model should only be introduced after enough completed outcomes exist; before that, household history should be added as features to the shared model.

## Grocery ideas and meal planning

The backend keeps one active grocery list per household. It combines:

- current Smart Pantry quantities;
- `consumed` inventory events from the last 90 days;
- a minimum seven-day observation window to avoid overreacting to one event;
- a small safety-stock allowance;
- planned-meal ingredient requirements;
- manual, user-locked list items.

Core endpoints:

```text
GET    /api/v1/grocery-lists/active
POST   /api/v1/grocery-lists/generate
GET    /api/v1/grocery-lists/{list_id}
POST   /api/v1/grocery-lists/{list_id}/meals
DELETE /api/v1/grocery-lists/{list_id}/meals/{meal_id}
POST   /api/v1/grocery-lists/{list_id}/items
PATCH  /api/v1/grocery-lists/{list_id}/items/{item_id}
DELETE /api/v1/grocery-lists/{list_id}/items/{item_id}
POST   /api/v1/grocery-lists/{list_id}/start-shopping
POST   /api/v1/grocery-lists/{list_id}/complete
GET    /api/v1/grocery-lists/history
```

Generate or refresh a seven-day list:

```json
{
  "coverage_days": 7
}
```

Add a meal:

```json
{
  "message": "I plan to make chicken karahi twice this week for 5 people"
}
```

Meal planning is not limited to a fixed recipe catalogue. For any dish the user enters, Groq Compound performs web search, a second Groq model converts the research into validated ingredient JSON, and the backend applies frequency, safe quantity limits, pantry subtraction, and duplicate merging. Set `GROQ_API_KEY` to enable planned meals; the normal rule-based grocery list works without it.

Recommended environment values:

```env
GROQ_API_KEY=your-key-here
GROQ_RECIPE_RESEARCH_MODEL=groq/compound-mini
GROQ_STRUCTURED_MODEL=llama-3.3-70b-versatile
GROQ_TIMEOUT_SECONDS=30
GROQ_REQUIRE_WEB_SEARCH=false
```

Receipt processing reconciles matching active grocery-list rows. A partial receipt keeps the list active; when all selected rows are satisfied, the list is completed automatically and remains available in history.
