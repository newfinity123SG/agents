import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "../../../packages/agents/src/mcp/server/index";
import { z } from "zod";

interface Env {
  PUBLISHER_URL?: string;
  PUBLISH_TOKEN?: string;
}

const DEFAULT_PUBLISHER_URL =
  "https://palm-beach-times-publisher.steven-a00.workers.dev";

function getPublisherUrl(env: Env) {
  return (env.PUBLISHER_URL || DEFAULT_PUBLISHER_URL).replace(/\/+$/, "");
}

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

function createServer(env: Env) {
  const server = new McpServer({
    name: "Palm Beach Times Publisher",
    version: "1.0.1"
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
        const publisherUrl = getPublisherUrl(env);
        const publishToken = requirePublishToken(env);

        const response = await fetch(`${publisherUrl}/api/publish`, {
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

        let result: Record<string, unknown>;
        try {
          result = JSON.parse(body) as Record<string, unknown>;
        } catch {
          return textResult(
            `The publisher returned an unexpected response: ${body}`,
            true
          );
        }

        return textResult(
          JSON.stringify(
            {
              ok: true,
              date: result.date ?? date,
              title: result.title ?? title,
              editionType: result.editionType ?? editionType,
              url: result.url,
              todayUrl: result.todayUrl
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
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
          .optional()
      }
    },
    async ({ date }) => {
      try {
        const publisherUrl = getPublisherUrl(env);
        const editionUrl = date
          ? `${publisherUrl}/${date}`
          : `${publisherUrl}/today`;

        const response = await fetch(editionUrl, {
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
              url: editionUrl
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
