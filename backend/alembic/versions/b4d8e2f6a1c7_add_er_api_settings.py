"""add separate ER API base URL + key to ExternalApiSettings

Revision ID: b4d8e2f6a1c7
Revises: a9c3d7e1f2b4
Create Date: 2026-11-18 00:00:00.000000

3iSoft delivered v1.2 of the ER roster as a SEPARATE "ER API"
(real: http://meraj:8080/his-er/api/er/v1) with its own key, not as
/er/current-visits on the Directory API. The ER roster therefore needs its
own base URL and its own (Fernet-encrypted) key. Both nullable: existing
rows stay "ER not configured" until an admin saves them.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b4d8e2f6a1c7'
down_revision: Union[str, Sequence[str], None] = 'a9c3d7e1f2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('ExternalApiSettings', sa.Column('er_base_url', sa.String(length=500), nullable=True))
    op.add_column('ExternalApiSettings', sa.Column('er_api_key_encrypted', sa.String(length=500), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('ExternalApiSettings', 'er_api_key_encrypted')
    op.drop_column('ExternalApiSettings', 'er_base_url')
