import { resolveEditionType } from "./newspaper-spec";

interface ResearchEnv {
  OPENAI_API_KEY: string;
}

function localDateParts(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return { date, editionType: resolveEditionType(now) };
}

function extractOutputText(parsed: any) {
  if (typeof parsed?.output_text === "string") return parsed.output_text;

  const parts = (parsed?.output ?? [])
    .flatMap((item: any) => item?.content ?? [])
    .filter((part: any) => part?.type === "output_text")
    .map((part: any) => part?.text ?? "");

  return parts.join("\n").trim();
}

function parseModelJson(text: string) {
  const trimmed = text.trim();

  const attempts = [
    trimmed,
    trimmed.replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/i, ""),
  ];

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue to balanced-object recovery below.
    }
  }

  const start = trimmed.indexOf("{");
  if (start < 0) {
    throw new Error(`research_output_missing_json_object: ${trimmed.slice(0, 500)}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;

      if (depth === 0) {
        const candidate = trimmed.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          break;
        }
      }
    }
  }

  throw new Error(`research_output_not_json: ${trimmed.slice(0, 500)}`);
}

export async function runResearchDryRun(env: ResearchEnv) {
  const { date, editionType } = localDateParts();

  const prompt = `
You are the research editor for The Palm Beach Times.

Current local date: ${date}
Edition type: ${editionType}
Primary geography in priority order: Boca Raton, Delray Beach, West Palm Beach, Palm Beach County, then broader South Florida only when materially relevant.

Use live web search. Return ONLY valid JSON, no markdown.

Build a compact research plan for a premium local morning newspaper. This is a DRY RUN and must not publish anything.

Required JSON shape:
{
  "date": "YYYY-MM-DD",
  "editionType": "...",
  "frontPageCandidates": [
    {"headline":"...", "whyItMatters":"...", "sourceUrl":"...", "sourceName":"...", "publishedAt":"..."}
  ],
  "localCandidates": [],
  "developmentCandidates": [],
  "moneyCandidates": [],
  "technologyCandidates": [],
  "worldLifestyleCandidates": [],
  "screenGuideCandidates": [],
  "weatherOcean": {
    "currentConditions": "",
    "highLow": "",
    "rain": "",
    "wind": "",
    "humidityDewPoint": "",
    "sunriseSunset": "",
    "alerts": [],
    "tides": "",
    "waterTemp": "",
    "surf": "",
    "ripCurrentRisk": "",
    "beachVerdict": "",
    "sourceUrl": "",
    "sourceName": ""
  },
  "weatherOceanNotes": [],
  "duplicateRisks": [],
  "editorNotes": []
}

Requirements:
- Prefer fresh current-day or very recent reporting.
- Prefer primary/official sources where practical.
- Include direct source URLs.
- Do not invent dates, facts, or links.
- Keep this dry-run candidate pool between 30 and 45 items total so the final edition has enough verified material to fill the desks without filler.
- At least 16 candidates should be Boca/Delray/West Palm/Palm Beach County specific when enough meaningful fresh material exists.
- Keep each headline under 120 characters.
- Keep each whyItMatters under 180 characters.
- Weather/ocean research must be centered on Boca Raton first, with Delray Beach and West Palm Beach differences only when meaningful.
- Populate the structured weatherOcean object with verified Boca Raton conditions/forecast, high/low, rain chance, wind, humidity/dew point when available, sunrise/sunset, active alerts, Lake Worth/Boca-relevant tides, water temperature, surf, rip-current risk, and a short beachVerdict when supported.
- Do NOT use Pompano Beach Airpark or another distant station as Boca Raton's current-condition reading. If a precise Boca observation is unavailable, use the Boca point forecast wording instead of substituting another city's observation.
- Prefer NWS/NOAA/NDBC/NOAA Tides & Currents and official local sources. Put the primary official source in weatherOcean.sourceUrl/sourceName. Do not put raw URLs inside weatherOceanNotes.
- weatherOceanNotes should contain only useful reader-facing context. Do not include data-provenance caveats like 'this is not a Boca observation' or 'latest station-widget reading located' in the visible paper.
- Deliberately research each local desk separately: Around Town, Development & Deals, Palm Beach County & South Florida News, and Community Issues.
- Around Town should deliberately look for Boca and Delray events, openings, restaurants, markets, parks and useful same-day happenings before filling with West Palm.
- Money should deliberately research mortgage, housing, rates, lenders and Palm Beach County business in addition to general markets.
- Local News should target at least 4 viable candidates so the final desk can usually carry 2-4 strong items.
- Quick Extras should have at least 3 viable leftover candidates whenever the morning cycle supports them.
- Deliberately research Screen Guide releases across Netflix, Hulu, Max, Prime Video, Apple TV+, Disney+, Peacock, Paramount+, major networks, and current theatrical releases. Include enough confirmed current releases for at least 3 final Screen Guide selections.
- Deliberately research Technology & Community and World & Lifestyle so those desks are not left empty merely because the first search pass was local.
- Keep weather/ocean notes and editor notes extremely concise.
- One event/entity may appear only once as a full candidate.
- Screen Guide items must have confirmed release/premiere dates where available.
- Do not include private user data.
- Return the JSON immediately after research. Do not add commentary before or after it.
`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-6-luna",
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      input: prompt,
      max_output_tokens: 12000,
    }),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`research_openai_http_${response.status}: ${body.slice(0, 1000)}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("research_openai_invalid_json");
  }

  if (parsed?.status === "incomplete") {
    const reason = parsed?.incomplete_details?.reason ?? "unknown";
    throw new Error(`research_openai_incomplete_${reason}`);
  }

  const output = extractOutputText(parsed);
  if (!output) throw new Error("research_openai_empty_output");

  const plan = parseModelJson(output);

  return {
    ok: true,
    date,
    editionType,
    plan,
  };
}
