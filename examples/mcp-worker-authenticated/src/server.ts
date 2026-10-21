import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/server";
import {
  createMcpHandler,
  getMcpAuthContext
} from "../../../packages/agents/src/mcp/server/index";
import { z } from "zod";
import { AuthHandler } from "./auth-handler";

interface Env {
  PUBLISHER: Fetcher;
  PUBLISH_TOKEN?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  ALLOWED_GITHUB_LOGIN?: string;
  SLACK_BOT_TOKEN?: string;
  SLACK_CHANNEL_ID?: string;
  OAUTH_KV: KVNamespace;
}

const PUBLIC_PUBLISHER_URL =
  "https://palm-beach-times-publisher.steven-a00.workers.dev";

function revisionStamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}${get("second")}`;
}

function todayNewYork() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

const MASTHEAD_OVERRIDE = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=UnifrakturCook:wght@700&display=swap" rel="stylesheet">
<style id="pbt-masthead-override">
.nameplate{margin-top:3px!important;margin-bottom:1px!important;text-align:center!important}
.nameplate .the{display:none!important}
.nameplate h1{
  margin:0!important;
  font-family:'UnifrakturCook','Old English Text MT','Goudy Text MT','Blackletter','Times New Roman',serif!important;
  font-weight:700!important;
  font-size:clamp(2.85rem,5.25vw,5.2rem)!important;
  line-height:.93!important;
  letter-spacing:-.015em!important;
  text-transform:none!important;
  white-space:nowrap!important;
}
@media(max-width:720px){
  .nameplate h1{font-size:clamp(2.15rem,11vw,3.25rem)!important;white-space:normal!important}
}
</style>`;

function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {})
  };
}

function requirePublishToken(env: Env): string {
  if (!env.PUBLISH_TOKEN) {
    throw new Error("PUBLISH_TOKEN is not configured");
  }
  return env.PUBLISH_TOKEN;
}

function requireAuthorizedUser(env: Env): string {
  const allowed = env.ALLOWED_GITHUB_LOGIN;
  if (!allowed) {
    throw new Error("ALLOWED_GITHUB_LOGIN is not configured");
  }

  const auth = getMcpAuthContext();
  const login = auth?.props?.githubLogin;

  if (typeof login !== "string") {
    throw new Error("No authenticated GitHub identity is available");
  }

  if (login.toLowerCase() !== allowed.toLowerCase()) {
    throw new Error("Authenticated GitHub account is not authorized");
  }

  return login;
}

function publisherRequest(env: Env, path: string, init?: RequestInit) {
  return env.PUBLISHER.fetch(
    new Request(`https://publisher.internal${path}`, init)
  );
}

function applyPalmBeachTimesMasthead(html: string): string {
  // Production v6 editions already contain the locked graphical masthead.
  // Preserve them byte-for-byte instead of layering the legacy text masthead CSS on top.
  if (
    html.includes('data-masthead="pbt-exact-graphical-v1"') &&
    html.includes('data-masthead-source="locked-pbt-artwork"')
  ) {
    return html;
  }

  let updated = html
    .replace(
      /<div\s+class=["']the["']>\s*THE\s*<\/div>\s*(<h1[^>]*>)\s*(?:THE\s+)?PALM BEACH TIMES\s*(<\/h1>)/i,
      "$1The Palm Beach Times$2"
    )
    .replace(
      /(<h1[^>]*>)\s*THE\s+PALM\s+BEACH\s+TIMES\s*(<\/h1>)/i,
      "$1The Palm Beach Times$2"
    );

  if (updated.includes('id="pbt-masthead-override"')) {
    return updated;
  }

  if (/<\/head>/i.test(updated)) {
    return updated.replace(/<\/head>/i, `${MASTHEAD_OVERRIDE}\n</head>`);
  }

  return `${MASTHEAD_OVERRIDE}\n${updated}`;
}

function validatePalmBeachTimesProductionHtml(html: string): string[] {
  const errors: string[] = [];
  if (html.length < 10000) errors.push("HTML is missing or too small");
  for (const [marker, name] of [
    ['data-layout="pbt-broadsheet-v6"', "v6 layout"],
    ['data-skill-build="pbt-v6.0"', "v6 build"],
    ['data-masthead="pbt-exact-graphical-v1"', "locked graphical masthead"],
    ['data-masthead-source="locked-pbt-artwork"', "locked masthead artwork"],
    ['class="todays-thread"', "Today's Thread"],
    ['id="front-page"', "Front Page"],
    ['id="weather-ocean"', "Weather & Ocean"],
    ['id="money"', "Money"]
  ]) {
    if (!html.includes(marker)) errors.push(`Missing ${name}`);
  }
  return errors;
}

async function verifyPublishedPalmBeachTimes(env: Env, path: string) {
  const response = await publisherRequest(env, path, {
    method: "GET",
    headers: { "Cache-Control": "no-cache" }
  });
  const html = await response.text();
  const errors = response.ok ? validatePalmBeachTimesProductionHtml(html) : [`HTTP ${response.status}`];
  return { ok: response.ok && errors.length === 0, status: response.status, htmlLength: html.length, errors };
}

const optionalDate = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
    .optional()
);

