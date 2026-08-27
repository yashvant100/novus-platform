from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.deps import get_current_user
from app.core.security import (
    create_access_token,
    verify_password,
    new_refresh_token,
    hash_refresh_token,
)
from app.db.session import get_db
from app.models import User, RefreshToken
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest


router = APIRouter(
    prefix="/api/auth",
    tags=["Authentication"],
)


def get_user_role(user: User) -> str:
    """
    Return user role as a plain string.

    Supports both:
    - Enum roles: UserRole.ADMIN
    - String roles: "ADMIN"
    """
    role = user.role

    if hasattr(role, "value"):
        return role.value

    return str(role)


@router.post(
    "/login",
    response_model=TokenResponse,
)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()

    user = db.scalar(
        select(User).where(User.email == email)
    )

    if (
        not user
        or not user.is_active
        or not verify_password(
            payload.password,
            user.password_hash,
        )
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
        )

    now = datetime.now(timezone.utc)

    user.last_login_at = now

    raw_refresh_token, refresh_token_hash = new_refresh_token()

    refresh_token = RefreshToken(
        user_id=user.id,
        token_hash=refresh_token_hash,
        expires_at=now
        + timedelta(
            days=get_settings().refresh_token_days
        ),
    )

    db.add(refresh_token)
    db.commit()

    role = get_user_role(user)

    return TokenResponse(
        access_token=create_access_token(
            user.id,
            role,
        ),
        refresh_token=raw_refresh_token,
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
)
def refresh(
    payload: RefreshRequest,
    db: Session = Depends(get_db),
):
    token_hash = hash_refresh_token(
        payload.refresh_token
    )

    token = db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash
        )
    )

    now = datetime.now(timezone.utc)

    if (
        not token
        or token.revoked_at
        or token.expires_at <= now
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid refresh token",
        )

    user = db.get(User, token.user_id)

    if not user or not user.is_active:
        raise HTTPException(
            status_code=401,
            detail="User is inactive or does not exist",
        )

    # Rotate refresh token
    token.revoked_at = now

    raw_refresh_token, refresh_token_hash = new_refresh_token()

    new_token = RefreshToken(
        user_id=user.id,
        token_hash=refresh_token_hash,
        expires_at=now
        + timedelta(
            days=get_settings().refresh_token_days
        ),
    )

    db.add(new_token)
    db.commit()

    role = get_user_role(user)

    return TokenResponse(
        access_token=create_access_token(
            user.id,
            role,
        ),
        refresh_token=raw_refresh_token,
    )


@router.get("/me")
def me(
    user=Depends(get_current_user),
):
    return {
        "id": user.id,
        "email": user.email,
        "role": get_user_role(user),
        "is_active": user.is_active,
    }