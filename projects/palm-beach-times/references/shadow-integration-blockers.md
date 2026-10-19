# Palm Beach Times staging: remaining production-equivalence gates

Status: staging engineering only. The production Publisher and Slack bot are unchanged.

## Market collection
- Completed: provider response normalization, market integrity checks, independent trading-session freshness gate, bounded retry and revalidated-cache decision policy.
- Missing: authorized, rate-limit-tolerant **live** intraday provider and exchange-calendar integration. The October 16 fixture is historical and must never be used as a live fallback.
- Scheduling/cache persistence and real provider HTTP behavior remain untested end-to-end.

## Visual artifacts
- The exact locked original transparent PNG must be bundled or otherwise supplied through an approved asset artifact. The current staging repository assets directory contains only newspaper-template.html. Do not recreate or replace the masthead.
- The existing embed_masthead_image.py enforces transparency, PNG validity, and minimum embedded size.
- The existing embed_comic_image.py enforces generated PNG dimensions, wide-strip aspect ratio and minimum payload size.
- Missing: authorized daily original-comic generation, artifact handoff, and validation against a full daily edition. Do not pass the previous day's comic off as fresh.

## Rendering and publishing
- Existing assemble_edition.py requires all complete approved v6 fragments; v6 strict validator must pass.
- The editorial bridge produces **partial** fragments and deliberately reports missing required fields.
- Missing: weather/ocean rendering, all mandatory sections, genuine chart input, generated comic, locked masthead, final HTML assembly, complete edition comparison.
- Do not enable Publisher writes, R2 staging activation or Slack delivery until seven comparable shadow editions have passed the acceptance plan.

## Provenance and model cost
- Model costs and token target not yet measured using a complete shadow edition.
- A historical production research archive proves prior coverage, not that any listed social/media source can be scraped automatically.
