#!/usr/bin/env python3
"""Convert a generated comic PNG/JPEG/WebP into the required self-contained COMIC_TILE fragment."""
from __future__ import annotations
import argparse, base64, html, mimetypes, struct
from pathlib import Path

def render(path: Path, title: str, caption: str, alt: str) -> str:
    mime,_=mimetypes.guess_type(path.name)
    if mime != "image/png": raise ValueError("Palm Beach Times comic must be generated as PNG")
    raw=path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[12:16] != b"IHDR": raise ValueError("Comic file is not a valid PNG")
    width,height=struct.unpack(">II", raw[16:24])
    if width < 900 or height < 240: raise ValueError("Comic image is too small for the newspaper strip")
    ratio=width/height
    if not 2.4 <= ratio <= 3.8: raise ValueError(f"Comic must be a wide strip; got aspect ratio {ratio:.2f}:1")
    data=base64.b64encode(raw).decode("ascii")
    if len(data)<10000: raise ValueError("Comic image is unexpectedly small; refuse placeholder/empty art")
    uri=f"data:{mime};base64,{data}"
    return (f'<h2>The Morning Strip</h2><div class="comic-wrap" data-comic-source="generated-image">'
            f'<div class="comic-frame"><img class="comic-image" src="{uri}" alt="{html.escape(alt,quote=True)}"></div>'
            f'</div><p class="caption"><strong>{html.escape(title)}</strong> · {html.escape(caption)}</p>')

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("image",type=Path); ap.add_argument("--title",required=True); ap.add_argument("--caption",default="Original artwork for this edition."); ap.add_argument("--alt",required=True); ap.add_argument("-o","--output",type=Path); a=ap.parse_args()
    text=render(a.image,a.title,a.caption,a.alt)
    a.output.write_text(text) if a.output else print(text)
if __name__=="__main__": main()
