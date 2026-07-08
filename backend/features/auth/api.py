# HTTP API for the authentication and user-management feature.
#
# Endpoints:
#   POST   /login             — verify credentials; returns the user record on success
#   GET    /users             — list all user accounts (no passwords returned)
#   POST   /users             — create a new user account
#   PUT    /users/{user_id}   — update an existing user (rename, change role/sections,
#                               reset password)
#   DELETE /users/{user_id}   — remove a user; cannot delete the last admin account

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from .users_manager import UsersManager

router = APIRouter()
_mgr   = UsersManager()


class LoginBody(BaseModel):
    """Credentials submitted by the login form."""
    username: str
    password: str


class UserBody(BaseModel):
    """
    Payload for create-user (POST) and update-user (PUT) requests.

    password is optional on updates — omit it to keep the existing hash intact.
    Three comma-separated fields control which parts of the frontend are accessible:
      sections:         navigation page keys (e.g. "home,beds-display,patients")
      settings_tabs:    settings panel sub-tab keys (e.g. "doctors,beds,reset")
      statistics_tabs:  statistics section sub-tab keys: "patients", "nurses", "doctors"
                        (if empty for a non-admin, all three tabs default to accessible)
    """
    username:         str
    password:         Optional[str] = None
    name:             Optional[str] = ""
    role:             str            = "user"
    sections:         str            = ""
    settings_tabs:    str            = ""
    statistics_tabs:  str            = ""


@router.post("/login")
async def login(body: LoginBody):
    """
    Authenticate a user with username and plain-text password.

    Delegates to UsersManager.login which compares against the stored SHA-256
    hash.  Returns the full user record (without password_hash) on success.

    Raises:
        HTTPException 401: if the username/password combination does not match.
    """
    user = _mgr.login(body.username, body.password)
    return {"ok": True, "user": user}


@router.get("/users")
async def list_users():
    """
    Return all user accounts.

    Password hashes are never included in the response — only user_id, username,
    name, role, sections, and settings_tabs are returned.
    """
    return {"users": _mgr.get_all()}


@router.post("/users")
async def create_user(body: UserBody):
    """
    Create a new user account.

    Password is mandatory for creation (unlike updates where it is optional).

    Raises:
        HTTPException 400: if password is omitted or if the username already exists.
    """
    if not body.password:
        raise HTTPException(status_code=400, detail="Password is required when creating a user")
    result = _mgr.create(body.username, body.password, body.name or "", body.role,
                         body.sections, body.settings_tabs, body.statistics_tabs)
    return {"success": True, **result}


@router.put("/users/{user_id}")
async def update_user(user_id: int, body: UserBody):
    """
    Update an existing user's profile.

    Omitting body.password leaves the current password hash unchanged.

    Args:
        user_id: path parameter identifying the user to update.
        body:    new field values; password=None means "do not change password".

    Raises:
        HTTPException 404: if user_id does not exist.
        HTTPException 400: if the new username is already taken by another account.
    """
    _mgr.update(user_id, body.username, body.name or "", body.role, body.sections,
                body.password or None, body.settings_tabs, body.statistics_tabs)
    return {"success": True}


@router.delete("/users/{user_id}")
async def delete_user(user_id: int):
    """
    Delete a user account.

    Args:
        user_id: path parameter identifying the user to delete.

    Raises:
        HTTPException 404: if user_id does not exist.
        HTTPException 400: if the account is the last admin — the system must
                           always retain at least one admin to remain manageable.
    """
    _mgr.delete(user_id)
    return {"success": True}
