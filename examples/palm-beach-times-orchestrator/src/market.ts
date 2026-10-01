const INDEXES = [
  { key: "sp500", label: "S&P 500", symbol: "^GSPC", proxy: "SPY", color: "#00A86B" },
  { key: "dow", label: "Dow", symbol: "^DJI", proxy: "DIA", color: "#0077FF" },
  { key: "nasdaq", label: "Nasdaq", symbol: "^IXIC", proxy: "QQQ", color: "#D400FF" },
] as const;

function esc(v: unknown) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nyDate(ts: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts * 1000));
}

function nyTime(ts: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(ts * 1000));
}

function nyNowParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

async function chart(symbol: string) {
  const nowSec = Math.floor(Date.now() / 1000);
  const period1 = nowSec - 6 * 24 * 60 * 60;
  const period2 = nowSec + 60;
  const nonce = Date.now();

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1m&period1=${period1}&period2=${period2}&includePrePost=false&events=div%2Csplits&_=${nonce}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "PalmBeachTimes/1.0",
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });

  if (!response.ok) throw new Error(`market_http_${response.status}_${symbol}`);

  const body: any = await response.json();
  const result = body?.chart?.result?.[0];
  if (!result) throw new Error(`market_empty_${symbol}`);
  return result;
}

function rows(result: any) {
  const ts = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const close = quote?.close ?? [];
  const volume = quote?.volume ?? [];

  return ts
    .map((timestamp: number, i: number) => ({
      timestamp,
      date: nyDate(timestamp),
      value: close[i],
      volume: volume[i],
    }))
    .filter((x: any) => typeof x.value === "number" && Number.isFinite(x.value));
}

function latestAlignedSession(indexRows: any[], proxyRows: any[]) {
  const dates = [...new Set(indexRows.map((x) => x.date))].sort().reverse();

  for (const date of dates) {
    const i = indexRows.filter((x) => x.date === date);
    const p = proxyRows.filter((x) => x.date === date);
    const pMap = new Map(p.map((x) => [x.timestamp, x]));

    const aligned = i
      .map((x) => {
        const proxy: any = pMap.get(x.timestamp);
        return proxy?.volume > 0 ? { ...x, volume: proxy.volume } : null;
      })
      .filter(Boolean);

    if (aligned.length >= 48) return { date, points: aligned };
  }

  throw new Error("market_no_aligned_session");
}

function validateFreshness(sessionDate: string, latestTimestamp: number) {
  const now = new Date();
  const ny = nyNowParts(now);
  const isWeekday = !["Sat", "Sun"].includes(ny.weekday);
  const minutes = ny.hour * 60 + ny.minute;
  const afterEnoughBars = minutes >= 10 * 60 + 18;
  const marketWindow = isWeekday && minutes >= 9 * 60 + 30 && minutes <= 16 * 60 + 20;
  const shortlyAfterClose = isWeekday && minutes > 16 * 60 + 20 && minutes <= 20 * 60;

  if ((marketWindow && afterEnoughBars) || shortlyAfterClose) {
    if (sessionDate !== ny.date) {
      throw new Error(`market_stale_session_${sessionDate}_expected_${ny.date}`);
    }

    const ageMinutes = Math.floor((Date.now() - latestTimestamp * 1000) / 60000);
    const maxAge = marketWindow ? 15 : 240;

    if (ageMinutes > maxAge) {
      throw new Error(`market_stale_quote_${ageMinutes}m`);
    }
  }
}

