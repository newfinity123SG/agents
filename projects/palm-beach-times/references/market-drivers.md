# Market Drivers ledger

Render a required compact ledger below Markets at a Glance, before Money stories. Reverify every edition; never hardcode observations from an earlier edition.

## Core readings

| Label / key | Instrument and unit | Change comparison | Preferred sources |
|---|---|---|---|
| WTI Oil / wti | Named front-month WTI futures contract, USD/barrel; label contract. If using spot, label WTI spot instead. | Same contract latest vs prior settlement; $ and %. Do not compare across contract roll. Spot fallback compares consecutive available daily observations. | CME contract quotes/settlements; EIA or FRED for explicitly dated spot fallback |
| 10Y Treasury / treasury10y | Treasury 10-year par yield, % | Latest daily observation vs previous available daily observation, signed basis points | U.S. Treasury daily par yield curve; FRED DGS10 fallback, retaining its series label |
| 2Y Treasury / treasury2y | Treasury 2-year par yield, % | Same as 10Y, signed basis points | U.S. Treasury daily par yield curve; FRED DGS2 fallback, retaining its series label |
| Freddie 30Y Fixed / freddie30y | Freddie Mac PMMS weekly national 30-year fixed mortgage average, % | Latest weekly release vs previous weekly release, signed basis points, visibly marked WoW | https://www.freddiemac.com/pmms ; Freddie archive; FRED MORTGAGE30US fallback |
| U.S. Dollar / dxy | ICE U.S. Dollar Index (DXY), index points | Latest vs preceding same-series session close, points and % | ICE or a reputable quote source identifying DXY and quote timestamp |
| Gold / gold | Gold spot XAU/USD, USD/troy oz; label spot | Latest vs source's prior session close, $ and % | Reliable dated spot quotes; if CME futures is used instead, visibly label contract and use its own prior settlement |
| Bitcoin / bitcoin | BTC/USD spot price, USD per BTC | Latest vs same-source price 24 hours earlier, $ and %, explicitly marked 24h | Reliable exchange or crypto quote provider with BTC/USD spot price and consistent 24h change |
| VIX / vix | Cboe VIX index level; do not substitute VIX futures | Latest vs previous session close, index points | Cboe VIX quotes/history, or FRED VIXCLS for dated daily-close fallback |

Prefer official sources. Record exact source URL, instrument/contract, unit, latest and comparison value, both observation dates, and quote delay/session basis internally. Use the latest available observation as of publication; never imply a stale spot/FRED daily series is live.

## Numerical and freshness rules

- Rates: change in basis points = (latest percentage rate - previous percentage rate) * 100. A move from 4.20% to 4.25% is +5 bp, not +0.05% or +5%.
- Prices/index levels: absolute change = latest - prior; percentage change = 100 * (latest / prior - 1). Require a verified positive comparison value for percentage calculation.
- Arrow/color follows the signed change: ▲ blue, ▼ amber, → gray. Use sensible precision and show flat only when the change rounds to zero at the displayed precision.
- Verify daily comparison basis internally (prior close, settlement or daily observation), but do not print repetitive `vs source prior close`, `vs prior close`, `vs prior settlement`, or comparison-date prose on every row. Show signed absolute/percentage moves only; retain `WoW` for Freddie and `24h` for Bitcoin. The weekly PMMS is a national survey average, not a borrower quote or current lender pricing.
- Keep exact source URLs and observation timestamps in research records or non-visible row data attributes. Do not print source names or source-link rows under individual readings. Use a single compact `driver-note` below the grid for quote time in ET, delay status and actual older Treasury/Freddie dates. On closed-market days identify the latest close date; do not imply weekend trading for closed instruments. Clearly separate continuous Bitcoin observations from closed-market readings when their dates differ.
- Do not combine Treasury par yields with intraday benchmark yields silently. If an intraday benchmark is used, name it and use a consistent same-source comparison.
- If level is verified but prior is unavailable, show level with `Change unavailable`. If neither is verified, show `Unavailable` with no arrow. Never fabricate a zero change.
- Do not silently replace DXY with a different broad-dollar index. Missing data remains unavailable. Be transparent about older observations or alternate instrument definitions.

- Bitcoin trades through weekends: use a current timestamped quote and a rolling 24-hour comparison even when other instruments show the latest weekday close. Never substitute a Bitcoin ETF, futures contract, BTC/USDT quote or a calendar-day change without explicit relabeling. Use the same provider for price and 24h comparison.

## Economy line

Add one `Next catalyst` line with the next verified consequential CPI, PCE, jobs, GDP or FOMC release, exact calendar date and Eastern time. Verify with BLS, BEA or Federal Reserve schedules. After a major fresh release, an optional concise `What stands out` line may name its actual versus prior values or describe the observed drivers. Compare matching definitions/periods; identify forecast consensus sources if used. Do not present analyst inference as proven causation or assert that rising oil/yields/dollar always predict stocks.

## Markup contract

Fill MARKET_DRIVERS with an aside, not a nested section (the edition validator reads the enclosing Money section). Use `id="market-drivers" class="market-drivers"`, an h3 `Market Drivers`, and `class="driver-grid"`. Include exactly one `class="driver-row" data-driver="KEY"` for each of the eight keys above. Each row uses driver-label, driver-value and driver-change with driver-up/down/flat, displayed on separate lines. Omit visible driver-source rows. Preserve verified provenance internally or with escaped data-source-url, data-as-of and data-comparison attributes. Add one shared driver-note for observation timing; do not repeat provider names or per-row attribution. Use `class="driver-catalyst"` for the Next catalyst line, optionally linking the event name directly to its official calendar without a separate source-label line; if schedule verification fails, state `Next catalyst: Schedule unavailable` instead of guessing. Never include sample numbers as production readings.

Keep typography readable. No additional eight charts, oversized tiles, or long teaching paragraphs. The existing stock index block still shows absolute point changes only; percentage changes here apply to driver prices/index readings, not the stock chart rows.
