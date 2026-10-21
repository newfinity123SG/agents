# Palm Beach Times durable artifact handoff: staging integration contract

Updated 2026-10-21. This document records VERIFIED status vs planned behavior.

## Verified
- Isolated staging Worker health responded with `ok:true, service:pbt-staging-only, delivery:DISABLED, scheduler:DISABLED` (operator browser).
- Authorized staging R2 PUT and separate GET of a benign checkpoint artifact succeeded.
- Original and recovered SHA-256 both `27ad81b9f1e7eaddadc59b68db0110a18646dc3437ffc9b71b9293a01035c551`.
- Staging Worker stores immutable content-addressed artifacts at `recovery/YYYY-MM-DD/{html|comic|market_input|masthead|checkpoint}/SHA256`.
- Tests and GitHub CI passed for storage transport. This does NOT prove complete edition handoff, task-to-task access or recovery.

## Blocking integration boundary
The native personal-morning-newspaper Skill currently has the connected Publisher operations:
`publish_newspaper`, `upload_newspaper_chunk`, `finalize_newspaper_upload`,
`get_newspaper`, and `deliver_newspaper`.
None of these operations can PUT/GET an arbitrary staging R2 artifact.
No installed ready-made Cloudflare connector was found at inspection time.
A scheduled ChatGPT task cannot be assumed to inherit a local PowerShell token,
a shell environment secret, browser authentication or ephemeral files.

**Do not paste PUBLISH_TOKEN into ChatGPT, a task prompt, GitHub, logs or Slack.**
Do not expose the staging endpoint without authentication.

## Proposed supported bridge (requires implementation and connected tool verification)
Extend the existing Palm Beach Times Publisher MCP service with *separate*
staging-only recovery artifact methods, or register an authenticated private app
that provides these methods. The service owns the staging authentication secret.
The ChatGPT Skill calls connector methods, never directly sees the secret.

1. `store_recovery_artifact(date, name, bytes_or_bounded_chunks, sha256)`:
   bounded binary-safe storage, size/digest verification and immutable acknowledgment.
2. `get_recovery_manifest(date)`: return manifest metadata only, with asset hashes,
   original generation/source dates, total byte counts, checkpoint status and freshness.
3. `retrieve_recovery_artifact(date, name, sha256)`: authenticated byte-safe retrieval
   into the executing Skill runtime (not a displayed/truncated tool text response).
4. `get_recovery_state(date)`: distinguish not_found, incomplete, committed,
   stale/superseded; report expiry and authoritative upload ID.
5. Recovery should never build from an incomplete manifest or mutable checkpoint,
   and never deliver to Slack before production dated and /today byte-level checks.

## Required end-to-end acceptance
- New native Skill execution creates full valid HTML and source-backed comic,
  market dataset and locked masthead; SHA256 manifest is persisted into staging R2.
- A **different** native scheduled task execution reads the manifest and exact assets
  and verifies each SHA256; no hidden dependence on original runtime filesystem.
- After interrupted publication it resumes only immutable verified bytes.
- Existing production Publisher finalizes and separately verifies dated and /today;
  dedicated Slack bot is invoked with `force=false` only after verification.
- No separate paid OpenAI model/API call. No production cutover until these tests pass.

## Safety and lifecycle
Staging Worker cannot deliver to Slack and has no cron. Preserve this.
Never make staging Worker call the production Publisher directly.
The public staging health endpoint is non-sensitive; recovery endpoints require auth.
Do not infer a real automated cross-task bridge from a successful PowerShell PUT/GET.
