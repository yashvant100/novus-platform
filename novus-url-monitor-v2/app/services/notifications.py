import logging
from datetime import datetime, timezone
from .email import send_smtp
from html import escape
import re

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .email import send_smtp

from app.models import (
    AlertRecipient,
    EmailProvider,
    Incident,
    IncidentStatus,
    Monitor,
    MonitorCheck,
    NotificationEvent,
)

logger = logging.getLogger("novus-monitor-notifications")


# ==========================================================
# TIME
# ==========================================================

def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ==========================================================
# EMAIL PROVIDER
# ==========================================================

def get_email_provider(
    db: Session,
) -> EmailProvider | None:

    return db.scalar(
        select(EmailProvider)
        .where(
            EmailProvider.is_active.is_(True)
        )
        .order_by(
            EmailProvider.is_default.desc(),
            EmailProvider.id.asc(),
        )
    )


def get_recipients(
    db: Session,
) -> list[str]:

    return list(
        db.scalars(
            select(AlertRecipient.email)
            .where(
                AlertRecipient.is_active.is_(True)
            )
            .order_by(
                AlertRecipient.id
            )
        ).all()
    )


def build_email_html(subject: str, body: str) -> str:
    """
    Build a responsive, Outlook/Gmail-friendly HTML email while preserving
    the existing plain-text body as the fallback.
    """
    subject_upper = subject.upper()

    if "DOWN" in subject_upper and "RESOLVED" not in subject_upper:
        accent = "#dc2626"
        soft = "#fef2f2"
        badge = "MONITOR DOWN"
        intro = "An availability alert requires your attention."
    elif "RESOLVED" in subject_upper:
        accent = "#16a34a"
        soft = "#f0fdf4"
        badge = "MONITOR RECOVERED"
        intro = "The monitored service has recovered and is responding normally."
    elif "SSL" in subject_upper:
        accent = "#d97706"
        soft = "#fffbeb"
        badge = "SSL CERTIFICATE ALERT"
        intro = "An SSL certificate requires attention."
    else:
        accent = "#2563eb"
        soft = "#eff6ff"
        badge = "NOVUS LOYALTY ALERT"
        intro = "Monitoring notification from Novus Loyalty."

    lines = body.splitlines()
    sections = []
    current_title = None
    current_rows = []
    top_rows = []

    def flush():
        nonlocal current_title, current_rows
        if current_title:
            sections.append((current_title, current_rows))
        current_title = None
        current_rows = []

    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        if set(line) == {"="} or set(line) == {"-"}:
            continue

        upper = line.upper()
        if upper in {"HTTP MONITORING", "SSL MONITORING"}:
            flush()
            current_title = upper
            continue

        if current_title:
            if ":" in line:
                key, value = line.split(":", 1)
                current_rows.append((key.strip(), value.strip()))
            else:
                current_rows.append((line, ""))
        else:
            # Preserve incident/alert metadata before HTTP/SSL sections.
            if upper != "NOVUS URL MONITOR":
                if upper.startswith("ALERT:") or upper == "MONITOR RESOLVED" or upper.startswith("SSL CERTIFICATE"):
                    continue
                if ":" in line:
                    key, value = line.split(":", 1)
                    top_rows.append((key.strip(), value.strip()))

    flush()

    if top_rows:
        sections.insert(0, ("ALERT DETAILS", top_rows))

    def linkify(value: str) -> str:
        escaped = escape(value)
        pattern = r'(https?://[^\s<]+)'
        return re.sub(
            pattern,
            lambda m: f'<a href="{m.group(1)}" style="color:#2563eb;text-decoration:none;font-weight:600;">{m.group(1)}</a>',
            escaped,
        )

    # Pull useful top-level values for the summary block.
    monitor_name = ""
    monitor_url = ""
    status = ""
    for section_name, rows in sections:
        for key, value in rows:
            k = key.lower()
            if k == "monitor":
                monitor_name = value
            elif k == "url":
                monitor_url = value
            elif k == "status":
                status = value

    rows_html = ""
    for section_name, rows in sections:
        if not rows:
            continue
        section_rows = ""
        for key, value in rows:
            value_html = linkify(value)
            section_rows += f"""
              <tr>
                <td style="padding:11px 14px;border-bottom:1px solid #e5e7eb;background:#f8fafc;color:#475569;font-size:13px;font-weight:600;width:34%;vertical-align:top;">{escape(key)}</td>
                <td style="padding:11px 14px;border-bottom:1px solid #e5e7eb;color:#1e293b;font-size:13px;vertical-align:top;word-break:break-word;">{value_html or "&mdash;"}</td>
              </tr>"""
        rows_html += f"""
          <tr>
            <td colspan="2" style="padding:12px 14px;background:{soft};color:{accent};font-size:12px;font-weight:800;letter-spacing:.08em;">
              {escape(section_name)}
            </td>
          </tr>
          {section_rows}"""

    summary_html = ""
    if monitor_name or monitor_url or status:
        summary_html = f"""
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:20px 0 8px;">
          <tr>
            <td style="width:33.33%;padding:14px;background:#f8fafc;border:1px solid #e5e7eb;">
              <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Monitor</div>
              <div style="margin-top:5px;font-size:14px;color:#0f172a;font-weight:700;">{escape(monitor_name) or "&mdash;"}</div>
            </td>
            <td style="width:33.33%;padding:14px;background:#f8fafc;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;">
              <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Status</div>
              <div style="margin-top:5px;font-size:14px;color:{accent};font-weight:800;">{escape(status) or badge}</div>
            </td>
            <td style="width:33.33%;padding:14px;background:#f8fafc;border:1px solid #e5e7eb;">
              <div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em;">Type</div>
              <div style="margin-top:5px;font-size:14px;color:#0f172a;font-weight:700;">URL Monitoring</div>
            </td>
          </tr>
        </table>"""

    cta_html = ""
    if monitor_url.startswith(("http://", "https://")):
        safe_url = escape(monitor_url, quote=True)
        cta_html = f"""
        <div style="margin-top:22px;">
          <a href="{safe_url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:8px;font-size:13px;font-weight:700;">Open monitored URL</a>
        </div>"""

    return f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:1100px;width:100%;background:#ffffff;border:1px solid #dbe3ec;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:24px 28px;background:#0f172a;">
            <div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:.01em;">Novus <span style="color:#38bdf8;">Loyalty</span></div>
            <div style="margin-top:4px;font-size:11px;color:#94a3b8;letter-spacing:.16em;text-transform:uppercase;">URL &amp; Alert Monitoring</div>
          </td>
        </tr>
        <tr>
          <td style="height:5px;background:{accent};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:{soft};color:{accent};font-size:10px;font-weight:800;letter-spacing:.08em;">{escape(badge)}</div>
            <h1 style="margin:14px 0 8px;font-size:24px;line-height:1.25;color:#0f172a;">{escape(subject)}</h1>
            <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6;">{escape(intro)}</p>
            {summary_html}
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:18px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
              {rows_html}
            </table>
            {cta_html}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;">
            <div style="font-size:12px;font-weight:700;color:#475569;">Novus Loyalty</div>
            <div style="margin-top:3px;font-size:11px;color:#94a3b8;">Automatic URL availability, response-time and alert monitoring.</div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""



