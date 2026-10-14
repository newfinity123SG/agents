#!/usr/bin/env python3
"""Strict pre-publish validation for Palm Beach Times HTML editions."""
from __future__ import annotations
import argparse, re
from html import unescape
from pathlib import Path
REQUIRED_MARKETS=(("S&P 500","S&amp;P 500"),("Dow",),("Nasdaq",))

class SectionMatch:
    def __init__(self,text,start,content_start,content_end,end):
        self.text=text; self.a=start; self.b=end; self.c=content_start; self.d=content_end
    def group(self,index): return self.text[self.c:self.d] if index==1 else self.text[self.a:self.b]
    def start(self): return self.a
    def end(self): return self.b

def find_section(text, section_id):
    """Match the enclosing desk, including nested market-chart sections."""
    start=re.search(r'<section\b[^>]*\bid=["\']'+re.escape(section_id)+r'["\'][^>]*>',text,re.I)
    if not start: return None
    depth=1
    for tag in re.finditer(r'<(/?)section\b[^>]*>',text[start.end():],re.I):
        depth += -1 if tag.group(1) else 1
        if depth==0:
            return SectionMatch(text,start.start(),start.end(),start.end()+tag.start(),start.end()+tag.end())
    return None

def validate(text:str):
    errors=[]
    placeholders=sorted(set(re.findall(r"\{\{[A-Z0-9_]+\}\}",text)))
    if placeholders: errors.append("Unresolved placeholders: "+", ".join(placeholders))
    if 'data-layout="pbt-broadsheet-v6"' not in text: errors.append("Edition is not using the Palm Beach Times v6 broadsheet template.")
    if 'data-skill-build="pbt-v6.0"' not in text: errors.append("Edition is missing the pbt-v6.0 build stamp; stale template/runtime suspected.")
    if 'class="market-glance"' not in text: errors.append("Missing Markets at a Glance block.")
    if 'data-market-period="1d"' not in text or 'class="market-glance-period">1 Day' not in text:
        errors.append("Market charts must show the 1-day intraday period, not a one-year view.")
    if re.search(r'one-year price chart|>1 Year<|\b1Y [+-]',text,re.I):
        errors.append("Stale one-year market chart label remains.")
    if 'data-market-style="raw-intraday-volume"' not in text:
        errors.append("Market charts must use the dense raw intraday price-and-volume style.")
    if not re.search(r'Session \d{4}-\d{2}-\d{2} · As of ',text):
        errors.append("Market charts must show the actual trading session date and data timestamp.")
    for labels in REQUIRED_MARKETS:
        if not any(x in text for x in labels): errors.append(f"Missing required market chart: {labels[0]}.")
    if len(re.findall(r'class="market-chart"',text))<3: errors.append("Markets at a Glance must contain three rich chart SVGs.")
    if len(re.findall(r'class="market-area"',text))<3 or len(re.findall(r'class="market-line"',text))<3: errors.append("Market charts must include filled areas and strong line series.")
    point_counts=[int(x) for x in re.findall(r'data-point-count="(\d+)"',text)]
    if len(point_counts)<3 or any(x<48 for x in point_counts[:3]): errors.append("Each market chart must contain at least 48 raw intraday observations.")
    if len(re.findall(r'class="market-volume-panel"',text))<3 or len(re.findall(r'class="market-volume-bar"',text))<144:
        errors.append("Each market chart must include the actual intraday volume histogram.")
    if len(re.findall(r'class="market-reference-line"',text))<3:
        errors.append("Each market chart must include a previous-close reference line.")
    changes=re.findall(r'<span class="market-change [^"]+"[^>]*>([^<]+)</span>',text)
    if len(changes)<3 or any('%' in x or not re.search(r'[▲▼→]\s+(?:[+-])?[\d,]+\.\d{2}$',x.strip()) for x in changes[:3]):
        errors.append("Market rows must show absolute point change with a directional arrow, never percentage change.")
    money=find_section(text, 'money')
    if not money or 'class="market-glance"' not in money.group(1): errors.append("Markets at a Glance must be inside the Money desk.")

    drivers=re.search(r'<aside\b[^>]*\bid="market-drivers"[^>]*>(.*?)</aside>',text,re.I|re.S)
    if not drivers:
        errors.append("Missing required Market Drivers ledger below the index charts.")
    else:
        if not money or drivers.start()<money.start() or drivers.end()>money.end():
            errors.append("Market Drivers must be inside the Money desk.")
        elif money.group(1).find('id="market-drivers"')<money.group(1).rfind('class="market-chart"'):
            errors.append("Market Drivers must follow all three index charts.")
        if not re.search(r'<h3\b[^>]*>\s*Market Drivers\s*</h3>',drivers.group(1),re.I):
            errors.append("Market Drivers must have its visible heading.")
        for key in ("wti","treasury10y","treasury2y","freddie30y","dxy","gold","vix","bitcoin"):
            if len(re.findall(rf'data-driver="{key}"',drivers.group(1)))!=1:
                errors.append(f"Market Drivers must include exactly one {key} reading or explicit unavailable row.")
        if 'class="driver-catalyst"' not in drivers.group(1):
            errors.append("Market Drivers must include the Next catalyst line or explicit unavailable note.")

    for section_id, heading in (("weather-ocean", "Weather & Ocean ☀️ 🌊"), ("money", "Money 💵 📈"), ("technology", "AI & Technology")):
        section=find_section(text, section_id)
        headings=re.findall(r'<h2\b[^>]*>(.*?)</h2>',section.group(1),re.I|re.S) if section else []
        visible=[" ".join(unescape(re.sub(r'<[^>]+>','',h)).split()) for h in headings]
        if heading not in visible:
            errors.append(f"Missing required section subheader: {heading}.")

    weather=re.search(r'<section\b[^>]*\bid="weather-ocean"[^>]*>(.*?)</section>',text,re.I|re.S)
    joke=re.search(r'<aside\b[^>]*\bid="daily-joke"[^>]*>(.*?)</aside>',text,re.I|re.S)
    if not joke:
        errors.append("Missing required Joke of the Day below Weather & Ocean.")
    else:
        if not weather or joke.start()<weather.start() or joke.end()>weather.end():
            errors.append("Joke of the Day must be inside the Weather & Ocean column above Development & Deals.")
        if not re.search(r'data-joke-date="\d{4}-\d{2}-\d{2}"',joke.group(0)):
            errors.append("Joke of the Day must record its edition date.")
        if not re.search(r'<h3\b[^>]*>Joke of the Day\s*😂\s*🤣\s*<span\b[^>]*>18\+</span>',joke.group(1),re.I):
            errors.append("Joke of the Day must have its visible heading and 18+ label.")
        paragraphs=re.findall(r'<p\b[^>]*>(.*?)</p>',joke.group(1),re.I|re.S)
        if not any(re.sub(r'<[^>]+>','',p).strip() for p in paragraphs):
            errors.append("Joke of the Day must contain visible joke text.")

    comic=re.search(r'<section\s+class="feature"\s+id="comic"[^>]*>(.*?)</section>',text,re.I|re.S)
    if not comic: errors.append("Missing comic section.")
    else:
        c=comic.group(1)
        if 'data-comic-source="generated-image"' not in c: errors.append("Comic must be marked as a generated-image asset.")
        m=re.search(r'<img\b[^>]*class=["\'][^"\']*comic-image[^"\']*["\'][^>]*src=["\']data:image/(png);base64,([^"\']+)["\']',c,re.I|re.S)
        if not m: errors.append("Comic must be an embedded generated PNG data URI; inline SVG fallback is not publishable.")
        elif len(re.sub(r"\s+","",m.group(2)))<10000: errors.append("Embedded comic payload is too small and likely a placeholder.")
        if re.search(r'<svg\b',c,re.I): errors.append("Comic section may not use inline SVG fallback in production.")
        if 'class="comic-frame"' not in c: errors.append("Comic must use the locked comic-frame wrapper for reliable wide-strip rendering.")
    required_local = (
        ("local", "Around Town"),
        ("development", "Development & Deals"),
        ("local-news", "Palm Beach County & South Florida News"),
        ("community-issues", "Community Issues"),
    )
    for section_id, label in required_local:
        if not re.search(rf'<section\s+class="desk"\s+id="{re.escape(section_id)}"[^>]*>', text, re.I):
            errors.append(f"Missing required visible local section: {label}.")
    if 'data-masthead="pbt-exact-graphical-v1"' not in text:
        errors.append("Edition is missing the locked Palm Beach Times graphical masthead container.")
    masthead = re.search(r'<div\s+class="nameplate"[^>]*data-masthead="pbt-exact-graphical-v1"[^>]*>(.*?)</div>', text, re.I|re.S)
    if not masthead:
        errors.append("Locked masthead container is incomplete.")
    else:
        mh=masthead.group(1)
        if 'data-masthead-source="locked-pbt-artwork"' not in mh:
            errors.append("Edition is not using the locked Palm Beach Times artwork.")
        m=re.search(r'<img\b[^>]*class=["\'][^"\']*masthead-logo[^"\']*["\'][^>]*src=["\']data:image/(png);base64,([^"\']+)["\']',mh,re.I|re.S)
        if not m:
            errors.append("Masthead must be embedded as the self-contained transparent PNG data URI.")
        elif len(re.sub(r"\s+","",m.group(2)))<100000:
            errors.append("Embedded masthead payload is too small; expected the locked high-resolution artwork.")
        if 'background:transparent' not in text or 'width:min(1320px,100%)' not in text:
            errors.append("Masthead template must preserve transparent artwork directly on the newspaper stock at the locked production width.")
    if re.search(r'<section\s+class="feature"\s+id="celebrity"', text, re.I):
        errors.append("Legacy standalone Celebrity & Entertainment tile is still present; use Screen Guide instead.")
    if not re.search(r'<section\s+class="feature"\s+id="screen-guide"[^>]*>', text, re.I):
        errors.append("Missing required Screen Guide: TV, Streaming & Movies section.")
    openings=re.search(r'<section\b[^>]*\bid="restaurant-openings"[^>]*>(.*?)</section>', text, re.I|re.S)
    if not openings:
        errors.append("Missing required Restaurant Openings section below Morning Strip.")
    else:
        content=openings.group(1)
        if not re.search(r'<h2\b[^>]*>\s*Restaurant Openings\s*</h2>',content,re.I):
            errors.append("Restaurant Openings must have its visible section heading.")
        if not re.search(r'No new restaurant openings verified for this edition\.',content,re.I):
            if not re.search(r'<a\b[^>]*href=["\']https?://',content,re.I):
                errors.append("Restaurant opening items must include source links or an explicit no-new-openings note.")
        screen=re.search(r'<section\b[^>]*\bid="screen-guide"',text,re.I)
        if not comic or openings.start()<comic.end() or (screen and openings.end()>screen.start()):
            errors.append("Restaurant Openings must follow Morning Strip and precede Screen Guide in reading order.")
    if "UnifrakturCook" in text or "Old English Text MT" in text or "Goudy Text MT" in text: errors.append("Legacy blackletter masthead font is still present.")
    return errors

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("html_file",type=Path); a=ap.parse_args(); errors=validate(a.html_file.read_text())
    if errors:
        for e in errors: print("ERROR:",e)
        raise SystemExit(1)
    print("PASS: pbt-v6.0 graphical masthead, expanded local desks, Restaurant Openings, Screen Guide, raw intraday price-and-volume charts, generated-image comic, and build stamp are publish-ready.")
if __name__=="__main__": main()
