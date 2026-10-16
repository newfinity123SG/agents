#!/usr/bin/env python3
"""Read-only verification of a Palm Beach Times edition on two public routes.

No publishing, Slack calls, or secrets. Use against staging before cutover.
"""
from __future__ import annotations
import argparse
import hashlib
import sys
import urllib.error
import urllib.request
from pathlib import Path
from validate_edition import validate


def fetch(url: str) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "PBT-migration-verifier/1"})
    with urllib.request.urlopen(req, timeout=35) as response:
        if response.status != 200:
            raise ValueError(f"{url}: HTTP {response.status}")
        content_type = response.headers.get("Content-Type", "")
        if "text/html" not in content_type.lower():
            raise ValueError(f"{url}: incorrect content type {content_type!r}")
        return response.read(), content_type


def verify(canonical: bytes, dated: bytes, latest: bytes, expected_date: str) -> dict:
    if dated != canonical or latest != canonical:
        raise ValueError("Canonical, dated, and /today response bytes differ")
    decoded = canonical.decode("utf-8", "strict")
    if f'data-edition-date="{expected_date}"' not in decoded:
        raise ValueError("Edition date mismatch")
    if f'data-joke-date="{expected_date}"' not in decoded:
        raise ValueError("Joke date mismatch")
    problems = validate(decoded)
    if problems:
        raise ValueError("Invalid v6 newspaper: " + "; ".join(problems))
    return {"date": expected_date, "bytes": len(canonical),
            "sha256": hashlib.sha256(canonical).hexdigest(), "verified": True}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--canonical", type=Path, required=True)
    p.add_argument("--date", required=True)
    p.add_argument("--origin", required=True)
    args = p.parse_args()
    origin = args.origin.rstrip("/")
    canonical = args.canonical.read_bytes()
    dated, _ = fetch(f"{origin}/{args.date}")
    latest, _ = fetch(f"{origin}/today")
    result = verify(canonical, dated, latest, args.date)
    import json
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, UnicodeError, urllib.error.URLError) as exc:
        print("FAIL:", exc, file=sys.stderr)
        raise SystemExit(1)
