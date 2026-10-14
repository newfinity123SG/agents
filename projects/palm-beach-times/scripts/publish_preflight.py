#!/usr/bin/env python3
"""Strict edition, exact UTF-8 digest and bounded MCP transport preflight."""
import argparse, hashlib, json, re
from pathlib import Path
from datetime import date
from validate_edition import validate
from read_publish_payload import chunks, manifest

def main():
    p=argparse.ArgumentParser(); p.add_argument('html_file',type=Path)
    p.add_argument('--chunk-size',type=int,default=24000)
    p.add_argument('--transport',choices=('chunked','inline'),default='chunked')
    p.add_argument('--date',required=True,help='Expected America/New_York edition date')
    p.add_argument('--max-bytes',type=int,help='Lower local ceiling; cannot exceed Publisher limit')
    a=p.parse_args(); date.fromisoformat(a.date)
    default_ceiling=12000000 if a.transport=='chunked' else 2500000
    ceiling=a.max_bytes if a.max_bytes is not None else (12000000 if a.transport=='chunked' else 2500000)
    if not 0<ceiling<=default_ceiling: p.error('max-bytes cannot exceed selected transport ceiling')
    raw=a.html_file.read_bytes(); html=raw.decode('utf-8',errors='strict'); errors=validate(html)
    if not re.search(r'\bdata-edition-date=["\']'+re.escape(a.date)+r'["\']',html):
        errors.append('Missing or incorrect data-edition-date; refuse stale edition')
    if not re.search(r'\bdata-joke-date=["\']'+re.escape(a.date)+r'["\']',html):
        errors.append('Joke edition date mismatch')
    if not html.lstrip().lower().startswith('<!doctype html>') or not html.rstrip().lower().endswith('</html>'):
        errors.append('Incomplete HTML document boundaries')
    parts=chunks(html,a.chunk_size); result=manifest(raw,html,parts,a.chunk_size)
    status='PASS'
    if errors: status='FAIL_VALIDATION'
    elif len(raw)>ceiling: status='FAIL_PAYLOAD_SIZE' if a.transport=='chunked' else 'FAIL_INLINE_PAYLOAD_SIZE'
    elif a.transport=='chunked' and not 1<=len(parts)<=400: status='FAIL_CHUNK_COUNT'
    result.update(status=status,date=a.date,transport=a.transport,max_bytes=ceiling,errors=errors)
    print(json.dumps(result,indent=2)); return 0 if status=='PASS' else 1

if __name__=='__main__': raise SystemExit(main())