# ==========================================================
# SEND EMAIL
# ==========================================================

def send_email(
    db: Session,
    subject: str,
    body: str,
) -> bool:
    """
    Send one notification through the shared SMTP transport.

    IMPORTANT:
    - body is the plain-text fallback.
    - build_email_html() is the actual branded HTML body.
    - smtp.send_smtp() sends both as multipart/alternative.
    """

    provider = get_email_provider(db)
    recipients = get_recipients(db)

    if not provider:
        logger.warning(
            "No active email provider configured. "
            "Email not sent: %s",
            subject,
        )
        return False

    if not recipients:
        logger.warning(
            "No active alert recipients configured. "
            "Email not sent: %s",
            subject,
        )
        return False

    if not provider.host:
        logger.error(
            "Email provider '%s' has no SMTP host",
            provider.name,
        )
        return False

    if not provider.port:
        logger.error(
            "Email provider '%s' has no SMTP port",
            provider.name,
        )
        return False

    html_body = build_email_html(
        subject,
        body,
    )

    try:
        send_smtp(
            provider=provider,
            recipients=recipients,
            subject=subject,
            body=body,
            html_body=html_body,
        )

        logger.info(
            "Email sent successfully: %s",
            subject,
        )

        return True

    except Exception:
        logger.exception(
            "Failed to send email: %s",
            subject,
        )

        return False


