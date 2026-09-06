"""add admin assigned monitor permissions

Revision ID: 20260906_02
Revises: 20260906_01
Create Date: 2026-09-06
"""

from alembic import op
import sqlalchemy as sa


revision = "20260906_02"
down_revision = "20260906_01"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    if "monitor_permissions" not in tables:
        op.create_table(
            "monitor_permissions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("monitor_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["monitor_id"], ["monitors.id"], ondelete="CASCADE"),
            sa.UniqueConstraint("user_id", "monitor_id", name="uq_monitor_permission"),
        )
        op.create_index("ix_monitor_permissions_user_id", "monitor_permissions", ["user_id"])
        op.create_index("ix_monitor_permissions_monitor_id", "monitor_permissions", ["monitor_id"])


def downgrade():
    bind = op.get_bind()
    if "monitor_permissions" in set(sa.inspect(bind).get_table_names()):
        op.drop_index("ix_monitor_permissions_monitor_id", table_name="monitor_permissions")
        op.drop_index("ix_monitor_permissions_user_id", table_name="monitor_permissions")
        op.drop_table("monitor_permissions")