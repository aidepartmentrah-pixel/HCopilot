"""add DoctorLog, NurseLog, PatientDoctorLog, PatientNurseLog

Revision ID: 7e2c4f9a1b56
Revises: 4f7d8b21c9a3
Create Date: 2026-07-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7e2c4f9a1b56'
down_revision: Union[str, Sequence[str], None] = '4f7d8b21c9a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'DoctorLog',
        sa.Column('log_id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=True),
        sa.Column('intern_or_not', sa.String(length=20), nullable=True),
        sa.Column('shift', sa.String(length=50), nullable=True),
        sa.Column('work_days', sa.String(length=50), nullable=True),
        sa.Column('patientNb', sa.String(length=20), nullable=True),
        sa.Column('availabilityTimeStart', sa.String(length=30), nullable=True),
        sa.Column('absent', sa.String(length=10), nullable=True),
        sa.Column('archived_at', sa.String(length=30), nullable=False),
        sa.PrimaryKeyConstraint('log_id'),
    )
    op.create_index(op.f('ix_DoctorLog_doctor_id'), 'DoctorLog', ['doctor_id'], unique=False)

    op.create_table(
        'NurseLog',
        sa.Column('log_id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('nurse_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=True),
        sa.Column('role', sa.String(length=20), nullable=True),
        sa.Column('shift', sa.String(length=50), nullable=True),
        sa.Column('group', sa.String(length=50), nullable=True),
        sa.Column('patientNB', sa.String(length=20), nullable=True),
        sa.Column('availabilityTimeStart', sa.String(length=30), nullable=True),
        sa.Column('absent', sa.String(length=10), nullable=True),
        sa.Column('archived_at', sa.String(length=30), nullable=False),
        sa.PrimaryKeyConstraint('log_id'),
    )
    op.create_index(op.f('ix_NurseLog_nurse_id'), 'NurseLog', ['nurse_id'], unique=False)

    op.create_table(
        'PatientDoctorLog',
        sa.Column('log_id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('stay_id', sa.Integer(), nullable=True),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('doctor_name', sa.String(length=200), nullable=True),
        sa.Column('archived_at', sa.String(length=30), nullable=False),
        sa.PrimaryKeyConstraint('log_id'),
    )
    op.create_index(op.f('ix_PatientDoctorLog_patient_id'), 'PatientDoctorLog', ['patient_id'], unique=False)
    op.create_index(op.f('ix_PatientDoctorLog_stay_id'), 'PatientDoctorLog', ['stay_id'], unique=False)
    op.create_index(op.f('ix_PatientDoctorLog_doctor_id'), 'PatientDoctorLog', ['doctor_id'], unique=False)
    op.create_index(op.f('ix_PatientDoctorLog_archived_at'), 'PatientDoctorLog', ['archived_at'], unique=False)

    op.create_table(
        'PatientNurseLog',
        sa.Column('log_id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('stay_id', sa.Integer(), nullable=True),
        sa.Column('nurse_id', sa.Integer(), nullable=False),
        sa.Column('nurse_name', sa.String(length=200), nullable=True),
        sa.Column('archived_at', sa.String(length=30), nullable=False),
        sa.PrimaryKeyConstraint('log_id'),
    )
    op.create_index(op.f('ix_PatientNurseLog_patient_id'), 'PatientNurseLog', ['patient_id'], unique=False)
    op.create_index(op.f('ix_PatientNurseLog_stay_id'), 'PatientNurseLog', ['stay_id'], unique=False)
    op.create_index(op.f('ix_PatientNurseLog_nurse_id'), 'PatientNurseLog', ['nurse_id'], unique=False)
    op.create_index(op.f('ix_PatientNurseLog_archived_at'), 'PatientNurseLog', ['archived_at'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_PatientNurseLog_archived_at'), table_name='PatientNurseLog')
    op.drop_index(op.f('ix_PatientNurseLog_nurse_id'), table_name='PatientNurseLog')
    op.drop_index(op.f('ix_PatientNurseLog_stay_id'), table_name='PatientNurseLog')
    op.drop_index(op.f('ix_PatientNurseLog_patient_id'), table_name='PatientNurseLog')
    op.drop_table('PatientNurseLog')

    op.drop_index(op.f('ix_PatientDoctorLog_archived_at'), table_name='PatientDoctorLog')
    op.drop_index(op.f('ix_PatientDoctorLog_doctor_id'), table_name='PatientDoctorLog')
    op.drop_index(op.f('ix_PatientDoctorLog_stay_id'), table_name='PatientDoctorLog')
    op.drop_index(op.f('ix_PatientDoctorLog_patient_id'), table_name='PatientDoctorLog')
    op.drop_table('PatientDoctorLog')

    op.drop_index(op.f('ix_NurseLog_nurse_id'), table_name='NurseLog')
    op.drop_table('NurseLog')

    op.drop_index(op.f('ix_DoctorLog_doctor_id'), table_name='DoctorLog')
    op.drop_table('DoctorLog')
