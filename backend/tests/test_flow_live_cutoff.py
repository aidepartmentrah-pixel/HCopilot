"""FLOW_LIVE_DATA_START — optional cutoff for live Flow Prediction data.

Pure unit tests (no database): the setting must never break training or the
chart, whatever someone types into the compose file.
"""
from datetime import datetime

from features.flow_prediction.data_processor import live_data_start


def test_unset_means_no_cutoff(monkeypatch):
    monkeypatch.delenv("FLOW_LIVE_DATA_START", raising=False)
    assert live_data_start() is None


def test_blank_means_no_cutoff(monkeypatch):
    monkeypatch.setenv("FLOW_LIVE_DATA_START", "   ")
    assert live_data_start() is None


def test_iso_date(monkeypatch):
    monkeypatch.setenv("FLOW_LIVE_DATA_START", "2026-09-22")
    assert live_data_start() == datetime(2026, 9, 22)


def test_iso_datetime(monkeypatch):
    monkeypatch.setenv("FLOW_LIVE_DATA_START", "2026-09-22T08:30")
    assert live_data_start() == datetime(2026, 9, 22, 8, 30)


def test_garbage_is_ignored_not_fatal(monkeypatch):
    monkeypatch.setenv("FLOW_LIVE_DATA_START", "22/09/2026")
    assert live_data_start() is None
