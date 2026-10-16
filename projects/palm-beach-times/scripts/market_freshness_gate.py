"""Fail-closed freshness gate for staging newspaper market data.

The calling scheduler must supply the expected *completed* exchange session from
an independently maintained exchange calendar. Do not infer holidays from weekdays.
"""
from __future__ import annotations
from datetime import date, datetime
from zoneinfo import ZoneInfo
from scripts.check_market_input import verify

NY = ZoneInfo("America/New_York")

def assess_market_readiness(payload, expected_session, edition_date, now_iso):
    failures = []
    try:
        expected = date.fromisoformat(expected_session)
        edition = date.fromisoformat(edition_date)
        now = datetime.fromisoformat(now_iso.replace("Z", "+00:00"))
        if now.tzinfo is None or now.astimezone(NY).date() != edition:
            raise ValueError("edition timestamp mismatch")
        if expected > edition:
            raise ValueError("future expected session")
    except (ValueError, TypeError):
        return {"ready": False, "reason": "invalid_calendar_context", "failures": ["invalid_calendar_context"]}
    if not isinstance(payload, dict):
        return {"ready": False, "reason": "market_data_unavailable", "failures": ["market_data_unavailable"]}
    preflight = verify(payload)
    if not preflight["pass"]:
        failures.extend(preflight["errors"])
    if payload.get("session_date") != expected_session:
        failures.append("wrong_or_stale_trading_session")
    try:
        observed = datetime.fromisoformat(payload["as_of"].replace("Z", "+00:00"))
        if observed > now:
            failures.append("market_as_of_in_future")
        if observed.astimezone(NY).date() < expected:
            failures.append("market_as_of_before_expected_session")
    except (ValueError, TypeError, KeyError, AttributeError):
        failures.append("invalid_as_of")
    return {"ready": not failures, "reason": "ready" if not failures else "blocked",
            "failures": sorted(set(failures)), "expectedSession": expected_session,
            "observedSession": payload.get("session_date"), "editionDate": edition_date,
            "source": payload.get("source"), "publishing": False, "modelTokens": 0}
