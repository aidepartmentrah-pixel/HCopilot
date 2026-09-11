# =============================================================================
# tests/test_model_training.py — Model training engine endpoint suite
# =============================================================================
#
# Like test_endpoints.py, this hits the real FastAPI app via TestClient
# against the real dev SQL Server database — there is no mocking anywhere in
# this test suite, and this file doesn't introduce any.
#
# IMPORTANT DIFFERENCE FROM test_endpoints.py: these tests genuinely retrain
# and temporarily redeploy the real, currently-serving Flow_prediction.pkl —
# not just throwaway rows in a business table. The `trained_run` fixture's
# teardown restores whichever run was live before this module ran (via the
# promote endpoint, no retraining needed) specifically so this suite is
# non-destructive to a shared dev environment. If there was no prior live
# run recorded (a fresh environment, before this feature's first use), the
# run this fixture creates is left live rather than deleted — deleting the
# live run is blocked by design (see trainer.delete_run).
#
# Repeated CI runs don't bloat backend/models/AIModels/training_runs/: the
# trainer's own retention cap (trainer.RETENTION_KEEP_N) prunes old,
# non-live artifacts in production use too, not just for tests. Each test
# here also does its own best-effort cleanup on top, but that's a nicety,
# not the load-bearing mechanism.
# =============================================================================

import os

import pytest

from features.model_training import trainer


@pytest.fixture(scope="module")
def trained_run(client):
    prev_resp = client.get("/api/model-training/live")
    prev_run_id = prev_resp.json()["run_id"] if prev_resp.status_code == 200 else None

    resp = client.post("/api/model-training/train")
    assert resp.status_code == 200, f"train -> {resp.status_code}: {resp.text}"
    result = resp.json()

    yield result

    # Restore whichever run was live before this module trained a new one.
    # No prior live run (fresh environment) -> nothing to restore to, so the
    # run created here is left live and not deleted.
    if prev_run_id:
        promote_resp = client.post(f"/api/model-training/runs/{prev_run_id}/promote")
        if promote_resp.status_code == 200:
            client.delete(f"/api/model-training/runs/{result['run_id']}")


def test_train_then_verify_history(trained_run, client):
    # Not asserting exact numeric thresholds (e.g. the notebook's MAE 11.37)
    # since the live dataset grows over time and a hardcoded value would go
    # stale/flaky — just that the metrics are real, sane numbers.
    assert trained_run["status"] == "completed"
    assert trained_run["is_live"] is True
    assert trained_run["row_count_train"] > 0
    assert trained_run["row_count_test"] > 0

    m = trained_run["metrics"]
    assert m["mae"] > 0
    assert m["rmse"] > 0
    assert m["mse"] > 0
    assert isinstance(m["r2"], float)
    assert m["mape"] > 0
    assert m["smape"] > 0

    resp = client.get("/api/model-training/runs")
    assert resp.status_code == 200
    run_ids = [r["run_id"] for r in resp.json()["runs"]]
    assert trained_run["run_id"] in run_ids

    resp = client.get(f"/api/model-training/runs/{trained_run['run_id']}")
    assert resp.status_code == 200
    assert resp.json()["run_id"] == trained_run["run_id"]

    resp = client.get("/api/model-training/live")
    assert resp.status_code == 200
    assert resp.json()["run_id"] == trained_run["run_id"]


def test_predict_reflects_new_model(trained_run, client):
    # Proves the mtime-cache handoff in flow_prediction/api.py picks up the
    # freshly (re)trained model with zero code changes on that side.
    resp = client.get("/api/flow-prediction/predict?days=5")
    assert resp.status_code == 200
    predictions = resp.json()["predictions"]
    assert len(predictions) == 5
    assert all(p["predicted_patients"] > 0 for p in predictions)


def test_train_conflict_returns_409(client):
    # Deterministic, not race-based: a true two-thread race against a real
    # multi-second training call would be flaky on slower CI runners for no
    # extra coverage. This exercises the exact same non-blocking lock
    # acquire that POST /train relies on, without any timing dependency.
    acquired = trainer._lock.acquire(blocking=False)
    assert acquired, "test setup: lock should have been free"
    try:
        resp = client.post("/api/model-training/train")
        assert resp.status_code == 409
    finally:
        trainer._lock.release()


def test_get_run_not_found_returns_404(client):
    bogus = "does-not-exist"
    assert client.get(f"/api/model-training/runs/{bogus}").status_code == 404
    assert client.get(f"/api/model-training/runs/{bogus}/export").status_code == 404
    assert client.post(f"/api/model-training/runs/{bogus}/promote").status_code == 404
    assert client.delete(f"/api/model-training/runs/{bogus}").status_code == 404


def test_export_returns_bytes_matching_disk(trained_run, client):
    resp = client.get(f"/api/model-training/runs/{trained_run['run_id']}/export")
    assert resp.status_code == 200

    abs_path = os.path.join(trainer.BACKEND_ROOT, trained_run["artifact_path"])
    with open(abs_path, "rb") as f:
        on_disk = f.read()
    assert resp.content == on_disk


def test_promote_switches_live_run(trained_run, client):
    # Trains a second run beyond the module fixture's run, promotes back to
    # the fixture's run, and confirms both /live and the live-serving
    # /api/flow-prediction/predict reflect the swap — proving promote (not
    # just train) correctly invalidates the cross-feature cache. Deliberately
    # the LAST test in this file: it leaves the fixture's run live again,
    # which is what the trained_run fixture's teardown assumes.
    run_a_id = trained_run["run_id"]

    resp = client.post("/api/model-training/train")
    assert resp.status_code == 200
    run_b = resp.json()
    run_b_id = run_b["run_id"]

    try:
        assert run_b["is_live"] is True

        promote_resp = client.post(f"/api/model-training/runs/{run_a_id}/promote")
        assert promote_resp.status_code == 200
        assert promote_resp.json()["is_live"] is True

        live_resp = client.get("/api/model-training/live")
        assert live_resp.status_code == 200
        assert live_resp.json()["run_id"] == run_a_id

        predict_resp = client.get("/api/flow-prediction/predict?days=3")
        assert predict_resp.status_code == 200
    finally:
        # Run B is no longer live (A was promoted back above), so this is a
        # normal delete, not blocked by the live-run guard.
        client.delete(f"/api/model-training/runs/{run_b_id}")
