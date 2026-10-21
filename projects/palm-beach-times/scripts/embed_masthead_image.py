#!/usr/bin/env python3
"""Embed the locked Palm Beach Times masthead PNG into the self-contained edition HTML."""
from __future__ import annotations
import argparse, base64, io, mimetypes, struct
from pathlib import Path

def render(path: Path, optimize_lossless: bool = False) -> str:
    mime,_=mimetypes.guess_type(path.name)
    if mime != "image/png":
        raise ValueError("Palm Beach Times masthead must be the locked transparent PNG asset")
    raw=path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[12:16] != b"IHDR":
        raise ValueError("Masthead file is not a valid PNG")
    color_type=raw[25]
    if color_type not in {4,6}:
        raise ValueError("Masthead PNG must include an alpha channel for transparency")
    if optimize_lossless:
        from PIL import Image
        original = Image.open(io.BytesIO(raw))
        encoded = io.BytesIO()
        original.save(encoded, format="PNG", optimize=True, compress_level=9)
        optimized = encoded.getvalue()
        restored = Image.open(io.BytesIO(optimized))
        if (restored.size != original.size or restored.mode != original.mode
                or restored.tobytes() != original.tobytes()):
            raise ValueError("Lossless masthead optimization changed pixels or alpha")
        if len(optimized) < len(raw):
            raw = optimized
    data=base64.b64encode(raw).decode("ascii")
    if len(data)<100000:
        raise ValueError("Masthead image is unexpectedly small")
    return (f'<img class="masthead-logo" data-masthead-source="locked-pbt-artwork" '
            f'src="data:{mime};base64,{data}" alt="The Palm Beach Times masthead">')

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("image",type=Path); ap.add_argument("-o","--output",type=Path); ap.add_argument("--optimize-lossless",action="store_true"); a=ap.parse_args()
    out=render(a.image, a.optimize_lossless)
    a.output.write_text(out) if a.output else print(out)
if __name__=="__main__": main()
