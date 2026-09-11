"""add PatientISBARDetails table

Revision ID: e8f1a29b6c53
Revises: 7e2c4f9a1b56
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8f1a29b6c53'
down_revision: Union[str, Sequence[str], None] = '7e2c4f9a1b56'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'PatientISBARDetails',
        sa.Column('stay_id', sa.Integer(), autoincrement=False, nullable=False),

        # Initial Vital Signs additions
        sa.Column('blood_glucose', sa.Float(), nullable=True),
        sa.Column('o2_support', sa.String(length=50), nullable=True),
        sa.Column('o2_flow_rate', sa.Float(), nullable=True),
        sa.Column('vitals_measured_at', sa.String(length=30), nullable=True),
        sa.Column('vitals_recorded_by', sa.String(length=200), nullable=True),

        # Situation
        sa.Column('reason_for_admission', sa.String(length=1000), nullable=True),
        sa.Column('current_diagnosis', sa.String(length=1000), nullable=True),
        sa.Column('clinical_status', sa.String(length=30), nullable=True),
        sa.Column('immediate_concerns', sa.String(length=500), nullable=True),
        sa.Column('immediate_concerns_other', sa.String(length=300), nullable=True),

        # Background
        sa.Column('past_medical_history', sa.String(length=500), nullable=True),
        sa.Column('past_medical_history_other', sa.String(length=300), nullable=True),
        sa.Column('surgical_history_flag', sa.String(length=10), nullable=True),
        sa.Column('surgical_history_text', sa.String(length=1000), nullable=True),
        sa.Column('allergies_status', sa.String(length=30), nullable=True),
        sa.Column('allergy_types', sa.String(length=200), nullable=True),
        sa.Column('allergy_substance', sa.String(length=500), nullable=True),
        sa.Column('allergy_reaction', sa.String(length=500), nullable=True),
        sa.Column('isolation_precautions', sa.String(length=30), nullable=True),
        sa.Column('high_alert_meds', sa.String(length=300), nullable=True),
        sa.Column('high_alert_meds_other', sa.String(length=300), nullable=True),
        sa.Column('recent_procedures', sa.String(length=300), nullable=True),
        sa.Column('recent_procedures_other', sa.String(length=300), nullable=True),
        sa.Column('recent_procedure_datetime', sa.String(length=30), nullable=True),

        # Focused Assessment
        sa.Column('neuro_status', sa.String(length=30), nullable=True),
        sa.Column('telemetry', sa.String(length=10), nullable=True),
        sa.Column('edema', sa.String(length=10), nullable=True),
        sa.Column('peripheral_pulses', sa.String(length=10), nullable=True),
        sa.Column('diet', sa.String(length=200), nullable=True),
        sa.Column('npo', sa.String(length=10), nullable=True),
        sa.Column('swallow_assessment', sa.String(length=20), nullable=True),
        sa.Column('last_bowel_movement', sa.String(length=100), nullable=True),
        sa.Column('voiding', sa.String(length=20), nullable=True),
        sa.Column('urinary_catheter', sa.String(length=10), nullable=True),
        sa.Column('wounds', sa.String(length=10), nullable=True),
        sa.Column('fall_risk', sa.String(length=10), nullable=True),
        sa.Column('pressure_injury_risk', sa.String(length=10), nullable=True),
        sa.Column('mobility_aids', sa.String(length=10), nullable=True),
        sa.Column('lines_tubes_drains', sa.String(length=300), nullable=True),
        sa.Column('intake_ml', sa.Float(), nullable=True),
        sa.Column('output_ml', sa.Float(), nullable=True),
        sa.Column('critical_lab_results', sa.String(length=1000), nullable=True),
        sa.Column('pending_labs', sa.String(length=1000), nullable=True),
        sa.Column('pending_imaging', sa.String(length=1000), nullable=True),

        # Recommendation & Handover
        sa.Column('nursing_priorities', sa.String(length=500), nullable=True),
        sa.Column('nursing_priorities_other', sa.String(length=300), nullable=True),
        sa.Column('meds_due_next_shift', sa.String(length=1000), nullable=True),
        sa.Column('pending_medical_review', sa.String(length=1000), nullable=True),
        sa.Column('consultations', sa.String(length=1000), nullable=True),
        sa.Column('discharge_transfer_plan', sa.String(length=30), nullable=True),
        sa.Column('discharge_transfer_plan_other', sa.String(length=300), nullable=True),
        sa.Column('outstanding_tasks', sa.String(length=500), nullable=True),
        sa.Column('outstanding_tasks_other', sa.String(length=300), nullable=True),
        sa.Column('outgoing_nurse', sa.String(length=200), nullable=True),
        sa.Column('incoming_nurse', sa.String(length=200), nullable=True),
        sa.Column('handover_datetime', sa.String(length=30), nullable=True),
        sa.Column('receiver_ack', sa.String(length=10), nullable=True),

        sa.PrimaryKeyConstraint('stay_id'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('PatientISBARDetails')
