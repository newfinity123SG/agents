import type {
  AuthRequest,
  OAuthHelpers
} from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";

interface Env {
  OAUTH_PROVIDER: OAuthHelpers;
  OAUTH_KV: KVNamespace;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  ALLOWED_GITHUB_LOGIN?: string;
}

interface GitHubTokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  id: number;
  login: string;
  name?: string | null;
}

const app = new Hono<{ Bindings: Env }>();
const STATE_COOKIE = "__Host-pbt-oauth-state";
const STATE_PREFIX = "pbt-oauth-state:";

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function stateCookie(state: string): string {
  return `${STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`;
}

function clearStateCookie(): string {
  return `${STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return undefined;

  for (const part of cookie.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return undefined;
}

app.get("/authorize", async (c) => {
  try {
    const clientId = required(c.env.GITHUB_CLIENT_ID, "GITHUB_CLIENT_ID");
    required(c.env.GITHUB_CLIENT_SECRET, "GITHUB_CLIENT_SECRET");
    required(c.env.ALLOWED_GITHUB_LOGIN, "ALLOWED_GITHUB_LOGIN");

    const oauthReqInfo: AuthRequest =
      await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

    if (!oauthReqInfo.clientId) {
      return c.text("Invalid OAuth client", 400);
    }

    const state = crypto.randomUUID();
    await c.env.OAUTH_KV.put(
      `${STATE_PREFIX}${state}`,
      JSON.stringify(oauthReqInfo),
      { expirationTtl: 600 }
    );

    const callbackUrl = new URL("/callback", c.req.url).href;
    const githubAuthorize = new URL("https://github.com/login/oauth/authorize");
    githubAuthorize.searchParams.set("client_id", clientId);
    githubAuthorize.searchParams.set("redirect_uri", callbackUrl);
    githubAuthorize.searchParams.set("scope", "read:user");
    githubAuthorize.searchParams.set("state", state);
    githubAuthorize.searchParams.set("allow_signup", "false");

    return new Response(null, {
      status: 302,
      headers: {
        Location: githubAuthorize.toString(),
        "Set-Cookie": stateCookie(state),
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return c.text(
      error instanceof Error ? error.message : "Authorization failed",
      500
    );
  }
});

app.get("/callback", async (c) => {
  const state = c.req.query("state");
  const code = c.req.query("code");
  const upstreamError = c.req.query("error");

  if (upstreamError) {
    return c.text(`GitHub authorization failed: ${upstreamError}`, 400);
  }

  if (!state || !code) {
    return c.text("Missing GitHub OAuth code or state", 400);
  }

  const cookieState = readCookie(c.req.raw, STATE_COOKIE);
  if (!cookieState || cookieState !== state) {
    return c.text("OAuth state validation failed", 400);
  }

  const stored = await c.env.OAUTH_KV.get(`${STATE_PREFIX}${state}`);
  if (!stored) {
    return c.text("OAuth state expired or was already used", 400);
  }

  await c.env.OAUTH_KV.delete(`${STATE_PREFIX}${state}`);

  let oauthReqInfo: AuthRequest;
  try {
    oauthReqInfo = JSON.parse(stored) as AuthRequest;
  } catch {
    return c.text("Stored OAuth request is invalid", 400);
  }

  try {
    const clientId = required(c.env.GITHUB_CLIENT_ID, "GITHUB_CLIENT_ID");
    const clientSecret = required(
      c.env.GITHUB_CLIENT_SECRET,
      "GITHUB_CLIENT_SECRET"
    );
    const allowedLogin = required(
      c.env.ALLOWED_GITHUB_LOGIN,
      "ALLOWED_GITHUB_LOGIN"
    );

    const callbackUrl = new URL("/callback", c.req.url).href;
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: callbackUrl
        })
      }
    );

    const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;
    if (!tokenResponse.ok || !tokenData.access_token) {
      return c.text(
        tokenData.error_description || tokenData.error || "GitHub token exchange failed",
        400
      );
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tokenData.access_token}`,
        "User-Agent": "Palm-Beach-Times-MCP",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    if (!userResponse.ok) {
      return c.text("Unable to read authenticated GitHub user", 502);
    }

    const user = (await userResponse.json()) as GitHubUser;
    if (user.login.toLowerCase() !== allowedLogin.toLowerCase()) {
      return c.text("This GitHub account is not authorized for this MCP server", 403);
    }

    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReqInfo,
      userId: String(user.id),
      metadata: {
        label: user.name || user.login
      },
      scope: oauthReqInfo.scope,
      props: {
        githubLogin: user.login,
        githubUserId: user.id,
        displayName: user.name || user.login
      }
    });

    const headers = new Headers({
      Location: redirectTo,
      "Cache-Control": "no-store"
    });
    headers.append("Set-Cookie", clearStateCookie());

    return new Response(null, { status: 302, headers });
  } catch (error) {
    return c.text(
      error instanceof Error ? error.message : "OAuth callback failed",
      500
    );
  }
});

app.get("/", (c) => {
  return c.html(`<!doctype html>
<html>
<head><meta charset="utf-8"><title>Palm Beach Times MCP</title></head>
<body style="font-family:system-ui;max-width:720px;margin:48px auto;padding:0 20px;line-height:1.5">
  <h1>Palm Beach Times MCP</h1>
  <p>Authenticated MCP publisher for The Palm Beach Times.</p>
  <p><code>/mcp</code> requires OAuth authorization.</p>
</body>
</html>`);
});

export { app as AuthHandler };
