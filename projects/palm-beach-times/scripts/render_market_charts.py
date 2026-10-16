#!/usr/bin/env python3
"""Render the Palm Beach Times rich Markets at a Glance HTML fragment."""
from __future__ import annotations
import argparse, html, json, math
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

COLORS={"sp500":"#00A86B","dow":"#0077FF","nasdaq":"#D400FF"}
ORDER=("sp500","dow","nasdaq")
LABELS={"sp500":"S&P 500","dow":"Dow","nasdaq":"Nasdaq"}

def num(v):
    if isinstance(v,bool) or not isinstance(v,(int,float)): raise ValueError(f"Non-numeric market value: {v!r}")
    value=float(v)
    if not math.isfinite(value): raise ValueError(f"Non-finite market value: {v!r}")
    return value

def series(points, session):
    values=[]; volumes=[]; previous_time=None
    for p in points:
        if not isinstance(p,dict) or not p.get("time"):
            raise ValueError("Every intraday observation needs a time, value and volume.")
        timestamp=datetime.fromisoformat(str(p["time"]).replace("Z","+00:00"))
        if timestamp.tzinfo is None: raise ValueError("Intraday times must include a UTC offset.")
        if timestamp.astimezone(ZoneInfo("America/New_York")).date().isoformat()!=session:
            raise ValueError("Chart observations must belong to session_date in America/New_York.")
        if previous_time is not None and timestamp<=previous_time:
            raise ValueError("Intraday observations must be in chronological order.")
        previous_time=timestamp
        values.append(num(p.get("value")))
        volume=num(p.get("volume"))
        if volume < 0: raise ValueError("Intraday volume cannot be negative.")
        volumes.append(volume)
    if len(values)<48:
        raise ValueError("Each index requires at least 48 raw price-and-volume observations from one trading session.")
    if not any(v>0 for v in volumes):
        raise ValueError("Each index requires real positive volume observations; identify an aligned ETF proxy in the source when index-native volume is unavailable.")
    return values,volumes

def coords(values,baseline,w=420,left=34,right=8,top=6,bottom=82):
    lo,hi=min(min(values),baseline),max(max(values),baseline); span=(hi-lo) or 1.0
    pad=span*.06; lo-=pad; hi+=pad; span=hi-lo
    uw=w-left-right; uh=bottom-top; last=len(values)-1
    return [(left+uw*i/last, top+uh*(1-(v-lo)/span)) for i,v in enumerate(values)],lo,hi

def path(points): return " ".join(("M" if i==0 else "L")+f"{x:.2f},{y:.2f}" for i,(x,y) in enumerate(points))
def area(points,base=82):
    return f"M{points[0][0]:.2f},{base:.2f} "+" ".join("L"+f"{x:.2f},{y:.2f}" for x,y in points)+f" L{points[-1][0]:.2f},{base:.2f} Z"
def volume_bars(volumes,w=420,left=34,right=8,top=92,bottom=118):
    high=max(volumes) or 1.0; usable=w-left-right; step=usable/len(volumes); bar=max(1.0,step*.72)
    out=[]
    for i,v in enumerate(volumes):
        height=(bottom-top)*(v/high)
        x=left+i*step+(step-bar)/2
        out.append(f'<rect class="market-volume-bar" x="{x:.2f}" y="{bottom-height:.2f}" width="{bar:.2f}" height="{height:.2f}"/>')
    return "".join(out)
def level(v): return f"{num(v):,.2f}" if abs(num(v))<100000 else f"{num(v):,.0f}"
def short(v): return f"{v/1000:.0f}k" if abs(v)>=10000 else f"{v:,.0f}"
def day_change(vs, previous_close):
    if previous_close is None: raise ValueError("Each index requires previous_close for the daily point change.")
    baseline=num(previous_close)
    if baseline <= 0: raise ValueError("The previous close must be positive.")
    change=vs[-1]-baseline
    if change>0: return f"▲ +{change:,.2f}","market-up","up"
    if change<0: return f"▼ {change:,.2f}","market-down","down"
    return "→ 0.00","market-flat","flat"

