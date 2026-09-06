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


class EmailProviderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    provider_type: str | None = None
    host: str | None = None
    port: int | None = Field(default=None, ge=1, le=65535)
    username: str | None = None
    secret: str | None = None
    from_email: EmailStr | None = None
    from_name: str | None = None
    tls_enabled: bool | None = None
    is_default: bool | None = None


class RecipientCreate(BaseModel):
    email: EmailStr
    name: str | None = None


class RecipientUpdate(BaseModel):
    email: EmailStr | None = None
    name: str | None = None
