# =============================================================================
# relations/api.py — Many-to-Many Relation Table Endpoints
# =============================================================================
#
# Exposes generic CRUD endpoints for every many-to-many link table in the
# system.  A single set of /{table} routes handles all six relation tables so
# no separate router is needed per relationship type.
#
# SUPPORTED TABLES:
#   patient_bed    patient_doctor    patient_nurse
#   ward_bed       ward_doctor       ward_nurse
#
# ENDPOINTS:
#   GET    /api/relations/tables          — list all table names and column definitions
#   GET    /api/relations/{table}         — list all rows in a table
#   POST   /api/relations/{table}         — add a (col_a, col_b) pair
#   DELETE /api/relations/{table}/{a}/{b} — remove a specific pair
#
# SIDE EFFECTS:
#   Adding/removing patient_doctor or patient_nurse rows automatically
#   increments or decrements the doctor's/nurse's patientNb counter so
#   patient-load statistics stay accurate without a separate sync step.
# =============================================================================

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .relations_manager import RelationsManager, TABLES
from features.staff_management.doctors_manager import DoctorsManager
from features.staff_management.nurses_manager import NursesManager

router = APIRouter()
mgr = RelationsManager()
_doctors = DoctorsManager()
_nurses  = NursesManager()

# Pre-compute the list of valid table names for quick validation in every endpoint
VALID_TABLES = list(TABLES.keys())


# Body model for add/delete — just the two integer IDs that form a relation pair
class RelationRow(BaseModel):
    col_a: int
    col_b: int


@router.get("/tables")
async def list_tables():
    # Return the names and column definitions for all supported relation tables
    return {"tables": [
        {"name": t, "columns": TABLES[t]["cols"]} for t in VALID_TABLES
    ]}


@router.get("/{table}")
async def list_relations(table: str):
    # Return every row in the requested table
    if table not in VALID_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown table '{table}'")
    try:
        return mgr.list(table)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{table}")
async def add_relation(table: str, row: RelationRow):
    # Insert a new (col_a, col_b) pair into the table
    if table not in VALID_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown table '{table}'")
    try:
        result = mgr.add(table, row.col_a, row.col_b)
        if table == "patient_doctor":
            _doctors.update_patient_count(row.col_b, +1)
        elif table == "patient_nurse":
            _nurses.update_patient_count(row.col_b, +1)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{table}/{col_a}/{col_b}")
async def delete_relation(table: str, col_a: int, col_b: int):
    # Remove a specific pair from the table
    if table not in VALID_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown table '{table}'")
    try:
        result = mgr.delete(table, col_a, col_b)
        if table == "patient_doctor":
            _doctors.update_patient_count(col_b, -1)
        elif table == "patient_nurse":
            _nurses.update_patient_count(col_b, -1)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
