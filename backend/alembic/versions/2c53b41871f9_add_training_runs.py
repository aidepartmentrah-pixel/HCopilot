"""add training runs

Revision ID: 2c53b41871f9
Revises: e8f1a29b6c53
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2c53b41871f9'
down_revision: Union[str, Sequence[str], None] = 'e8f1a29b6c53'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'TrainingRuns',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('run_id', sa.String(length=64), nullable=False),
        sa.Column('model_name', sa.String(length=100), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('row_count_train', sa.Integer(), nullable=True),
        sa.Column('row_count_test', sa.Integer(), nullable=True),
        sa.Column('train_data_start', sa.String(length=10), nullable=True),
        sa.Column('train_data_end', sa.String(length=10), nullable=True),
        sa.Column('hyperparameters', sa.String(length=1000), nullable=True),
        sa.Column('mae', sa.Float(), nullable=True),
        sa.Column('rmse', sa.Float(), nullable=True),
        sa.Column('mse', sa.Float(), nullable=True),
        sa.Column('r2', sa.Float(), nullable=True),
        sa.Column('mape', sa.Float(), nullable=True),
        sa.Column('smape', sa.Float(), nullable=True),
        sa.Column('artifact_path', sa.String(length=500), nullable=True),
        sa.Column('is_live', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('error_message', sa.String(length=1000), nullable=True),
        sa.CheckConstraint("status IN ('running','completed','failed')", name='ck_training_runs_status'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('run_id', name='uq_training_runs_run_id'),
    )
    op.create_index(op.f('ix_TrainingRuns_model_name'), 'TrainingRuns', ['model_name'], unique=False)
    op.create_index(op.f('ix_TrainingRuns_status'), 'TrainingRuns', ['status'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_TrainingRuns_status'), table_name='TrainingRuns')
    op.drop_index(op.f('ix_TrainingRuns_model_name'), table_name='TrainingRuns')
    op.drop_table('TrainingRuns')
