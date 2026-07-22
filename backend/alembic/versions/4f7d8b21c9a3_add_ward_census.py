"""add admission_ward columns and WardDailyCensus table

Revision ID: 4f7d8b21c9a3
Revises: 9b3e5a1c7d24
Create Date: 2026-07-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4f7d8b21c9a3'
down_revision: Union[str, Sequence[str], None] = '9b3e5a1c7d24'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('DailyPatients', sa.Column('admission_ward_id', sa.Integer(), nullable=True))
    op.add_column('DailyPatients', sa.Column('admission_ward_name', sa.String(length=200), nullable=True))
    op.add_column('LogPatients', sa.Column('admission_ward_id', sa.Integer(), nullable=True))
    op.add_column('LogPatients', sa.Column('admission_ward_name', sa.String(length=200), nullable=True))

    op.create_table(
        'WardDailyCensus',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('census_date', sa.String(length=10), nullable=False),
        sa.Column('ward_id', sa.Integer(), nullable=True),
        sa.Column('ward_name', sa.String(length=200), nullable=False),
        sa.Column('active_patients', sa.Integer(), nullable=False),
        sa.Column('discharged_patients', sa.Integer(), nullable=False),
        sa.Column('total_patients', sa.Integer(), nullable=False),
        sa.Column('computed_at', sa.String(length=30), nullable=False),
        sa.CheckConstraint(
            'active_patients >= 0 AND discharged_patients >= 0 AND total_patients >= 0',
            name='ck_ward_census_nonnegative',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('census_date', 'ward_name', name='uq_ward_census_date_ward'),
    )
    op.create_index(op.f('ix_WardDailyCensus_census_date'), 'WardDailyCensus', ['census_date'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_WardDailyCensus_census_date'), table_name='WardDailyCensus')
    op.drop_table('WardDailyCensus')

    op.drop_column('LogPatients', 'admission_ward_name')
    op.drop_column('LogPatients', 'admission_ward_id')
    op.drop_column('DailyPatients', 'admission_ward_name')
    op.drop_column('DailyPatients', 'admission_ward_id')
