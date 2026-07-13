import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app import app


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def existing_doctor_id(client):
    resp = client.get("/api/staff/doctors/list")
    doctors = resp.json().get("doctors", [])
    if not doctors:
        pytest.skip("No doctors in the current dataset")
    return doctors[0]["id"]


@pytest.fixture(scope="session")
def existing_nurse_id(client):
    resp = client.get("/api/staff/nurses/list")
    nurses = resp.json().get("nurses", [])
    if not nurses:
        pytest.skip("No nurses in the current dataset")
    return nurses[0]["id"]
