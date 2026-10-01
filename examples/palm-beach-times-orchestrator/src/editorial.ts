interface EditorialEnv {
  OPENAI_API_KEY: string;
}

function extractOutputText(parsed: any) {
  if (typeof parsed?.output_text === "string") return parsed.output_text;
  return (parsed?.output ?? [])
    .flatMap((item: any) => item?.content ?? [])
    .filter((part: any) => part?.type === "output_text")
    .map((part: any) => part?.text ?? "")
    .join("\n")
    .trim();
}

function parseJson(text: string) {
  const cleaned = text
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/i, "");
  return JSON.parse(cleaned);
}

export async function buildEditorialPlan(env: EditorialEnv, researchPlan: any) {
  const prompt = `
You are the senior editor of The Palm Beach Times.

Using ONLY the supplied research plan, select and write a concise newspaper edition.
Do not invent facts, links, dates, quotes, weather values, market values, or entertainment releases.
Return ONLY valid JSON with no markdown.

Research plan:
${JSON.stringify(researchPlan)}

Return this exact JSON shape:
{
  "todaysThread": "25-55 words",
  "frontPage": {
    "headline": "...",
    "summary": "60-100 words",
    "sourceName": "...",
    "sourceUrl": "..."
  },
  "morningBriefs": ["...", "...", "...", "..."],
  "weatherOcean": {
    "summary": "...",
    "notes": ["..."]
  },
  "money": [
    {"headline":"...","summary":"25-45 words","sourceName":"...","sourceUrl":"..."}
  ],
  "aroundTown": [],
  "development": [],
  "localNews": [],
  "communityIssues": [],
  "technology": [],
  "worldLifestyle": [],
  "screenGuide": [],
  "quickExtras": []
}

Rules:
- One story, one home. No duplicate full-story treatments.
- Local priority: Boca Raton, Delray Beach, West Palm Beach, Palm Beach County.
- Exactly four Morning in 60 Seconds briefs.
- Keep every secondary summary under 45 words.
- If a desk has no supported item, return an empty array.
- Do not turn thin evidence into certainty.
- Preserve source URLs exactly as supplied.
`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-6-luna",
      input: prompt,
      max_output_tokens: 8000,
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`editorial_openai_http_${response.status}: ${body.slice(0, 1000)}`);
  }

  const parsed = JSON.parse(body);
  if (parsed?.status === "incomplete") {
    throw new Error(`editorial_openai_incomplete_${parsed?.incomplete_details?.reason ?? "unknown"}`);
  }

  const output = extractOutputText(parsed);
  if (!output) throw new Error("editorial_openai_empty_output");

  return parseJson(output);
}
