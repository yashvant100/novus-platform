from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl


# ==========================================================
# CREATE / UPDATE MONITOR
# ==========================================================

class MonitorCreate(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=200,
    )

    url: HttpUrl

    method: str = Field(
        default="GET",
        pattern="^(GET|HEAD)$",
    )

    expected_status: int = Field(
        default=200,
        ge=100,
        le=599,
    )

    timeout_seconds: int = Field(
        default=10,
        ge=1,
        le=120,
    )

    interval_seconds: int = Field(
        default=60,
        ge=10,
        le=86400,
    )

    ssl_enabled: bool = True


# ==========================================================
# MONITOR RESPONSE
# ==========================================================

class MonitorResponse(BaseModel):
    # ------------------------------------------------------
    # Monitor
    # ------------------------------------------------------

    id: int

    name: str

    url: str

    status: str

    expected_status: int

    is_active: bool

    ssl_enabled: bool

    # ------------------------------------------------------
    # Latest HTTP Check
    # ------------------------------------------------------

    http_status: int | None = None

    response_time_ms: int | None = None

    error_message: str | None = None

    # ------------------------------------------------------
    # Latest SSL Check
    # ------------------------------------------------------

    ssl_valid: bool | None = None

    ssl_expires_at: datetime | None = None

    ssl_days_remaining: int | None = None

    ssl_issuer: str | None = None

    ssl_tls_version: str | None = None

    ssl_error: str | None = None

    # ------------------------------------------------------
    # ORM support
    # ------------------------------------------------------

    class Config:
        from_attributes = True