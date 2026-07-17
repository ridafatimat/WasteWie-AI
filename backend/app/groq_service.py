"""Groq-powered recipe research and natural-language meal planning.

The meal-planning flow is deliberately dynamic: no dish whitelist or hardcoded
recipe catalogue is used. Groq Compound researches the requested recipe with
web search, then a second Groq model converts the research into validated JSON
that the grocery engine can safely merge with pantry stock.
"""

from __future__ import annotations

import json
import os
from typing import Any, Literal

import httpx
from pydantic import BaseModel, Field, ValidationError


class MealPlanParseError(ValueError):
    """Raised when a meal request cannot be converted into safe structured data."""


class ParsedIngredient(BaseModel):
    product_name: str = Field(min_length=1, max_length=160)
    quantity: float = Field(gt=0, le=100000)
    unit: Literal["g", "kg", "ml", "l", "piece", "pack"]
    category: Literal[
        "beverage",
        "dairy",
        "fruit",
        "grain",
        "meat",
        "snack",
        "vegetable",
        "other",
    ] = "other"


class ParsedMeal(BaseModel):
    dish_name: str = Field(min_length=1, max_length=160)
    servings: int = Field(default=4, ge=1, le=30)
    times: int = Field(default=1, ge=1, le=14)
    ingredients: list[ParsedIngredient] = Field(min_length=1, max_length=60)
    assumptions: list[str] = Field(default_factory=list, max_length=12)


def _require_api_key() -> str:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise MealPlanParseError(
            "GROQ_API_KEY is not configured. Add it to use AI meal planning."
        )
    return api_key


def _timeout_seconds() -> float:
    raw_value = os.getenv("GROQ_TIMEOUT_SECONDS", "30").strip()
    try:
        value = float(raw_value)
    except ValueError as exc:
        raise MealPlanParseError("GROQ_TIMEOUT_SECONDS must be a number.") from exc
    return max(5.0, min(value, 90.0))


async def _post_groq(
    *,
    api_key: str,
    payload: dict[str, Any],
    timeout_seconds: float,
    latest_compound_version: bool = False,
) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if latest_compound_version:
        headers["Groq-Model-Version"] = "latest"

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise MealPlanParseError("Groq took too long to research the recipe.") from exc
    except httpx.HTTPStatusError as exc:
        detail = "Groq could not process the meal request."
        try:
            error_payload = exc.response.json()
            api_message = error_payload.get("error", {}).get("message")
            if api_message:
                detail = f"Groq request failed: {api_message}"
        except Exception:
            pass
        raise MealPlanParseError(detail) from exc
    except httpx.HTTPError as exc:
        raise MealPlanParseError("Groq is currently unavailable.") from exc

    try:
        data = response.json()
    except ValueError as exc:
        raise MealPlanParseError("Groq returned an unreadable response.") from exc

    if not isinstance(data, dict):
        raise MealPlanParseError("Groq returned an invalid response.")
    return data


def _response_content(response_payload: dict[str, Any]) -> str:
    try:
        content = response_payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise MealPlanParseError("Groq returned an incomplete response.") from exc

    if not isinstance(content, str) or not content.strip():
        raise MealPlanParseError("Groq returned an empty response.")
    return content.strip()


def _executed_web_search(response_payload: dict[str, Any]) -> bool:
    try:
        executed_tools = response_payload["choices"][0]["message"].get(
            "executed_tools", []
        )
    except (KeyError, IndexError, TypeError):
        return False

    serialized = json.dumps(executed_tools, default=str).lower()
    return "web_search" in serialized or "search_results" in serialized


def _collect_source_urls(value: Any, output: list[str]) -> None:
    if len(output) >= 8:
        return

    if isinstance(value, dict):
        for key, nested in value.items():
            if isinstance(nested, str) and key.lower() in {"url", "source_url", "link"}:
                candidate = nested.strip()
                if candidate.startswith(("http://", "https://")) and candidate not in output:
                    output.append(candidate)
            else:
                _collect_source_urls(nested, output)
    elif isinstance(value, list):
        for nested in value:
            _collect_source_urls(nested, output)


def _source_urls(response_payload: dict[str, Any]) -> list[str]:
    output: list[str] = []
    try:
        executed_tools = response_payload["choices"][0]["message"].get(
            "executed_tools", []
        )
    except (KeyError, IndexError, TypeError):
        return output
    _collect_source_urls(executed_tools, output)
    return output


async def _research_recipe(
    message: str,
    *,
    api_key: str,
    timeout_seconds: float,
) -> tuple[str, bool, list[str]]:
    model = os.getenv("GROQ_RECIPE_RESEARCH_MODEL", "groq/compound-mini").strip()

    research_prompt = f"""You are researching a recipe for a household grocery-list application.

The user's exact meal plan is:
{message}

You MUST use web search before answering. Research a representative, practical
recipe for the requested dish. Infer servings and cooking frequency from the
message; use 4 servings and one cooking occurrence only when missing.

Return a concise research brief containing:
1. dish name;
2. servings;
3. number of times it will be cooked;
4. ingredient names and quantities for ONE cooking occurrence at those servings;
5. any assumptions.

Use generic grocery names rather than brands. Exclude water. Convert teaspoons,
tablespoons, and cups into approximate grams or millilitres where practical.
Do not subtract pantry stock; the backend will do that later."""

    payload: dict[str, Any] = {
        "model": model,
        "temperature": 0.1,
        "messages": [{"role": "user", "content": research_prompt}],
    }

    if model.startswith("groq/compound"):
        payload["compound_custom"] = {
            "tools": {
                "enabled_tools": ["web_search"],
            }
        }

    response_payload = await _post_groq(
        api_key=api_key,
        payload=payload,
        timeout_seconds=timeout_seconds,
        latest_compound_version=model.startswith("groq/compound"),
    )
    return (
        _response_content(response_payload),
        _executed_web_search(response_payload),
        _source_urls(response_payload),
    )


