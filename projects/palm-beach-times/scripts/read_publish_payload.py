#!/usr/bin/env python3
"""Byte-preserving UTF-8 file-to-runtime bridge; chunks bounded in UTF-16 units."""
import argparse, hashlib, json
from pathlib import Path

def units(text):
    return len(text.encode('utf-16-le')) // 2

def chunks(html, limit=24000):
    if not 2<=limit<=24000: raise ValueError("chunk size must be 2..24000 UTF-16 units")
    result=[]; start=0
    while start<len(html):
        stop=min(len(html),start+limit)
        if units(html[start:stop])>limit:
            low=start; high=stop
            while low<high:
                mid=(low+high+1)//2
                if units(html[start:mid])<=limit: low=mid
                else: high=mid-1
            stop=low
        result.append(html[start:stop]); start=stop
    return result

def manifest(raw,html,parts,limit=24000):
    return {'html_bytes':len(raw),'html_characters':len(html),'javascript_characters':units(html),
            'sha256':hashlib.sha256(raw).hexdigest(),'total':len(parts),'max_chunk_characters':limit}

def main():
    p=argparse.ArgumentParser(); p.add_argument('html_file',type=Path)
    p.add_argument('--chunk-size',type=int,default=24000); p.add_argument('--count',type=int,default=1); p.add_argument('--index',type=int); p.add_argument('--offset',type=int)
    p.add_argument('--length',type=int,default=12000)
    a=p.parse_args(); raw=a.html_file.read_bytes(); html=raw.decode('utf-8',errors='strict')
    if html.encode('utf-8')!=raw: p.error('UTF-8 roundtrip mismatch')
    parts=chunks(html,a.chunk_size); result=manifest(raw,html,parts,a.chunk_size)
    if a.index is not None:
        if a.offset is not None or not 0<=a.index<len(parts): p.error('Invalid chunk index')
        if not 1<=a.count<=4: p.error('Batch count must be 1..4')
        if a.count==1:
            part=parts[a.index]
            result.update(index=a.index,characters=len(part),chunk_characters=units(part),html=part)
        else:
            result.update(parts=[{'index':i,'characters':len(parts[i]),'chunk_characters':units(parts[i]),'html':parts[i]} for i in range(a.index,min(len(parts),a.index+a.count))])
    elif a.offset is not None:
        # Legacy bridge compatibility, bounded to 24,000 JS units even for astral characters.
        if not 0<=a.offset<len(html) or not 0<a.length<=12000: p.error('Invalid legacy offset/length (max 12000)')
        if a.count!=1 or a.chunk_size!=24000: p.error('Legacy offsets require default chunk size and count=1')
        part=html[a.offset:a.offset+a.length]
        result.update(offset=a.offset,characters=len(part),chunk_characters=units(part),html=part)
    print(json.dumps(result,ensure_ascii=True))

if __name__=='__main__': main()
