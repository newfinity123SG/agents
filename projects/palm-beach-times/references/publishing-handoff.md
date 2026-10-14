# Complete, bounded publishing handoff

Keep the canonical HTML file immutable after validation. Never reconstruct HTML or base64 from displayed tool output, trim strings, normalize newlines, or pass paths/IDs as HTML. Use binary-safe image reads. Preserve masthead pixels/alpha, original embedded comic, all charts and editorial requirements.

## Production procedure

1. Research and generate the complete fresh self-contained edition from the bundled template. Set data-edition-date and data-joke-date to the current America/New_York date. Sunday retains SUNDAY WEEK AHEAD EDITION visually; send MCP editionType=weekend because the current schema has no Sunday enum.
2. Run validate_edition.py, then publish_preflight.py FILE --date YYYY-MM-DD. Require PASS and retain its SHA-256, UTF-8 bytes, total and date. Do not change content after this point. Strict local validation is mandatory: the MCP marker check is narrower and is not a replacement.
3. Generate one unique uploadId matching [a-zA-Z0-9_-]{8,64}. Use the same date, uploadId and total for every chunk. The source enforces <=400 chunks, each <=24,000 JavaScript UTF-16 units, and <=12,000,000 assembled UTF-8 bytes. Parts expire after eight hours (28,800 seconds); require expiresInSeconds=28800 on new acknowledgments. Older acknowledgments without that field may still have the former two-hour retention. Refresh any expired early parts with identical content under the same upload ID before finalization. This is a source limit, not proof that every such size has been tested.
4. Use read_publish_payload.py FILE --index I for I=0..total-1. It splits by UTF-16 units without splitting astral Unicode characters. Parse the shell result inside functions.exec, without printing the HTML field. Require exit_code=0, valid JSON, matching SHA-256/bytes/total/index, and html.length=chunk_characters<=24000. Do not use Python code-point count as JavaScript string length.
5. Call upload_newspaper_chunk sequentially using each complete parsed string. Require no tool error and JSON ok=true, stored=I, total=manifest.total and uploadId=your ID. Abort on inconsistent acknowledgments. An ambiguous storage failure may retry the identical chunk under the identical ID; never change its content. Do not print full chunk data.
6. After all acknowledgments, call finalize_newspaper_upload with date, uploadId, total, sha256, title and editionType. Require ok=true, verified=true and matching date, SHA-256 and bytes. This confirms staging, activation and service-route readback. Treat anything else as failure.
7. Retry only the explicit 'Chunk N not yet available; retry finalization after KV propagation' error, using unchanged arguments. Wait 15, 30, 60, 60 and 60 seconds at most; communicate between waits. Do not reupload the whole document or start another upload for propagation. On expiry/failure report the blocker and retain the original artifact. Do not blindly retry checksum, metadata or validation errors. After an ambiguous activation, inspect the public routes before retrying finalization.
8. Independently GET the dated URL and /today with Cache-Control:no-cache and a cache-busting revision. Download raw response bodies; require HTTP 200, HTML content type, matching byte counts/SHA-256, expected data-edition-date, current visible date and strict validate_edition.py success on BOTH. get_newspaper currently reports availability/status only; never invent productionValid/date/hash fields it does not return.
9. Only then call deliver_newspaper(date=manifest.date, force=false). Require the returned channel=C0BTU2G3LNS and a messageTs receipt for a new send. Verify that same receipt and cache-busted dated link in the existing #personal-flo channel C0BTU2G3LNS. A successful send to another channel is a failed handoff; fix configuration before retrying, never use force=true to mask a destination error. delivered=true is a new send; deduped=true is an existing send requiring evidence, not a new message. Re-read Slack after an ambiguous send before retrying. Never send comic/HTML attachments in normal delivery.

## Programmatic bridge example

Adapt literal absolute paths and metadata below. Keep payload parsing and tool invocation in the same functions.exec runtime. Run in bounded batches and persist uploadId, manifest, next index and acknowledgment timestamps to a local JSON checkpoint after each acknowledged chunk. store/load can assist within a turn but does not survive a new user turn. On resume read the file checkpoint and verify the canonical file SHA-256 before continuing; never regenerate IDs or mutate files. If checkpoint persistence fails after an acknowledgment, retry that identical part safely. Shell-quote arbitrary paths safely; do not interpolate JSON.stringify output into shell commands.

