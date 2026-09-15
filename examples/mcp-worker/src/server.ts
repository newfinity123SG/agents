import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "../../../packages/agents/src/mcp/server/index";
import { z } from "zod";

interface Env {
  PUBLISHER: Fetcher;
  PUBLISH_TOKEN?: string;
}

const PUBLIC_PUBLISHER_URL =
  "https://palm-beach-times-publisher.steven-a00.workers.dev";

function requirePublishToken(env: Env) {
  const publishToken = env.PUBLISH_TOKEN;

  if (!publishToken) {
    throw new Error("PUBLISH_TOKEN is not configured");
  }

  return publishToken;
}

function textResult(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {})
  };
}

function publisherRequest(env: Env, path: string, init?: RequestInit) {
  return env.PUBLISHER.fetch(
    new Request(`https://publisher.internal${path}`, init)
  );
}

function createServer(env: Env) {
  const server = new McpServer({
    name: "Palm Beach Times Publisher",
    version: "1.1.1"
  });

  server.registerTool(
    "publish_newspaper",
    {
      description:
        "Publish a completed Palm Beach Times HTML edition to the newspaper publisher and return browser URLs for the dated edition and /today.",
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
        const publishToken = requirePublishToken(env);

        const response = await publisherRequest(env, "/api/publish", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${publishToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            date,
            html,
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
          // The public URLs below are synthesized intentionally because the
          // service binding uses an internal hostname when invoking publisher.
        }

        return textResult(
          JSON.stringify(
            {
              ok: true,
              date: result.date ?? date,
              title: result.title ?? title,
              editionType: result.editionType ?? editionType,
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
        "Return the browser URL and availability status for today's Palm Beach Times or a specific dated edition. Leave date blank to get today's edition.",
      inputSchema: {
        date: z
          .union([
            z.literal(""),
            z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
          ])
          .optional()
      }
    },
    async ({ date }) => {
      try {
        const normalizedDate = date?.trim() || undefined;
        const path = normalizedDate ? `/${normalizedDate}` : "/today";
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
              date: normalizedDate ?? "today",
              url: normalizedDate
                ? `${PUBLIC_PUBLISHER_URL}/${normalizedDate}`
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

export default {
  fetch(request, env, ctx) {
    return createMcpHandler(() => createServer(env as Env))(request, env, ctx);
  }
} satisfies ExportedHandler<Env>;
