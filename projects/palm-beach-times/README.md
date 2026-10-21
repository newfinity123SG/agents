# Palm Beach Times v6 shadow migration

This branch is a nonproduction migration workspace. The canonical newspaper rendering rules are preserved. No staging Worker or cron is deployed by this branch.

## Source recovered from installed Skill
- assets/newspaper-template.html
- scripts/validate_edition.py
- scripts/publish_preflight.py
- scripts/embed_masthead_image.py
- scripts/embed_comic_image.py
- scripts/render_market_charts.py
- scripts/read_publish_payload.py
- references/editorial-layout.md
- references/market-drivers.md
- references/local-social-events.md
- references/comic-rotation.md
- references/publishing-handoff.md

## Outstanding source and access dependencies
1. Restore locked binary PNG: assets/palm-beach-times-masthead.png through a binary-safe path.
2. Recover exact Publisher v2 source from the Cloudflare dashboard export supplied in conversation. Do not modify the production Worker.
3. Identify publisher MCP and Slack delivery bot code and source control.
4. Obtain an approved newspaper edition's exact HTML bytes and reference browser screenshots.
5. Identify externally callable research, intraday market and comic-image generation services for unattended Cloudflare invocation.
6. Configure isolated staging R2 and secrets only after source completeness and operational security review.

## Architecture contract
Cloudflare orchestration records durable checkpoints and calls a separately executable v6 renderer with the original template/assets/scripts; Publisher v2 handles staging/activation; dedicated Slack service handles verified final delivery.
Never substitute a new CSS renderer or silently omit required content. Fail closed and retain retryable checkpoint state.

## Verification
Run from project root: python3 -m unittest discover -s tests -v.
Then verify fixture byte-hash, required sections, desktop/tablet/mobile screenshots, failure recovery, and staging-only publication.
Seven consecutive unattended shadow editions must pass before cutover. Production cron and Slack remain unchanged until explicit final cutover.

## Current status
Source recovery is partial until binary masthead, live Publisher code and delivery service source are archived. Baseline tests added but not yet executed in this environment.
