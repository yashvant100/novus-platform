from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.crypto import encrypt_secret
from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models import AlertRecipient, EmailProvider, UserRole
from app.schemas.email import (
    EmailProviderCreate,
    EmailProviderUpdate,
    RecipientCreate,
    RecipientUpdate,
)

router = APIRouter(
    prefix="/api/admin/email-providers",
    tags=["Admin Email Providers"],
)


@router.post("")
def create_provider(
    payload: EmailProviderCreate,
    admin=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    if payload.is_default:
        for p in db.scalars(select(EmailProvider)).all():
            p.is_default = False

    provider = EmailProvider(
        name=payload.name.strip(),
        provider_type=payload.provider_type,
        host=payload.host,
        port=payload.port,
        username=payload.username,
        encrypted_secret=encrypt_secret(payload.secret) if payload.secret else None,
        from_email=str(payload.from_email),
        from_name=payload.from_name,
        tls_enabled=payload.tls_enabled,
        is_active=True,
        is_default=payload.is_default,
    )

    db.add(provider)
    db.commit()
    db.refresh(provider)

    return {
        "id": provider.id,
        "name": provider.name,
        "provider_type": provider.provider_type,
        "host": provider.host,
        "port": provider.port,
        "username": provider.username,
        "from_email": provider.from_email,
        "from_name": provider.from_name,
        "tls_enabled": provider.tls_enabled,
        "is_active": provider.is_active,
        "is_default": provider.is_default,
        "secret_configured": bool(provider.encrypted_secret),
    }


@router.get("")
def list_providers(
    admin=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    providers = db.scalars(
        select(EmailProvider).order_by(EmailProvider.id)
    ).all()

    return [
        {
            "id": p.id,
            "name": p.name,
            "provider_type": p.provider_type,
            "host": p.host,
            "port": p.port,
            "username": p.username,
            "from_email": p.from_email,
            "is_active": p.is_active,
            "is_default": p.is_default,
            "secret_configured": bool(p.encrypted_secret),
        }
        for p in providers
    ]


@router.post("/recipients")
def create_recipient(
    payload: RecipientCreate,
    admin=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().lower()

    existing = db.scalar(
        select(AlertRecipient).where(AlertRecipient.email == email)
    )
    if existing:
        raise HTTPException(409, "Recipient already exists")

    recipient = AlertRecipient(
        email=email,
        name=payload.name,
        is_active=True,
    )
    db.add(recipient)
    db.commit()
    db.refresh(recipient)

    return {
        "id": recipient.id,
        "email": recipient.email,
        "name": recipient.name,
        "is_active": recipient.is_active,
    }


@router.get("/recipients")
def list_recipients(
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    recipients = db.scalars(
        select(AlertRecipient).order_by(AlertRecipient.id)
    ).all()

    return [
        {
            "id": r.id,
            "email": r.email,
            "name": r.name,
            "is_active": r.is_active,
        }
        for r in recipients
    ]


@router.patch("/{provider_id}")
def update_provider(
    provider_id: int,
    payload: EmailProviderUpdate,
    admin=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    provider = db.get(EmailProvider, provider_id)
    if not provider:
        raise HTTPException(404, "Email provider not found")

    if payload.name is not None:
        provider.name = payload.name.strip()
    for field in ("provider_type", "host", "port", "username", "from_name", "tls_enabled"):
        value = getattr(payload, field)
        if value is not None:
            setattr(provider, field, value)
    if payload.from_email is not None:
        provider.from_email = str(payload.from_email)
    if payload.secret:
        provider.encrypted_secret = encrypt_secret(payload.secret)
    if payload.is_default:
        for other in db.scalars(select(EmailProvider)).all():
            other.is_default = other.id == provider_id
    elif payload.is_default is False:
        provider.is_default = False

    db.commit()
    db.refresh(provider)
    return {"id": provider.id, "name": provider.name, "is_active": provider.is_active}


@router.patch("/{provider_id}/enable")
def enable_provider(
    provider_id: int,
    admin=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    provider = db.get(EmailProvider, provider_id)
    if not provider:
        raise HTTPException(404, "Email provider not found")
    provider.is_active = True
    db.commit()
    return {"id": provider.id, "is_active": provider.is_active}


@router.patch("/{provider_id}/disable")
def disable_provider(
    provider_id: int,
    admin=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    provider = db.get(EmailProvider, provider_id)
    if not provider:
        raise HTTPException(404, "Email provider not found")
    provider.is_active = False
    db.commit()
    return {"id": provider.id, "is_active": provider.is_active}


@router.delete("/{provider_id}")
def delete_provider(
    provider_id: int,
    admin=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    provider = db.get(EmailProvider, provider_id)
    if not provider:
        raise HTTPException(404, "Email provider not found")
    db.delete(provider)
    db.commit()
    return {"id": provider_id, "deleted": True}


@router.patch("/recipients/{recipient_id}")
def update_recipient(
    recipient_id: int,
    payload: RecipientUpdate,
    admin=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    recipient = db.get(AlertRecipient, recipient_id)
    if not recipient:
        raise HTTPException(404, "Recipient not found")
    if payload.email is not None:
        email = str(payload.email).strip().lower()
        existing = db.scalar(select(AlertRecipient).where(AlertRecipient.email == email, AlertRecipient.id != recipient_id))
        if existing:
            raise HTTPException(409, "Recipient already exists")
        recipient.email = email
    if payload.name is not None:
        recipient.name = payload.name
    db.commit()
    db.refresh(recipient)
    return {"id": recipient.id, "email": recipient.email, "name": recipient.name, "is_active": recipient.is_active}


@router.patch("/recipients/{recipient_id}/enable")
def enable_recipient(
    recipient_id: int,
    admin=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    recipient = db.get(AlertRecipient, recipient_id)
    if not recipient:
        raise HTTPException(404, "Recipient not found")
    recipient.is_active = True
    db.commit()
    return {"id": recipient.id, "is_active": recipient.is_active}


@router.patch("/recipients/{recipient_id}/disable")
def disable_recipient(
    recipient_id: int,
    admin=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    recipient = db.get(AlertRecipient, recipient_id)
    if not recipient:
        raise HTTPException(404, "Recipient not found")
    recipient.is_active = False
    db.commit()
    return {"id": recipient.id, "is_active": recipient.is_active}


@router.delete("/recipients/{recipient_id}")
def delete_recipient(
    recipient_id: int,
    admin=Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db),
):
    recipient = db.get(AlertRecipient, recipient_id)
    if not recipient:
        raise HTTPException(404, "Recipient not found")
    db.delete(recipient)
    db.commit()
    return {"id": recipient_id, "deleted": True}
