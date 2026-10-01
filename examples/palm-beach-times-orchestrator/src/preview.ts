import { NEWSPAPER_TEMPLATE } from "./template";
import { MASTHEAD_DATA_URI } from "./masthead-data";
import { buildEditorialPlan } from "./editorial";
import { runResearchDryRun } from "./research";

interface PreviewEnv {
  OPENAI_API_KEY: string;
}

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(value: unknown) {
  const raw = String(value ?? "");
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? esc(raw) : "";
  } catch {
    return "";
  }
}

function story(item: any) {
  if (!item?.headline) return "";
  const url = safeUrl(item.sourceUrl);
  return `<article class="story">
    <h3>${esc(item.headline)}</h3>
    <p>${esc(item.summary ?? item.whyItMatters ?? "")}</p>
    ${item.sourceName ? `<span class="source">${esc(item.sourceName)}</span>` : ""}
    ${url ? `<a class="read" href="${url}" target="_blank" rel="noopener">Read full story →</a>` : ""}
  </article>`;
}

function storyDesk(title: string, items: any[], quiet = "Quiet this morning") {
  const body = (items ?? []).map(story).filter(Boolean).join("");
  return `<h2>${esc(title)}</h2>${body || `<p class="quiet">${esc(quiet)}</p>`}`;
}

function replaceAll(template: string, values: Record<string, string>) {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

function editionLabel(kind: string) {
  if (kind === "friday-weekend") return "Friday + Weekend Edition";
  if (kind === "weekend") return "Weekend Edition";
  if (kind === "sunday-week-ahead") return "Sunday Week Ahead Edition";
  return "Morning Edition";
}

export async function buildPreviewEdition(env: PreviewEnv) {
  const research = await runResearchDryRun(env);
  const editorial = await buildEditorialPlan(env, research.plan);

  const front = editorial.frontPage ?? {};
  const briefs = (editorial.morningBriefs ?? []).slice(0, 4);
  while (briefs.length < 4) briefs.push("No additional verified brief selected.");

  const marketPreview = `
    <div class="market-glance" data-preview-only="true">
      <div class="market-glance-head">
        <span class="market-glance-title">Markets at a Glance</span>
        <span class="market-glance-period">Preview only</span>
      </div>
      <p class="quiet">Live S&amp;P 500, Dow and Nasdaq intraday charts are intentionally withheld from this preview until the dedicated market-data adapter is connected. No fabricated market series.</p>
    </div>`;

  const comicPreview = `
    <h2>The Morning Strip</h2>
    <div class="comic-wrap" data-preview-only="true">
      <p class="quiet">Comic placement verified. Daily image generation and embedding will be connected in the next production stage.</p>
    </div>`;

  const html = replaceAll(NEWSPAPER_TEMPLATE, {
    MASTHEAD: "The Palm Beach Times",
    EDITION: editionLabel(research.editionType),
    REGION_LABEL: "Boca · Delray · West Palm · Palm Beach County",
    DATE: esc(research.date),
    DESK_LABEL: "Preview Build",
    MASTHEAD_LOGO: `<img class="masthead-logo" src="${MASTHEAD_DATA_URI}" alt="The Palm Beach Times">`,
    DECK: "Local people. Brighter days.",
    CONTENTS_LINKS: '<a href="#front-page">Front Page</a><a href="#local">Local</a><a href="#money">Money</a><a href="#technology">Technology</a><a href="#lifestyle">Lifestyle</a><a href="#comic">Comic</a>',
    TODAYS_THREAD: `<p>${esc(editorial.todaysThread ?? "")}</p>`,
    FRONT_PAGE: `<span class="kicker">Front Page</span><h2>${esc(front.headline ?? "Morning Briefing")}</h2><p>${esc(front.summary ?? "")}</p>${front.sourceName ? `<span class="source">${esc(front.sourceName)}</span>` : ""}${safeUrl(front.sourceUrl) ? `<a class="read" href="${safeUrl(front.sourceUrl)}" target="_blank" rel="noopener">Read full story →</a>` : ""}`,
    MORNING_BRIEFS: `<h2>Morning in 60 Seconds</h2><ol class="brief-list">${briefs.map((b: string) => `<li>${esc(b)}</li>`).join("")}</ol>`,
    WEATHER_OCEAN_DESK: `<h2>Weather &amp; Ocean</h2><p>${esc(editorial.weatherOcean?.summary ?? "Weather and ocean detail will be expanded from verified official sources in production.")}</p><ul class="brief-list">${(editorial.weatherOcean?.notes ?? []).map((n: string) => `<li>${esc(n)}</li>`).join("")}</ul>`,
    MARKET_CHARTS: marketPreview,
    MONEY_DESK: storyDesk("Money", editorial.money ?? []),
    AROUND_TOWN_DESK: storyDesk("Around Town", editorial.aroundTown ?? []),
    DEVELOPMENT_DESK: storyDesk("Development & Deals", editorial.development ?? []),
    LOCAL_NEWS_DESK: storyDesk("Palm Beach County & South Florida News", editorial.localNews ?? []),
    COMMUNITY_ISSUES_DESK: storyDesk("Community Issues", editorial.communityIssues ?? []),
    TECH_COMMUNITY_DESK: storyDesk("Technology & Community", editorial.technology ?? []),
    WORLD_LIFESTYLE_DESK: storyDesk("World & Lifestyle", editorial.worldLifestyle ?? []),
    COMIC_TILE: comicPreview,
    SCREEN_GUIDE_TILE: storyDesk("Screen Guide: TV, Streaming & Movies", editorial.screenGuide ?? [], "No verified release selected for this preview."),
    EXTRAS_TILE: `<h2>Quick Extras</h2><div class="extras-grid">${(editorial.quickExtras ?? []).map(story).join("") || '<p class="quiet">No additional verified items selected.</p>'}</div>`,
    FOOTER: '<span>The Palm Beach Times · Preview build</span><span>Not published · Not sent to Slack</span>',
  });

  return {
    ok: true,
    date: research.date,
    editionType: research.editionType,
    html,
    notes: [
      "Preview only: no publisher call",
      "Preview only: no Slack delivery",
      "Market charts intentionally blocked until verified intraday adapter is connected",
      "Comic image generation intentionally blocked until image generation stage is connected",
    ],
  };
}
