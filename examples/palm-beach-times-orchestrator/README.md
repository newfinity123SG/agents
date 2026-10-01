# Palm Beach Times Orchestrator

Production orchestration worker for The Palm Beach Times.

## Responsibilities

- own the scheduled morning run
- keep delivery idempotent by edition date
- coordinate generation, validation, publishing, verification, and Slack delivery
- expose health/status endpoints
- emit stage-specific logs and failures

## Non-responsibilities

- does not store newspaper HTML itself
- does not replace `palm-beach-times-publisher`
- does not hard-code editorial layout decisions into orchestration logic

## Current phase

Skeleton only. It verifies required secrets and the publisher service binding.

Endpoints:

- `GET /health`
- `GET /status`
- `POST /run-test`

Cron is intentionally not configured yet. Enable scheduling only after the full manual production path passes.

Deployment trigger: refreshed to force a new Cloudflare build from the orchestrator branch.

Integration test endpoints deployment refresh.
