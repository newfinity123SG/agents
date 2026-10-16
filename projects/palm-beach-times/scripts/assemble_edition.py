#!/usr/bin/env python3
"""Assemble the canonical Palm Beach Times v6 HTML from an explicit complete manifest.

This script does NOT research, fabricate content, draw charts, or generate imagery.
Inputs are trusted, pre-reviewed HTML fragments from the editorial pipeline.
It fails closed on missing fragments, bad dates and strict v6 validation errors.
"""
from __future__ import annotations
import argparse
from datetime import date
import json
from pathlib import Path
import re
from validate_edition import validate

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "assets" / "newspaper-template.html"
PLACEHOLDER = re.compile(r"\{\{([A-Z0-9_]+)\}\}")
DATE_FIELDS = ("DATE_ISO",)
FRAGMENT_FIELDS = {
    "MASTHEAD_LOGO", "CONTENTS_LINKS", "TODAYS_THREAD", "FRONT_PAGE",
    "MORNING_BRIEFS", "WEATHER_OCEAN_DESK", "DAILY_JOKE_TILE",
    "MARKET_CHARTS", "MARKET_DRIVERS", "MONEY_DESK", "AROUND_TOWN_DESK",
    "DEVELOPMENT_DESK", "LOCAL_NEWS_DESK", "COMMUNITY_ISSUES_DESK",
    "AI_TECHNOLOGY_DESK", "WORLD_LIFESTYLE_DESK", "COMIC_TILE",
    "RESTAURANT_OPENINGS_TILE", "SCREEN_GUIDE_TILE", "EXTRAS_TILE",
    "FOOTER",
}

def assemble(manifest: dict, template: str | None = None) -> str:
    if not isinstance(manifest, dict):
        raise ValueError("Manifest must be a JSON object")
    edition_date = manifest.get("DATE_ISO")
    if not isinstance(edition_date, str) or date.fromisoformat(edition_date).isoformat() != edition_date:
        raise ValueError("DATE_ISO must be a valid YYYY-MM-DD date")
    source = TEMPLATE.read_text(encoding="utf-8") if template is None else template
    names = set(PLACEHOLDER.findall(source))
    missing = sorted(k for k in names if not isinstance(manifest.get(k), str) or not manifest[k].strip())
    if missing:
        raise ValueError("Missing required template fields: " + ", ".join(missing))
    unknown = sorted(set(manifest) - names)
    if unknown:
        raise ValueError("Unknown template fields: " + ", ".join(unknown))
    for field in names & FRAGMENT_FIELDS:
        if "<script" in manifest[field].lower():
            raise ValueError("Executable scripts prohibited in fragment " + field)
    out = PLACEHOLDER.sub(lambda m: manifest[m.group(1)], source)
    if PLACEHOLDER.search(out):
        raise ValueError("Unresolved template placeholders remain")
    if f'data-edition-date="{edition_date}"' not in out:
        raise ValueError("Generated edition date does not match manifest")
    if f'data-joke-date="{edition_date}"' not in out:
        raise ValueError("Joke edition date does not match manifest")
    errors = validate(out)
    if errors:
        raise ValueError("Strict v6 validation failed:\n" + "\n".join(errors))
    return out

def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", type=Path, required=True,
                   help="Complete JSON object mapping every canonical template placeholder to an approved value")
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    html = assemble(manifest)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(html.encode("utf-8"))
    print(f"PASS: complete canonical v6 edition assembled; bytes={len(html.encode('utf-8'))}")

if __name__ == "__main__":
    main()