```javascript
function decode(result) {
  if (result.isError) throw new Error('MCP reported failure');
  for (const item of result.content || []) {
    if (item.type === 'text') {
      try { return JSON.parse(item.text); } catch {}
    }
  }
  throw new Error('Missing JSON acknowledgment');
}
// Load run from the durable JSON checkpoint through exec_command and JSON.parse.
const run = load('pbt-upload'); // only a within-turn working copy
const bridge = '/absolute/skill/scripts/read_publish_payload.py';
const file = '/absolute/Palm_Beach_Times_YYYY-MM-DD.html';
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
const end = Math.min(run.manifest.total, run.nextIndex+10);
for (let i=run.nextIndex; i<end; i++) {
  const output = await tools.exec_command({
    cmd: 'python3 '+quote(bridge)+' '+quote(file)+' --chunk-size '+run.manifest.max_chunk_characters+' --index '+i,
    max_output_tokens: 60000
  });
  if (output.exit_code !== 0) throw new Error('Bridge failed');
  const part = JSON.parse(output.output); // fails closed on truncated JSON
  if (part.index!==i || part.total!==run.manifest.total ||
      part.sha256!==run.manifest.sha256 || part.html_bytes!==run.manifest.html_bytes ||
      !part.html || part.html.length!==part.chunk_characters || part.html.length>24000)
    throw new Error('Bridge manifest mismatch');
  const ack = decode(await tools.mcp__codex_apps__palm_beach_times_publisher_upload_newspaper_chunk({
    date:run.date, uploadId:run.uploadId, index:i, total:part.total, chunk:part.html
  }));
  if (ack.ok!==true || ack.stored!==i || ack.total!==part.total || ack.uploadId!==run.uploadId)
    throw new Error('Chunk storage acknowledgment mismatch');
  run.nextIndex=i+1; store('pbt-upload',run);
  // Persist run to the durable JSON checkpoint before the next chunk.
  // Use a file-writing API or a safely quoted heredoc; never shell-interpolate payloads.
}
text({uploaded:run.nextIndex,total:run.manifest.total}); // metadata only
```

If even one bounded JSON response cannot be read intact, set --chunk-size (2..24000 UTF-16 units) on both preflight and read_publish_payload consistently and recompute the manifest before upload, or report PUBLISH-HANDOFF BLOCKED. Never rebuild a string from model-visible fragments.

## Small inline compatibility

publish_newspaper accepts a complete html string. Use only for genuinely small editions within a demonstrated intact per-call ceiling. Preflight --transport inline retains the conservative 2,500,000-byte guard; this is not a universal MCP limit. Independently verify both routes before delivery just as for chunked publishing. Prefer chunks for every large edition.

## Schedule and duplicate prevention

Preserve daily 6:30 AM ET generation and 7:05 AM ET recovery. Do not overlap live deliveries: KV date-and-channel dedupe is eventually consistent and does not prove atomic concurrency protection. Recovery checks both current public bodies first, calls force=false only after verification, and rebuilds once only for a missing/stale/invalid edition. Never post a stale edition to test delivery. Keep recurring tasks enabled after success as well as failure. Never create, pause, disable or change automations from inside a newspaper run. Verify the Work runtime exposes the installed Skill/support files, shell, research, image generation, Publisher and Slack before starting; report the exact missing stage/capability if blocked. A supported connector inventory alone does not prove a scheduled run can execute.

## Interrupted approvals

If automatic approval review fails, preserve the canonical artifact and durable checkpoint. Resolve the stated blocker and resume the normal authorized tool; never bypass review with another transport. Report the exact blocked action and reason. An unexecuted chunk is not acknowledged and must remain the next index. After credits or approvals are restored, retry the normal authorized tool. If time has passed, recheck editorial freshness first: resume unchanged only when appropriate; any refreshed content requires a new canonical file, manifest and upload ID. Preserve the earlier artifact and mark its checkpoint superseded. Persist the canonical file and checkpoint in storage accessible to the next execution environment; a scratch-only file is insufficient after that environment is replaced.

## Verified production envelope

On October 12, 2026, a complete 7,539,483-byte edition was uploaded as 315 chunks of at most 24,000 UTF-16 units. Finalization rejected an intentionally incorrect checksum and left the dated route unpublished. Correct finalization returned ok=true and verified=true with the exact source SHA-256. Independent dated and /today raw-body downloads matched every byte and passed strict date-aware production preflight. This proves that tested size, not every value up to the 12 MB source ceiling.

The same end-to-end test found and corrected a stale #news destination and missing private-channel membership. Production configuration now pins SLACK_CHANNEL_ID=C0BTU2G3LNS. Worker v2.4.2 checks that destination, validates Slack channel/message receipts and deduplicates by date plus channel. The dedicated Palm Beach Times Delivery bot U0C65CE1WEQ was verified and added to #personal-flo; its October 12 post was independently read at messageTs=1791843705.200089.

After KV propagation, a second force=false call returned delivered=false and deduped=true with that same target-channel receipt. Independent Slack history still contained exactly one newspaper post in #personal-flo. Sequential retry deduplication passed; this does not prove atomic protection for concurrent sends.

On October 13, 2026, approval review stopped an upload for exhausted workspace credits. After credits were restored, the normal chunk tool accepted the saved next part. A refreshed edition used a new immutable upload ID, passed strict validation and uploaded all 290 chunks. Finalization and both independent public bodies verified SHA-256 `35ecd616fb42f9d188546b266a05fdabfbef155a7c52390ad82b620559c84e9a` and 6,941,859 bytes. The dedicated bot delivered to C0BTU2G3LNS at messageTs `1791907135.746609`; that exact post was independently read. A subsequent force=false call returned the same prior receipt with deduped=true. This verifies publication and sequential delivery recovery; future timed runs still require their own results.
