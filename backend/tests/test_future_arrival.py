"""A future arrival time must be rejected (it corrupts predictions and blocks discharge)."""
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

from features.timestamp_utils import validate_not_future


def _iso(delta):
    return (datetime.now() + delta).strftime("%Y-%m-%dT%H:%M")


def test_past_and_now_are_allowed():
    validate_not_future(_iso(timedelta(hours=-3)))
    validate_not_future(_iso(timedelta(0)))


def test_small_clock_skew_is_tolerated():
    validate_not_future(_iso(timedelta(minutes=1)))


def test_far_future_is_rejected():
    with pytest.raises(HTTPException) as exc:
        validate_not_future(_iso(timedelta(hours=20)))
    assert exc.value.status_code == 400
    assert "future" in exc.value.detail


def test_blank_is_ignored():
    validate_not_future(None)
    validate_not_future("")
