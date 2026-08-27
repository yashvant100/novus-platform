"""add ssl monitoring fields

Revision ID: 001_add_ssl_monitoring
Revises:
Create Date: 2026-08-26
"""

from alembic import op
import sqlalchemy as sa


revision = "001_add_ssl_monitoring"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    monitor_columns = {
        c["name"] for c in inspector.get_columns("monitors")
    }

    check_columns = {
        c["name"] for c in inspector.get_columns("monitor_checks")
    }

    if "ssl_enabled" not in monitor_columns:
        op.add_column(
            "monitors",
            sa.Column(
                "ssl_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )
        op.alter_column(
            "monitors",
            "ssl_enabled",
            server_default=None,
        )

    if "ssl_valid" not in check_columns:
        op.add_column(
            "monitor_checks",
            sa.Column(
                "ssl_valid",
                sa.Boolean(),
                nullable=True,
            ),
        )

    if "ssl_expires_at" not in check_columns:
        op.add_column(
            "monitor_checks",
            sa.Column(
                "ssl_expires_at",
                sa.DateTime(timezone=True),
                nullable=True,
            ),
        )

    if "ssl_days_remaining" not in check_columns:
        op.add_column(
            "monitor_checks",
            sa.Column(
                "ssl_days_remaining",
                sa.Integer(),
                nullable=True,
            ),
        )

    if "ssl_issuer" not in check_columns:
        op.add_column(
            "monitor_checks",
            sa.Column(
                "ssl_issuer",
                sa.String(length=512),
                nullable=True,
            ),
        )

    if "ssl_tls_version" not in check_columns:
        op.add_column(
            "monitor_checks",
            sa.Column(
                "ssl_tls_version",
                sa.String(length=32),
                nullable=True,
            ),
        )

    if "ssl_error" not in check_columns:
        op.add_column(
            "monitor_checks",
            sa.Column(
                "ssl_error",
                sa.Text(),
                nullable=True,
            ),
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    check_columns = {
        c["name"] for c in inspector.get_columns("monitor_checks")
    }

    monitor_columns = {
        c["name"] for c in inspector.get_columns("monitors")
    }

    for column in (
        "ssl_error",
        "ssl_tls_version",
        "ssl_issuer",
        "ssl_days_remaining",
        "ssl_expires_at",
        "ssl_valid",
    ):
        if column in check_columns:
            op.drop_column("monitor_checks", column)

    if "ssl_enabled" in monitor_columns:
        op.drop_column("monitors", "ssl_enabled")
