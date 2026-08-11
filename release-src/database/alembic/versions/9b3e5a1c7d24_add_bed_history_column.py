"""add bed_history column

Revision ID: 9b3e5a1c7d24
Revises: 7a2f9c4d8e11
Create Date: 2026-07-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9b3e5a1c7d24'
down_revision: Union[str, Sequence[str], None] = '7a2f9c4d8e11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('DailyPatients', sa.Column('bed_history', sa.String(length=500), nullable=True))
    op.add_column('LogPatients', sa.Column('bed_history', sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('LogPatients', 'bed_history')
    op.drop_column('DailyPatients', 'bed_history')
