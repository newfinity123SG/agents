"""Fail-closed, portable edition recovery checkpoint.

A checkpoint is a manifest only. It is NOT durable storage or proof that files
exist after a scheduled runtime restart. Verify each local artifact before reuse.
"""
import hashlib
import json
from datetime import date
from pathlib import Path

REQUIRED=("html","comic","market_input","masthead")
def file_record(path):
    p=Path(path)
    b=p.read_bytes()
    if not b: raise ValueError("Empty artifact")
    return {"filename":p.name,"sha256":hashlib.sha256(b).hexdigest(),"bytes":len(b)}

def create_checkpoint(edition_date, paths, uploaded_chunks=0, upload_id=None):
    if date.fromisoformat(edition_date).isoformat()!=edition_date:
        raise ValueError("Noncanonical edition date")
    if not all(key in paths for key in REQUIRED):
        raise ValueError("Missing required artifact keys")
    records={name:file_record(paths[name]) for name in REQUIRED}
    if not isinstance(uploaded_chunks,int) or isinstance(uploaded_chunks,bool) or uploaded_chunks<0:
        raise ValueError("Invalid uploaded chunk count")
    if upload_id is not None and not isinstance(upload_id,str):
        raise ValueError("Invalid upload identifier")
    return {"schema":"pbt-edition-checkpoint-v1","editionDate":edition_date,
            "artifacts":records,"uploadId":upload_id,"acknowledgedChunks":uploaded_chunks,
            "storageVerified":False}

def verify_checkpoint(checkpoint, paths, expected_date):
    if checkpoint.get("schema")!="pbt-edition-checkpoint-v1" or checkpoint.get("editionDate")!=expected_date:
        raise ValueError("Wrong edition checkpoint")
    records=checkpoint.get("artifacts")
    if not isinstance(records,dict):raise ValueError("Missing artifact manifest")
    for name in REQUIRED:
        if name not in records or name not in paths:
            raise ValueError("Missing required recovery artifact: "+name)
        actual=file_record(paths[name])
        if actual!=records[name]:
            raise ValueError("Recovery artifact mismatch: "+name)
    return True

def write_checkpoint(checkpoint, target):
    path=Path(target)
    if path.exists(): raise ValueError("Refusing checkpoint overwrite")
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(checkpoint,sort_keys=True,indent=2)+"\n",encoding="utf-8")
    return path
