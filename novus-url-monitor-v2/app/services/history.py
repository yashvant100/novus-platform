from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import MonitorCheck


def enforce_history_limit(
    db: Session,
    monitor_id: int,
    limit: int = 100,
):
    if limit < 1:
        raise ValueError(
            "History limit must be greater than zero"
        )

    ids = db.scalars(
        select(MonitorCheck.id)
        .where(
            MonitorCheck.monitor_id == monitor_id
        )
        .order_by(
            MonitorCheck.checked_at.desc(),
            MonitorCheck.id.desc(),
        )
        .offset(limit)
    ).all()

    if not ids:
        return

    db.execute(
        delete(MonitorCheck).where(
            MonitorCheck.id.in_(ids)
        )
    )

    db.commit()