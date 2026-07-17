"""Gemini-based receipt extraction and validation service."""

from __future__ import annotations

import mimetypes
import os
from datetime import date
from io import BytesIO
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError

from .schemas import (
    ReceiptData,
    ReceiptFinancialValidation,
)


load_dotenv()


MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

EXTENSION_MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".jfif": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


RECEIPT_EXTRACTION_PROMPT = """
Analyse this Pakistani or international retail receipt and return
structured receipt data.

Extract every purchased product line from the receipt.

Product extraction rules:

1. Extract only actual purchased products.

2. Do not treat the following as products:
   - Merchant name
   - Invoice number
   - Receipt date or time
   - Table headings
   - Gross amount
   - Subtotal
   - Tax or GST
   - Receipt total
   - Payment amount
   - Change
   - Service charge
   - Delivery charge
   - Total product count
   - Terms and conditions

3. Keep purchased quantity separate from package size.

Example:

"Milk 1L | Qty 2"

Means:

purchased_quantity = 2
package_size = 1
package_unit = "l"

4. For loose products sold by weight, place the measured
weight in purchased_quantity and keep package_size null.

Example:

"Organic Bananas | Qty 1.53 lb"

Means:

purchased_quantity = 1.53
package_size = null
package_unit = "lb"

5. For packaged products, keep the number of packages in
purchased_quantity and the printed package size separately.

Example:

"Strawberries 1 lb | Qty 1"

Means:

purchased_quantity = 1
package_size = 1
package_unit = "lb"

Example:

"Milk 1/2 gal | Qty 1"

Means:

purchased_quantity = 1
package_size = 0.5
package_unit = "gal"

6. For countable packages, store the count as package_size
and use package_unit = "piece".

Example:

"Large Eggs 12 count | Qty 1"

Means:

purchased_quantity = 1
package_size = 12
package_unit = "piece"

7. Do not use package size as purchased quantity.

8. Do not invent unreadable receipt values. Return null when
quantity, price, date, or package size cannot be read.

9. If an item has no explicitly printed quantity, return
purchased_quantity as null. The backend will default it to one.

10. raw_name should remain close to the exact receipt text.

11. product_name should be clean and human-readable. It may
retain the brand and useful variety information, but it must
not become a different product.

12. pantry_name must be a simple generic household inventory
name for grouping and displaying the item in the Smart Pantry.

pantry_name rules:

- Remove brand names.
- Remove store-brand names.
- Remove package sizes, weights, counts, and pack quantities.
- Remove words such as organic, premium, large, small, value,
  original, traditional, plain, and percentage values unless
  they are essential to identify the food.
- Keep a useful food distinction when it affects how the item
  is understood or stored, such as Greek Yogurt, Chicken
  Breast, Brown Rice, Pasta Sauce, or Frozen Chicken.
- Do not use vague names such as Food, Grocery, Product, or
  Snack when a more useful food name is available.
- Use a short title-cased name.
- pantry_name must not contain a package size.

Examples:

"Great Value Large Eggs 12 count"
product_name = "Great Value Large Eggs"
pantry_name = "Eggs"

"365 Organic Milk 2% 1/2 gal"
product_name = "365 Organic Milk 2%"
pantry_name = "Milk"

"Horizon Organic Milk 2% 1 gal"
product_name = "Horizon Organic Milk 2%"
pantry_name = "Milk"

"Chobani Greek Yogurt Plain 5.3 oz"
product_name = "Chobani Greek Yogurt Plain"
pantry_name = "Greek Yogurt"

"Tyson Chicken Breast 2.5 lb"
product_name = "Tyson Chicken Breast"
pantry_name = "Chicken Breast"

"Mission Flour Tortillas 10 count"
product_name = "Mission Flour Tortillas"
pantry_name = "Tortillas"

"Driscoll's Strawberries 1 lb"
product_name = "Driscoll's Strawberries"
pantry_name = "Strawberries"

"Annie's Mac & Cheese Shells 6 oz"
product_name = "Annie's Mac & Cheese Shells"
pantry_name = "Macaroni & Cheese"

"Coca-Cola 12 oz 18 Pack"
product_name = "Coca-Cola"
pantry_name = "Soft Drink"

"Gatorade Arctic Blitz 20 oz"
product_name = "Gatorade Arctic Blitz"
pantry_name = "Sports Drink"

"Nutella"
product_name = "Nutella"
pantry_name = "Hazelnut Spread"

"Biskrem Duo"
product_name = "Biskrem Duo"
pantry_name = "Cookies"

13. For misspelled or abbreviated receipt names, normalize the
product_name only when the identity is reasonably clear.

Example:

"Nutelka" may be normalized to "Nutella" if the receipt context
supports that interpretation.

14. Use the appropriate three-letter currency code:
    - PKR for Pakistani rupees
    - USD for US dollars
    - GBP for British pounds
    - EUR for euros

15. Mark non-food products with:

is_food_item = false

16. Add unclear receipt fields to uncertain_fields.

17. Infer the most suitable food category and storage location.

18. Use these category values only:

beverage, dairy, fruit, grain, meat, snack, vegetable, other

19. Use these storage-location values only:

fridge, freezer, pantry, unknown

Package-unit rules:

20. Use only these package_unit values:

g, kg, ml, l, oz, fl_oz, lb, gal, pint, quart, piece, pack,
unknown

21. Use "oz" for ordinary ounces, such as 5.3 oz or 20 oz.

22. Use "fl_oz" only when the receipt specifically indicates
fluid ounces.

23. Use "lb" for pounds, including loose products sold by
weight and packaged products labelled 1 lb or 2 lb.

24. Use "gal" for gallons. Convert printed fractions such as
1/2 gal to package_size = 0.5 and package_unit = "gal".

25. Use "pint" and "quart" when those units are explicitly
printed.

26. Use "piece" for countable units such as eggs, tortillas,
bread rolls, produce pieces, or package counts.

27. Use "pack" only when the receipt identifies the purchased
unit as a pack and the individual count cannot be represented
more accurately as pieces.

Purchase-date rules:

28. Extract purchase_date only when a date is visible and
reliably readable on the receipt.

29. Format an extracted date as YYYY-MM-DD.

30. When no purchase date is visible, return:

purchase_date = null

31. Always return:

purchase_date_source = null

The backend will set purchase_date_source after validating the
extracted date.

Shelf-life estimation rules:

32. For every food product, estimate a conservative typical
shelf life in days from the purchase date.

33. Base the estimate on:
    - The generic food represented by pantry_name
    - Whether it is fresh, prepared, frozen, dried, canned,
      packaged, or shelf-stable
    - The selected storage location
    - General food-storage knowledge

34. Distinguish a refrigerated dairy product from a packaged
shelf-stable product whose name contains a dairy word.

For example, boxed "Macaroni & Cheese" stored in the pantry is
a shelf-stable dry product. Do not estimate it using the shelf
life of fresh refrigerated cheese.

35. This is not a Google Search task. Do not claim that online
information was searched.

36. estimated_shelf_life_days is only an estimate and is not
the exact manufacturer-printed expiry date.

37. Use conservative estimates for fresh meat, prepared food,
dairy, fruits, and vegetables.

38. Frozen products should normally have longer estimates than
equivalent refrigerated products.

39. Shelf-stable grains, flour, snacks, canned products, and
canned beverages may have longer pantry estimates.

40. If the exact product is unclear, estimate shelf life using
its likely category, food type, and storage location.

41. expiry_confidence must be between 0 and 1.

42. expiry_reason must briefly explain the estimate.

Financial extraction rules:

43. Extract the receipt financial summary separately from the
purchased products.

44. items_subtotal means the printed total of purchased product
lines before tax, GST, service charges, delivery charges, or
other charges.

45. The before-tax product total may be labelled:
    - Gross
    - Items Total
    - Item Amount
    - Subtotal
    - Total before tax

46. Some receipts may label the final after-tax amount as
"Subtotal". Do not store that final amount as items_subtotal.

47. Extract these values when visible:
    - items_subtotal
    - tax_amount
    - tax_rate
    - service_charge
    - delivery_charge
    - other_charges
    - discount_amount
    - total_amount
    - payment_amount
    - change_amount

48. tax_rate should contain the percentage number.

Example:

GST 15%

Means:

tax_rate = 15

49. Use this financial equation:

items_subtotal
+ tax_amount
+ service_charge
+ delivery_charge
+ other_charges
- discount_amount
= total_amount

50. Do not include tax, GST, service charges, delivery charges,
payment, or change as purchased products.

51. Return null for financial values that are not printed or
cannot be reliably determined.

52. Return only valid structured data matching the supplied
schema.
"""