# ==========================================================
# CHECK WHETHER EVENT WAS ALREADY SENT
# ==========================================================

def event_exists(
    db: Session,
    monitor_id: int,
    event_type: str,
    event_key: str,
) -> bool:

    return (
        db.scalar(
            select(
                NotificationEvent.id
            )
            .where(
                NotificationEvent.monitor_id
                == monitor_id,

                NotificationEvent.event_type
                == event_type,

                NotificationEvent.event_key
                == event_key,
            )
        )
        is not None
    )


# ==========================================================
# RECORD NOTIFICATION EVENT
# ==========================================================

def record_event(
    db: Session,
    monitor_id: int,
    event_type: str,
    event_key: str,
    incident_id: int | None = None,
) -> bool:

    event = NotificationEvent(
        monitor_id=monitor_id,
        incident_id=incident_id,
        event_type=event_type,
        event_key=event_key,
    )

    db.add(event)

    try:

        db.flush()

        return True

    except IntegrityError:

        db.rollback()

        return False


# ==========================================================
# SEND ONE NOTIFICATION ONLY ONCE
# ==========================================================

def send_once(
    db: Session,
    monitor: Monitor,
    event_type: str,
    event_key: str,
    subject: str,
    body: str,
    incident_id: int | None = None,
) -> bool:

    # Already sent
    if event_exists(
        db,
        monitor.id,
        event_type,
        event_key,
    ):
        return False

    # Send email first
    sent = send_email(
        db,
        subject,
        body,
    )

    # Do not create event if email failed
    if not sent:
        return False

    # Record event only after successful email
    recorded = record_event(
        db,
        monitor.id,
        event_type,
        event_key,
        incident_id,
    )

    if not recorded:

        db.rollback()

        return False

    db.commit()

    return True


# ==========================================================
# LATEST MONITOR CHECK / EMAIL DETAILS
# ==========================================================

def get_latest_check(
    db: Session,
    monitor_id: int,
) -> MonitorCheck | None:
    return db.scalar(
        select(MonitorCheck)
        .where(MonitorCheck.monitor_id == monitor_id)
        .order_by(
            MonitorCheck.checked_at.desc(),
            MonitorCheck.id.desc(),
        )
    )


