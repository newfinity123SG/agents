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

export async function buildComic(env: ComicEnv, date: string, todaysThread: string) {
  const lane = LANES[dayOfYear(date) % LANES.length];

  const prompt = [
    `Create an original three-panel horizontal newspaper comic for The Palm Beach Times dated ${date}.`,
    `Theme lane: ${lane}.`,
    `Optional current-news inspiration: ${todaysThread}`,
    "Use a vintage local-newspaper comic feel with clean black ink and restrained muted color.",
    "IMPORTANT LAYOUT RULE: create exactly three equal-width comic panels in ONE SINGLE HORIZONTAL ROW: left panel, center panel, right panel.",
    "The three panels MUST be side by side. NEVER stack panels vertically. NEVER use a two-row or three-row comic layout.",
    "Each panel should be a vertical rectangle separated by clear black comic-panel borders.",
    "Keep short, phone-readable dialogue inside each panel.",
    "The finished strip should feel approximately 1400x600: wide and shallow.",
    "Fill the image edge-to-edge horizontally with the three panels. Use almost no outer white margin.",
    "Do not include a newspaper masthead, publication title, date banner, page header, footer, or Palm Beach Times logo inside the image.",
    "Keep the humor benign, observational, and rooted in South Florida life.",
    "Do not depict a real private person. Do not imitate a named artist, existing comic strip, or copyrighted character.",
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
    throw new Error(`comic_openai_http_${response.status}: ${body.slice(0, 500)}`);
  }

  const parsed = JSON.parse(body);
  const b64 = parsed?.data?.[0]?.b64_json;

  if (!b64 || String(b64).length < 10000) {
    throw new Error("comic_image_missing_or_too_small");
  }

  return `<h2>The Morning Strip</h2>
    <div class="comic-wrap" data-comic-source="generated-image">
      <img class="comic-image" src="data:image/png;base64,${b64}" alt="Original three-panel horizontal Palm Beach Times comic for ${date}">
    </div>
    <p class="caption"><strong>Today in South Florida</strong> · Original artwork generated for this edition.</p>`;
}
