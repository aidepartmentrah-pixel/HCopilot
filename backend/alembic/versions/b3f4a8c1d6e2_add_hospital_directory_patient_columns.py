"""add hospital directory patient columns

Revision ID: b3f4a8c1d6e2
Revises: a1c9e7f2b5d8
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f4a8c1d6e2'
down_revision: Union[str, Sequence[str], None] = 'a1c9e7f2b5d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    for table in ('DailyPatients', 'LogPatients'):
        op.add_column(table, sa.Column('external_patient_id', sa.String(length=64), nullable=True))
        op.add_column(table, sa.Column('external_visit_id', sa.String(length=64), nullable=True))
        op.add_column(table, sa.Column('record_source', sa.String(length=20), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    for table in ('LogPatients', 'DailyPatients'):
        op.drop_column(table, 'record_source')
        op.drop_column(table, 'external_visit_id')
        op.drop_column(table, 'external_patient_id')
