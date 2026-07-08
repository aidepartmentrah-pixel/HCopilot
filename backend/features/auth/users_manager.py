# =============================================================================
# auth/users_manager.py — User Account CSV Manager
# =============================================================================
#
# Manages user accounts stored in Users.csv.  Provides login authentication,
# account creation, updates, and deletion with a hard guard against removing
# the last admin account.
#
# CSV file managed:
#   Users.csv — columns: user_id, username, password_hash, name, role,
#                        sections, settings_tabs, statistics_tabs
#
# KEY BEHAVIOURS:
#   - Passwords are stored as SHA-256 hashes; plain text is never persisted.
#   - An admin account ("admin" / "admin") is auto-created on first run so the
#     system is usable straight out of the box without manual setup.
#   - sections, settings_tabs, and statistics_tabs are comma-separated lists of
#     page/tab keys that control which parts of the frontend this user can access.
#   - delete() rejects removal of the last remaining admin account so the system
#     cannot be permanently locked out.
#   - Back-fill: admin rows written before settings_tabs or statistics_tabs existed
#     receive the full tab list on next read so existing deployments upgrade gracefully.
# =============================================================================

import os
import hashlib
import pandas as pd
from fastapi import HTTPException

_HERE       = os.path.dirname(__file__)
USERS_FILE  = os.path.join(_HERE, "..", "..", "datasets", "Users.csv")
ALL_SECTIONS        = "home,flow-prediction,beds-display,patients,scheduling,simulation,unurgent,statistics,settings"
ALL_SETTINGS_TABS   = "beds,doctors,nurses,wards,daily-patients,log-patients,shifts,groups,datasets,relations,models,features,reset"
ALL_STATISTICS_TABS = "patients,nurses,doctors"


def _hash(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


_DEFAULT_ADMIN = {
    "user_id":          1,
    "username":         "admin",
    "password_hash":    _hash("admin"),
    "name":             "Administrator",
    "role":             "admin",
    "sections":         ALL_SECTIONS,
    "settings_tabs":    ALL_SETTINGS_TABS,
    "statistics_tabs":  ALL_STATISTICS_TABS,
}

_COLS = ["user_id", "username", "password_hash", "name", "role", "sections", "settings_tabs", "statistics_tabs"]


class UsersManager:
    """
    Manages user account records for HCopilot's authentication system.

    CSV file managed:
      - Users.csv : one row per user account, identified by an integer user_id

    Key invariants:
      - Passwords are never stored in plain text — only the SHA-256 hash is written.
      - At least one admin account must always exist (enforced in delete()).
      - The admin / admin account is created automatically if the CSV is absent.
      - sections and settings_tabs control which frontend pages/tabs are visible
        to this user; they are comma-separated strings of page-key identifiers.
    """

    def __init__(self):
        os.makedirs(os.path.dirname(USERS_FILE), exist_ok=True)
        if not os.path.exists(USERS_FILE):
            pd.DataFrame([_DEFAULT_ADMIN]).to_csv(USERS_FILE, index=False)

    # ── Private ────────────────────────────────────────────────────────────────

    def _read(self) -> pd.DataFrame:
        if not os.path.exists(USERS_FILE):
            return pd.DataFrame(columns=_COLS)
        df = pd.read_csv(USERS_FILE)
        for c in _COLS:
            if c not in df.columns:
                df[c] = ""
        # Back-fill settings_tabs for admin rows that pre-date this column
        mask = (df["role"].str.strip() == "admin") & (df["settings_tabs"].str.strip() == "")
        df.loc[mask, "settings_tabs"] = ALL_SETTINGS_TABS
        # Back-fill statistics_tabs for admin rows that pre-date this column
        mask2 = (df["role"].str.strip() == "admin") & (df["statistics_tabs"].str.strip() == "")
        df.loc[mask2, "statistics_tabs"] = ALL_STATISTICS_TABS
        return df

    def _write(self, df: pd.DataFrame):
        df.to_csv(USERS_FILE, index=False)

    def _row(self, r) -> dict:
        return {
            "user_id":          int(r["user_id"]),
            "username":         str(r["username"]).strip(),
            "name":             str(r.get("name", "")).strip() if pd.notna(r.get("name", "")) else "",
            "role":             str(r["role"]).strip(),
            "sections":         str(r["sections"]).strip(),
            "settings_tabs":    str(r.get("settings_tabs", "")).strip()    if pd.notna(r.get("settings_tabs", ""))    else "",
            "statistics_tabs":  str(r.get("statistics_tabs", "")).strip()  if pd.notna(r.get("statistics_tabs", ""))  else "",
        }

    # ── Public ─────────────────────────────────────────────────────────────────

    def get_all(self) -> list:
        df = self._read()
        return [self._row(r) for _, r in df.iterrows()]

    def login(self, username: str, password: str) -> dict:
        df   = self._read()
        mask = (df["username"].str.strip() == username.strip()) & \
               (df["password_hash"] == _hash(password))
        if df[mask].empty:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        return self._row(df[mask].iloc[0])

    def create(self, username: str, password: str, name: str, role: str,
               sections: str, settings_tabs: str = "", statistics_tabs: str = "") -> dict:
        df = self._read()
        if username.strip() in df["username"].str.strip().values:
            raise HTTPException(status_code=400, detail=f"Username '{username}' already exists")
        new_id = int(df["user_id"].max()) + 1 if len(df) > 0 else 1
        new_row = pd.DataFrame([{
            "user_id":          new_id,
            "username":         username.strip(),
            "password_hash":    _hash(password),
            "name":             name.strip(),
            "role":             role.strip(),
            "sections":         sections.strip(),
            "settings_tabs":    settings_tabs.strip(),
            "statistics_tabs":  statistics_tabs.strip(),
        }])
        self._write(pd.concat([df, new_row], ignore_index=True))
        return {"user_id": new_id}

    def update(self, user_id: int, username: str, name: str, role: str,
               sections: str, password: str | None = None, settings_tabs: str = "",
               statistics_tabs: str = ""):
        df = self._read()
        if user_id not in df["user_id"].values:
            raise HTTPException(status_code=404, detail=f"User {user_id} not found")
        conflict = df[(df["username"].str.strip() == username.strip()) &
                      (df["user_id"] != user_id)]
        if not conflict.empty:
            raise HTTPException(status_code=400, detail=f"Username '{username}' is already taken")
        mask = df["user_id"] == user_id
        df.loc[mask, "username"]         = username.strip()
        df.loc[mask, "name"]             = name.strip()
        df.loc[mask, "role"]             = role.strip()
        df.loc[mask, "sections"]         = sections.strip()
        df.loc[mask, "settings_tabs"]    = settings_tabs.strip()
        df.loc[mask, "statistics_tabs"]  = statistics_tabs.strip()
        if password:
            df.loc[mask, "password_hash"] = _hash(password)
        self._write(df)

    def delete(self, user_id: int):
        df = self._read()
        if user_id not in df["user_id"].values:
            raise HTTPException(status_code=404, detail=f"User {user_id} not found")
        row = df[df["user_id"] == user_id].iloc[0]
        if str(row["role"]).strip() == "admin":
            if len(df[df["role"].str.strip() == "admin"]) <= 1:
                raise HTTPException(status_code=400, detail="Cannot delete the last admin account")
        self._write(df[df["user_id"] != user_id].reset_index(drop=True))
