"""add external api settings

Revision ID: a1c9e7f2b5d8
Revises: 2c53b41871f9
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c9e7f2b5d8'
down_revision: Union[str, Sequence[str], None] = '2c53b41871f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'ExternalApiSettings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('integration_name', sa.String(length=50), nullable=False),
        sa.Column('base_url', sa.String(length=500), nullable=True),
        sa.Column('api_key_encrypted', sa.String(length=500), nullable=True),
        sa.Column('timeout_seconds', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('verify_tls', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('last_test_status', sa.String(length=20), nullable=True),
        sa.Column('last_test_message', sa.String(length=1000), nullable=True),
        sa.Column('last_test_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('integration_name', name='uq_external_api_settings_integration_name'),
    )
    op.create_index(op.f('ix_ExternalApiSettings_integration_name'), 'ExternalApiSettings', ['integration_name'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_ExternalApiSettings_integration_name'), table_name='ExternalApiSettings')
    op.drop_table('ExternalApiSettings')
