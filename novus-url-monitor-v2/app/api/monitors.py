from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models import (
    AlertRecipient,
    Monitor,
    MonitorAlertRecipient,
    MonitorCheck,
    MonitorPermission,
    User,
    UserRole,
)
from app.schemas.monitor import MonitorCreate, MonitorResponse

router = APIRouter(
    prefix="/api/monitors",
    tags=["Monitors"],
)


# ==========================================================
# HELPER - GET LATEST CHECK
# ==========================================================

def get_latest_check(
    db: Session,
    monitor_id: int,
):
    return db.scalars(
        select(MonitorCheck)
        .where(
            MonitorCheck.monitor_id == monitor_id
        )
        .order_by(
            MonitorCheck.checked_at.desc(),
            MonitorCheck.id.desc(),
        )
        .limit(1)
    ).first()


def can_access_monitor(monitor: Monitor, user) -> bool:
    return user.role == UserRole.ADMIN or monitor.created_by == user.id


def can_view_monitor(db: Session, monitor: Monitor, user) -> bool:
    if user.role == UserRole.ADMIN or monitor.created_by == user.id:
        return True
    return db.scalar(
        select(MonitorPermission.id).where(
            MonitorPermission.user_id == user.id,
            MonitorPermission.monitor_id == monitor.id,
        )
    ) is not None


def require_active_recipients(db: Session, emails: list[str]) -> list[AlertRecipient]:
    normalized_emails = sorted({str(email).strip().lower() for email in emails if str(email).strip()})
    if not normalized_emails:
        raise HTTPException(400, "Select at least one alert recipient")

    recipients = db.scalars(
        select(AlertRecipient).where(
            AlertRecipient.email.in_(normalized_emails),
            AlertRecipient.is_active.is_(True),
        )
    ).all()
    if len(recipients) != len(normalized_emails):
        raise HTTPException(400, "All selected emails must be active alert recipients")

    return recipients


def monitor_recipient_emails(db: Session, monitor_id: int) -> list[str]:
    return list(
        db.scalars(
            select(AlertRecipient.email)
            .join(MonitorAlertRecipient, MonitorAlertRecipient.recipient_id == AlertRecipient.id)
            .where(MonitorAlertRecipient.monitor_id == monitor_id)
            .order_by(AlertRecipient.email)
        ).all()
    )


# ==========================================================
# CREATE MONITOR
# ==========================================================

@router.post(
    "",
    response_model=MonitorResponse,
)
def create_monitor(
    payload: MonitorCreate,
    user=Depends(
        require_roles(
            UserRole.ADMIN,
            UserRole.URL_MANAGER,
        )
    ),
    db: Session = Depends(get_db),
):
    selected_emails = payload.alert_emails or ([str(payload.alert_email)] if payload.alert_email else [])
    recipients = require_active_recipients(db, selected_emails)
    monitor = Monitor(
        name=payload.name.strip(),
        url=str(payload.url),
        method=payload.method,
        expected_status=payload.expected_status,
        timeout_seconds=payload.timeout_seconds,
        interval_seconds=payload.interval_seconds,
        alert_email=recipients[0].email,
        is_active=True,
        ssl_enabled=payload.ssl_enabled,
        created_by=user.id,
    )

    db.add(monitor)
    db.flush()
    db.add_all(
        MonitorAlertRecipient(monitor_id=monitor.id, recipient_id=recipient.id)
        for recipient in recipients
    )
    db.commit()
    db.refresh(monitor)

    return monitor


# ==========================================================
# LIST MONITORS
# ==========================================================

@router.get(
    "",
    response_model=list[MonitorResponse],
)
def list_monitors(
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Monitor).order_by(Monitor.id.desc())
    if user.role != UserRole.ADMIN:
        query = query.where(
            or_(
                Monitor.created_by == user.id,
                Monitor.id.in_(
                    select(MonitorPermission.monitor_id).where(
                        MonitorPermission.user_id == user.id,
                    )
                ),
            )
        )
    monitors = db.scalars(query).all()

    result = []

    for monitor in monitors:

        latest_check = get_latest_check(
            db,
            monitor.id,
        )

        owner_email = None
        assigned_user_emails = []
        if user.role == UserRole.ADMIN:
            owner_email = db.scalar(
                select(User.email).where(User.id == monitor.created_by)
            )
            assigned_user_emails = list(
                db.scalars(
                    select(User.email)
                    .join(MonitorPermission, MonitorPermission.user_id == User.id)
                    .where(MonitorPermission.monitor_id == monitor.id)
                    .order_by(User.email)
                ).all()
            )

        result.append(
            {
                "id": monitor.id,
                "name": monitor.name,
                "url": monitor.url,
                "status": monitor.status,
                "expected_status": monitor.expected_status,
                "is_active": monitor.is_active,
                "ssl_enabled": monitor.ssl_enabled,
                "alert_email": monitor.alert_email,
                "alert_emails": monitor_recipient_emails(db, monitor.id) or ([monitor.alert_email] if monitor.alert_email else []),
                "can_edit": can_access_monitor(monitor, user),
                "can_delete": user.role == UserRole.ADMIN,
                "owner_email": owner_email,
                "assigned_user_emails": assigned_user_emails,

                # Latest HTTP result
                "http_status": (
                    latest_check.http_status
                    if latest_check
                    else None
                ),

                "response_time_ms": (
                    latest_check.response_time_ms
                    if latest_check
                    else None
                ),

                "error_message": (
                    latest_check.error_message
                    if latest_check
                    else None
                ),

                # Latest SSL result
                "ssl_valid": (
                    latest_check.ssl_valid
                    if latest_check
                    else None
                ),

                "ssl_expires_at": (
                    latest_check.ssl_expires_at
                    if latest_check
                    and latest_check.ssl_expires_at
                    else None
                ),

                "ssl_days_remaining": (
                    latest_check.ssl_days_remaining
                    if latest_check
                    else None
                ),

                "ssl_issuer": (
                    latest_check.ssl_issuer
                    if latest_check
                    else None
                ),

                "ssl_tls_version": (
                    latest_check.ssl_tls_version
                    if latest_check
                    else None
                ),

                "ssl_error": (
                    latest_check.ssl_error
                    if latest_check
                    else None
                ),
            }
        )

    return result


