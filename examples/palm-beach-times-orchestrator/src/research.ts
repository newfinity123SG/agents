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
      } else if (ch === "\\\\") {
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
  "weatherOceanNotes": [],
  "duplicateRisks": [],
  "editorNotes": []
}

Requirements:
- Prefer fresh current-day or very recent reporting.
- Prefer primary/official sources where practical.
- Include direct source URLs.
- Do not invent dates, facts, or links.
- Keep the total candidate pool between 18 and 28 items.
- At least 8 candidates should be Boca/Delray/West Palm/Palm Beach County specific when enough meaningful fresh material exists.
- One event/entity may appear only once as a full candidate.
- Screen Guide items must have confirmed release/premiere dates where available.
- Do not include private user data.
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
      max_output_tokens: 7000,
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
