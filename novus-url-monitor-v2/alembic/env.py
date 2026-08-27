from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

from app.db.session import Base
import app.models

config = context.config

# The current alembic.ini does not contain Alembic's standard logging
# sections, so do not let fileConfig prevent migrations from running.
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
    url = config.get_main_option("sqlalchemy.url")

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    section = config.get_section(config.config_ini_section)

    connectable = engine_from_config(
        section,
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