def build_monitor_details(
    db: Session,
    monitor: Monitor,
) -> str:
    """
    Build one common HTTP + SSL section for all incident emails.

    The latest MonitorCheck is used so DOWN, reminder, and RESOLVED
    emails contain the actual HTTP and SSL result of the latest check.
    """
    check = get_latest_check(db, monitor.id)

    if check is None:
        return (
            "HTTP MONITORING\n"
            "---------------\n"
            "Status: N/A\n"
            "HTTP Status: N/A\n"
            "Response Time: N/A\n"
            f"Expected Status: {monitor.expected_status}\n"
            "Error: N/A\n\n"
            "SSL MONITORING\n"
            "---------------\n"
            f"SSL Enabled: {'Yes' if monitor.ssl_enabled else 'No'}\n"
            "SSL Valid: N/A\n"
            "Certificate Expires: N/A\n"
            "Days Remaining: N/A\n"
            "Issuer: N/A\n"
            "TLS Version: N/A\n"
            "SSL Error: N/A\n"
        )

    status_value = (
        check.status.value
        if hasattr(check.status, "value")
        else str(check.status)
    )

    http_status = (
        str(check.http_status)
        if check.http_status is not None
        else "N/A"
    )

    response_time = (
        f"{check.response_time_ms} ms"
        if check.response_time_ms is not None
        else "N/A"
    )

    error = check.error_message or "None"

    if not monitor.ssl_enabled:
        ssl_enabled = "No"
        ssl_valid = "N/A"
        ssl_expires = "N/A"
        ssl_days = "N/A"
        ssl_issuer = "N/A"
        ssl_tls = "N/A"
        ssl_error = "N/A"
    elif check.ssl_valid is True:
        ssl_enabled = "Yes"
        ssl_valid = "Yes"
        ssl_expires = (
            check.ssl_expires_at.isoformat()
            if check.ssl_expires_at
            else "N/A"
        )
        ssl_days = (
            str(check.ssl_days_remaining)
            if check.ssl_days_remaining is not None
            else "N/A"
        )
        ssl_issuer = check.ssl_issuer or "N/A"
        ssl_tls = check.ssl_tls_version or "N/A"
        ssl_error = check.ssl_error or "None"
    elif check.ssl_valid is False:
        ssl_enabled = "Yes"
        ssl_valid = "No"
        ssl_expires = (
            check.ssl_expires_at.isoformat()
            if check.ssl_expires_at
            else "N/A"
        )
        ssl_days = (
            str(check.ssl_days_remaining)
            if check.ssl_days_remaining is not None
            else "N/A"
        )
        ssl_issuer = check.ssl_issuer or "N/A"
        ssl_tls = check.ssl_tls_version or "N/A"
        ssl_error = check.ssl_error or "Unknown SSL error"
    else:
        ssl_enabled = "Yes"
        ssl_valid = "N/A"
        ssl_expires = "N/A"
        ssl_days = "N/A"
        ssl_issuer = "N/A"
        ssl_tls = "N/A"
        ssl_error = "N/A"

    return (
        "HTTP MONITORING\n"
        "---------------\n"
        f"Status: {status_value}\n"
        f"HTTP Status: {http_status}\n"
        f"Response Time: {response_time}\n"
        f"Expected Status: {monitor.expected_status}\n"
        f"Error: {error}\n\n"
        "SSL MONITORING\n"
        "---------------\n"
        f"SSL Enabled: {ssl_enabled}\n"
        f"SSL Valid: {ssl_valid}\n"
        f"Certificate Expires: {ssl_expires}\n"
        f"Days Remaining: {ssl_days}\n"
        f"Issuer: {ssl_issuer}\n"
        f"TLS Version: {ssl_tls}\n"
        f"SSL Error: {ssl_error}\n"
    )


# ==========================================================
# INCIDENT - DOWN EMAIL
# ==========================================================

def send_incident_down(
    db: Session,
    monitor: Monitor,
    incident: Incident,
    reason: str,
) -> bool:
    subject = f"[DOWN] {monitor.name}"

    body = (
        "NOVUS LOYALTY\n"
        "==================\n\n"
        "ALERT: MONITOR DOWN\n\n"
        f"Monitor: {monitor.name}\n"
        f"URL: {monitor.url}\n"
        "Status: DOWN\n"
        f"Incident ID: {incident.id}\n"
        f"Started: {incident.started_at.isoformat()}\n"
        f"Reason: {reason or 'Monitor is DOWN'}\n\n"
        f"{build_monitor_details(db, monitor)}"
    )

    return send_once(
        db=db,
        monitor=monitor,
        event_type="INCIDENT",
        event_key=f"{incident.id}:DOWN",
        subject=subject,
        body=body,
        incident_id=incident.id,
    )


