# =============================================================================
# data_management/wards_manager.py — Hospital Ward SQL Server Manager
# =============================================================================
#
# Manages hospital ward records stored in the Wards table. A ward groups beds
# together and belongs to a department.
#
# Key invariants:
#   - Each ward belongs to a department (department_id).
#   - Bed counts are not stored here; they are computed at read-time from the
#     ward_bed table so there is never a count/reality mismatch. Now that
#     BedManager + RelationsManager are both ORM-backed, ward_bed.csv is dead
#     (nothing writes it anymore) — this reads the SQL Server table.
#   - delete() cascade-removes all ward_bed, ward_doctor, and ward_nurse
#     relation rows so no orphaned references remain after a ward is removed.
# =============================================================================

from fastapi import HTTPException
from sqlalchemy import func

from db.session import SessionLocal
from db.models import Ward, WardBed
from features.relations.relations_manager import RelationsManager


def _ward_bed_counts(session) -> dict:
    rows = session.query(WardBed.ward_id, func.count(WardBed.bed_id)).group_by(WardBed.ward_id).all()
    return {ward_id: count for ward_id, count in rows}


class WardsManager:
    def _row(self, ward: Ward, counts: dict) -> dict:
        return {
            "ward_id":       ward.ward_id,
            "ward_name":     ward.ward_name,
            "department_id": ward.department_id,
            "assigned_beds": counts.get(ward.ward_id, 0),
        }

    def get_all(self):
        with SessionLocal() as session:
            wards = session.query(Ward).all()
            counts = _ward_bed_counts(session)
            return {"wards": [self._row(w, counts) for w in wards], "total": len(wards)}

    def get_stats(self):
        with SessionLocal() as session:
            total = session.query(Ward).count()
            counts = _ward_bed_counts(session)
            departments = session.query(func.count(func.distinct(Ward.department_id))).scalar()
            return {
                "total":         total,
                "assigned_beds": sum(counts.values()),
                "departments":   departments or 0,
            }

    def add(self, ward_name, department_id):
        if not ward_name.strip():
            raise HTTPException(status_code=400, detail="Ward name is required")
        if department_id < 1:
            raise HTTPException(status_code=400, detail="Department ID must be a positive integer")
        with SessionLocal() as session:
            max_id = session.query(Ward.ward_id).order_by(Ward.ward_id.desc()).first()
            new_id = (max_id[0] + 1) if max_id else 1
            session.add(Ward(ward_id=new_id, ward_name=ward_name, department_id=department_id))
            session.commit()
            return {
                "success": True,
                "message": f"Ward '{ward_name}' added successfully",
                "ward": {"ward_id": new_id, "ward_name": ward_name, "department_id": department_id},
            }

    def modify(self, ward_id, ward_name, department_id):
        if not ward_name.strip():
            raise HTTPException(status_code=400, detail="Ward name is required")
        if department_id < 1:
            raise HTTPException(status_code=400, detail="Department ID must be a positive integer")
        with SessionLocal() as session:
            ward = session.query(Ward).filter(Ward.ward_id == ward_id).first()
            if ward is None:
                raise HTTPException(status_code=404, detail=f"Ward {ward_id} not found")
            ward.ward_name = ward_name
            ward.department_id = department_id
            session.commit()
            return {
                "success": True,
                "message": f"Ward {ward_id} modified successfully",
                "ward": {"ward_id": ward_id, "ward_name": ward_name, "department_id": department_id},
            }

    def delete(self, ward_id):
        with SessionLocal() as session:
            ward = session.query(Ward).filter(Ward.ward_id == ward_id).first()
            if ward is None:
                raise HTTPException(status_code=404, detail=f"Ward {ward_id} not found")
            ward_name = ward.ward_name
            session.delete(ward)
            session.commit()
        rel = RelationsManager()
        rel.delete_by_left("ward_bed",    ward_id)
        rel.delete_by_left("ward_doctor", ward_id)
        rel.delete_by_left("ward_nurse",  ward_id)
        return {"success": True, "message": f"Ward '{ward_name}' deleted successfully"}
