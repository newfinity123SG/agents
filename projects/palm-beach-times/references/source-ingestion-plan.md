# PBT source ingestion registry: implementation policy
Historical evidence: six archived HTML editions October 7, 8, 10, 13, 14 and 15 2026; 159 outbound links across 72 unique domains. This does **not** establish that all these sites were scraped or accessed directly during generation.

## Discovery-first classification (not verified endpoints)
- 21 editorial publishers: RSS/Atom *when verified*; fallback to search/discovery with publication timestamps and links; never copy full paid articles.
- 20 official local calendars/government/venues: retrieve public iCal/JSON/structured calendar **only after testing**; else bounded HTML discovery.
- 8 official data providers: documented free releases/endpoints where available, subject to per-endpoint validation and provenance.
- 14 official company/studio/technology announcement sources: official newsroom/blog, RSS if present; independently verify claims when necessary.
- 6 restaurant/venue/business domains: event openings, hours, restaurant news; cross-check date and operational status.
- 3 quote/listing aggregators: verify terms and freshness; no assumed commercial redistribution rights.

## Section routing
Front page, Around Town, Palm Beach County & South Florida News, Development & Deals, Community Issues, Restaurant Openings, AI & Technology, Money, Weather & Ocean, Screen Guide, World & Lifestyle. Preserve all source categories; use independent fallback if a site is blocked.

## Provider record
Each domain should store: domain, category, original sections, source edition dates, count, retrieval method (candidate), tested feed URL, authentication, cost, license/attribution, freshness SLA, last successful poll, HTTP status, parsing test, duplicate event key, priority/fallback. The initial catalog marks all 72 `discovery_only` and `api_or_rss_verified=NO`; no assumptions.

## Free-first pipeline
1. Fetch official APIs, RSS and confirmed calendars with source-specific Cloudflare cache intervals.
2. Normalize title, source domain, source URL, published/updated time, event occurrence time and timezone, retrieved time, section candidate and short extract.
3. Dedupe across feeds by canonical article URL and event identity, never one syndicated article as several stories.
4. Respect robots, terms and rate limits; defer paid/no-feed sites to targeted discovery.
5. Pass a compact shortlist to OpenAI for editorial selection, synthesis and original writing. Never pass an entire page corpus every day.
6. Gate edition eligibility on freshness and v6 validation, independently of source count.

## Near-term work
The full CSV registry generated from saved HTML is available separately in the working archive; add that canonical CSV to repository using a binary-safe export/import method on the next ingestion deployment. Independently verify RSS/feeds in batches and add only proven endpoints as active adapters. Additional historic paper dates may be archived in R2; query read-only before declaring the historical catalogue complete.
