"""Password hashing, JWTs, household invites, and request authentication."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from .database import get_db
from .models import HouseholdMember, User


JWT_SECRET = os.getenv(
    "JWT_SECRET",
    "development-only-secret-change-me",
)
JWT_ALGORITHM = "HS256"
TOKEN_LIFETIME_HOURS = 24
HOUSEHOLD_INVITE_LIFETIME_HOURS = 72

password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer()


def hash_password(password: str) -> str:
    """Hash a plain-text password."""

    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a stored password hash."""

    try:
        return password_hash.verify(password, hashed_password)
    except Exception:
        return False


def create_access_token(user: User) -> str:
    """Create a JWT access token for an authenticated user."""

    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(hours=TOKEN_LIFETIME_HOURS)

    return jwt.encode(
        {
            "sub": user.id,
            "type": "access",
            "iat": issued_at,
            "exp": expires_at,
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def create_household_invite_token(
    household_id: str,
    created_by_user_id: str,
) -> str:
    """Create a time-limited token that allows a new user to join a household."""

    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(
        hours=HOUSEHOLD_INVITE_LIFETIME_HOURS
    )

    return jwt.encode(
        {
            "sub": household_id,
            "type": "household_invite",
            "created_by": created_by_user_id,
            "iat": issued_at,
            "exp": expires_at,
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def decode_household_invite_token(invite_token: str) -> str:
    """Validate a household invite token and return its household ID."""

    invalid_invite = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired household invite",
    )

    try:
        payload = jwt.decode(
            invite_token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )
    except jwt.PyJWTError as error:
        raise invalid_invite from error

    if payload.get("type") != "household_invite":
        raise invalid_invite

    household_id = payload.get("sub")

    if not isinstance(household_id, str) or not household_id:
        raise invalid_invite

    return household_id


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Return the authenticated user from a Bearer access token."""

    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired access token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )
    except jwt.PyJWTError as error:
        raise unauthorized from error

    if payload.get("type") not in (None, "access"):
        raise unauthorized

    user_id = payload.get("sub")

    if not isinstance(user_id, str) or not user_id:
        raise unauthorized

    user = db.get(User, user_id)

    if user is None:
        raise unauthorized

    return user


def get_current_membership(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> HouseholdMember:
    """Return the authenticated user's single household membership."""

    memberships = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.user_id == user.id)
        .all()
    )

    if not memberships:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not assigned to a household",
        )

    if len(memberships) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "User belongs to multiple households, but no active "
                "household has been selected"
            ),
        )

    return memberships[0]


def get_current_household_id(
    membership: HouseholdMember = Depends(get_current_membership),
) -> str:
    """Return the authenticated user's household ID."""

    return membership.household_id