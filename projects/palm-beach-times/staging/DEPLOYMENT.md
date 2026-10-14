# Staging-only deployment instructions

This project is NOT connected to the live Palm Beach Times Worker.
Only deploy to a freshly created Cloudflare Worker named `palm-beach-times-staging`.
The production Worker `palm-beach-times-publisher` and R2 bucket `palm-beach-times` must remain untouched.

## Safety preconditions
1. GitHub Actions migration baseline must pass on the exact intended commit.
2. Confirm a NEW R2 bucket called `palm-beach-times-staging` exists.
3. Confirm the `staging/wrangler.toml` R2 binding uses only `palm-beach-times-staging`.
4. Use a new staging-only `PUBLISH_TOKEN` secret. Never copy the production token.
5. There is intentionally no cron, no Slack service binding, and no production message capability.
6. Do not connect the production Worker Git integration to this branch.

## When deploying using Wrangler from the repository
Run these commands from `projects/palm-beach-times/staging`, after installing the supported Wrangler CLI and authenticating to the correct Cloudflare account:

```sh
npx wrangler r2 bucket create palm-beach-times-staging
npx wrangler secret put PUBLISH_TOKEN
npx wrangler deploy
```

If the bucket already exists, skip creation rather than deleting or recreating it.

Check `GET /health` on the staging Workers domain and confirm the response identifies `pbt-staging-only` with `delivery: DISABLED` and `scheduler: DISABLED`.

## Security caveat
Staging code is a transport test harness, not the full newspaper validator. Its structural checks cannot replace the existing Python `validate_edition.py` and `publish_preflight.py`. Never connect it to production delivery. A validated canonical v6 HTML edition must first be generated externally, using the exact original assets.

## No cutover until
- Original locked masthead PNG recovered byte-for-byte
- Production Publisher source archived and compared
- Original complete generated edition reproduced in staging
- Strict Python validation succeeds and published bytes match on dated and /today URLs
- Responsive screenshots visually approved
- Research, market data and original comic are generated unattended
- Seven consecutive automatic shadow editions succeed without duplicate deliveries

`wrangler deploy` here is only an operator instruction, not a claim of actual Cloudflare deployment.
