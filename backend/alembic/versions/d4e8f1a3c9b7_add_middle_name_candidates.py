"""add middle name candidates

Revision ID: d4e8f1a3c9b7
Revises: c5d2b9a4f7e1
Create Date: 2026-09-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e8f1a3c9b7'
down_revision: Union[str, Sequence[str], None] = 'c5d2b9a4f7e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Starting candidate list for the "Find possible matches" guess loop —
# common Arabic male given names, most-common-first (order matters: it's
# the try-order). Purely a seeded starting point; fully editable afterward
# from Settings -> Hospital Directory API.
_SEED_NAMES = [
    "محمد", "علي", "حسين", "أحمد", "حسن", "عبدالله", "إبراهيم", "يوسف",
    "خالد", "عمر", "حيدر", "جعفر", "مصطفى", "كريم", "وليد", "سامي",
    "نبيل", "فادي", "رامي", "طارق", "ياسين", "بلال", "أنس", "زياد",
    "غسان", "نزار", "رضا", "صادق", "هاشم", "ناصر", "سليم", "فؤاد",
]


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'MiddleNameCandidates',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_MiddleNameCandidates_sort_order'), 'MiddleNameCandidates', ['sort_order'], unique=False)

    candidates_table = sa.table(
        'MiddleNameCandidates',
        sa.column('name', sa.String),
        sa.column('sort_order', sa.Integer),
    )
    op.bulk_insert(candidates_table, [
        {"name": name, "sort_order": i} for i, name in enumerate(_SEED_NAMES)
    ])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_MiddleNameCandidates_sort_order'), table_name='MiddleNameCandidates')
    op.drop_table('MiddleNameCandidates')
