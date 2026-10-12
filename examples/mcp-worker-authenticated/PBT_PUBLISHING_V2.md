# Palm Beach Times Publisher v2 MCP handoff

## Production configuration

- Cloudflare Worker: `agents` (OAuth MCP server)
- R2 publisher service binding: `PUBLISHER` -> `palm-beach-times-publisher`
- OAuth state namespace binding: `OAUTH_KV`
- Secrets: `PUBLISH_TOKEN`, `GITHUB_CLIENT_SECRET`, `SLACK_BOT_TOKEN` (store as encrypted Cloudflare secrets)
- Variables: `ALLOWED_GITHUB_LOGIN`, `GITHUB_CLIENT_ID`, `SLACK_CHANNEL_ID`
- Publisher Worker has `NEWSPAPERS` R2 binding and `PUBLISH_TOKEN` secret.
- Deploy code from `examples/mcp-worker-authenticated`; production branch `main` only after validation.

## Production newspaper publishing

For smaller inline HTML, `publish_newspaper` remains supported but still carries the complete HTML inside a single MCP input.

For large self-contained newspapers with embedded masthead/comic/chart images:

1. Render and run complete Palm Beach Times v6 preflight locally.
2. Split **the exact complete HTML string** into chunks at most **24,000 JavaScript string characters**. Keep index 0..N-1 and do not trim, reformat, or normalize bytes.
3. Compute SHA-256 of `new TextEncoder().encode(completeHtml)`, lowercase hex. Use the same date and unique alphanumeric/hyphen/underscore `uploadId` (8-64 characters) for all chunks.
4. Invoke `upload_newspaper_chunk` once per chunk sequentially; verify `ok: true` and `stored` for every index.
5. Invoke `finalize_newspaper_upload` with date, uploadId, total, sha256, title, editionType.
6. If a chunk is not yet available due to KV propagation, retry finalization without resending all chunks. Never change chunk content for the same upload ID.
7. Finalization assembles HTML, validates required production v6 markers, checks SHA-256, transfers raw bytes through `/api/stage`, activates via `/api/activate`, and checks `/YYYY-MM-DD` and `/today` hashes.
8. Only after `verified: true`, invoke `deliver_newspaper` for that date. Never send a link to an unverified edition.

Upload parts expire after two hours. Keep chunks below 24,000 characters; MCP tool payloads remain bounded. KV is eventually consistent, so finalize may need a retry after all chunks are stored.

## Caveats and release checklist

- Source branches must be tested with `pnpm run deploy` equivalents (build/typecheck without deployment), OAuth, staging, Slack Bot API. Never copy the compiled 24,000-line editor bundle over the TypeScript source.
- Rotate the existing `SLACK_BOT_TOKEN` that was exposed as a plaintext Cloudflare variable. Store the replacement as a **Secret** after reviewing token permissions. Do not include token values in code or logs.
- Never merge this PR until CI passes and the first full large-edition upload + Slack delivery is verified in a controlled test.
- Update the deployed personal-morning-newspaper Skill: its current inline `publish_newspaper` instruction must instead use the bounded workflow for large output. This repository document does **not** itself update the installed Skill.
