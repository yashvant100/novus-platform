import logging
import time

from sqlalchemy import select

from app.config import get_settings
from app.db.session import SessionLocal
from app.models import Monitor
from app.services.monitoring import check_monitor
from app.services.notifications import (
    process_incident_alerts,
    process_ssl_alerts,
)


# ==========================================================
# LOGGING
# ==========================================================

logging.basicConfig(
    level=logging.INFO,
    format=(
        "%(asctime)s "
        "[%(levelname)s] "
        "%(message)s"
    ),
)

logger = logging.getLogger(
    "novus-monitor-worker"
)


# ==========================================================
# WORKER POLL
# ==========================================================

POLL_SECONDS = 5


# ==========================================================
# WORKER
# ==========================================================

def run_worker():

    logger.info(
        "Novus URL Monitor worker started"
    )

    settings = get_settings()

    history_limit = (
        settings.monitor_max_history
    )

    # Last execution time for each monitor
    last_checked: dict[int, float] = {}

    while True:

        try:

            now_mono = time.monotonic()

            db = SessionLocal()

            active_ids: set[int] = set()

            try:

                monitors = db.scalars(
                    select(Monitor)
                    .where(
                        Monitor.is_active.is_(True)
                    )
                    .order_by(
                        Monitor.id
                    )
                ).all()

                for monitor in monitors:

                    monitor_id = monitor.id

                    active_ids.add(
                        monitor_id
                    )

                    # ==================================================
                    # INTERVAL CHECK
                    # ==================================================

                    last_run = (
                        last_checked.get(
                            monitor_id
                        )
                    )

                    if (
                        last_run is not None
                        and
                        (
                            now_mono
                            - last_run
                        )
                        < monitor.interval_seconds
                    ):
                        continue

                    last_checked[
                        monitor_id
                    ] = now_mono

                    # ==================================================
                    # CAPTURE VALUES BEFORE COMMIT
                    # ==================================================

                    monitor_name = (
                        monitor.name
                    )

                    monitor_url = (
                        monitor.url
                    )

                    logger.info(
                        "Checking monitor "
                        "id=%s name=%s url=%s",
                        monitor_id,
                        monitor_name,
                        monitor_url,
                    )

                    try:

                        # ==================================================
                        # HTTP + SSL CHECK
                        # ==================================================

                        check = check_monitor(
                            db=db,
                            monitor=monitor,
                            history_limit=history_limit,
                        )

                        current_status = (
                            check.status.value
                            if hasattr(
                                check.status,
                                "value",
                            )
                            else str(
                                check.status
                            )
                        )

                        reason = (
                            check.error_message
                            or ""
                        )

                        logger.info(
                            "Monitor id=%s "
                            "status=%s "
                            "http_status=%s "
                            "ssl_valid=%s "
                            "ssl_days=%s "
                            "response_time=%sms",
                            monitor_id,
                            current_status,
                            check.http_status,
                            check.ssl_valid,
                            check.ssl_days_remaining,
                            check.response_time_ms,
                        )

                        # ==================================================
                        # RELOAD MONITOR
                        # ==================================================

                        fresh_monitor = db.get(
                            Monitor,
                            monitor_id,
                        )

                        if not fresh_monitor:

                            logger.warning(
                                "Monitor id=%s "
                                "was removed during check",
                                monitor_id,
                            )

                            continue

                        # ==================================================
                        # INCIDENT ALERTS
                        # ==================================================

                        process_incident_alerts(
                            db=db,
                            monitor=fresh_monitor,
                            current_status=current_status,
                            reason=reason,
                        )

                        # ==================================================
                        # SSL ALERTS
                        # ==================================================

                        process_ssl_alerts(
                            db=db,
                            monitor=fresh_monitor,
                            ssl_valid=(
                                check.ssl_valid
                            ),
                            expires_at=(
                                check.ssl_expires_at
                            ),
                            days_remaining=(
                                check.ssl_days_remaining
                            ),
                        )

                    except Exception:

                        logger.exception(
                            "Monitor check/notification "
                            "failed id=%s name=%s",
                            monitor_id,
                            monitor_name,
                        )

                        db.rollback()

            finally:

                db.close()

            # ==========================================================
            # REMOVE DELETED / INACTIVE MONITORS
            # ==========================================================

            last_checked = {
                monitor_id: timestamp
                for (
                    monitor_id,
                    timestamp,
                ) in last_checked.items()
                if monitor_id in active_ids
            }

        except Exception:

            logger.exception(
                "Monitoring worker loop error"
            )

        time.sleep(
            POLL_SECONDS
        )


# ==========================================================
# ENTRY POINT
# ==========================================================

if __name__ == "__main__":

    try:

        run_worker()

    except KeyboardInterrupt:

        logger.info(
            "Novus URL Monitor worker stopped"
        )