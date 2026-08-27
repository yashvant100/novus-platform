from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.core.security import hash_password
from app.db.session import get_db
from app.models import User, UserRole
from app.schemas.auth import UserCreate


router = APIRouter(
    prefix="/api/admin/users",
    tags=["Admin Users"],
)


# =========================================================
# HELPERS
# =========================================================

def role_to_string(role) -> str:
    """
    Convert UserRole enum or database string
    to a plain string.
    """
    if hasattr(role, "value"):
        return role.value

    return str(role)


def parse_role(role_value) -> UserRole:
    """
    Convert incoming role to UserRole safely.

    Supports:
    - enum value
    - enum name
    """

    if isinstance(role_value, UserRole):
        return role_value

    value = str(role_value).strip()

    # Try enum value
    try:
        return UserRole(value)
    except ValueError:
        pass

    # Try enum name
    try:
        return UserRole[value.upper()]
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role: {value}",
        )


def serialize_user(user: User) -> dict:
    """
    Convert User model into API response.
    """

    return {
        "id": user.id,
        "email": user.email,
        "role": role_to_string(user.role),
        "is_active": user.is_active,
    }


# =========================================================
# UPDATE USER SCHEMA
# =========================================================

class UserUpdate(BaseModel):
    """
    Fields that can be updated.

    Password is optional so an admin can update
    email/role without changing the password.
    """

    email: Optional[EmailStr] = None

    password: Optional[
        str
    ] = Field(
        default=None,
        min_length=12,
        max_length=256,
    )

    role: Optional[str] = None


# =========================================================
# CREATE USER
# =========================================================

@router.post("")
def create_user(
    payload: UserCreate,
    admin=Depends(
        require_roles(UserRole.ADMIN)
    ),
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()

    # -----------------------------------------------------
    # Duplicate email
    # -----------------------------------------------------

    existing_user = db.scalar(
        select(User).where(
            User.email == email
        )
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="User already exists",
        )

    # -----------------------------------------------------
    # Password validation
    # -----------------------------------------------------

    if len(payload.password) < 12:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 12 characters",
        )

    # -----------------------------------------------------
    # Role
    # -----------------------------------------------------

    role = parse_role(payload.role)

    # -----------------------------------------------------
    # Create
    # -----------------------------------------------------

    user = User(
        email=email,
        password_hash=hash_password(
            payload.password
        ),
        role=role,
        is_active=True,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return serialize_user(user)


# =========================================================
# LIST USERS
# =========================================================

@router.get("")
def list_users(
    admin=Depends(
        require_roles(UserRole.ADMIN)
    ),
    db: Session = Depends(get_db),
):
    users = db.scalars(
        select(User).order_by(
            User.id
        )
    ).all()

    return [
        serialize_user(user)
        for user in users
    ]


# =========================================================
# GET SINGLE USER
# =========================================================

@router.get("/{user_id}")
def get_user(
    user_id: int,
    admin=Depends(
        require_roles(UserRole.ADMIN)
    ),
    db: Session = Depends(get_db),
):
    user = db.get(
        User,
        user_id,
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    return serialize_user(user)


# =========================================================
# UPDATE USER
# =========================================================

@router.patch("/{user_id}")
def update_user(
    user_id: int,
    payload: UserUpdate,
    admin=Depends(
        require_roles(UserRole.ADMIN)
    ),
    db: Session = Depends(get_db),
):
    user = db.get(
        User,
        user_id,
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    # -----------------------------------------------------
    # Update email
    # -----------------------------------------------------

    if payload.email is not None:
        email = str(
            payload.email
        ).strip().lower()

        duplicate_user = db.scalar(
            select(User).where(
                User.email == email,
                User.id != user_id,
            )
        )

        if duplicate_user:
            raise HTTPException(
                status_code=409,
                detail="Email already exists",
            )

        user.email = email

    # -----------------------------------------------------
    # Update password
    # -----------------------------------------------------

    if payload.password is not None:
        if len(payload.password) < 12:
            raise HTTPException(
                status_code=400,
                detail="Password must be at least 12 characters",
            )

        user.password_hash = hash_password(
            payload.password
        )

    # -----------------------------------------------------
    # Update role
    # -----------------------------------------------------

    if payload.role is not None:
        user.role = parse_role(
            payload.role
        )

    db.commit()
    db.refresh(user)

    return serialize_user(user)


# =========================================================
# ENABLE USER
# =========================================================

@router.patch("/{user_id}/enable")
def enable_user(
    user_id: int,
    admin=Depends(
        require_roles(UserRole.ADMIN)
    ),
    db: Session = Depends(get_db),
):
    user = db.get(
        User,
        user_id,
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    user.is_active = True

    db.commit()
    db.refresh(user)

    return {
        **serialize_user(user),
        "message": "User enabled successfully",
    }


# =========================================================
# DISABLE USER
# =========================================================

@router.patch("/{user_id}/disable")
def disable_user(
    user_id: int,
    admin=Depends(
        require_roles(UserRole.ADMIN)
    ),
    db: Session = Depends(get_db),
):
    user = db.get(
        User,
        user_id,
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    # -----------------------------------------------------
    # Prevent self-disable
    # -----------------------------------------------------

    if user.id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot disable your own account",
        )

    user.is_active = False

    db.commit()
    db.refresh(user)

    return {
        **serialize_user(user),
        "message": "User disabled successfully",
    }


# =========================================================
# DELETE USER
# =========================================================

@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    admin=Depends(
        require_roles(UserRole.ADMIN)
    ),
    db: Session = Depends(get_db),
):
    user = db.get(
        User,
        user_id,
    )

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    # -----------------------------------------------------
    # Prevent self-delete
    # -----------------------------------------------------

    if user.id == admin.id:
        raise HTTPException(
            status_code=400,
            detail="You cannot delete your own account",
        )

    db.delete(user)
    db.commit()

    return {
        "id": user_id,
        "message": "User deleted successfully",
    }