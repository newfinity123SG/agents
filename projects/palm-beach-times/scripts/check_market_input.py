#!/usr/bin/env python3
"""Staging-only market chart provenance preflight. Never fetches, fabricates or publishes data."""
from __future__ import annotations
from datetime import date, datetime
from zoneinfo import ZoneInfo
import argparse
import json
from pathlib import Path
import math

EXPECTED = {"sp500", "dow", "nasdaq"}
NY = ZoneInfo("America/New_York")

def verify(payload: dict) -> dict:
    errors = []
    try:
        session = date.fromisoformat(payload["session_date"])
        if session.isoformat() != payload["session_date"]:
            raise ValueError("bad date")
        as_of = datetime.fromisoformat(payload["as_of"].replace("Z", "+00:00"))
        if as_of.tzinfo is None:
            raise ValueError("as_of must be timezone aware")
        if as_of.astimezone(NY).date() < session:
            errors.append("as_of_before_session")
    except (KeyError, TypeError, ValueError):
        return {"pass": False, "errors": ["invalid_session_or_as_of"]}
    source = payload.get("source")
    if not isinstance(source, str) or len(source.strip()) < 5:
        errors.append("missing_provenance")
    indices = payload.get("indices")
    if not isinstance(indices, list) or len(indices) != 3:
        return {"pass": False, "errors": errors + ["expected_three_indices"]}
    keys = [x.get("key") for x in indices if isinstance(x, dict)]
    if set(keys) != EXPECTED or len(keys) != len(set(keys)):
        errors.append("index_keys_invalid")
    sets = []
    counts = {}
    for row in indices:
        if not isinstance(row, dict):
            errors.append("index_not_object")
            continue
        key = row.get("key", "unknown")
        points = row.get("points")
        if not isinstance(points, list) or len(points) < 48:
            errors.append(f"{key}:insufficient_observations")
            continue
        timestamps = []
        volume_positive = 0
        previous_close = row.get("previous_close")
        if isinstance(previous_close, bool) or not isinstance(previous_close, (float, int)) or not math.isfinite(previous_close) or previous_close <= 0:
            errors.append(f"{key}:invalid_previous_close")
        for p in points:
            try:
                t = datetime.fromisoformat(p["time"].replace("Z", "+00:00"))
                value, vol = p["value"], p["volume"]
                if t.tzinfo is None or t.astimezone(NY).date() != session:
                    raise ValueError("session mismatch")
                if any(isinstance(v, bool) or not isinstance(v, (float, int)) or not math.isfinite(v) for v in (value, vol)):
                    raise ValueError("numeric data")
                if value <= 0 or vol < 0:
                    raise ValueError("nonpositive price or negative volume")
                volume_positive += (vol > 0)
                timestamps.append(t.astimezone(ZoneInfo("UTC")))
            except (KeyError, TypeError, AttributeError, ValueError):
                errors.append(f"{key}:invalid_point")
                break
        if timestamps != sorted(set(timestamps)):
            errors.append(f"{key}:timestamps_not_strictly_increasing")
        if volume_positive < 48:
            errors.append(f"{key}:insufficient_positive_volume")
        counts[key] = {"points": len(points), "positiveVolume": volume_positive}
        sets.append({t.isoformat() for t in timestamps})
    if len(sets) == 3 and (sets[0] != sets[1] or sets[1] != sets[2]):
        errors.append("index_timestamps_not_aligned")
    return {"pass": not errors, "errors": errors, "sessionDate": session.isoformat(),
            "counts": counts, "source": source, "publishing": False, "modelTokens": 0}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_json", type=Path)
    args = parser.parse_args()
    result = verify(json.loads(args.input_json.read_text(encoding="utf-8")))
    print(json.dumps(result, indent=2))
    if not result["pass"]:
        raise SystemExit(1)

if __name__ == "__main__":
    main()
