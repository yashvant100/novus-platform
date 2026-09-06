from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import Response

from app.config import get_settings
from app.api import auth, users, monitors, email_providers

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="2.0.0-dev",
    docs_url=None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(monitors.router)
app.include_router(email_providers.router)


NOVUS_FAVICON = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><linearGradient id="bg" x1="8" y1="4" x2="57" y2="60" gradientUnits="userSpaceOnUse">
<stop stop-color="#06b6d4"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs>
<rect width="64" height="64" rx="18" fill="url(#bg)"/>
<path d="M11 33h10l4-12 7 25 5-16h16" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"/>
<circle cx="51" cy="30" r="3" fill="#d9f99d"/></svg>"""


@app.get("/api/favicon.svg", include_in_schema=False)
def api_favicon():
    return Response(content=NOVUS_FAVICON, media_type="image/svg+xml")


@app.get("/docs", include_in_schema=False)
def swagger_docs():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{settings.app_name} - Swagger UI",
        swagger_favicon_url="/api/favicon.svg",
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "2.0.0-dev",
    }
