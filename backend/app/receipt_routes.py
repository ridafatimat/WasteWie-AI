"""Receipt scanning and automatic pantry update routes."""

from __future__ import annotations

import asyncio
import logging
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from .auth import get_current_household_id
from .database import get_db
from .receipt_pantry_service import (
    DuplicateReceiptError,
    calculate_receipt_hash,
    find_processed_receipt,
    process_receipt_into_pantry,
)
from .receipt_service import (
    InvalidReceiptFileError,
    ReceiptExtractionError,
    extract_receipt_data_from_bytes,
    validate_receipt_financials,
)
from .schemas import (
    ReceiptProcessResponse,
    ReceiptScanResponse,
)


logger = logging.getLogger(
    __name__
)


router = APIRouter(
    prefix="/receipts",
    tags=["Receipt scanning"],
)


async def _read_receipt_upload(
    file: UploadFile,
) -> tuple[bytes, str, str | None]:
    """Read and close an uploaded receipt image."""

    filename = (
        file.filename
        or "receipt.jpg"
    )

    content_type = file.content_type

    try:
        file_bytes = await file.read()

    finally:
        await file.close()

    if not file_bytes:
        raise HTTPException(
            status_code=(
                status.HTTP_400_BAD_REQUEST
            ),
            detail=(
                "The uploaded receipt file is empty."
            ),
        )

    return (
        file_bytes,
        filename,
        content_type,
    )


async def _extract_receipt(
    file_bytes: bytes,
    filename: str,
    content_type: str | None,
):
    """
    Run Gemini in a worker thread so its synchronous
    request does not block FastAPI's event loop.
    """

    try:
        return await asyncio.to_thread(
            extract_receipt_data_from_bytes,
            file_bytes,
            filename,
            content_type,
        )

    except InvalidReceiptFileError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
            ),
            detail=str(exc),
        ) from exc

    except ReceiptExtractionError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_502_BAD_GATEWAY
            ),
            detail=str(exc),
        ) from exc


@router.post(
    "/scan",
    response_model=ReceiptScanResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {
            "description": "Empty receipt upload",
        },
        415: {
            "description": (
                "Unsupported or invalid image"
            ),
        },
        502: {
            "description": (
                "Receipt extraction failed"
            ),
        },
    },
)
async def scan_receipt(
    file: Annotated[
        UploadFile,
        File(
            description=(
                "Receipt image to scan without "
                "updating the Smart Pantry"
            )
        ),
    ],
) -> ReceiptScanResponse:
    """
    Scan a receipt and return its extracted information.

    This endpoint does not modify the pantry database.
    """

    (
        file_bytes,
        filename,
        content_type,
    ) = await _read_receipt_upload(
        file
    )

    receipt_data = await _extract_receipt(
        file_bytes=file_bytes,
        filename=filename,
        content_type=content_type,
    )

    financial_validation = (
        validate_receipt_financials(
            receipt_data
        )
    )

    return ReceiptScanResponse(
        success=True,
        receipt=receipt_data,
        financial_validation=financial_validation,
    )


@router.post(
    "/process",
    response_model=ReceiptProcessResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {
            "description": "Empty receipt upload",
        },
        409: {
            "description": (
                "Receipt has already been processed"
            ),
        },
        415: {
            "description": (
                "Unsupported or invalid image"
            ),
        },
        500: {
            "description": (
                "Pantry update failed"
            ),
        },
        502: {
            "description": (
                "Receipt extraction failed"
            ),
        },
    },
)
async def process_receipt(
    file: Annotated[
        UploadFile,
        File(
            description=(
                "Receipt image to scan and "
                "automatically add to the Smart Pantry"
            )
        ),
    ],
    household_id: str = Depends(
        get_current_household_id
    ),
    db: Session = Depends(
        get_db
    ),
) -> ReceiptProcessResponse:
    """
    Scan a receipt and automatically create or update
    Smart Pantry records.
    """

    (
        file_bytes,
        filename,
        content_type,
    ) = await _read_receipt_upload(
        file
    )

    file_hash = calculate_receipt_hash(
        file_bytes
    )

    existing_receipt = find_processed_receipt(
        db=db,
        household_id=household_id,
        file_hash=file_hash,
    )

    # Check before calling Gemini so duplicate uploads do
    # not waste another slow API request.
    if existing_receipt:
        raise HTTPException(
            status_code=(
                status.HTTP_409_CONFLICT
            ),
            detail=(
                "This receipt has already been processed."
            ),
        )

    receipt_data = await _extract_receipt(
        file_bytes=file_bytes,
        filename=filename,
        content_type=content_type,
    )

    try:
        return process_receipt_into_pantry(
            db=db,
            household_id=household_id,
            receipt=receipt_data,
            file_hash=file_hash,
            original_filename=filename,
            content_type=content_type,
        )

    except DuplicateReceiptError as exc:
        raise HTTPException(
            status_code=(
                status.HTTP_409_CONFLICT
            ),
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception(
            "Receipt was scanned but pantry update failed."
        )

        raise HTTPException(
            status_code=(
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ),
            detail=(
                "Receipt was scanned, but the pantry "
                "could not be updated."
            ),
        ) from exc