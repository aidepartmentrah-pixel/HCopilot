# =============================================================================
# relations/relations_manager.py — Many-to-Many Relation Table SQL Server Manager
# =============================================================================
#
# Generic CRUD manager for all many-to-many relationship tables in HCopilot.
# Every link between two entity types (patient<->bed, ward<->nurse, etc.) is
# stored as its own SQL Server table with a composite PK (see db/models.py) —
# a single instance of this class operates on any of the six supported tables
# through the TABLES/_MODELS registries, so no separate class is needed per
# relationship, exactly like the CSV-era design.
#
# Key design rules (unchanged):
#   - Each (col_a, col_b) pair must be unique; add() rejects duplicates.
#   - delete_by_left() removes all rows for a given left-side entity (e.g.
#     removing all of a discharged patient's links in one call).
#   - delete_by_right() removes all rows for a given right-side entity (e.g.
#     removing all references to a deleted doctor across every relation table).
#
# _read() is a pandas-DataFrame-shaped compatibility shim: daily_patients_
# manager.py, log_patients_manager.py, and unurgent/api.py all call this
# private method directly and treat the result as a DataFrame. It stays until
# those managers are migrated to the ORM too.
# =============================================================================

import pandas as pd
from fastapi import HTTPException

from db.session import SessionLocal
from db.models import PatientBed, PatientDoctor, PatientNurse, WardBed, WardDoctor, WardNurse

TABLES = {
    "patient_doctor": {"cols": ["patient_id", "doctor_id"]},
    "patient_nurse":  {"cols": ["patient_id", "nurse_id"]},
    "patient_bed":    {"cols": ["patient_id", "bed_id"]},
    "ward_doctor":    {"cols": ["ward_id",    "doctor_id"]},
    "ward_nurse":     {"cols": ["ward_id",    "nurse_id"]},
    "ward_bed":       {"cols": ["ward_id",    "bed_id"]},
}

_MODELS = {
    "patient_doctor": PatientDoctor,
    "patient_nurse":  PatientNurse,
    "patient_bed":    PatientBed,
    "ward_doctor":    WardDoctor,
    "ward_nurse":     WardNurse,
    "ward_bed":       WardBed,
}


class RelationsManager:
    def _cols(self, table: str):
        return TABLES[table]["cols"]

    def _model(self, table: str):
        return _MODELS[table]

    def _read(self, table: str) -> pd.DataFrame:
        # Pandas-shaped compatibility shim — see module docstring.
        cols = self._cols(table)
        model = self._model(table)
        with SessionLocal() as session:
            rows = session.query(model).all()
            data = [{cols[0]: getattr(r, cols[0]), cols[1]: getattr(r, cols[1])} for r in rows]
        return pd.DataFrame(data, columns=cols)

    # ── Public API ─────────────────────────────────────────────────────────────

    def list(self, table: str):
        if table not in TABLES:
            raise HTTPException(status_code=400, detail=f"Unknown table '{table}'")
        cols = self._cols(table)
        model = self._model(table)
        with SessionLocal() as session:
            rows = session.query(model).all()
            result = [{cols[0]: getattr(r, cols[0]), cols[1]: getattr(r, cols[1])} for r in rows]
        return {"table": table, "rows": result, "total": len(result)}

    def add(self, table: str, col_a_val: int, col_b_val: int):
        if table not in TABLES:
            raise HTTPException(status_code=400, detail=f"Unknown table '{table}'")
        cols = self._cols(table)
        model = self._model(table)
        col_a_attr, col_b_attr = getattr(model, cols[0]), getattr(model, cols[1])
        with SessionLocal() as session:
            exists = session.query(model).filter(col_a_attr == col_a_val, col_b_attr == col_b_val).first()
            if exists is not None:
                raise HTTPException(status_code=400,
                    detail=f"Relation ({col_a_val}, {col_b_val}) already exists in {table}")
            session.add(model(**{cols[0]: col_a_val, cols[1]: col_b_val}))
            session.commit()
        return {"success": True, "message": f"Relation added to {table}",
                "row": {cols[0]: col_a_val, cols[1]: col_b_val}}

    def delete(self, table: str, col_a_val: int, col_b_val: int):
        if table not in TABLES:
            raise HTTPException(status_code=400, detail=f"Unknown table '{table}'")
        cols = self._cols(table)
        model = self._model(table)
        col_a_attr, col_b_attr = getattr(model, cols[0]), getattr(model, cols[1])
        with SessionLocal() as session:
            row = session.query(model).filter(col_a_attr == col_a_val, col_b_attr == col_b_val).first()
            if row is None:
                raise HTTPException(status_code=404,
                    detail=f"Relation ({col_a_val}, {col_b_val}) not found in {table}")
            session.delete(row)
            session.commit()
        return {"success": True, "message": f"Relation removed from {table}"}

    def delete_by_left(self, table: str, col_a_val: int):
        if table not in TABLES:
            raise HTTPException(status_code=400, detail=f"Unknown table '{table}'")
        cols = self._cols(table)
        model = self._model(table)
        col_a_attr = getattr(model, cols[0])
        with SessionLocal() as session:
            session.query(model).filter(col_a_attr == col_a_val).delete(synchronize_session=False)
            session.commit()
        return {"success": True}

    def delete_by_right(self, table: str, col_b_val: int):
        if table not in TABLES:
            raise HTTPException(status_code=400, detail=f"Unknown table '{table}'")
        cols = self._cols(table)
        model = self._model(table)
        col_b_attr = getattr(model, cols[1])
        with SessionLocal() as session:
            session.query(model).filter(col_b_attr == col_b_val).delete(synchronize_session=False)
            session.commit()
        return {"success": True}
