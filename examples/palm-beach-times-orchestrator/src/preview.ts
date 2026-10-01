import { NEWSPAPER_TEMPLATE } from "./template";
import { buildEditorialPlan } from "./editorial";
import { runResearchDryRun } from "./research";
import { loadLockedMasthead } from "./assets";
import { buildMarketCharts } from "./market";
import { buildComic } from "./comic";
import { validateEditionHtml } from "./validate";

interface PreviewEnv {
  OPENAI_API_KEY: string;
  PUBLISHER: Fetcher;
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

function cleanWeatherNote(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return "";
  if (/not a boca raton (?:observation|reading)/i.test(raw)) return "";
  if (/station-widget reading/i.test(raw)) return "";
  if (/verify alerts before publication/i.test(raw)) return "";
  return raw.replace(/https?:\/\/\S+/gi, "").replace(/\s{2,}/g, " ").trim();
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

function weatherDesk(data: any) {
  const s = data?.stats ?? {};
  const stats = [
    ["Now", s.now],
    ["High / Low", s.highLow],
    ["Rain", s.rain],
    ["Wind", s.wind],
    ["Humidity", s.humidity],
    ["Sun", s.sun],
  ].filter(([, value]) => String(value ?? "").trim());

  const ledger = stats.length
    ? `<div class="weather-ledger">${stats.map(([label,value]) => `<div class="stat"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>`).join("")}</div>`
    : "";

  const alerts = (data?.alerts ?? []).filter(Boolean);
  const marineBits = [
    data?.tides ? `Tides: ${data.tides}` : "",
    data?.waterTemp ? `Water: ${data.waterTemp}` : "",
    data?.surf ? `Surf: ${data.surf}` : "",
    data?.ripCurrentRisk ? `Rip current: ${data.ripCurrentRisk}` : "",
  ].filter(Boolean).join(" · ");

  const sourceUrl = safeUrl(data?.sourceUrl);
  const source = data?.sourceName ? `<span class="source">${esc(data.sourceName)}</span>` : "";
  const link = sourceUrl ? `<a class="read" href="${sourceUrl}" target="_blank" rel="noopener">Read official conditions →</a>` : "";

  return `<h2>Weather &amp; Ocean</h2>
    ${ledger}
    <article class="story"><h3>Best window / Watch out</h3><p>${esc(data?.summary ?? "Boca Raton weather and ocean detail unavailable from verified sources.")}</p>${alerts.length ? `<ul class="brief-list">${alerts.map((a:string)=>`<li>${esc(a)}</li>`).join("")}</ul>` : ""}${source}${link}</article>
    ${marineBits || data?.beachVerdict ? `<article class="story"><h3>Tides &amp; beach verdict</h3><p>${esc(marineBits)}${data?.beachVerdict ? ` ${esc(data.beachVerdict)}` : ""}</p></article>` : ""}
    ${(data?.notes ?? []).map(cleanWeatherNote).filter(Boolean).map((n:string)=>`<p class="quiet">${esc(n)}</p>`).join("")}`;
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

  const [mastheadLogo, marketPreview] = await Promise.all([
    loadLockedMasthead(env),
    buildMarketCharts(),
  ]);

  const comicPreview = await buildComic(
    env,
    research.date,
    editorial.todaysThread ?? "",
  );

  const html = replaceAll(NEWSPAPER_TEMPLATE, {
    MASTHEAD: "The Palm Beach Times",
    EDITION: editionLabel(research.editionType),
    REGION_LABEL: "Boca · Delray · West Palm · Palm Beach County",
    DATE: esc(research.date),
    DESK_LABEL: "Preview Build",
    MASTHEAD_LOGO: mastheadLogo,
    DECK: "Local people. Brighter days.",
    CONTENTS_LINKS: '<a href="#front-page">Front Page</a><a href="#local">Local</a><a href="#money">Money</a><a href="#technology">Technology</a><a href="#lifestyle">Lifestyle</a><a href="#comic">Comic</a>',
    TODAYS_THREAD: `<p>${esc(editorial.todaysThread ?? "")}</p>`,
    FRONT_PAGE: `<span class="kicker">Front Page</span><h2>${esc(front.headline ?? "Morning Briefing")}</h2><p>${esc(front.summary ?? "")}</p>${front.sourceName ? `<span class="source">${esc(front.sourceName)}</span>` : ""}${safeUrl(front.sourceUrl) ? `<a class="read" href="${safeUrl(front.sourceUrl)}" target="_blank" rel="noopener">Read full story →</a>` : ""}`,
    MORNING_BRIEFS: `<h2>Morning in 60 Seconds</h2><ol class="brief-list">${briefs.map((b: string) => `<li>${esc(b)}</li>`).join("")}</ol>`,
    WEATHER_OCEAN_DESK: weatherDesk(editorial.weatherOcean ?? {}),
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

  validateEditionHtml(html);

  return {
    ok: true,
    date: research.date,
    editionType: research.editionType,
    html,
    notes: [
      "Preview only: no publisher call",
      "Preview only: no Slack delivery",
      "Locked graphical masthead loaded from the last valid published edition",
      "Live 1-day S&P 500, Dow and Nasdaq charts enabled with aligned ETF volume proxies",
      "Fresh generated Morning Strip is embedded directly in the HTML",
    ],
  };
}