function createServer(env: Env) {
  const server = new McpServer({
    name: "Palm Beach Times Publisher",
    version: "2.4.2"
  });

  server.registerTool(
    "publish_newspaper",
    {
      description:
        "Publish a validated Palm Beach Times v6 HTML edition through staged Publisher v2 upload, SHA-256 verification, and activation.",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
        html: z.string().min(1),
        title: z.string().default("The Palm Beach Times"),
        editionType: z
          .enum(["weekday", "friday-weekend", "weekend"])
          .default("weekday")
      }
    },
    async ({ date, html, title, editionType }) => {
      try {
        requireAuthorizedUser(env);
        const publishToken = requirePublishToken(env);
        const preflightErrors = validatePalmBeachTimesProductionHtml(html);
        if (preflightErrors.length) return textResult(`Publishing blocked: ${preflightErrors.join("; ")}`, true);
        const publishedHtml = html;

        // Publisher v2 two-phase transfer. Raw UTF-8 bytes are staged in R2
        // and verified by SHA-256 before the dated edition is activated.
        // Note: the legacy MCP input still carries full HTML; callers with
        // tool-argument size limits need a separate upload transport.
        const bytes = new TextEncoder().encode(publishedHtml);
        const digestBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
        const sha256 = [...digestBytes]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");

        const stageResponse = await publisherRequest(env, "/api/stage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${publishToken}`,
            "Content-Type": "text/html; charset=utf-8",
            "x-edition-date": date,
            "x-edition-title": title,
            "x-edition-type": editionType,
            "x-content-sha256": sha256
          },
          body: publishedHtml
        });
        const stageBody = await stageResponse.text();
        if (!stageResponse.ok) {
          return textResult(
            `Staging failed with HTTP ${stageResponse.status}: ${stageBody}`,
            true
          );
        }
        let staged: Record<string, unknown>;
        try {
          staged = JSON.parse(stageBody) as Record<string, unknown>;
        } catch {
          return textResult("Staging returned invalid JSON", true);
        }
        if (staged.ok !== true || staged.sha256 !== sha256 || staged.bytes !== bytes.byteLength) {
          return textResult("Staging failed integrity confirmation", true);
        }

        const response = await publisherRequest(env, "/api/activate", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${publishToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ date, sha256 })
        });
        const body = await response.text();
        if (!response.ok) {
          return textResult(
            `Activation failed with HTTP ${response.status}: ${body}`,
            true
          );
        }

        let result: Record<string, unknown>;
        try {
          result = JSON.parse(body) as Record<string, unknown>;
        } catch {
          return textResult("Activation returned invalid JSON", true);
        }
        if (result.ok !== true || result.sha256 !== sha256 || result.bytes !== bytes.byteLength) {
          return textResult("Activation failed integrity confirmation", true);
        }
        for (const checkPath of [`/${date}`, "/today"]) {
          const verify = await publisherRequest(env, checkPath, {
            method: "GET",
            headers: { "Cache-Control": "no-cache" }
          });
          if (!verify.ok) {
            return textResult(`Publication verification failed for ${checkPath}: HTTP ${verify.status}`, true);
          }
          const fetched = new Uint8Array(await verify.arrayBuffer());
          if (fetched.byteLength !== bytes.byteLength) {
            return textResult(`Publication verification failed for ${checkPath}: byte mismatch`, true);
          }
          const verifiedDigest = new Uint8Array(await crypto.subtle.digest("SHA-256", fetched));
          const verifiedSha = [...verifiedDigest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
          if (verifiedSha !== sha256) {
            return textResult(`Publication verification failed for ${checkPath}: SHA-256 mismatch`, true);
          }
        }

        return textResult(
          JSON.stringify(
            {
              ok: true,
              date: result.date ?? date,
              title: result.title ?? title,
              editionType: result.editionType ?? editionType,
              mastheadStyle: publishedHtml.includes('data-masthead-source="locked-pbt-artwork"')
                ? "locked-graphical"
                : "classic-blackletter",
              url: `${PUBLIC_PUBLISHER_URL}/${date}`,
              todayUrl: `${PUBLIC_PUBLISHER_URL}/today`
            },
            null,
            2
          )
        );
      } catch (error) {
        return textResult(
          error instanceof Error ? error.message : "Unknown publishing error",
          true
        );
      }
    }
  );

  // Bounded MCP arguments: upload an HTML edition in ordered, short chunks.
  // Each chunk is stored temporarily; finalization validates the assembled
  // document before sending it to the R2-backed Publisher v2.
  server.registerTool(
    "upload_newspaper_chunk",
    {
      description: "Store one bounded HTML chunk for a new Palm Beach Times edition. Send sequential chunks of at most 24000 characters, numbered from zero. Do not deliver until finalize_newspaper_upload succeeds.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        uploadId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
        index: z.number().int().min(0).max(399),
        total: z.number().int().min(1).max(400),
        chunk: z.string().min(1).max(24000)
      }
    },
    async ({ date, uploadId, index, total, chunk }) => {
      try {
        requireAuthorizedUser(env);
        if (index >= total) return textResult("Invalid chunk index", true);
        await env.OAUTH_KV.put(
          `pbt-upload:${date}:${uploadId}:${index}`,
          JSON.stringify({ total, chunk }),
          { expirationTtl: 8 * 60 * 60 }
        );
        return textResult(JSON.stringify({ ok: true, stored: index, total, uploadId, expiresInSeconds: 8 * 60 * 60 }));
      } catch (error) {
        return textResult(error instanceof Error ? error.message : "Chunk storage failed", true);
      }
    }
  );

  server.registerTool(
    "finalize_newspaper_upload",
    {
      description: "Assemble previously uploaded HTML chunks, run production validation, verify the expected SHA-256 and publish through the Publisher v2 stage/activate endpoints. Call only after all chunks were uploaded.",
      inputSchema: {
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        uploadId: z.string().regex(/^[a-zA-Z0-9_-]{8,64}$/),
        total: z.number().int().min(1).max(400),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        title: z.string().default("The Palm Beach Times"),
        editionType: z.enum(["weekday", "friday-weekend", "weekend"]).default("weekday")
      }
    },
    async ({ date, uploadId, total, sha256, title, editionType }) => {
      try {
        requireAuthorizedUser(env);
        const token = requirePublishToken(env);
        const parts: string[] = [];
        for (let i = 0; i < total; i++) {
          const value = await env.OAUTH_KV.get(`pbt-upload:${date}:${uploadId}:${i}`);
          if (!value) return textResult(`Chunk ${i} not yet available; retry finalization after KV propagation`, true);
          const parsed = JSON.parse(value) as { total: number; chunk: string };
          if (parsed.total !== total || typeof parsed.chunk !== "string") {
            return textResult(`Chunk ${i} has inconsistent metadata`, true);
          }
          parts.push(parsed.chunk);
        }
        const html = parts.join("");
        const errors = validatePalmBeachTimesProductionHtml(html);
        if (errors.length) return textResult(`Publishing blocked: ${errors.join("; ")}`, true);
        const bytes = new TextEncoder().encode(html);
        if (bytes.byteLength > 12_000_000) return textResult("HTML exceeds Publisher v2 size limit", true);
        const computed = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
          .map((b) => b.toString(16).padStart(2, "0")).join("");
        if (computed !== sha256) return textResult("Assembled HTML SHA-256 mismatch", true);
        const stage = await publisherRequest(env, "/api/stage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/html; charset=utf-8",
            "x-edition-date": date,
            "x-edition-title": title,
            "x-edition-type": editionType,
            "x-content-sha256": sha256
          },
          body: html
        });
        const stageBody = await stage.text();
        if (!stage.ok) return textResult(`Staging failed HTTP ${stage.status}: ${stageBody}`, true);
        const staged = JSON.parse(stageBody) as Record<string, unknown>;
        if (staged.ok !== true || staged.sha256 !== sha256 || staged.bytes !== bytes.byteLength) {
          return textResult("Staged payload integrity check failed", true);
        }
        const activated = await publisherRequest(env, "/api/activate", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ date, sha256 })
        });
        const activeBody = await activated.text();
        if (!activated.ok) return textResult(`Activation failed HTTP ${activated.status}: ${activeBody}`, true);
        const active = JSON.parse(activeBody) as Record<string, unknown>;
        if (active.ok !== true || active.sha256 !== sha256 || active.bytes !== bytes.byteLength) {
          return textResult("Activation integrity check failed", true);
        }
        for (const route of [`/${date}`, "/today"]) {
          const res = await publisherRequest(env, route, { method: "GET" });
          if (!res.ok) return textResult(`Post-activation verification failed at ${route}: HTTP ${res.status}`, true);
          const read = await res.arrayBuffer();
          const check = [...new Uint8Array(await crypto.subtle.digest("SHA-256", read))]
            .map((b) => b.toString(16).padStart(2, "0")).join("");
          if (check !== sha256 || read.byteLength !== bytes.byteLength) {
            return textResult(`Post-activation checksum mismatch at ${route}`, true);
          }
        }
        return textResult(JSON.stringify({
          ok: true, verified: true, date, sha256, bytes: bytes.byteLength,
          url: `${PUBLIC_PUBLISHER_URL}/${date}`,
          todayUrl: `${PUBLIC_PUBLISHER_URL}/today`,
          delivery: "NOT_SENT"
        }, null, 2));
      } catch (error) {
        return textResult(error instanceof Error ? error.message : "Finalize failed", true);
      }
    }
  );

  server.registerTool(
    "get_newspaper",
    {
      description:
        "Return the browser URL and availability status for today's Palm Beach Times or a specific dated edition.",
      inputSchema: {
        date: optionalDate
      }
    },
    async ({ date }) => {
      try {
        requireAuthorizedUser(env);

        const path = date ? `/${date}` : "/today";
        const response = await publisherRequest(env, path, {
          method: "GET",
          redirect: "manual"
        });

        if (response.body) {
          await response.body.cancel();
        }

        return textResult(
          JSON.stringify(
            {
              ok: response.ok,
              status: response.status,
              date: date ?? "today",
              url: date
                ? `${PUBLIC_PUBLISHER_URL}/${date}`
                : `${PUBLIC_PUBLISHER_URL}/today`
            },
            null,
            2
          ),
          !response.ok
        );
      } catch (error) {
        return textResult(
          error instanceof Error ? error.message : "Unknown lookup error",
          true
        );
      }
    }
  );


  server.registerTool(
    "deliver_newspaper",
    {
      description:
        "Verify a published Palm Beach Times edition and deliver its cache-busted dated URL through the dedicated Palm Beach Times Slack bot. Delivery is idempotent by edition date and channel unless force=true.",
      inputSchema: {
        date: optionalDate,
        weatherEmoji: z.string().min(1).max(8).optional(),
        force: z.boolean().default(false)
      }
    },
    async ({ date, weatherEmoji, force }) => {
      try {
        requireAuthorizedUser(env);

        if (!env.SLACK_BOT_TOKEN) throw new Error("SLACK_BOT_TOKEN is not configured");
        if (env.SLACK_CHANNEL_ID !== "C0C66163K7D") throw new Error("Delivery blocked: SLACK_CHANNEL_ID must be the verified #news channel C0C66163K7D");

        const resolvedDate = date ?? todayNewYork();
        const path = `/${resolvedDate}`;
        const response = await publisherRequest(env, path, {
          method: "GET",
          redirect: "manual",
          headers: { "Cache-Control": "no-cache" }
        });

        const html = await response.text();

        if (!response.ok) {
          return textResult(
            `Delivery blocked: publisher returned HTTP ${response.status} for ${resolvedDate}`,
            true
          );
        }

        const integrityErrors = validatePalmBeachTimesProductionHtml(html);
        if (integrityErrors.length) {
          return textResult(`Delivery blocked: ${integrityErrors.join("; ")}`, true);
        }

        const dedupeKey = `pbt-delivery:${resolvedDate}:${env.SLACK_CHANNEL_ID}`;
        const prior = await env.OAUTH_KV.get(dedupeKey);

        if (prior && !force) {
          return textResult(
            JSON.stringify(
              {
                ok: true,
                delivered: false,
                deduped: true,
                date: resolvedDate,
                channel: env.SLACK_CHANNEL_ID,
                priorDelivery: JSON.parse(prior)
              },
              null,
              2
            )
          );
        }

        const publicUrl =
          `${PUBLIC_PUBLISHER_URL}/${resolvedDate}?rev=${revisionStamp()}`;
        const emoji = weatherEmoji?.trim() || "🌴";
        const message = `Here is today’s paper ${emoji} 📰 ${publicUrl}`;

        const slackResponse = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
            "Content-Type": "application/json; charset=utf-8"
          },
          body: JSON.stringify({
            channel: env.SLACK_CHANNEL_ID,
            text: message,
            unfurl_links: false,
            unfurl_media: false
          })
        });
        let slackResult: { ok?: boolean; error?: string; channel?: string; ts?: string };
        try {
          slackResult = await slackResponse.json() as { ok?: boolean; error?: string; channel?: string; ts?: string };
        } catch {
          return textResult("Slack delivery failed: invalid JSON response", true);
        }
        if (!slackResponse.ok || !slackResult.ok) {
          return textResult(`Slack delivery failed: ${slackResult.error || `HTTP ${slackResponse.status}`}`, true);
        }

        if (slackResult.channel !== env.SLACK_CHANNEL_ID || !slackResult.ts) {
          return textResult("Slack delivery unverified: missing or mismatched channel/message receipt; inspect Slack before retrying", true);
        }
        const deliveredAt = new Date().toISOString();
        await env.OAUTH_KV.put(
          dedupeKey,
          JSON.stringify({ deliveredAt, url: publicUrl, channel: slackResult.channel, messageTs: slackResult.ts }),
          { expirationTtl: 60 * 60 * 24 * 14 }
        );

        return textResult(
          JSON.stringify(
            {
              ok: true,
              delivered: true,
              deduped: false,
              date: resolvedDate,
              deliveredAt,
              channel: slackResult.channel,
              messageTs: slackResult.ts,
              url: publicUrl
            },
            null,
            2
          )
        );
      } catch (error) {
        return textResult(
          error instanceof Error ? error.message : "Unknown Slack delivery error",
          true
        );
      }
    }
  );

  // Recovery reads are bounded to avoid truncated MCP tool responses.
  const artifactDate = z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/);
  const artifactSha = z.string().regex(/^[a-f0-9]{64}$/);
  const artifactName = z.enum(["html", "comic", "market_input", "masthead", "checkpoint"]);

  server.registerTool(
    "verify_recovery_manifest",
    {
      description: "Validate an immutable newspaper recovery checkpoint and all four stored assets. Does not publish or deliver.",
      inputSchema: { date: artifactDate, sha256: artifactSha }
    },
    async ({ date, sha256 }) => {
      try {
        requireAuthorizedUser(env);
        const token = requirePublishToken(env);
        const params = new URLSearchParams({date, sha256});
        const res = await publisherRequest(env, "/api/recovery-manifest?" + params, {
          headers: { Authorization: "Bearer " + token }
        });
        const body = await res.text();
        if (body.length > 16000) return textResult("Recovery manifest response exceeds safe MCP limit", true);
        return textResult(body, !res.ok);
      } catch (error) {
        return textResult(error instanceof Error ? error.message : "Recovery verification error", true);
      }
    }
  );

  server.registerTool(
    "store_recovery_artifact",
    {
      description: "Store a small immutable recovery artifact (max 16 KB base64 input). Larger newspaper assets require a future bounded chunk transfer; never truncate or split them manually.",
      inputSchema: {
        date: artifactDate, name: artifactName, sha256: artifactSha,
        base64: z.string().min(1).max(22000)
      }
    },
    async ({ date, name, sha256, base64 }) => {
      try {
        requireAuthorizedUser(env);
        const token = requirePublishToken(env);
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0)
          return textResult("Invalid base64 encoding", true);
        const binary = atob(base64);
        if (!binary.length || binary.length > 16000)
          return textResult("Artifact exceeds 16 KB tool limit; use a chunked recovery operation", true);
        const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
        const computed = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
          .map(x => x.toString(16).padStart(2, "0")).join("");
        if (computed !== sha256) return textResult("Recovery artifact SHA-256 mismatch", true);
        const res = await publisherRequest(env, "/api/recovery-artifact", {
          method: "PUT",
          headers: {
            Authorization: "Bearer " + token, "X-Edition-Date": date,
            "X-Artifact-Name": name, "X-Content-SHA256": sha256,
            "Content-Type": "application/octet-stream"
          },
          body: bytes
        });
        return textResult(await res.text(), !res.ok);
      } catch (error) {
        return textResult(error instanceof Error ? error.message : "Recovery storage error", true);
      }
    }
  );

  server.registerTool(
    "get_recovery_artifact",
    {
      description: "Retrieve an exact small immutable recovery artifact as base64, with SHA-256 verification. Refuses responses larger than 16 KB.",
      inputSchema: { date: artifactDate, name: artifactName, sha256: artifactSha }
    },
    async ({ date, name, sha256 }) => {
      try {
        requireAuthorizedUser(env);
        const token = requirePublishToken(env);
        const params = new URLSearchParams({date, name, sha256});
        const res = await publisherRequest(env, "/api/recovery-artifact?" + params, {
          headers: { Authorization: "Bearer " + token }
        });
        if (!res.ok) return textResult("Recovery retrieval HTTP " + res.status + ": " + (await res.text()).slice(0, 800), true);
        if (Number(res.headers.get("Content-Length") || 0) > 16000)
          return textResult("Artifact too large for bounded MCP retrieval", true);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (!bytes.length || bytes.length > 16000)
          return textResult("Artifact too large for bounded MCP retrieval", true);
        const computed = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
          .map(x => x.toString(16).padStart(2, "0")).join("");
        if (computed !== sha256) return textResult("Retrieved artifact checksum mismatch", true);
        const base64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""));
        return textResult(JSON.stringify({ok:true,date,name,sha256,bytes:bytes.length,base64}));
      } catch (error) {
        return textResult(error instanceof Error ? error.message : "Recovery retrieval error", true);
      }
    }
  );

  return server;
}

const apiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return createMcpHandler(() => createServer(env))(request, env, ctx);
  }
};

export default new OAuthProvider<Env>({
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  apiRoute: "/mcp",
  apiHandler,
  defaultHandler: {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
      return AuthHandler.fetch(request, env as Env & Record<string, unknown>, ctx);
    }
  }
});