# ==========================================================
# INCIDENT - 5 / 15 MINUTE REMINDER
# ==========================================================

def send_incident_reminder(
    db: Session,
    monitor: Monitor,
    incident: Incident,
    minutes: int,
    reason: str,
) -> bool:
    stage = f"DOWN_REMINDER_{minutes}"
    subject = f"[DOWN REMINDER - {minutes} MIN] {monitor.name}"

    body = (
        "NOVUS LOYALTY\n"
        "==================\n\n"
        "ALERT: MONITOR STILL DOWN\n\n"
        f"Monitor: {monitor.name}\n"
        f"URL: {monitor.url}\n"
        "Status: STILL DOWN\n"
        f"Incident ID: {incident.id}\n"
        f"Started: {incident.started_at.isoformat()}\n"
        f"Reminder: {minutes} minutes\n"
        f"Reason: {reason or 'Monitor is DOWN'}\n\n"
        f"{build_monitor_details(db, monitor)}"
    )

    return send_once(
        db=db,
        monitor=monitor,
        event_type="INCIDENT",
        event_key=f"{incident.id}:{stage}",
        subject=subject,
        body=body,
        incident_id=incident.id,
    )


# ==========================================================
# INCIDENT - RESOLVED EMAIL
# ==========================================================

def send_incident_resolved(
    db: Session,
    monitor: Monitor,
    incident: Incident,
) -> bool:
    duration = incident.duration_seconds or 0

    subject = f"[RESOLVED] {monitor.name}"

    body = (
        "NOVUS LOYALTY\n"
        "==================\n\n"
        "MONITOR RESOLVED\n\n"
        f"Monitor: {monitor.name}\n"
        f"URL: {monitor.url}\n"
        "Status: UP\n"
        f"Incident ID: {incident.id}\n"
        f"Started: {incident.started_at.isoformat()}\n"
        f"Resolved: "
        f"{incident.resolved_at.isoformat() if incident.resolved_at else utcnow().isoformat()}\n"
        f"Downtime: {duration} seconds\n"
        f"Reason: {incident.reason}\n\n"
        f"{build_monitor_details(db, monitor)}"
    )

    return send_once(
        db=db,
        monitor=monitor,
        event_type="INCIDENT",
        event_key=f"{incident.id}:RESOLVED",
        subject=subject,
        body=body,
        incident_id=incident.id,
    )


# ==========================================================
# SSL EXPIRY EMAIL
# ==========================================================

def send_ssl_alert(
    db: Session,
    monitor: Monitor,
    expires_at: datetime,
    days_remaining: int,
    alert_key: str,
) -> bool:
    expiry_key = (
        expires_at
        .astimezone(timezone.utc)
        .isoformat()
    )

    event_key = f"{expiry_key}:{alert_key}"

    subject = (
        f"[SSL EXPIRY - {days_remaining} DAYS] "
        f"{monitor.name}"
    )

    check = get_latest_check(db, monitor.id)

    issuer = check.ssl_issuer if check else None
    tls_version = check.ssl_tls_version if check else None
    ssl_error = check.ssl_error if check else None
    ssl_valid = check.ssl_valid if check else None

    body = (
        "NOVUS LOYALTY\n"
        "==================\n\n"
        "SSL CERTIFICATE EXPIRY ALERT\n\n"
        f"Monitor: {monitor.name}\n"
        f"URL: {monitor.url}\n\n"
        "SSL MONITORING\n"
        "---------------\n"
        f"SSL Enabled: {'Yes' if monitor.ssl_enabled else 'No'}\n"
        f"SSL Valid: {'Yes' if ssl_valid is True else 'No' if ssl_valid is False else 'N/A'}\n"
        f"Certificate Expires: {expires_at.isoformat()}\n"
        f"Days Remaining: {days_remaining}\n"
        f"Issuer: {issuer or 'N/A'}\n"
        f"TLS Version: {tls_version or 'N/A'}\n"
        f"SSL Error: {ssl_error or 'None'}\n\n"
        f"Alert: {alert_key}\n"
    )

    return send_once(
        db=db,
        monitor=monitor,
        event_type="SSL_EXPIRY",
        event_key=event_key,
        subject=subject,
        body=body,
    )


