"""Add four twenty mode to matches

Revision ID: 6f2d8a7c4b31
Revises: ceb436e20d42
Create Date: 2026-07-31 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "6f2d8a7c4b31"
down_revision = "ceb436e20d42"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "matches",
        sa.Column(
            "four_twenty_mode",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )


def downgrade():
    op.drop_column("matches", "four_twenty_mode")
