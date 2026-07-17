# WasteWise Grocery Ideas Backend Update

## Added

- One active grocery list per household (`draft` or `shopping`).
- Rule-based quantities from current pantry stock and the last 90 days of `consumed` events.
- A seven-day minimum observation window and a small safety-stock allowance.
- Dynamic Groq meal planning for any recipe entered by the user.
- Groq Compound web search before ingredient extraction; there is no dish whitelist or hardcoded recipe catalogue.
- A second Groq call converts recipe research into validated structured JSON.
- Pantry-aware ingredient subtraction and duplicate product merging.
- Manual grocery items, editable quantities, selection state, and user locking.
- Grocery-list completion and history.
- Receipt-to-list reconciliation. Partial receipts keep the list active; a fully satisfied list completes automatically.

## Environment

Keep your existing `.env` file and add:

```env
GROQ_API_KEY=your-key-here
GROQ_RECIPE_RESEARCH_MODEL=groq/compound-mini
GROQ_STRUCTURED_MODEL=llama-3.3-70b-versatile
GROQ_TIMEOUT_SECONDS=30
GROQ_REQUIRE_WEB_SEARCH=false
```

The normal rule-based grocery list works without Groq. Adding planned meals requires a Groq API key.

## Meal-planning flow

```text
Any user recipe request
-> Groq Compound web search
-> structured recipe validation
-> multiply by cooking frequency
-> subtract pantry stock
-> merge with consumption recommendations
-> save in the active grocery list
```

Example request:

```json
{
  "message": "I plan to make mutton nihari twice this week for 6 people"
}
```

## Main endpoints

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

## Database

The existing startup call to `Base.metadata.create_all()` creates:

- `grocery_lists`
- `grocery_list_items`
- `meal_plans`

## Verification

Run:

```powershell
python -m pytest -q
```

The included suite covers authentication, pantry events, grocery generation, list reuse, locked edits, dynamic meal planning, pantry subtraction, and receipt reconciliation.
