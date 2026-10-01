import { runResearchDryRun } from "./research";

interface Env {
  OPENAI_API_KEY: string;
  SLACK_WEBHOOK_URL: string;
  PUBLISHER: Fetcher;
}

type Stage =
  | "idle"
  | "triggered"
  | "research_started"
  | "market_data_ready"
  | "comic_ready"
  | "html_built"
  | "validation_passed"
  | "published"
  | "publisher_verified"
  | "slack_sent"
  | "slack_verified"
  | "complete"
  | "failed";

interface RunStatus {
  ok: boolean;
  service: string;
  stage: Stage;
  date?: string;
  detail?: string;
  updatedAt: string;
}

let lastStatus: RunStatus = {
  ok: true,
  service: "palm-beach-times-orchestrator",
  stage: "idle",
  updatedAt: new Date(0).toISOString(),
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function logStage(stage: Stage, detail?: string, date?: string) {
  lastStatus = {
    ok: stage !== "failed",
    service: "palm-beach-times-orchestrator",
    stage,
    date,
    detail,
    updatedAt: new Date().toISOString(),
  };

  console.log(
    JSON.stringify({
      event: "pbt_stage",
      stage,
      date,
      detail,
      at: lastStatus.updatedAt,
    }),
  );
}

async function verifyPublisher(env: Env) {
  const response = await env.PUBLISHER.fetch(
    new Request("https://publisher.internal/health"),
  );

  if (!response.ok) {
    throw new Error(`publisher_health_http_${response.status}`);
  }

  return response.json();
}

async function verifyOpenAI(env: Env) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-6-luna",
      input: "Reply with exactly: PBT_OPENAI_OK",
      max_output_tokens: 24,
    }),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`openai_http_${response.status}: ${body.slice(0, 500)}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("openai_invalid_json");
  }

  const outputText =
    parsed.output_text ??
    parsed.output
      ?.flatMap((item: any) => item.content ?? [])
      ?.find((part: any) => part.type === "output_text")
      ?.text ??
    "";

  if (!String(outputText).includes("PBT_OPENAI_OK")) {
    throw new Error("openai_unexpected_response");
  }

  return { ok: true, model: "gpt-6-luna" };
}

async function sendSlackTest(env: Env) {
  const text =
    "✅ Palm Beach Times delivery test — Cloudflare orchestrator is connected to #personal-flo.";

  const response = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  const body = await response.text();

  if (!response.ok || body.trim().toLowerCase() !== "ok") {
    throw new Error(`slack_http_${response.status}: ${body.slice(0, 500)}`);
  }

  return { ok: true };
}

async function runSkeleton(env: Env, source: "manual" | "scheduled") {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  logStage("triggered", `source=${source}`, date);

  if (!env.OPENAI_API_KEY) {
    logStage("failed", "OPENAI_API_KEY missing", date);
    throw new Error("OPENAI_API_KEY missing");
  }

  if (!env.SLACK_WEBHOOK_URL) {
    logStage("failed", "SLACK_WEBHOOK_URL missing", date);
    throw new Error("SLACK_WEBHOOK_URL missing");
  }

  const publisher = await verifyPublisher(env);
  logStage("complete", "skeleton health checks passed", date);

  return {
    ok: true,
    date,
    source,
    publisher,
    stage: "complete",
    note: "Generation pipeline is not enabled yet.",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      try {
        const publisher = await verifyPublisher(env);
        return json({
          ok: true,
          service: "palm-beach-times-orchestrator",
          publisher,
        });
      } catch (error) {
        return json(
          {
            ok: false,
            service: "palm-beach-times-orchestrator",
            error: error instanceof Error ? error.message : String(error),
          },
          503,
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/status") {
      return json(lastStatus);
    }

    if (request.method === "POST" && url.pathname === "/run-test") {
      try {
        return json(await runSkeleton(env, "manual"));
      } catch (error) {
        return json(
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            status: lastStatus,
          },
          500,
        );
      }
    }

    if (request.method === "POST" && url.pathname === "/test-openai") {
      try {
        return json(await verifyOpenAI(env));
      } catch (error) {
        return json(
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500,
        );
      }
    }

    if (request.method === "POST" && url.pathname === "/test-slack") {
      try {
        return json(await sendSlackTest(env));
      } catch (error) {
        return json(
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500,
        );
      }
    }

    if (request.method === "POST" && url.pathname === "/dry-run-research") {
      try {
        logStage("research_started", "manual dry-run research");
        const result = await runResearchDryRun(env);
        return json(result);
      } catch (error) {
        logStage(
          "failed",
          error instanceof Error ? error.message : String(error),
        );
        return json(
          {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
          500,
        );
      }
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    try {
      await runSkeleton(env, "scheduled");
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "pbt_scheduled_failure",
          error: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString(),
        }),
      );
    }
  },
} satisfies ExportedHandler<Env>;
