# =============================================================================
# auth/users_manager.py — User Account SQL Server Manager
# =============================================================================
#
# Manages user accounts stored in the Users table (SQL Server via SQLAlchemy
# ORM). Provides login authentication, account creation, updates, and
# deletion with a hard guard against removing the last admin account.
#
# KEY BEHAVIOURS (unchanged from the CSV-era implementation):
#   - Passwords are stored as SHA-256 hashes; plain text is never persisted.
#   - An admin account ("admin" / "admin") is auto-created on first run so the
#     system is usable straight out of the box without manual setup.
#   - sections, settings_tabs, and statistics_tabs are comma-separated lists of
#     page/tab keys that control which parts of the frontend this user can access.
#   - delete() rejects removal of the last remaining admin account so the system
#     cannot be permanently locked out.
#   - Back-fill: admin rows written before settings_tabs or statistics_tabs existed
#     receive the full tab list on every read (not persisted) so existing
#     deployments upgrade gracefully.
# =============================================================================

import hashlib
from fastapi import HTTPException

from db.session import SessionLocal
from db.models import User

ALL_SECTIONS        = "home,flow-prediction,beds-display,patients,scheduling,simulation,unurgent,statistics,settings"
ALL_SETTINGS_TABS   = "beds,doctors,nurses,wards,daily-patients,log-patients,shifts,groups,datasets,relations,models,features,reset"
ALL_STATISTICS_TABS = "patients,nurses,doctors"


def _hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


class UsersManager:
    """
    Manages user account records for HCopilot's authentication system.

    Key invariants:
      - Passwords are never stored in plain text — only the SHA-256 hash is written.
      - At least one admin account must always exist (enforced in delete()).
      - The admin / admin account is created automatically if the table is empty.
      - sections and settings_tabs control which frontend pages/tabs are visible
        to this user; they are comma-separated strings of page-key identifiers.
    """

    def __init__(self):
        with SessionLocal() as session:
            if session.query(User).first() is None:
                session.add(User(
                    user_id=1,
                    username="admin",
                    password_hash=_hash("admin"),
                    name="Administrator",
                    role="admin",
                    sections=ALL_SECTIONS,
                    settings_tabs=ALL_SETTINGS_TABS,
                    statistics_tabs=ALL_STATISTICS_TABS,
                ))
                session.commit()

    def _row(self, user: User) -> dict:
        settings_tabs = user.settings_tabs or ""
        statistics_tabs = user.statistics_tabs or ""
        if user.role == "admin":
            if not settings_tabs.strip():
                settings_tabs = ALL_SETTINGS_TABS
            if not statistics_tabs.strip():
                statistics_tabs = ALL_STATISTICS_TABS
        return {
            "user_id":          user.user_id,
            "username":         (user.username or "").strip(),
            "name":             (user.name or "").strip(),
            "role":             (user.role or "").strip(),
            "sections":         (user.sections or "").strip(),
            "settings_tabs":    settings_tabs.strip(),
            "statistics_tabs":  statistics_tabs.strip(),
        }

    def get_all(self) -> list:
        with SessionLocal() as session:
            users = session.query(User).all()
            return [self._row(u) for u in users]

    def login(self, username: str, password: str) -> dict:
        with SessionLocal() as session:
            user = session.query(User).filter(
                User.username == username.strip(),
                User.password_hash == _hash(password),
            ).first()
            if user is None:
                raise HTTPException(status_code=401, detail="Invalid username or password")
            return self._row(user)

    def create(self, username: str, password: str, name: str, role: str,
               sections: str, settings_tabs: str = "", statistics_tabs: str = "") -> dict:
        with SessionLocal() as session:
            existing = session.query(User).filter(User.username == username.strip()).first()
            if existing is not None:
                raise HTTPException(status_code=400, detail=f"Username '{username}' already exists")
            max_id = session.query(User.user_id).order_by(User.user_id.desc()).first()
            new_id = (max_id[0] + 1) if max_id else 1
            session.add(User(
                user_id=new_id,
                username=username.strip(),
                password_hash=_hash(password),
                name=name.strip(),
                role=role.strip(),
                sections=sections.strip(),
                settings_tabs=settings_tabs.strip(),
                statistics_tabs=statistics_tabs.strip(),
            ))
            session.commit()
            return {"user_id": new_id}

    def update(self, user_id: int, username: str, name: str, role: str,
               sections: str, password: str | None = None, settings_tabs: str = "",
               statistics_tabs: str = ""):
        with SessionLocal() as session:
            user = session.query(User).filter(User.user_id == user_id).first()
            if user is None:
                raise HTTPException(status_code=404, detail=f"User {user_id} not found")
            conflict = session.query(User).filter(
                User.username == username.strip(), User.user_id != user_id,
            ).first()
            if conflict is not None:
                raise HTTPException(status_code=400, detail=f"Username '{username}' is already taken")
            user.username = username.strip()
            user.name = name.strip()
            user.role = role.strip()
            user.sections = sections.strip()
            user.settings_tabs = settings_tabs.strip()
            user.statistics_tabs = statistics_tabs.strip()
            if password:
                user.password_hash = _hash(password)
            session.commit()

    def delete(self, user_id: int):
        with SessionLocal() as session:
            user = session.query(User).filter(User.user_id == user_id).first()
            if user is None:
                raise HTTPException(status_code=404, detail=f"User {user_id} not found")
            if user.role == "admin":
                admin_count = session.query(User).filter(User.role == "admin").count()
                if admin_count <= 1:
                    raise HTTPException(status_code=400, detail="Cannot delete the last admin account")
            session.delete(user)
            session.commit()
