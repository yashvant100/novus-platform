import socket
import ssl
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from sqlalchemy.orm import Session

from app.models import Monitor, MonitorCheck, MonitorStatus
from app.services.history import enforce_history_limit


def empty_ssl_result() -> dict:
    return {
        "ssl_valid": None,
        "ssl_expires_at": None,
        "ssl_days_remaining": None,
        "ssl_issuer": None,
        "ssl_tls_version": None,
        "ssl_error": None,
    }


def get_ssl_certificate_info(url: str, timeout: int = 10) -> dict:
    result = empty_ssl_result()
    parsed = urlparse(url)

    if parsed.scheme.lower() != "https":
        return result

    hostname = parsed.hostname
    if not hostname:
        result["ssl_valid"] = False
        result["ssl_error"] = "Invalid HTTPS hostname"
        return result

    port = parsed.port or 443
    raw_socket = None
    tls_socket = None

    try:
        context = ssl.create_default_context()

        raw_socket = socket.create_connection(
            (hostname, port),
            timeout=timeout,
        )

        tls_socket = context.wrap_socket(
            raw_socket,
            server_hostname=hostname,
        )

        certificate = tls_socket.getpeercert()
        if not certificate:
            raise ssl.SSLError("No TLS certificate received")

        result["ssl_tls_version"] = tls_socket.version()

        expires_string = certificate.get("notAfter")
        if expires_string:
            expires_at = datetime.strptime(
                expires_string,
                "%b %d %H:%M:%S %Y %Z",
            ).replace(tzinfo=timezone.utc)

            seconds_remaining = (
                expires_at - datetime.now(timezone.utc)
            ).total_seconds()

            result["ssl_expires_at"] = expires_at
            result["ssl_days_remaining"] = int(
                seconds_remaining // 86400
            )

        issuer_values = []
        for section in certificate.get("issuer", ()):
            for key, value in section:
                issuer_values.append(f"{key}={value}")

        issuer = ", ".join(issuer_values)
        result["ssl_issuer"] = issuer[:512] if issuer else None
        result["ssl_valid"] = True
        result["ssl_error"] = None
        return result

    except ssl.CertificateError as exc:
        result["ssl_valid"] = False
        result["ssl_error"] = f"Certificate validation failed: {exc}"[:2000]
        return result

    except ssl.SSLError as exc:
        result["ssl_valid"] = False
        result["ssl_error"] = f"TLS/SSL error: {exc}"[:2000]
        return result

    except socket.timeout:
        result["ssl_valid"] = False
        result["ssl_error"] = "SSL connection timed out"
        return result

    except OSError as exc:
        result["ssl_valid"] = False
        result["ssl_error"] = f"SSL connection error: {exc}"[:2000]
        return result

    except Exception as exc:
        result["ssl_valid"] = False
        result["ssl_error"] = f"SSL check failed: {exc}"[:2000]
        return result

    finally:
        if tls_socket is not None:
            try:
                tls_socket.close()
            except Exception:
                pass
        elif raw_socket is not None:
            try:
                raw_socket.close()
            except Exception:
                pass


def check_monitor(
    db: Session,
    monitor: Monitor,
    history_limit: int = 100,
):
    started = time.perf_counter()

    status = MonitorStatus.DOWN
    http_status = None
    error = None
    ssl_data = empty_ssl_result()

    try:
        with httpx.Client(
            timeout=monitor.timeout_seconds,
            follow_redirects=True,
        ) as client:
            response = client.request(
                monitor.method,
                monitor.url,
            )

            http_status = response.status_code

            if response.status_code == monitor.expected_status:
                status = MonitorStatus.UP
            else:
                error = (
                    f"Expected HTTP {monitor.expected_status}, "
                    f"got {response.status_code}"
                )

    except httpx.TimeoutException:
        error = "HTTP request timed out"

    except httpx.RequestError as exc:
        error = f"HTTP request failed: {exc}"[:2000]

    except Exception as exc:
        error = str(exc)[:2000]

    if (
        monitor.ssl_enabled
        and monitor.url.lower().startswith("https://")
    ):
        ssl_data = get_ssl_certificate_info(
            monitor.url,
            timeout=monitor.timeout_seconds,
        )

        if ssl_data["ssl_valid"] is not True:
            status = MonitorStatus.DOWN
            ssl_error = ssl_data["ssl_error"]

            if ssl_error:
                if error:
                    error = f"{error}; SSL: {ssl_error}"
                else:
                    error = f"SSL: {ssl_error}"

    response_time_ms = int(
        (time.perf_counter() - started) * 1000
    )

    check = MonitorCheck(
        monitor_id=monitor.id,
        status=status,
        http_status=http_status,
        response_time_ms=response_time_ms,
        error_message=error,
        ssl_valid=ssl_data["ssl_valid"],
        ssl_expires_at=ssl_data["ssl_expires_at"],
        ssl_days_remaining=ssl_data["ssl_days_remaining"],
        ssl_issuer=ssl_data["ssl_issuer"],
        ssl_tls_version=ssl_data["ssl_tls_version"],
        ssl_error=ssl_data["ssl_error"],
    )

    db.add(check)
    monitor.status = status

    db.commit()
    db.refresh(check)

    enforce_history_limit(
        db,
        monitor.id,
        history_limit,
    )

    return check