function renderRow(item: any) {
  const { key, label, color, previousClose, points } = item;
  const w = 420, left = 34, right = 8, top = 6, bottom = 82;
  const vals = points.map((p: any) => p.value);
  let lo = Math.min(previousClose, ...vals), hi = Math.max(previousClose, ...vals);
  let span = hi - lo || 1;
  const pad = span * 0.06;
  lo -= pad; hi += pad; span = hi - lo || 1;

  const uw = w - left - right, uh = bottom - top;
  const coords = vals.map((v: number, i: number) => ({
    x: left + uw * i / Math.max(1, vals.length - 1),
    y: top + uh * (1 - (v - lo) / span),
  }));

  const line = coords
    .map((p: any, i: number) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

  const area =
    `M${coords[0].x.toFixed(2)},82 ` +
    coords.map((p: any) => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ") +
    ` L${coords.at(-1).x.toFixed(2)},82 Z`;

  const maxVol = Math.max(...points.map((p: any) => p.volume), 1);
  const step = uw / points.length;
  const bw = Math.max(.6, step * .72);

  const bars = points.map((p: any, i: number) => {
    const h = 26 * p.volume / maxVol;
    return `<rect class="market-volume-bar" x="${(left + i * step + (step - bw)/2).toFixed(2)}" y="${(118-h).toFixed(2)}" width="${bw.toFixed(2)}" height="${h.toFixed(2)}"/>`;
  }).join("");

  const refY = top + uh * (1 - (previousClose - lo) / span);
  const latest = vals.at(-1);
  const change = latest - previousClose;
  const changeText = change > 0 ? `▲ +${change.toFixed(2)}` : change < 0 ? `▼ ${change.toFixed(2)}` : "→ 0.00";
  const changeClass = change > 0 ? "market-up" : change < 0 ? "market-down" : "market-flat";

  return `<div class="market-row" data-index="${key}" data-point-count="${points.length}" style="--market-color:${color}">
    <div class="market-meta">
      <span class="market-name">${esc(label)}</span>
      <span class="market-level">${latest.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
      <span class="market-change ${changeClass}">${changeText}</span>
    </div>
    <svg class="market-chart" viewBox="0 0 420 122" role="img" aria-label="${esc(label)} intraday chart">
      <line class="market-grid" x1="34" y1="6" x2="412" y2="6"/>
      <line class="market-grid" x1="34" y1="44" x2="412" y2="44"/>
      <line class="market-grid" x1="34" y1="82" x2="412" y2="82"/>
      <line class="market-reference-line" x1="34" y1="${refY.toFixed(2)}" x2="412" y2="${refY.toFixed(2)}"/>
      <text class="market-reference-label" x="410" y="${Math.max(8,refY-3).toFixed(2)}" text-anchor="end">Prev close</text>
      <path class="market-area" d="${area}"/>
      <path class="market-line" d="${line}"/>
      <circle class="market-end" cx="${coords.at(-1).x.toFixed(2)}" cy="${coords.at(-1).y.toFixed(2)}" r="4"/>
      <g class="market-volume-panel">
        <line class="market-volume-divider" x1="34" y1="90" x2="412" y2="90"/>
        ${bars}
      </g>
    </svg>
  </div>`;
}

export async function buildMarketCharts() {
  const fetchedAt = Date.now();

  const data = await Promise.all(INDEXES.map(async (item) => {
    const [indexResult, proxyResult] = await Promise.all([chart(item.symbol), chart(item.proxy)]);
    const selected = latestAlignedSession(rows(indexResult), rows(proxyResult));

    const previousClose = Number(
      indexResult?.meta?.chartPreviousClose ?? indexResult?.meta?.previousClose,
    );

    if (!Number.isFinite(previousClose) || previousClose <= 0) {
      throw new Error(`market_previous_close_missing_${item.key}`);
    }

    return { ...item, previousClose, ...selected };
  }));

  if (new Set(data.map((x) => x.date)).size !== 1) {
    throw new Error("market_session_mismatch");
  }

  const sessionDate = data[0].date;
  const latestTimestamp = Math.min(
    ...data.map((x) => x.points[x.points.length - 1].timestamp),
  );

  validateFreshness(sessionDate, latestTimestamp);

  const fetchedAtText = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(new Date(fetchedAt));

  return `<section class="market-glance" data-market-period="1d" data-market-style="raw-intraday-volume" data-market-as-of="${latestTimestamp}" aria-label="Markets at a Glance">
    <div class="market-glance-head">
      <span class="market-glance-title">Markets at a Glance</span>
      <span class="market-glance-period">1 Day</span>
    </div>
    ${data.map(renderRow).join("")}
    <small class="market-source">Session ${sessionDate} · As of ${nyTime(latestTimestamp)} ET · fetched ${fetchedAtText} ET · Yahoo Finance 1-minute index data; SPY, DIA and QQQ used only as aligned volume proxies.</small>
  </section>`;
}