# ==========================================================
# UPDATE MONITOR
# ==========================================================

@router.patch(
    "/{monitor_id}",
    response_model=MonitorResponse,
)
def update_monitor(
    monitor_id: int,
    payload: MonitorCreate,
    user=Depends(
        require_roles(
            UserRole.ADMIN,
            UserRole.URL_MANAGER,
        )
    ),
    db: Session = Depends(get_db),
):
    monitor = db.get(Monitor, monitor_id)

    if not monitor:
        raise HTTPException(
            404,
            "Monitor not found",
        )

    if not can_access_monitor(monitor, user):
        raise HTTPException(403, "You do not have access to this monitor")

    monitor.name = payload.name.strip()
    monitor.url = str(payload.url)
    monitor.method = payload.method
    monitor.expected_status = payload.expected_status
    monitor.timeout_seconds = payload.timeout_seconds
    monitor.interval_seconds = payload.interval_seconds
    monitor.ssl_enabled = payload.ssl_enabled
    if payload.alert_emails or payload.alert_email is not None:
        selected_emails = payload.alert_emails or [str(payload.alert_email)]
        recipients = require_active_recipients(db, selected_emails)
        monitor.alert_email = recipients[0].email
        db.execute(delete(MonitorAlertRecipient).where(MonitorAlertRecipient.monitor_id == monitor.id))
        db.add_all(
            MonitorAlertRecipient(monitor_id=monitor.id, recipient_id=recipient.id)
            for recipient in recipients
        )

    db.commit()
    db.refresh(monitor)

    return monitor


# ==========================================================
# ENABLE MONITOR
# ==========================================================

@router.patch(
    "/{monitor_id}/enable"
)
def enable_monitor(
    monitor_id: int,
    user=Depends(
        require_roles(
            UserRole.ADMIN,
            UserRole.URL_MANAGER,
        )
    ),
    db: Session = Depends(get_db),
):
    monitor = db.get(Monitor, monitor_id)

    if not monitor:
        raise HTTPException(
            404,
            "Monitor not found",
        )

    if not can_access_monitor(monitor, user):
        raise HTTPException(403, "You do not have access to this monitor")

    monitor.is_active = True

    db.commit()
    db.refresh(monitor)

    return {
        "id": monitor.id,
        "name": monitor.name,
        "is_active": monitor.is_active,
        "message": "Monitor enabled successfully",
    }


# ==========================================================
# DISABLE MONITOR
# ==========================================================

@router.patch(
    "/{monitor_id}/disable"
)
def disable_monitor(
    monitor_id: int,
    user=Depends(
        require_roles(
            UserRole.ADMIN,
            UserRole.URL_MANAGER,
        )
    ),
    db: Session = Depends(get_db),
):
    monitor = db.get(Monitor, monitor_id)

    if not monitor:
        raise HTTPException(
            404,
            "Monitor not found",
        )

    if not can_access_monitor(monitor, user):
        raise HTTPException(403, "You do not have access to this monitor")

    monitor.is_active = False

    db.commit()
    db.refresh(monitor)

    return {
        "id": monitor.id,
        "name": monitor.name,
        "is_active": monitor.is_active,
        "message": "Monitor disabled successfully",
    }


# ==========================================================
# DELETE MONITOR
# ==========================================================

@router.delete(
    "/{monitor_id}"
)
def delete_monitor(
    monitor_id: int,
    admin=Depends(
        require_roles(UserRole.ADMIN)
    ),
    db: Session = Depends(get_db),
):
    monitor = db.get(Monitor, monitor_id)

    if not monitor:
        raise HTTPException(
            404,
            "Monitor not found",
        )

    db.execute(
        delete(MonitorCheck).where(
            MonitorCheck.monitor_id == monitor_id
        )
    )

    db.delete(monitor)
    db.commit()

    return {
        "message": "Monitor deleted successfully",
        "id": monitor_id,
    }


# ==========================================================
# HISTORY
# ==========================================================

@router.get(
    "/{monitor_id}/history"
)
def history(
    monitor_id: int,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    monitor = db.get(Monitor, monitor_id)

    if not monitor:
        raise HTTPException(
            404,
            "Monitor not found",
        )

    if not can_view_monitor(db, monitor, user):
        raise HTTPException(403, "You do not have access to this monitor")

    checks = db.scalars(
        select(MonitorCheck)
        .where(
            MonitorCheck.monitor_id == monitor_id
        )
        .order_by(
            MonitorCheck.checked_at.desc(),
            MonitorCheck.id.desc(),
        )
        .limit(100)
    ).all()

    return [
        {
            "id": check.id,
            "checked_at": check.checked_at,
            "status": check.status,

            # HTTP
            "http_status": check.http_status,
            "response_time_ms": check.response_time_ms,
            "error_message": check.error_message,

            # SSL
            "ssl_valid": check.ssl_valid,
            "ssl_expires_at": check.ssl_expires_at,
            "ssl_days_remaining": check.ssl_days_remaining,
            "ssl_issuer": check.ssl_issuer,
            "ssl_tls_version": check.ssl_tls_version,
            "ssl_error": check.ssl_error,
        }
        for check in checks
    ]