class InvalidReceiptFileError(ValueError):
    """Raised when an uploaded receipt is invalid."""


class ReceiptExtractionError(RuntimeError):
    """Raised when Gemini cannot analyse a receipt."""


def _resolve_mime_type(
    filename: str,
    declared_content_type: str | None,
) -> str:
    """Determine the uploaded receipt image MIME type."""

    normalized_content_type = (
        declared_content_type.lower().strip()
        if declared_content_type
        else None
    )

    if normalized_content_type in ALLOWED_MIME_TYPES:
        return normalized_content_type

    suffix = Path(filename).suffix.lower()

    extension_mime_type = EXTENSION_MIME_TYPES.get(
        suffix
    )

    if extension_mime_type:
        return extension_mime_type

    guessed_mime_type, _ = mimetypes.guess_type(
        filename
    )

    if guessed_mime_type in ALLOWED_MIME_TYPES:
        return guessed_mime_type

    raise InvalidReceiptFileError(
        "Unsupported receipt format. Upload a JPG, JPEG, "
        "JFIF, PNG, or WEBP image."
    )


def _validate_image(
    file_bytes: bytes,
) -> None:
    """Confirm that the uploaded bytes contain a real image."""

    if not file_bytes:
        raise InvalidReceiptFileError(
            "The uploaded receipt file is empty."
        )

    if len(file_bytes) > MAX_RECEIPT_SIZE_BYTES:
        raise InvalidReceiptFileError(
            "Receipt image must be 10 MB or smaller."
        )

    try:
        with Image.open(
            BytesIO(file_bytes)
        ) as image:
            image.verify()

    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
    ) as exc:
        raise InvalidReceiptFileError(
            "The uploaded file is not a valid image."
        ) from exc