# ==========================================================
# SSL RESOLVED / CERTIFICATE RENEWED
# ==========================================================

def send_ssl_resolved(
    db: Session,
    monitor: Monitor,
    old_expires_at: datetime | None,
    new_expires_at: datetime,
    days_remaining: int,
) -> bool:
    expiry_key = (
        new_expires_at
        .astimezone(timezone.utc)
        .isoformat()
    )

    event_key = f"{expiry_key}:SSL_RESOLVED"

    subject = f"[SSL RESOLVED] {monitor.name}"

    check = get_latest_check(db, monitor.id)

    issuer = check.ssl_issuer if check else None
    tls_version = check.ssl_tls_version if check else None
    ssl_error = check.ssl_error if check else None

    body = (
        "NOVUS LOYALTY\n"
        "==================\n\n"
        "SSL CERTIFICATE RESOLVED\n\n"
        f"Monitor: {monitor.name}\n"
        f"URL: {monitor.url}\n\n"
        "SSL MONITORING\n"
        "---------------\n"
        "SSL Enabled: Yes\n"
        "SSL Valid: Yes\n"
        f"Previous Expiry: {old_expires_at.isoformat() if old_expires_at else 'N/A'}\n"
        f"New Expiry: {new_expires_at.isoformat()}\n"
        f"New Days Remaining: {days_remaining}\n"
        f"Issuer: {issuer or 'N/A'}\n"
        f"TLS Version: {tls_version or 'N/A'}\n"
        f"SSL Error: {ssl_error or 'None'}\n\n"
        "Resolution rule: "
        "new certificate has more than 70 days remaining.\n"
    )

    return send_once(
        db=db,
        monitor=monitor,
        event_type="SSL_RESOLVED",
        event_key=event_key,
        subject=subject,
        body=body,
    )


# ==========================================================
# INCIDENT PROCESSING
# ==========================================================

def process_incident_alerts(
    db: Session,
    monitor: Monitor,
    current_status: str,
    reason: str,
) -> None:

    now = utcnow()

    status = (
        current_status.value
        if hasattr(
            current_status,
            "value",
        )
        else str(current_status)
    )

    open_incident = db.scalar(
        select(Incident)
        .where(
            Incident.monitor_id
            == monitor.id,

            Incident.status
            == IncidentStatus.OPEN,
        )
        .order_by(
            Incident.id.desc()
        )
    )

    # ======================================================
    # DOWN
    # ======================================================

    if status == "DOWN":

        # New incident
        if not open_incident:

            incident = Incident(
                monitor_id=monitor.id,
                started_at=now,
                reason=(
                    reason
                    or "Monitor is DOWN"
                ),
                status=IncidentStatus.OPEN,
            )

            db.add(incident)

            db.commit()

            db.refresh(incident)

            send_incident_down(
                db,
                monitor,
                incident,
                reason,
            )

            return

        # Existing incident
        elapsed = (
            now
            - open_incident.started_at
        ).total_seconds()

        # 5 minute reminder
        if elapsed >= 5 * 60:

            send_incident_reminder(
                db,
                monitor,
                open_incident,
                5,
                reason,
            )

        # 15 minute reminder
        if elapsed >= 15 * 60:

            send_incident_reminder(
                db,
                monitor,
                open_incident,
                15,
                reason,
            )

        return

    # ======================================================
    # UP / RESOLVED
    # ======================================================

    if (
        status == "UP"
        and open_incident
    ):

        open_incident.resolved_at = now

        open_incident.duration_seconds = max(
            0,
            int(
                (
                    now
                    - open_incident.started_at
                ).total_seconds()
            ),
        )

        open_incident.status = (
            IncidentStatus.RESOLVED
        )

        db.commit()

        db.refresh(
            open_incident
        )

        send_incident_resolved(
            db,
            monitor,
            open_incident,
        )


