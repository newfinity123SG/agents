# Unattended editorial provider contract (design, not deployed)

The v6 assembly scripts already exist. This contract defines the missing interfaces that a separately executable producer must satisfy before any unattended edition can be published. Never replace the original HTML template or fabricate stories/data to satisfy a test.

## Input
- `edition_date`: YYYY-MM-DD in America/New_York.
- `edition_type`: weekday, friday-weekend, weekend.
- `run_id`: stable unique ID for a single edition attempt.
- `reference_sha256`: checksum of the approved visual reference.
- `source_window_end`: bounded timestamp for freshness validation.

## Required external providers
1. Research provider: delivers topical article items with headline, summary, publication timestamp, source URL, retrieved timestamp, attribution, and desk classification. Exclude unverified or stale items; never make up a replacement headline.
2. Market provider: delivers previous close plus at least 48 chronological, timestamped real session observations of price and positive volume for each of S&P 500, Dow and Nasdaq, with explicit ETF proxy disclosure wherever index-native volume is unavailable. Also supplies verified Bitcoin, WTI oil, ten-year Treasury and Freddie 30-year rate snapshots with timestamps.
3. Weather/ocean provider: supplies Palm Beach area conditions and marine information with observation/forecast times and provider URLs.
4. Image provider: creates an original wide-strip comic as PNG and returns bytes, provenance, generation job ID and dimensions. The original PNG must satisfy embed_comic_image.py aspect ratio and minimum dimensions; do not use generic placeholders.
5. Editorial formatter: builds each of the exact 28 template slots according to the installed Skill, including restaurant openings, screen guide, daily joke and five Around Town items. It must output source-backed content and text safe for incorporation into the validated HTML.

## Validation and immutable artifacts
- Normalize and persist each provider result in staging R2 under `runs/<edition_date>/<run_id>/`, recording provider, observed time, SHA-256, status, and error.
- Do not mark a run ASSEMBLED if any mandatory provider fails, or if an editorial slot is empty.
- Use locked masthead bytes and original scripts to build the manifest and canonical v6 HTML.
- Run strict validate_edition.py and publish_preflight.py with the current edition date.
- Preserve exact canonical UTF-8 byte stream; activate only after staged verification.
- Verify dated and /today public response bytes match canonical SHA-256; no Slack delivery from staging.
- Prevent activation of an older edition over a newer /today pointer.

## States
CREATED -> RESEARCHED -> RENDERED -> ASSEMBLED -> VALIDATED -> STAGED -> VERIFIED.
Failure transitions to FAILED with recoverable stage and attempt count.
Production DELIVERED is a separate, explicitly disabled final step during shadow testing.

## Hard blockers before unattended Cloudflare deployment
- Confirm execution service capable of calling research, market, weather and comic APIs, including credentials and costs.
- Recover binary masthead/artwork bytes into a durable store and verify their digests.
- Complete integration tests using actual API responses and production-equivalent edition data.
- Ensure seven successful scheduled staging shadow runs, including weekend variation, with zero messages to production Slack.
- Explicit final authorization to cut over scheduling and disable the old ChatGPT automations.
