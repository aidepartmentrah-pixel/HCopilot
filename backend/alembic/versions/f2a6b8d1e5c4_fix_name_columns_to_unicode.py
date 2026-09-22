"""fix name columns to unicode

Revision ID: f2a6b8d1e5c4
Revises: d4e8f1a3c9b7
Create Date: 2026-09-14 00:30:00.000000

Discovered while seeding MiddleNameCandidates: SQL Server VARCHAR (what
SQLAlchemy's plain String() compiles to on this dialect) is a non-Unicode,
single-code-page type — every Arabic character written to one silently
becomes a literal "?" at the storage layer, not just a display artifact.
This affects any name pulled from the Hospital Directory API (its patient
data is Arabic) into DailyPatients.name / LogPatients.name via the
search-and-autofill flow, and the MiddleNameCandidates seed data itself.

Widens all three to NVARCHAR (SQLAlchemy Unicode) so Arabic (and any other
non-Latin-1 text) survives. Existing DailyPatients/LogPatients data is
ASCII/Latin-1 with the exception of a handful of already-corrupted
LogPatients rows (see project notes) — those "?" placeholders are
unrecoverable at the database layer (the original text was never stored)
and are left as-is; this migration only prevents new corrosion going
forward. The MiddleNameCandidates seed rows ARE fully recoverable (the
correct values are still in the seed migration's own source) and are
re-inserted here with the fixed column type.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2a6b8d1e5c4'
down_revision: Union[str, Sequence[str], None] = 'd4e8f1a3c9b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Same list as d4e8f1a3c9b7_add_middle_name_candidates.py — re-inserted here
# because those rows were corrupted to "?" by the VARCHAR column this
# migration fixes.
_SEED_NAMES = [
    "محمد", "علي", "حسين", "أحمد", "حسن", "عبدالله", "إبراهيم", "يوسف",
    "خالد", "عمر", "حيدر", "جعفر", "مصطفى", "كريم", "وليد", "سامي",
    "نبيل", "فادي", "رامي", "طارق", "ياسين", "بلال", "أنس", "زياد",
    "غسان", "نزار", "رضا", "صادق", "هاشم", "ناصر", "سليم", "فؤاد",
]


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('DailyPatients', 'name', existing_type=sa.String(length=200),
                     type_=sa.Unicode(length=200), existing_nullable=True)
    op.alter_column('LogPatients', 'name', existing_type=sa.String(length=200),
                     type_=sa.Unicode(length=200), existing_nullable=True)
    op.alter_column('MiddleNameCandidates', 'name', existing_type=sa.String(length=200),
                     type_=sa.Unicode(length=200), existing_nullable=False)

    # The seed rows inserted by d4e8f1a3c9b7 were corrupted to "?" by the
    # VARCHAR column just widened above — replace them with correct values.
    conn = op.get_bind()
    conn.execute(sa.text('DELETE FROM "MiddleNameCandidates"'))
    candidates_table = sa.table(
        'MiddleNameCandidates',
        sa.column('name', sa.Unicode(length=200)),
        sa.column('sort_order', sa.Integer),
    )
    op.bulk_insert(candidates_table, [
        {"name": name, "sort_order": i} for i, name in enumerate(_SEED_NAMES)
    ])


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('MiddleNameCandidates', 'name', existing_type=sa.Unicode(length=200),
                     type_=sa.String(length=200), existing_nullable=False)
    op.alter_column('LogPatients', 'name', existing_type=sa.Unicode(length=200),
                     type_=sa.String(length=200), existing_nullable=True)
    op.alter_column('DailyPatients', 'name', existing_type=sa.Unicode(length=200),
                     type_=sa.String(length=200), existing_nullable=True)
