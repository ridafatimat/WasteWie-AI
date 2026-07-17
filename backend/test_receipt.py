from __future__ import annotations

import mimetypes
import os
import time
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field


load_dotenv()


class ReceiptItem(BaseModel):
    raw_name: str = Field(
        description="Exact product name visible on the receipt."
    )
    product_name: str = Field(
        description="Clean, human-readable product name."
    )

    purchased_quantity: float | None = Field(
        default=None,
        description="Number of units purchased. Do not confuse with package size.",
    )

    package_size: float | None = Field(
        default=None,
        description="Package size such as 1 for 1L or 500 for 500g.",
    )

    package_unit: Literal[
        "g",
        "kg",
        "ml",
        "l",
        "piece",
        "pack",
        "unknown",
    ] = "unknown"

    unit_price: float | None = None
    line_total: float | None = None

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

    location: Literal[
        "fridge",
        "freezer",
        "pantry",
        "unknown",
    ] = "unknown"

    is_food_item: bool = True

    uncertain_fields: list[str] = Field(
        default_factory=list,
        description="Fields that could not be read confidently.",
    )


class ReceiptData(BaseModel):
    merchant_name: str | None = None
    invoice_number: str | None = None

    purchase_date: str | None = Field(
        default=None,
        description="Purchase date in YYYY-MM-DD format.",
    )

    currency: str = "PKR"
    total_amount: float | None = None
    items: list[ReceiptItem] = Field(default_factory=list)


PROMPT = """
Analyse this Pakistani retail receipt.

Extract only purchased product line items.

Rules:
1. Ignore payment, change, subtotal, tax, receipt total, invoice metadata,
   headings and Urdu terms and conditions when identifying products.
2. Keep purchased quantity separate from package size.
3. Example: "Milk 1L, Qty 2" means:
   purchased_quantity = 2
   package_size = 1
   package_unit = "l"
4. Do not invent missing quantities or prices. Return null when absent.
5. Do not treat the package size as the purchased quantity.
6. Mark non-food products with is_food_item = false.
7. Use PKR unless another currency is clearly printed.
8. Add unclear fields to uncertain_fields.
9. Normalize abbreviations conservatively. Do not guess a completely
   different product.
"""


def main() -> None:
    api_key = os.getenv("GEMINI_API_KEY")
    model_name = os.getenv(
        "GEMINI_MODEL",
        "gemini-3.1-flash-lite",
    )

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is missing from backend/.env")

    receipt_path = Path("sample_receipt.jfif")

    if not receipt_path.exists():
        raise FileNotFoundError(
            f"Receipt image not found: {receipt_path.resolve()}"
        )

    mime_type, _ = mimetypes.guess_type(receipt_path.name)

    if mime_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise ValueError(
            "Receipt must be a JPG, PNG or WEBP image."
        )

    image_bytes = receipt_path.read_bytes()

    client = genai.Client(api_key=api_key)

    start_time = time.perf_counter()

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=[
                types.Part.from_bytes(
                    data=image_bytes,
                    mime_type=mime_type,
                ),
                PROMPT,
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_json_schema=ReceiptData.model_json_schema(),
                temperature=0,
                max_output_tokens=2048,
            ),
        )

        if not response.text:
            raise RuntimeError("Gemini returned an empty response.")

        receipt = ReceiptData.model_validate_json(response.text)

        duration = time.perf_counter() - start_time

        print(receipt.model_dump_json(indent=2))
        print(f"\nResponse time: {duration:.2f} seconds")

    finally:
        client.close()


if __name__ == "__main__":
    main()