async def _structure_recipe(
    message: str,
    research: str,
    *,
    api_key: str,
    timeout_seconds: float,
) -> ParsedMeal:
    model = os.getenv(
        "GROQ_STRUCTURED_MODEL",
        os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
    ).strip()

    system_prompt = """Convert recipe research into JSON for a grocery-list application.
Return only one JSON object with these exact keys:
- dish_name: concise dish name
- servings: integer 1-30; use 4 only when genuinely missing
- times: integer 1-14; how many times the dish will be cooked; use 1 only when missing
- ingredients: array for ONE cooking occurrence at the stated servings. Each item must have product_name, quantity, unit, category.
- assumptions: array of short strings explaining defaults or interpretations

Allowed units: g, kg, ml, l, piece, pack.
Allowed categories: beverage, dairy, fruit, grain, meat, snack, vegetable, other.
Use generic ingredient names, not brands. Exclude water. Merge duplicate ingredients.
Convert spoon/cup measures into practical grams or millilitres. Never return zero or negative quantities."""

    user_prompt = f"""Original user request:
{message}

Web-researched recipe brief:
{research}

Produce the required JSON now."""

    payload = {
        "model": model,
        "temperature": 0.0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }

    response_payload = await _post_groq(
        api_key=api_key,
        payload=payload,
        timeout_seconds=timeout_seconds,
    )

    try:
        parsed = ParsedMeal.model_validate_json(_response_content(response_payload))
    except ValidationError as exc:
        raise MealPlanParseError("Groq returned an invalid recipe structure.") from exc

    _validate_ingredient_limits(parsed.ingredients)
    return parsed


def _validate_ingredient_limits(ingredients: list[ParsedIngredient]) -> None:
    for ingredient in ingredients:
        quantity = ingredient.quantity
        if ingredient.unit in {"kg", "l"} and quantity > 100:
            raise MealPlanParseError("An AI ingredient quantity exceeded the safe limit.")
        if ingredient.unit in {"piece", "pack"} and quantity > 500:
            raise MealPlanParseError("An AI ingredient count exceeded the safe limit.")


def _merge_duplicate_ingredients(
    ingredients: list[ParsedIngredient],
    times: int,
) -> list[dict[str, Any]]:
    merged: dict[tuple[str, str], dict[str, Any]] = {}

    for ingredient in ingredients:
        data = ingredient.model_dump()
        product_name = " ".join(data["product_name"].strip().split())
        key = (product_name.casefold(), data["unit"])
        multiplied_quantity = round(float(data["quantity"]) * times, 4)

        existing = merged.get(key)
        if existing is None:
            data["product_name"] = product_name
            data["quantity"] = multiplied_quantity
            merged[key] = data
        else:
            existing["quantity"] = round(
                float(existing["quantity"]) + multiplied_quantity,
                4,
            )

    return list(merged.values())


async def parse_meal_request(message: str) -> dict[str, Any]:
    """Research and parse any user-supplied recipe with Groq.

    There is intentionally no hardcoded dish list. The returned ingredient
    quantities are scaled for the requested cooking frequency before being
    passed to the grocery-list engine.
    """

    cleaned_message = " ".join(message.strip().split())
    if len(cleaned_message) < 3:
        raise MealPlanParseError("Please enter a meal or recipe to plan.")

    api_key = _require_api_key()
    timeout_seconds = _timeout_seconds()

    research, used_web_search, sources = await _research_recipe(
        cleaned_message,
        api_key=api_key,
        timeout_seconds=timeout_seconds,
    )

    require_web = os.getenv("GROQ_REQUIRE_WEB_SEARCH", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    if require_web and not used_web_search:
        raise MealPlanParseError(
            "Groq did not execute web search for this recipe. Please try again."
        )

    parsed = await _structure_recipe(
        cleaned_message,
        research,
        api_key=api_key,
        timeout_seconds=timeout_seconds,
    )

    assumptions = list(parsed.assumptions)
    if not used_web_search:
        assumptions.append(
            "Groq Compound did not report a web-search tool call for this request."
        )
    elif sources:
        source_hosts: list[str] = []
        for url in sources:
            host = url.split("//", 1)[-1].split("/", 1)[0]
            if host and host not in source_hosts:
                source_hosts.append(host)
        if source_hosts:
            assumptions.append(
                "Recipe research sources: " + ", ".join(source_hosts[:5]) + "."
            )

    return {
        "dish_name": parsed.dish_name,
        "servings": parsed.servings,
        "times": parsed.times,
        "ingredients": _merge_duplicate_ingredients(
            parsed.ingredients,
            parsed.times,
        ),
        "assumptions": list(dict.fromkeys(assumptions)),
        "recipe_source": "groq_web" if used_web_search else "groq_compound",
    }
