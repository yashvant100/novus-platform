from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api import auth, users, monitors, email_providers

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version="2.0.0-dev",
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


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "2.0.0-dev",
    }
