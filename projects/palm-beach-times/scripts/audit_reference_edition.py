#!/usr/bin/env python3
"""Inspect a saved newspaper reference without altering it or publishing anything."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re

class Inspector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sections=[]
        self.images=[]
        self.attrs=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=="section" and a.get("id"):self.sections.append(a["id"])
        if tag=="img":self.images.append({"locked_masthead":a.get("data-masthead-source")=="locked-pbt-artwork","generated_comic":a.get("data-comic-source")=="generated-image","embedded_png":a.get("src","").startswith("data:image/png;base64,")})
        if "data-edition-date" in a:self.attrs.append({"edition_date":a["data-edition-date"]})
        if "data-joke-date" in a:self.attrs.append({"joke_date":a["data-joke-date"]})

def audit(raw:bytes):
    text=raw.decode("utf-8","strict")
    parser=Inspector(); parser.feed(text)
    return {
      "sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw),
      "layout_v6":'data-layout="pbt-broadsheet-v6"' in text,
      "build_v6":'data-skill-build="pbt-v6.0"' in text,
      "edition_date_stamps":[x["edition_date"] for x in parser.attrs if "edition_date" in x],
      "joke_date_stamps":[x["joke_date"] for x in parser.attrs if "joke_date" in x],
      "sections":parser.sections,"embedded_png_count":sum(x["embedded_png"] for x in parser.images),
      "locked_masthead_count":sum(x["locked_masthead"] for x in parser.images),
      "generated_comic_images":sum(x["generated_comic"] for x in parser.images),
      "is_publish_ready":False,
      "note":"Read-only reference audit; a saved browser HTML copy must never bypass strict preflight."
    }
def main():
    p=argparse.ArgumentParser();p.add_argument("html_file",type=Path)
    args=p.parse_args()
    print(json.dumps(audit(args.html_file.read_bytes()),indent=2))
if __name__=="__main__":main()
