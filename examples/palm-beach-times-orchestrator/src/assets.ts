interface AssetEnv {
  PUBLISHER: Fetcher;
}

const BOOTSTRAP_DATE = "2026-09-30";

export async function loadLockedMasthead(env: AssetEnv) {
  const response = await env.PUBLISHER.fetch(
    new Request(`https://publisher.internal/${BOOTSTRAP_DATE}`),
  );

  if (!response.ok) {
    throw new Error(`masthead_bootstrap_http_${response.status}`);
  }

  const html = await response.text();
  const match = html.match(
    /<img\b[^>]*class=["'][^"']*masthead-logo[^"']*["'][^>]*src=["'](data:image\/(?:png|jpeg|webp);base64,[^"']+)["']/i,
  );

  if (!match?.[1] || match[1].length < 100000) {
    throw new Error("masthead_bootstrap_asset_missing");
  }

  return `<img class="masthead-logo" data-masthead-source="locked-pbt-artwork" src="${match[1]}" alt="The Palm Beach Times masthead">`;
}
