"""add er_roster_enabled switch to ExternalApiSettings

Revision ID: a9c3d7e1f2b4
Revises: e7a4c2f8d9b1
Create Date: 2026-09-30 00:00:00.000000

Part of Directory API v1.1 Compatibility (see docs/development/Directory
API v1.1 Compatibility/0. Slicing Task Table.md, slice V1). The air-gapped
Hospital Directory API is v1.1, which has no /er/current-visits. This
admin-controlled switch (default OFF) keeps HCopilot from calling that
endpoint until IT enables it after the vendor deploys it. Existing rows
backfill to OFF via the server default.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a9c3d7e1f2b4'
down_revision: Union[str, Sequence[str], None] = 'e7a4c2f8d9b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'ExternalApiSettings',
        sa.Column('er_roster_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('ExternalApiSettings', 'er_roster_enabled')
