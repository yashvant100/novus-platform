from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Novus URL Monitor V2"
    environment: str = "development"
    host: str = "127.0.0.1"
    port: int = 8090

    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    secret_encryption_key: str

    cors_origins: str = "http://127.0.0.1:8090"
    monitor_default_timeout: int = 10
    monitor_max_history: int = 100
    monitor_worker_interval: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            x.strip()
            for x in self.cors_origins.split(",")
            if x.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