def render(payload):
    session=str(payload.get("session_date") or "")
    try: date.fromisoformat(session)
    except ValueError: raise ValueError("Provide session_date as YYYY-MM-DD for the actual trading session.")
    as_of=str(payload.get("as_of") or "").strip()
    source=str(payload.get("source") or "").strip()
    if not as_of or not source: raise ValueError("Provide the market data as_of timestamp and source.")
    by={r.get("key"):r for r in payload.get("indices") or []}
    missing=[k for k in ORDER if k not in by]
    if missing: raise ValueError("Missing required indexes: "+", ".join(missing))
    out=['<section class="market-glance" data-market-period="1d" data-market-style="raw-intraday-volume" aria-label="Markets at a Glance, one-day raw intraday index charts with volume">',
         '<div class="market-glance-head"><span class="market-glance-title">Markets at a Glance</span><span class="market-glance-period">1 Day</span></div>']
    for key in ORDER:
        row=by[key]; v,volumes=series(row.get("points") or [],session); baseline=num(row.get("previous_close")); pts,lo,hi=coords(v,baseline); mid=(lo+hi)/2
        label=html.escape(str(row.get("label") or LABELS[key])); latest=row.get("latest",v[-1]); color=COLORS[key]
        if abs(num(latest)-v[-1])>max(0.01,abs(v[-1])*0.0001): raise ValueError(f"{label}: latest value does not match the last chart point.")
        change_text,change_class,direction=day_change(v,baseline)
        ref_y=6+(82-6)*(1-(baseline-lo)/(hi-lo))
        out += [f'<div class="market-row" data-index="{key}" data-direction="{direction}" data-point-count="{len(v)}" style="--market-color:{color}">',
                '<div class="market-meta">',f'<span class="market-name">{label}</span>',f'<span class="market-level">{level(latest)}</span>',f'<span class="market-change {change_class}" aria-label="Daily point change {html.escape(change_text)}">{change_text}</span>','</div>',
                f'<svg class="market-chart" viewBox="0 0 420 122" role="img" aria-label="{label} raw intraday price and volume chart for {session}">',
                '<line class="market-grid" x1="34" y1="6" x2="412" y2="6"/><line class="market-grid" x1="34" y1="44" x2="412" y2="44"/><line class="market-grid" x1="34" y1="82" x2="412" y2="82"/>',
                '<line class="market-grid" x1="128" y1="6" x2="128" y2="82"/><line class="market-grid" x1="223" y1="6" x2="223" y2="82"/><line class="market-grid" x1="317" y1="6" x2="317" y2="82"/>',
                f'<text class="market-axis-label" x="0" y="10">{short(hi)}</text><text class="market-axis-label" x="0" y="47">{short(mid)}</text><text class="market-axis-label" x="0" y="84">{short(lo)}</text>',
                f'<line class="market-reference-line" x1="34" y1="{ref_y:.2f}" x2="412" y2="{ref_y:.2f}"/><text class="market-reference-label" x="410" y="{max(8,ref_y-3):.2f}" text-anchor="end">Prev close</text>',
                f'<path class="market-area" d="{area(pts)}"/><path class="market-line" d="{path(pts)}"/>',
                f'<circle class="market-end" cx="{pts[-1][0]:.2f}" cy="{pts[-1][1]:.2f}" r="4"/>',
                '<g class="market-volume-panel" aria-label="Intraday volume"><line class="market-volume-divider" x1="34" y1="90" x2="412" y2="90"/>',volume_bars(volumes),'</g>','</svg>','</div>']
    out += [f'<small class="market-source">Session {session} · As of {html.escape(as_of)} · {html.escape(source)}</small>','</section>']
    return "\n".join(out)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("input_json",type=Path); ap.add_argument("-o","--output",type=Path); a=ap.parse_args()
    rendered=render(json.loads(a.input_json.read_text()))
    a.output.write_text(rendered) if a.output else print(rendered)
if __name__=="__main__": main()
