"""add per-monitor alert email

Revision ID: 20260906_01
Revises: 20260826_01
Create Date: 2026-09-06
"""

from alembic import op
import sqlalchemy as sa


revision = "20260906_01"
down_revision = "20260826_01"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("monitors")}

    if "alert_email" not in columns:
        op.add_column(
            "monitors",
            sa.Column("alert_email", sa.String(length=320), nullable=True),
        )


def downgrade():
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("monitors")}

    if "alert_email" in columns:
        op.drop_column("monitors", "alert_email")