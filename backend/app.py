# =============================================================================
# app.py — HCopilot FastAPI Application Entry Point
# =============================================================================
#
# This is the single entry point for the entire backend.  It is responsible for:
#   1. Creating the FastAPI application instance.
#   2. Configuring CORS so the browser-served frontend can call the API.
#   3. Importing each feature's APIRouter and mounting it under its own URL prefix.
#   4. In local dev, also serving the frontend (HTML/CSS/JS) as static files from
#      the same HTTP server so no separate web server is needed. In the Docker
#      deployment, the frontend is served by its own nginx container instead
#      (see frontend/Dockerfile) and this backend image ships API-only — the
#      static mount below is skipped automatically when frontend/ isn't present.
#
# HOW REQUESTS FLOW (local dev, one process):
#   Browser → GET /           → StaticFiles serves frontend/index.html
#   Browser → GET /api/beds/list → FastAPI routes to beds_display.api router
#   Browser → POST /api/auth/login → FastAPI routes to auth.api router
#
# DATA STORAGE:
#   Microsoft SQL Server (see db/session.py, db/models.py). Every manager class
#   talks to the database via SQLAlchemy — see the Stage 1 migration.
#
# RUNNING:
#   cd backend && python app.py
#   The dev server starts at http://localhost:8090
# =============================================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import os

# Create the FastAPI app instance with a human-readable title
app = FastAPI(title="HCopilot")

# Allow requests from any origin so the frontend (served from the same port)
# and any development tool can reach the API without CORS errors.
# In production you would restrict allow_origins to your actual domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Router imports ─────────────────────────────────────────────────────────────
# Imported after the app is created to avoid circular imports.  Each feature
# exposes exactly one `router` object that registers all its endpoint handlers.

from features.dataset_display.api import router as dataset_router   # CSV dataset browser
from features.flow_prediction.api import router as flow_router       # XGBoost patient-flow forecast
from features.beds_display.api import router as beds_router          # Bed list, stats, CRUD, assign/discharge
from features.model_files.api import router as models_router         # .pkl model file listing
from features.staff_management.api import router as staff_router     # Doctors, nurses, shifts, groups
from features.data_management.api import router as data_mgmt_router  # Wards, DailyPatients, LogPatients
from features.patient_management.api import router as patients_router # Patient CRUD + next-ID helper
from features.relations.api import router as relations_router        # Generic many-to-many table CRUD
from features.scheduling.api import router as scheduling_router      # Assignment create/edit/discharge
from features.simulation.api import router as simulation_router      # Intake simulation + OR scheduler
from features.statistics.api import router as statistics_router      # Aggregate KPI endpoints
from features.reset.api import router as reset_router                # Destructive data-clear endpoints
from features.unurgent.api import router as unurgent_router          # Unurgent (acuity-5) patient path
from features.auth.api import router as auth_router                  # Login + user account management

# ── Router registration ────────────────────────────────────────────────────────
# Each router is mounted under its own URL prefix.  All API endpoints therefore
# live under /api/… which separates them cleanly from the static frontend files
# served at the root path.

app.include_router(dataset_router,    prefix="/api/patient-flow")   # GET /api/patient-flow/datasets, etc.
app.include_router(flow_router,       prefix="/api/flow-prediction") # GET /api/flow-prediction/predict
app.include_router(beds_router,       prefix="/api/beds")            # GET /api/beds/list, POST /api/beds/add
app.include_router(models_router,     prefix="/api/models")          # GET /api/models/list
app.include_router(staff_router,      prefix="/api/staff")           # /api/staff/doctors/…, /api/staff/nurses/…
app.include_router(data_mgmt_router,  prefix="/api/data")            # /api/data/wards/…, /api/data/daily-patients/…
app.include_router(patients_router,   prefix="/api/patients")        # GET /api/patients/list, GET /api/patients/next-ids
app.include_router(relations_router,  prefix="/api/relations")       # GET /api/relations/{table}
app.include_router(scheduling_router, prefix="/api/scheduling")      # POST /api/scheduling/assign
app.include_router(simulation_router, prefix="/api/simulation")      # GET /api/simulation/sample-patient
app.include_router(statistics_router, prefix="/api/statistics")      # GET /api/statistics/overview
app.include_router(reset_router,      prefix="/api/reset")           # POST /api/reset/all
app.include_router(unurgent_router,   prefix="/api/unurgent")        # GET /api/unurgent/list
app.include_router(auth_router,       prefix="/api/auth")            # POST /api/auth/login


@app.get("/health")
async def health():
    """Lightweight liveness check for the Docker/Compose healthcheck — no DB access."""
    return {"status": "ok"}


# ── Static frontend serving (local dev only) ───────────────────────────────────
# Mount the entire frontend/ directory as static HTML.  The `html=True` flag
# makes FastAPI serve index.html for any path that doesn't match an API route,
# which is the standard "catch-all" configuration for single-page apps.
# This must be mounted LAST — StaticFiles is a catch-all and would intercept
# API requests if mounted before the routers.
#
# The backend Docker image is API-only and has no frontend/ directory (nginx
# serves the frontend in its own container instead) — StaticFiles would raise
# at startup if pointed at a missing directory, so this mount is skipped
# entirely when the folder isn't present.

FRONTEND_FOLDER = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND_FOLDER):
    app.mount("/", StaticFiles(directory=FRONTEND_FOLDER, html=True), name="frontend")

# ── Development server ────────────────────────────────────────────────────────
# Only executed when this file is run directly (`python app.py`).
# In production you would use: uvicorn app:app --host 0.0.0.0 --port 8090

if __name__ == "__main__":
    print("\n🏥 HCopilot\n")
    uvicorn.run(app, host="localhost", port=8090)
