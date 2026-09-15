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
  OAUTH_KV: KVNamespace;
}

const PUBLIC_PUBLISHER_URL =
  "https://palm-beach-times-publisher.steven-a00.workers.dev";

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
    version: "2.1.0"
  });

  server.registerTool(
    "publish_newspaper",
    {
      description:
        "Publish a completed Palm Beach Times HTML edition and return browser URLs for the dated edition and /today. The publisher automatically applies the classic Palm Beach Times blackletter masthead treatment.",
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
        const publishedHtml = applyPalmBeachTimesMasthead(html);

        const response = await publisherRequest(env, "/api/publish", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${publishToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            date,
            html: publishedHtml,
            title,
            editionType
          })
        });

        const body = await response.text();
        if (!response.ok) {
          return textResult(
            `Publishing failed with HTTP ${response.status}: ${body}`,
            true
          );
        }

        let result: Record<string, unknown> = {};
        try {
          result = JSON.parse(body) as Record<string, unknown>;
        } catch {
          // Public URLs are synthesized below because the service binding
          // invokes the publisher using an internal hostname.
        }

        return textResult(
          JSON.stringify(
            {
              ok: true,
              date: result.date ?? date,
              title: result.title ?? title,
              editionType: result.editionType ?? editionType,
              mastheadStyle: "classic-blackletter",
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
