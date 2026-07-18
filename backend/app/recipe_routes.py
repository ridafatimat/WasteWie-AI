"""FastAPI routes for Groq-powered expiry-rescue recipes."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .auth import get_current_household_id
from .database import get_db
from .schemas import (
    RecipeSuggestionRequest,
    RecipeSuggestionResponse,
)
from .services import (
    generate_expiry_rescue_recipes,
)


router = APIRouter(
    prefix="/recommendations",
    tags=["recipe recommendations"],
)


@router.post(
    "/recipes",
    response_model=RecipeSuggestionResponse,
)
def suggest_expiry_rescue_recipes(
    payload: RecipeSuggestionRequest,
    household_id: str = Depends(
        get_current_household_id,
    ),
    db: Session = Depends(get_db),
):
    return generate_expiry_rescue_recipes(
        db=db,
        household_id=household_id,
        request=payload,
    )