# ==========================================================
# SSL PROCESSING
# ==========================================================

def process_ssl_alerts(
    db: Session,
    monitor: Monitor,
    ssl_valid: bool | None,
    expires_at: datetime | None,
    days_remaining: int | None,
) -> None:

    if (
        not monitor.ssl_enabled
        or ssl_valid is not True
        or expires_at is None
        or days_remaining is None
    ):
        return

    previous_expiry = (
        monitor.ssl_last_expires_at
    )

    # ======================================================
    # CERTIFICATE RENEWAL DETECTION
    # ======================================================

    if previous_expiry is not None:

        changed = (
            abs(
                (
                    expires_at
                    - previous_expiry
                ).total_seconds()
            )
            > 60
        )

        # New certificate has >70 days
        # => SSL RESOLVED
        if (
            changed
            and days_remaining > 70
        ):

            send_ssl_resolved(
                db=db,
                monitor=monitor,
                old_expires_at=previous_expiry,
                new_expires_at=expires_at,
                days_remaining=days_remaining,
            )

    # Save latest certificate expiry
    monitor.ssl_last_expires_at = (
        expires_at
    )

    db.commit()

    # ======================================================
    # 15 DAYS
    # ======================================================

    if days_remaining == 15:

        send_ssl_alert(
            db,
            monitor,
            expires_at,
            days_remaining,
            "15_DAY",
        )

        return

    # ======================================================
    # 10 DAYS
    # ======================================================

    if days_remaining == 10:

        send_ssl_alert(
            db,
            monitor,
            expires_at,
            days_remaining,
            "10_DAY",
        )

        return

    # ======================================================
    # 7 DAYS
    # ======================================================

    if days_remaining == 7:

        send_ssl_alert(
            db,
            monitor,
            expires_at,
            days_remaining,
            "7_DAY",
        )

        return

    # ======================================================
    # 3 DAYS
    # ======================================================

    if days_remaining == 3:

        send_ssl_alert(
            db,
            monitor,
            expires_at,
            days_remaining,
            "3_DAY",
        )

        return

    # ======================================================
    # 2 DAYS
    # ======================================================

    if days_remaining == 2:

        send_ssl_alert(
            db,
            monitor,
            expires_at,
            days_remaining,
            "2_DAY",
        )

        return

    # ======================================================
    # 1 DAY - FOUR HOURLY EMAILS
    # ======================================================

    if days_remaining == 1:

        now = utcnow()

        seconds_remaining = max(
            0,
            int(
                (
                    expires_at
                    - now
                ).total_seconds()
            ),
        )

        elapsed_seconds = (
            24 * 60 * 60
            - seconds_remaining
        )

        slot = (
            elapsed_seconds // 3600
        ) + 1

        if 1 <= slot <= 4:

            send_ssl_alert(
                db,
                monitor,
                expires_at,
                days_remaining,
                f"1_DAY_HOURLY_{slot}",
            )

        return

    # ======================================================
    # 0 DAY - FOUR HOURLY EMAILS
    # ======================================================

    if days_remaining == 0:

        now = utcnow()

        seconds_remaining = max(
            0,
            int(
                (
                    expires_at
                    - now
                ).total_seconds()
            ),
        )

        elapsed_seconds = (
            48 * 60 * 60
            - seconds_remaining
        )

        slot = (
            elapsed_seconds // 3600
        ) + 1

        if 1 <= slot <= 4:

            send_ssl_alert(
                db,
                monitor,
                expires_at,
                days_remaining,
                f"0_DAY_HOURLY_{slot}",
            )