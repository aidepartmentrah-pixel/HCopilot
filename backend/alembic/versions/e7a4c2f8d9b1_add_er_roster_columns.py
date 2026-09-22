"""add er roster columns

Revision ID: e7a4c2f8d9b1
Revises: f2a6b8d1e5c4
Create Date: 2026-09-18 00:00:00.000000

Part of the ER Live-Roster Redesign (see docs/development/ER Live
Roster Redesign/0. Slicing Task Table.md, slice ER2). Adds three
nullable columns to DailyPatients/LogPatients:

  - er_visit_id      : reference to the external ER system's visit id
                        (via the proposed /er/current-visits endpoint).
                        Never a primary key, never unique-constrained —
                        a previously-departed er_visit_id reappearing
                        later is deliberately treated as a new
                        admission, not a resumed stay, so no row should
                        ever be looked up or merged by this value alone.
  - triage_time       : when the patient was actually seen by a doctor,
                        for ER wait-time KPIs. Same free-text-ISO
                        convention as arrival_time/bed_occupation_time
                        (nullable, filled in later, not validated here).
  - departure_source  : "manual" (a nurse's own discharge action) or
                        "api_detected" (the live-roster poll-diff safety
                        net closed this stay because the patient
                        disappeared from the feed without a manual
                        discharge). Null for any pre-existing row and
                        for any discharge that predates this feature.

All three nullable, no backfill — every existing row and every existing
manual-entry code path is unaffected by default.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7a4c2f8d9b1'
down_revision: Union[str, Sequence[str], None] = 'f2a6b8d1e5c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    for table in ('DailyPatients', 'LogPatients'):
        op.add_column(table, sa.Column('er_visit_id', sa.String(length=64), nullable=True))
        op.add_column(table, sa.Column('triage_time', sa.String(length=30), nullable=True))
        op.add_column(table, sa.Column('departure_source', sa.String(length=20), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    for table in ('LogPatients', 'DailyPatients'):
        op.drop_column(table, 'departure_source')
        op.drop_column(table, 'triage_time')
        op.drop_column(table, 'er_visit_id')
