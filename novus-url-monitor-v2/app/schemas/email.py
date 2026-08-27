from pydantic import BaseModel, EmailStr, Field


class EmailProviderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider_type: str = "SMTP"
    host: str | None = None
    port: int | None = Field(default=None, ge=1, le=65535)
    username: str | None = None
    secret: str | None = None
    from_email: EmailStr
    from_name: str = "Novus URL Monitor"
    tls_enabled: bool = True
    is_default: bool = False


class RecipientCreate(BaseModel):
    email: EmailStr
    name: str | None = None
