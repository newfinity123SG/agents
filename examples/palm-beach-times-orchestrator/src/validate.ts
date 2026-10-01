export function validateEditionHtml(html: string) {
  const errors: string[] = [];

  const unresolved = html.match(/\{\{[A-Z0-9_]+\}\}/g) ?? [];
  if (unresolved.length) {
    errors.push(`unresolved_placeholders:${[...new Set(unresolved)].join(",")}`);
  }

  for (const marker of [
    'data-layout="pbt-broadsheet-v6"',
    'data-skill-build="pbt-v6.0"',
    'data-masthead="pbt-exact-graphical-v1"',
    'data-masthead-source="locked-pbt-artwork"',
    'data-market-period="1d"',
    'data-market-style="raw-intraday-volume"',
    'id="screen-guide"',
  ]) {
    if (!html.includes(marker)) errors.push(`missing_marker:${marker}`);
  }

  if (!/class="masthead-logo"[^>]*src="data:image\/(?:png|jpeg|webp);base64,[^"]{100000,}"/i.test(html)) {
    errors.push("masthead_not_embedded");
  }

  const marketCharts = (html.match(/class="market-chart"/g) ?? []).length;
  if (marketCharts !== 3) errors.push(`market_chart_count_${marketCharts}`);

  const pointCounts = [...html.matchAll(/data-point-count="(\d+)"/g)].map((m) => Number(m[1]));
  if (pointCounts.length !== 3 || pointCounts.some((n) => n < 48)) {
    errors.push("market_point_count_invalid");
  }

  const volumeBars = (html.match(/class="market-volume-bar"/g) ?? []).length;
  if (volumeBars < 144) errors.push(`market_volume_bars_${volumeBars}`);

  const screen =
    html.match(/<section class="feature" id="screen-guide">([\s\S]*?)<\/section>/i)?.[1] ?? "";
  if ((screen.match(/class="story"/g) ?? []).length < 3) {
    errors.push("screen_guide_too_thin");
  }

  if (errors.length) {
    throw new Error(`edition_validation_failed: ${errors.join("; ")}`);
  }
}
