# Palm Beach Times release and cutover plan

Status: DEVELOPMENT. No production cutover has been authorized by a proven seven-day shadow run.

## Single source of truth
GitHub stores the Skill source, v6 template, validators, art assets, model configuration, deployment code and approval history. API Skill versions and Cloudflare releases must record the Git commit SHA and immutable API skill version ID. Never treat a dashboard-only edit as the canonical copy.

## Setup dependencies
1. Create a dedicated OpenAI Platform project named Palm Beach Times with billing/limits and a project-scoped API key. Store the key as a *staging-only Cloudflare secret* (OPENAI_API_KEY). Never commit or paste credentials into GitHub or chat.
2. Package the original personal-morning-newspaper Skill with full SKILL.md, references, scripts, immutable graphical masthead and a deployment manifest. Verify a complete binary-safe package, including PNG assets. API integration must use the platform's current Skills execution interface, not invent a skill ID.
3. Confirm the API execution environment supports required skills, web research, image generation and Python scripts, and document runtime restrictions. ChatGPT memory and connected apps do not automatically transfer.
4. Connect free-source fetch adapters (RSS, NWS, NOAA, FRED, BLS, CoinGecko), with explicit source provenance and licensing review for intraday chart display.
5. Keep the existing v6 assembler/validator and Publisher v2. Use independent Cloudflare staging R2, secrets and Worker. No staging Slack writes.
6. Build durable orchestration, run ledger, retry and idempotency guard; record failure stage and recovered outcome. Set budget alarms and a fixed maximum per-edition API spend.

## Staging acceptance gates
- Exact approved v6 masthead image and all sections, charts and original comic.
- Real sourced articles and local events; no invented numbers or synthetic charts.
- Strict v6 preflight; exact SHA-256 of canonical HTML equals staging dated URL and /today.
- Visual screenshot comparison (desktop, tablet, mobile).
- At least seven consecutive unattended daily editions including weekend.
- No duplicate publications, no test messages to production Slack.
- Verified version metadata and rollback plan.

## Cutover
Do not disable current ChatGPT 6:30 AM and 7:05 AM automations or enable production Cloudflare schedule until all acceptance criteria are demonstrated and approved. Cutover must be coordinated to avoid duplicate deliveries. Keep old schedule only until replacement verified.

## Revision flow
User requests change in ChatGPT -> commit to development branch -> unit/integration/visual acceptance -> upload versioned API Skill and pin version in staging -> verify one complete edition -> approve and deploy pinned version to production -> record commit and release identifiers -> rollback to previous pinned version on failure.

## Open blockers
- API project key and configured account budget.
- Complete binary Skill package with published-approved masthead/artwork.
- Supported API Skill execution integration and image/web tool access.
- Live API integration tests and provider licenses.
- Cloudflare orchestrator and seven-day unattended staging runs.
