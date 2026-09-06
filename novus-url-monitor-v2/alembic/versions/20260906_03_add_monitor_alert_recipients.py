"""add multiple alert recipients per monitor

Revision ID: 20260906_03
Revises: 20260906_02
Create Date: 2026-09-06
"""

from alembic import op
import sqlalchemy as sa


revision = "20260906_03"
down_revision = "20260906_02"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    if "monitor_alert_recipients" not in tables:
        op.create_table(
            "monitor_alert_recipients",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("monitor_id", sa.Integer(), nullable=False),
            sa.Column("recipient_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["monitor_id"], ["monitors.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["recipient_id"], ["alert_recipients.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("monitor_id", "recipient_id", name="uq_monitor_alert_recipient"),
        )
        op.create_index("ix_monitor_alert_recipients_monitor_id", "monitor_alert_recipients", ["monitor_id"])
        op.create_index("ix_monitor_alert_recipients_recipient_id", "monitor_alert_recipients", ["recipient_id"])


def downgrade():
    bind = op.get_bind()
    if "monitor_alert_recipients" in set(sa.inspect(bind).get_table_names()):
        op.drop_index("ix_monitor_alert_recipients_recipient_id", table_name="monitor_alert_recipients")
        op.drop_index("ix_monitor_alert_recipients_monitor_id", table_name="monitor_alert_recipients")
        op.drop_table("monitor_alert_recipients")