def _set_purchase_date_source(
    receipt_data: ReceiptData,
) -> None:
    """
    Validate the extracted purchase date.

    If the receipt does not contain a valid ISO date, today's
    upload date is used.
    """

    if receipt_data.purchase_date:
        try:
            date.fromisoformat(
                receipt_data.purchase_date
            )

        except ValueError:
            receipt_data.purchase_date = (
                date.today().isoformat()
            )

            receipt_data.purchase_date_source = (
                "upload_date"
            )

        else:
            receipt_data.purchase_date_source = (
                "receipt"
            )

        return

    receipt_data.purchase_date = (
        date.today().isoformat()
    )

    receipt_data.purchase_date_source = (
        "upload_date"
    )


def validate_receipt_financials(
    receipt: ReceiptData,
) -> ReceiptFinancialValidation:
    """
    Reconcile the printed subtotal, taxes, charges, discounts,
    and final receipt total.

    The printed subtotal is preferred for the final financial
    equation. The sum of extracted product lines is validated
    separately because per-line rounding can create a small
    difference.
    """

    known_line_totals = [
        float(item.line_total)
        for item in receipt.items
        if item.line_total is not None
    ]

    missing_line_totals = sum(
        1
        for item in receipt.items
        if item.line_total is None
    )

    line_items_total = round(
        sum(known_line_totals),
        2,
    )

    printed_subtotal = (
        float(receipt.items_subtotal)
        if receipt.items_subtotal is not None
        else None
    )

    receipt_total = (
        float(receipt.total_amount)
        if receipt.total_amount is not None
        else None
    )

    currency = (
        receipt.currency
        or "PKR"
    ).strip().upper()

    # Smaller-unit currencies and PKR receipts commonly need
    # a one-unit tolerance. Decimal currencies use two cents
    # as the minimum tolerance.
    base_tolerance = (
        1.0
        if currency in {
            "PKR",
            "JPY",
            "KRW",
        }
        else 0.02
    )

    reference_amount = max(
        abs(receipt_total or 0),
        abs(printed_subtotal or 0),
        abs(line_items_total),
    )

    tolerance = max(
        base_tolerance,
        round(
            reference_amount * 0.001,
            2,
        ),
    )

    notes: list[str] = []

    if missing_line_totals:
        notes.append(
            f"{missing_line_totals} item(s) did not have "
            "a readable line total."
        )

    if (
        printed_subtotal is not None
        and known_line_totals
    ):
        subtotal_difference = round(
            abs(
                printed_subtotal
                - line_items_total
            ),
            2,
        )

        if subtotal_difference > 0:
            if subtotal_difference <= tolerance:
                notes.append(
                    "The sum of extracted product lines "
                    f"differs from the printed subtotal by "
                    f"{subtotal_difference:.2f}, which is "
                    "within the allowed rounding tolerance."
                )

            else:
                notes.append(
                    "The sum of extracted product lines "
                    f"differs from the printed subtotal by "
                    f"{subtotal_difference:.2f}, which "
                    "exceeds the allowed tolerance."
                )

    # Prefer the subtotal printed by the merchant. Only fall
    # back to line-item totals when no subtotal is available.
    if printed_subtotal is not None:
        effective_subtotal = printed_subtotal

    elif known_line_totals:
        effective_subtotal = line_items_total

        notes.append(
            "A printed subtotal was unavailable, so the "
            "sum of extracted product lines was used."
        )

    else:
        effective_subtotal = None

    if (
        effective_subtotal is None
        or receipt_total is None
    ):
        return ReceiptFinancialValidation(
            status="unavailable",
            line_items_total=line_items_total,
            items_subtotal=effective_subtotal,
            calculated_total=None,
            receipt_total=receipt_total,
            difference=None,
            tolerance=tolerance,
            missing_line_totals=missing_line_totals,
            notes=notes
            + [
                "There was not enough financial information "
                "to reconcile the receipt."
            ],
        )

    if receipt.tax_amount is not None:
        tax_amount = float(
            receipt.tax_amount
        )

    elif receipt.tax_rate is not None:
        tax_amount = round(
            effective_subtotal
            * float(receipt.tax_rate)
            / 100,
            2,
        )

        notes.append(
            "Tax amount was calculated from the extracted "
            "tax rate because a separate tax amount was "
            "not available."
        )

    else:
        tax_amount = 0.0

    service_charge = float(
        receipt.service_charge or 0
    )

    delivery_charge = float(
        receipt.delivery_charge or 0
    )

    other_charges = float(
        receipt.other_charges or 0
    )

    discount_amount = float(
        receipt.discount_amount or 0
    )

    calculated_total = round(
        effective_subtotal
        + tax_amount
        + service_charge
        + delivery_charge
        + other_charges
        - discount_amount,
        2,
    )

    difference = round(
        abs(
            calculated_total
            - receipt_total
        ),
        2,
    )

    reconciled = (
        difference <= tolerance
    )

    if reconciled:
        if printed_subtotal is not None:
            notes.append(
                "The printed subtotal, tax, charges, "
                "discounts, and final receipt total "
                "reconcile."
            )

        else:
            notes.append(
                "The product-line total, tax, charges, "
                "discounts, and final receipt total "
                "reconcile."
            )

    else:
        notes.append(
            "The calculated receipt total does not match "
            "the printed receipt total."
        )

    return ReceiptFinancialValidation(
        status=(
            "reconciled"
            if reconciled
            else "mismatch"
        ),
        line_items_total=line_items_total,
        items_subtotal=round(
            effective_subtotal,
            2,
        ),
        calculated_total=calculated_total,
        receipt_total=round(
            receipt_total,
            2,
        ),
        difference=difference,
        tolerance=tolerance,
        missing_line_totals=missing_line_totals,
        notes=notes,
    )


