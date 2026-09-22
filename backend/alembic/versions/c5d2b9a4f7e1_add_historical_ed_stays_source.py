"""add historical ed stays source

Revision ID: c5d2b9a4f7e1
Revises: b3f4a8c1d6e2
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5d2b9a4f7e1'
down_revision: Union[str, Sequence[str], None] = 'b3f4a8c1d6e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('HistoricalEdStays', sa.Column('source', sa.String(length=20), nullable=True))
    # Every row imported before this migration came from the one-time
    # edstays_with_synth.csv seed (see scripts/import_ml_historical_data.py) —
    # tag it "synthetic" so features/flow_prediction can distinguish it from
    # rows synced later from this deployment's own live patient activity.
    op.execute("UPDATE HistoricalEdStays SET source = 'synthetic' WHERE source IS NULL")
    op.create_index(op.f('ix_HistoricalEdStays_source'), 'HistoricalEdStays', ['source'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_HistoricalEdStays_source'), table_name='HistoricalEdStays')
    op.drop_column('HistoricalEdStays', 'source')
