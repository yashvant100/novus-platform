from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.crypto import encrypt_secret
from app.core.deps import require_roles
from app.db.session import get_db
from app.models import AlertRecipient, EmailProvider, UserRole
from app.schemas.email import EmailProviderCreate, RecipientCreate

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
        "from_email": provider.from_email,
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
    admin=Depends(require_roles(UserRole.ADMIN)),
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