def extract_receipt_data_from_bytes(
    file_bytes: bytes,
    filename: str,
    declared_content_type: str | None = None,
) -> ReceiptData:
    """
    Send receipt bytes to Gemini and return validated
    structured receipt information.
    """

    _validate_image(
        file_bytes
    )

    mime_type = _resolve_mime_type(
        filename=filename,
        declared_content_type=declared_content_type,
    )

    api_key = os.getenv(
        "GEMINI_API_KEY"
    )

    if not api_key:
        raise ReceiptExtractionError(
            "GEMINI_API_KEY is missing from backend/.env."
        )

    model_name = os.getenv(
        "GEMINI_MODEL"
    )

    if not model_name:
        raise ReceiptExtractionError(
            "GEMINI_MODEL is missing from backend/.env."
        )

    client = genai.Client(
        api_key=api_key
    )

    try:
        response = client.models.generate_content(
            model=model_name,
            contents=[
                types.Part.from_bytes(
                    data=file_bytes,
                    mime_type=mime_type,
                ),
                RECEIPT_EXTRACTION_PROMPT,
            ],
            config=types.GenerateContentConfig(
                response_mime_type=(
                    "application/json"
                ),
                response_json_schema=(
                    ReceiptData.model_json_schema()
                ),
                temperature=0,
                max_output_tokens=4096,
            ),
        )

    except Exception as exc:
        raise ReceiptExtractionError(
            "Gemini could not analyse the receipt. "
            "Please try again."
        ) from exc

    finally:
        client.close()

    if not response.text:
        raise ReceiptExtractionError(
            "Gemini returned an empty receipt response."
        )

    try:
        receipt_data = (
            ReceiptData.model_validate_json(
                response.text
            )
        )

    except ValidationError as exc:
        raise ReceiptExtractionError(
            "Gemini returned receipt data in an "
            "invalid format."
        ) from exc

    _set_purchase_date_source(
        receipt_data
    )

    return receipt_data