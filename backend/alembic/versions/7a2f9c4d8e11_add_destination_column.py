"""add destination column

Revision ID: 7a2f9c4d8e11
Revises: 30e9f38859e7
Create Date: 2026-07-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a2f9c4d8e11'
down_revision: Union[str, Sequence[str], None] = '30e9f38859e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('DailyPatients', sa.Column('destination', sa.String(length=50), nullable=True))
    op.add_column('LogPatients', sa.Column('destination', sa.String(length=50), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('LogPatients', 'destination')
    op.drop_column('DailyPatients', 'destination')
