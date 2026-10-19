"""Verify exactly approved visual assets; fail closed on replacement artwork."""
from __future__ import annotations
import hashlib
from pathlib import Path
from scripts.embed_masthead_image import render as embed_masthead
from scripts.embed_comic_image import render as embed_comic

# Extracted byte-for-byte from the successful 2026-10-16 published edition.
LOCKED_MASTHEAD_SHA256 = "b0fe0798d536c315e8916b884e6d09c1137f828195473f49dfa0e187e4300b79"

def validate_masthead(path: Path) -> dict:
    digest=hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != LOCKED_MASTHEAD_SHA256:
        raise ValueError("Masthead bytes differ from the approved Oct 16 edition")
    fragment=embed_masthead(path)
    return {"verified": True, "sha256": digest, "fragment": fragment}

def validate_daily_comic(path: Path, edition_date: str, title: str, caption: str, alt: str) -> dict:
    if path.name != f"comic-{edition_date}.png":
        raise ValueError("Comic filename must match edition date; no recycled comic")
    fragment=embed_comic(path,title,caption,alt)
    return {"verified": True,"sha256":hashlib.sha256(path.read_bytes()).hexdigest(),
            "editionDate": edition_date,"fragment":fragment}
