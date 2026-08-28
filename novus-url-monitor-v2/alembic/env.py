import sys
from pathlib import Path
from logging.config import fileConfig

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import engine_from_config, pool
from alembic import context

from app.config import get_settings
from app.db.session import Base
import app.models


config = context.config

if config.config_file_name:
    try:
        fileConfig(
            config.config_file_name,
            disable_existing_loggers=False,
        )
    except (KeyError, ValueError):
        pass


target_metadata = Base.metadata


def run_migrations_offline():
    settings = get_settings()

    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    settings = get_settings()

    connectable = engine_from_config(
        {
            "sqlalchemy.url": settings.database_url,
        },
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
