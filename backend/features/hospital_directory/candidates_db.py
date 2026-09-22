# =============================================================================
# hospital_directory/candidates_db.py — Middle-Name Candidate List DB Layer
# =============================================================================
#
# One flat, admin-editable list of candidate middle/father names tried by
# the "Find possible matches" guess loop (see guess.py) when a user knows a
# patient's first and last name but not the middle name the vendor's search
# requires. There is deliberately only one list, not named/switchable sets —
# read fresh from the DB on every call, same no-caching convention as
# settings_db.py.
# =============================================================================

from db.session import SessionLocal
from db.models import MiddleNameCandidate


def list_candidates() -> list[str]:
    """Candidate names in try-order (sort_order ascending)."""
    with SessionLocal() as session:
        rows = session.query(MiddleNameCandidate).order_by(MiddleNameCandidate.sort_order.asc()).all()
        return [r.name for r in rows]


def replace_candidates(names: list[str]) -> list[str]:
    """
    Replace the entire list, preserving the given order as the new
    sort_order. Blank entries are dropped; duplicates are kept as typed
    (an admin's call, not silently collapsed).
    """
    cleaned = [n.strip() for n in names if n and n.strip()]
    with SessionLocal() as session:
        session.query(MiddleNameCandidate).delete(synchronize_session=False)
        for i, name in enumerate(cleaned):
            session.add(MiddleNameCandidate(name=name, sort_order=i))
        session.commit()
    return cleaned
