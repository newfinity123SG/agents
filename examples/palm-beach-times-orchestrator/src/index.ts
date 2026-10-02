interface Env {
  SLACK_WEBHOOK_URL: string;
  PUBLISHER: Fetcher;
}

type DeliveryStatus = {
  ok: boolean;
  service: string;
  stage: "idle" | "publisher_verified" | "slack_sent" | "failed";
  date?: string;
  detail?: string;
  updatedAt: string;
};

let lastStatus: DeliveryStatus = {
  ok: true,
  service: "palm-beach-times-delivery",
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

function nyDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function nyHour(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
}

function revisionStamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}${get("second")}`;
}

function setStatus(
  stage: DeliveryStatus["stage"],
  detail?: string,
  date?: string,
) {
  lastStatus = {
    ok: stage !== "failed",
    service: "palm-beach-times-delivery",
    stage,
    detail,
    date,
    updatedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify({ event: "pbt_delivery", ...lastStatus }));
}

async function fetchPublishedEdition(env: Env, date: string) {
  // Use the Publisher service binding so delivery never depends on Flo,
  // ChatGPT Slack transport, or the retired orchestrator build path.
  const response = await env.PUBLISHER.fetch(
    new Request(`https://publisher.internal/${date}`, {
      method: "GET",
      headers: { "Cache-Control": "no-cache" },
    }),
  );

  const html = await response.text();

  if (!response.ok) {
    throw new Error(`publisher_http_${response.status}`);
  }

  if (!html || html.length < 10000) {
    throw new Error("publisher_html_missing_or_too_small");
  }

  if (!html.includes(date)) {
    throw new Error("publisher_wrong_date");
  }

  if (!html.includes('data-layout="pbt-broadsheet-v6"')) {
    throw new Error("publisher_layout_marker_missing");
  }

  if (!html.includes('data-masthead="pbt-exact-graphical-v1"')) {
    throw new Error("publisher_masthead_marker_missing");
  }

  if (!html.includes('id="screen-guide"')) {
    throw new Error("publisher_screen_guide_missing");
  }

  const marketCharts = (html.match(/class="market-chart"/g) ?? []).length;
  if (marketCharts !== 3) {
    throw new Error(`publisher_market_chart_count_${marketCharts}`);
  }

  if (!html.includes('data-comic-source="generated-image"')) {
    throw new Error("publisher_comic_missing");
  }

  return html;
}

async function sendSlack(env: Env, date: string) {
  if (!env.SLACK_WEBHOOK_URL) {
    throw new Error("SLACK_WEBHOOK_URL missing");
  }

  const publicUrl =
    `https://palm-beach-times-publisher.steven-a00.workers.dev/${date}` +
    `?rev=${revisionStamp()}`;

  // Keep delivery intentionally dumb. The newspaper is already built,
  // validated and published before this Worker touches anything.
  const message = `Here is today’s paper 🌴 📰 ${publicUrl}`;

  const response = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });

  const body = await response.text();

  if (!response.ok || body.trim().toLowerCase() !== "ok") {
    throw new Error(`slack_http_${response.status}: ${body.slice(0, 300)}`);
  }

  return { message, url: publicUrl };
}

async function deliver(env: Env, source: "manual" | "scheduled") {
  const date = nyDate();

  await fetchPublishedEdition(env, date);
  setStatus("publisher_verified", `source=${source}`, date);

  const slack = await sendSlack(env, date);
  setStatus("slack_sent", `source=${source}`, date);

  return {
    ok: true,
    date,
    source,
    stage: "slack_sent",
    url: slack.url,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      const date = nyDate();
      try {
        await fetchPublishedEdition(env, date);
        return json({
          ok: true,
          service: "palm-beach-times-delivery",
          date,
          publisher: "verified",
        });
      } catch (error) {
        return json(
          {
            ok: false,
            service: "palm-beach-times-delivery",
            date,
            error: error instanceof Error ? error.message : String(error),
          },
          503,
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/status") {
      return json(lastStatus);
    }

    if (request.method === "POST" && url.pathname === "/deliver") {
      try {
        return json(await deliver(env, "manual"));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        setStatus("failed", detail, nyDate());
        return json({ ok: false, error: detail, status: lastStatus }, 500);
      }
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    if (nyHour() !== 7) return;

    try {
      await deliver(env, "scheduled");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setStatus("failed", detail, nyDate());
      console.error(
        JSON.stringify({
          event: "pbt_delivery_failure",
          error: detail,
          at: new Date().toISOString(),
        }),
      );
    }
  },
} satisfies ExportedHandler<Env>;
