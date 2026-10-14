#!/usr/bin/env python3
"""Compare reference and candidate newspaper HTML without modifying or publishing.

Checks immutable masthead bytes, CSS, layout identifiers and section ordering.
A visual screenshot review is still required; this is NOT pixel comparison.
"""
import argparse
import base64
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys

class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sections=[]
        self.mastheads=[]
    def handle_starttag(self, tag, attrs):
        attr=dict(attrs)
        if tag=="section" and attr.get("id"):
            self.sections.append(attr["id"])
        if tag=="img" and attr.get("data-masthead-source")=="locked-pbt-artwork":
            src=attr.get("src","")
            if not src.startswith("data:image/png;base64,"):
                raise ValueError("Masthead is not embedded PNG")
            self.mastheads.append(hashlib.sha256(base64.b64decode(src.split(",",1)[1],validate=True)).hexdigest())

def extract_css(text):
    return re.findall(r"<style\b[^>]*>(.*?)</style\s*>",text,flags=re.I|re.S)

def compare(reference:bytes,candidate:bytes):
    ref=reference.decode("utf-8","strict"); cand=candidate.decode("utf-8","strict")
    a=Document();a.feed(ref)
    b=Document();b.feed(cand)
    differences=[]
    for marker in ['data-layout="pbt-broadsheet-v6"','data-skill-build="pbt-v6.0"']:
        if marker not in cand: differences.append("Missing v6 marker: "+marker)
    if len(a.mastheads)!=1 or len(b.mastheads)!=1: differences.append("Missing or duplicated locked masthead")
    elif a.mastheads[0]!=b.mastheads[0]: differences.append("Locked masthead bytes changed")
    if extract_css(ref)!=extract_css(cand): differences.append("Inline stylesheet changed")
    if a.sections!=b.sections: differences.append("Section order or IDs changed")
    return {"passed":not differences,"differences":differences,
            "reference_sha256":hashlib.sha256(reference).hexdigest(),
            "candidate_sha256":hashlib.sha256(candidate).hexdigest(),
            "section_count":len(a.sections),
            "masthead_sha256":a.mastheads[0] if len(a.mastheads)==1 else None}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--reference",type=Path,required=True)
    p.add_argument("--candidate",type=Path,required=True)
    a=p.parse_args()
    result=compare(a.reference.read_bytes(),a.candidate.read_bytes())
    print(json.dumps(result,indent=2))
    return 0 if result["passed"] else 1
if __name__=="__main__":
    sys.exit(main())
