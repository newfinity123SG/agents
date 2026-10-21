#!/usr/bin/env python3
"""Recover the original locked masthead from an approved, saved HTML edition.

Read-only input; exact base64-decode; never re-encode or redraw the image.
"""
import argparse
import base64
import hashlib
from html.parser import HTMLParser
from pathlib import Path
import struct

class MastheadParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources=[]
    def handle_starttag(self, tag, attrs):
        if tag.lower() != "img":
            return
        d=dict(attrs)
        if d.get("data-masthead-source")=="locked-pbt-artwork":
            self.sources.append(d.get("src",""))

def recover(html):
    parser=MastheadParser()
    parser.feed(html)
    if len(parser.sources)!=1:
        raise ValueError(f"Expected exactly one locked masthead, found {len(parser.sources)}")
    prefix="data:image/png;base64,"
    source=parser.sources[0]
    if not source.startswith(prefix):
        raise ValueError("Locked masthead is not embedded as PNG")
    raw=base64.b64decode(source[len(prefix):], validate=True)
    if raw[:8]!=b"\x89PNG\r\n\x1a\n" or raw[12:16]!=b"IHDR":
        raise ValueError("Invalid PNG signature")
    width,height=struct.unpack(">II",raw[16:24])
    if width < 600 or height < 150:
        raise ValueError("Unexpectedly small locked masthead")
    if raw[25] not in (4,6):
        raise ValueError("Locked masthead lacks alpha channel")
    return raw,{"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw),"width":width,"height":height}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--edition",type=Path,required=True)
    p.add_argument("--output",type=Path,required=True)
    a=p.parse_args()
    raw,manifest=recover(a.edition.read_text(encoding="utf-8"))
    if a.output.exists():
        raise ValueError("Output exists; refusing to overwrite an asset")
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_bytes(raw)
    import json
    print(json.dumps({"file":str(a.output),**manifest},indent=2))

if __name__=="__main__":
    main()
