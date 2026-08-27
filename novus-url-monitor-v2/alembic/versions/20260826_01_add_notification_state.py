"""add notification state and ssl renewal tracking

Revision ID: 20260826_01
Revises: 001_add_ssl_monitoring
Create Date: 2026-08-26
"""

from alembic import op
import sqlalchemy as sa


revision = "20260826_01"
down_revision = "001_add_ssl_monitoring"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    monitor_columns = {
        c["name"] for c in inspector.get_columns("monitors")
    }

    if "ssl_last_expires_at" not in monitor_columns:
        op.add_column(
            "monitors",
            sa.Column(
                "ssl_last_expires_at",
                sa.DateTime(timezone=True),
                nullable=True,
            ),
        )

    tables = set(inspector.get_table_names())

    if "notification_events" not in tables:
        op.create_table(
            "notification_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("monitor_id", sa.Integer(), nullable=False),
            sa.Column("incident_id", sa.Integer(), nullable=True),
            sa.Column("event_type", sa.String(length=64), nullable=False),
            sa.Column("event_key", sa.String(length=255), nullable=False),
            sa.Column(
                "sent_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["monitor_id"],
                ["monitors.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["incident_id"],
                ["incidents.id"],
                ondelete="CASCADE",
            ),
            sa.UniqueConstraint(
                "monitor_id",
                "event_type",
                "event_key",
                name="uq_notification_event",
            ),
        )

        op.create_index(
            "ix_notification_events_monitor_id",
            "notification_events",
            ["monitor_id"],
        )
        op.create_index(
            "ix_notification_events_incident_id",
            "notification_events",
            ["incident_id"],
        )
        op.create_index(
            "ix_notification_events_event_type",
            "notification_events",
            ["event_type"],
        )
        op.create_index(
            "ix_notification_events_sent_at",
            "notification_events",
            ["sent_at"],
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "notification_events" in tables:
        op.drop_index(
            "ix_notification_events_sent_at",
            table_name="notification_events",
        )
        op.drop_index(
            "ix_notification_events_event_type",
            table_name="notification_events",
        )
        op.drop_index(
            "ix_notification_events_incident_id",
            table_name="notification_events",
        )
        op.drop_index(
            "ix_notification_events_monitor_id",
            table_name="notification_events",
        )
        op.drop_table("notification_events")

    monitor_columns = {
        c["name"] for c in inspector.get_columns("monitors")
    }

    if "ssl_last_expires_at" in monitor_columns:
        op.drop_column("monitors", "ssl_last_expires_at")
