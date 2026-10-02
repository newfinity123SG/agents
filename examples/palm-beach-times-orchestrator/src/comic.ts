interface ComicEnv {
  OPENAI_API_KEY: string;
}

const LANES = [
  "beach, ocean and boating",
  "Boca Raton, Delray Beach or West Palm Beach everyday life",
  "mortgage, housing and real-estate absurdities",
  "traffic, commuting, airports or travel",
  "AI, technology and gadgets",
  "food, restaurants, shopping or weekend plans",
  "markets, business or office life",
  "Florida weather and tropical living",
];

function dayOfYear(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const start = Date.UTC(year, 0, 0);
  return Math.floor((Date.UTC(year, month - 1, day) - start) / 86400000);
}

async function generatePanel(
  env: ComicEnv,
  date: string,
  lane: string,
  todaysThread: string,
  panelNumber: 1 | 2 | 3,
) {
  const role =
    panelNumber === 1
      ? "SETUP: establish the everyday South Florida situation and the joke premise."
      : panelNumber === 2
        ? "ESCALATION: the same couple discovers the absurd complication."
        : "PUNCHLINE: resolve the joke with one concise final beat.";

  const prompt = [
    `Create panel ${panelNumber} of a three-panel newspaper comic for The Palm Beach Times dated ${date}.`,
    `Theme lane: ${lane}.`,
    `Optional current-news inspiration: ${todaysThread}`,
    role,
    "This is ONE landscape comic panel only, not a multi-panel page.",
    "Use the SAME recurring South Florida couple in every panel: a dark-haired man in his 40s wearing a coral polo and sunglasses, and a woman in her 40s wearing a straw sunhat and a teal or tropical-print outfit.",
    "Vintage local-newspaper comic look, clean black ink, restrained coastal color, Palm Beach County setting.",
    "Include no more than two short speech balloons. Keep each balloon under eight words and keep every balloon fully inside the panel with generous padding from all edges.",
    "Do not put text, faces, signs, hands, or essential objects against the outer edge.",
    "Do not include a publication masthead, date banner, footer, panel number, or Palm Beach Times logo.",
    "Do not imitate any named artist, existing comic strip, copyrighted character, or real private person.",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2.5-sunburst",
      prompt,
      size: "1536x1024",
      quality: "medium",
    }),
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `comic_panel_${panelNumber}_openai_http_${response.status}: ${body.slice(0, 500)}`,
    );
  }

  const parsed = JSON.parse(body);
  const b64 = parsed?.data?.[0]?.b64_json;

  if (!b64 || String(b64).length < 10000) {
    throw new Error(`comic_panel_${panelNumber}_image_missing_or_too_small`);
  }

  return String(b64);
}

export async function buildComic(
  env: ComicEnv,
  date: string,
  todaysThread: string,
) {
  const lane = LANES[dayOfYear(date) % LANES.length];

  const panels = await Promise.all([
    generatePanel(env, date, lane, todaysThread, 1),
    generatePanel(env, date, lane, todaysThread, 2),
    generatePanel(env, date, lane, todaysThread, 3),
  ]);

  const panelHtml = panels
    .map(
      (b64, index) =>
        `<div class="comic-panel"><img class="comic-image comic-panel-image" src="data:image/png;base64,${b64}" alt="Original Palm Beach Times comic panel ${index + 1} of 3 for ${date}"></div>`,
    )
    .join("");

  return `<h2>The Morning Strip</h2>
    <div class="comic-wrap" data-comic-source="generated-image">
      <div class="comic-strip-grid">${panelHtml}</div>
    </div>
    <p class="caption"><strong>Today in South Florida</strong> · Original three-panel artwork generated for this edition.</p>`;
}
