export const NEWSPAPER_TEMPLATE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{MASTHEAD}} — {{DATE}}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Playfair+Display:wght@700;800;900&display=swap');
:root{
  --paper:#e5d8c1;--paper-light:#f0e7d7;--ink:#17130f;--muted:#62594d;
  --rule:#3b3024;--rule-soft:rgba(59,48,36,.28);--accent:#7a3f2e;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:#b9a88b;color:var(--ink);font:15px/1.5 'Libre Baskerville',Georgia,'Times New Roman',serif}
a{color:var(--accent);text-underline-offset:2px}
.paper{
  width:min(1480px,calc(100vw - 22px));margin:10px auto 20px;padding:18px 22px 24px;
  background:repeating-linear-gradient(0deg,rgba(78,58,29,.012) 0 1px,transparent 1px 4px),linear-gradient(180deg,var(--paper-light),var(--paper));
  border:1px solid rgba(59,48,36,.58);box-shadow:0 10px 28px rgba(0,0,0,.12)
}
.masthead{border-top:4px double var(--rule);border-bottom:4px double var(--rule);padding:8px 6px 10px;margin-bottom:18px}
.meta{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;font-size:.66rem;text-transform:uppercase;letter-spacing:.14em;color:var(--muted)}
.meta span:nth-child(2){text-align:center}.meta span:last-child{text-align:right}
.edition{display:inline-block;border:1px solid var(--rule);padding:2px 7px}
.nameplate{text-align:center;margin:4px auto 2px}.nameplate .semantic-title{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.masthead-logo{width:min(860px,84%);max-height:270px;height:auto;display:block;margin:0 auto;object-fit:contain;mix-blend-mode:multiply}
.mast-sub{text-align:center;margin-top:5px;font-size:.8rem;font-style:italic;color:var(--muted)}
.contents{display:flex;justify-content:center;flex-wrap:wrap;gap:8px 18px;margin-top:9px;padding-top:7px;border-top:1px solid var(--rule-soft);font-size:.66rem;text-transform:uppercase;letter-spacing:.08em}
.contents a{color:var(--ink);text-decoration:none}
.todays-thread{margin:-4px 0 18px;padding:9px 0 11px;border-bottom:3px double var(--rule);display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:start}
.todays-thread .thread-label{font-size:.6rem;text-transform:uppercase;letter-spacing:.12em;font-weight:700;color:var(--muted);white-space:nowrap;padding-top:2px}
.todays-thread p{margin:0;font-size:.9rem;line-height:1.55;font-style:italic}

/* The page is deliberately grouped. Major regions use rules, not boxes. */
.hero{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(300px,.75fr);gap:24px;padding-bottom:18px;border-bottom:3px double var(--rule);margin-bottom:18px}
.hero-main{padding-right:22px;border-right:1px solid var(--rule-soft)}
.hero-briefs{padding-left:0}
.kicker{display:block;font-size:.6rem;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:700;margin-bottom:6px}
.hero h2,.desk h2,.feature h2,.quick-strip h2{font-family:'Playfair Display',Georgia,serif}
.hero h2{font-size:clamp(2.1rem,3vw,3.2rem);line-height:1;margin:0 0 10px;text-transform:none}
.hero p{font-size:.98rem;line-height:1.58;margin:.35rem 0 .65rem}
.hero-briefs h2{font-size:1.2rem;text-transform:uppercase;border-bottom:2px solid var(--rule);padding-bottom:5px;margin:0 0 7px}
.hero-briefs li{margin-bottom:8px;font-size:.84rem;line-height:1.45}

.main-desks{display:grid;grid-template-columns:.9fr 1.05fr 1.05fr;gap:0;margin-bottom:20px;border-bottom:3px double var(--rule)}
.desk{padding:0 18px 18px;min-width:0}
.desk:first-child{padding-left:0}.desk:last-child{padding-right:0}
.desk + .desk{border-left:1px solid var(--rule-soft)}
.desk h2{font-size:1.3rem;line-height:1.08;margin:0 0 9px;padding-bottom:5px;border-bottom:2px solid var(--rule);text-transform:uppercase}
.story{margin:0;padding:0}.story + .story{margin-top:11px;padding-top:10px;border-top:1px solid var(--rule-soft)}
.story h3{font-size:1rem;line-height:1.22;margin:0 0 4px}.story p{font-size:.86rem;line-height:1.5;margin:.2rem 0 .45rem}
.read{font-size:.76rem;font-weight:700}.source{display:block;font-size:.67rem;color:var(--muted)}

.weather-ledger,.ocean-ledger,.stat-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:7px 0 10px}
.stat{padding:6px 0;border-bottom:1px solid var(--rule-soft)}.stat .label{display:block;font-size:.58rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.stat .value{font-size:.86rem;font-weight:700}

/* Rich 1-day intraday market charts live inside the Money desk. */
.market-glance{margin:0 0 14px;padding:10px 10px 9px;border:1px solid rgba(59,48,36,.46);border-radius:12px;background:rgba(255,250,238,.36)}
.market-glance-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 2px 8px;padding-bottom:6px;border-bottom:2px solid var(--rule)}
.market-glance-title{font-family:'Playfair Display',Georgia,serif;font-size:1.05rem;font-weight:900;text-transform:uppercase;letter-spacing:.025em}
.market-glance-period{font-family:'Libre Baskerville',Georgia,serif;font-size:.62rem;text-transform:uppercase;letter-spacing:.16em;color:var(--muted);padding-left:10px;border-left:1px solid var(--rule-soft)}
.market-row{display:grid;grid-template-columns:minmax(112px,.48fr) minmax(0,1.52fr);gap:10px;align-items:center;padding:9px 8px;margin:7px 0;border:1px solid rgba(59,48,36,.35);border-radius:10px;background:rgba(248,240,224,.58);position:relative;overflow:hidden}
.market-row:before{content:'';position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--market-color)}
.market-meta{padding-left:5px;min-width:0}.market-name{display:block;font-family:'Playfair Display',Georgia,serif;font-size:.92rem;font-weight:900;line-height:1.08}.market-level{display:block;font-family:'Playfair Display',Georgia,serif;font-size:1.02rem;font-weight:800;line-height:1.12;margin-top:3px}.market-change{display:inline-block;margin-top:5px;padding:2px 6px;border-radius:999px;font-size:.62rem;font-weight:800;white-space:nowrap}.market-change.market-up{background:rgba(0,126,77,.1);color:#007e4d}.market-change.market-down{background:rgba(181,38,52,.1);color:#b52634}.market-change.market-flat{background:rgba(91,85,76,.1);color:var(--muted)}
.market-chart{width:100%;height:126px;display:block;overflow:visible}.market-grid{stroke:rgba(59,48,36,.16);stroke-width:1;stroke-dasharray:2 4}.market-reference-line{stroke:#b52634;stroke-width:1.15;stroke-dasharray:5 4}.market-reference-label{fill:#8f202c;font:8px 'Libre Baskerville',Georgia,serif}.market-area{fill:var(--market-color);fill-opacity:.1}.market-line{fill:none;stroke:var(--market-color);stroke-width:2.25;stroke-linecap:butt;stroke-linejoin:miter}.market-end{fill:var(--market-color);stroke:#f7efdf;stroke-width:2}.market-volume-divider{stroke:rgba(59,48,36,.26);stroke-width:1}.market-volume-bar{fill:var(--market-color);fill-opacity:.34;shape-rendering:crispEdges}.market-axis-label{fill:var(--muted);font:9px 'Libre Baskerville',Georgia,serif}.market-source{display:block;margin:7px 2px 0;font-size:.56rem;color:var(--muted);line-height:1.35;font-style:italic}

.brief-list{margin:.2rem 0 0;padding-left:18px}.brief-list li{font-size:.82rem;line-height:1.45;margin-bottom:7px}
.hot-item{padding:7px 0;border-top:1px solid var(--rule-soft);font-size:.82rem;line-height:1.45}.hot-item:first-child{border-top:0;padding-top:0}
.badge{display:inline-block;border:1px solid var(--rule);padding:1px 4px;margin-right:4px;font-size:.52rem;text-transform:uppercase}

.local-expanded{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin-bottom:20px;border-bottom:3px double var(--rule)}
.local-expanded .desk:first-child{padding-left:0}.local-expanded .desk:last-child{padding-right:0}.local-expanded .desk + .desk{border-left:1px solid var(--rule-soft)}
.local-expanded .quiet{font-size:.78rem;font-style:italic;color:var(--muted);margin:.2rem 0 .45rem}

.support-desks{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:20px;border-bottom:3px double var(--rule)}
.support-desks .desk:first-child{padding-left:0;padding-right:22px}.support-desks .desk:last-child{padding-left:22px;padding-right:0}

.feature-row{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(300px,.7fr);gap:24px;margin-bottom:14px;align-items:start}
.feature{padding-top:3px}.feature + .feature{border-left:1px solid var(--rule-soft);padding-left:24px}
.feature h2{font-size:1.3rem;text-transform:uppercase;margin:0 0 8px;padding-bottom:5px;border-bottom:2px solid var(--rule)}
.comic-wrap{background:rgba(255,250,238,.20);padding:4px;border:1px solid rgba(59,48,36,.30);text-align:center;overflow:hidden}.comic-wrap img.comic-image{width:100%;max-width:100%;height:315px;display:block;margin:0 auto;border:1px solid rgba(59,48,36,.55);object-fit:contain}
.caption{font-size:.64rem;color:var(--muted);font-style:italic;margin:.35rem 0 0}#screen-guide .story{margin-top:8px;padding-top:8px}#screen-guide .story h3{font-size:.92rem}#screen-guide .story p{font-size:.77rem;line-height:1.38;margin:.15rem 0 .3rem}#screen-guide .source,#screen-guide .read{font-size:.64rem}

.quick-strip{border-top:3px double var(--rule);padding-top:10px}
.quick-strip h2{font-size:1.05rem;text-transform:uppercase;margin:0 0 8px}
.extras-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0}
.extras-grid .story{padding:0 12px;border-right:1px solid var(--rule-soft)}.extras-grid .story:first-child{padding-left:0}.extras-grid .story:last-child{border-right:0;padding-right:0}
.extras-grid .story h3{font-size:.85rem}.extras-grid .story p{font-size:.74rem;line-height:1.4}
.footer{display:flex;justify-content:space-between;gap:12px;margin-top:13px;padding-top:7px;border-top:1px solid var(--rule-soft);font-size:.64rem;color:var(--muted)}

/* Neutralize accidental old tiled markup. */
.tile,.brief-card{border:0!important;background:transparent!important;box-shadow:none!important;padding:0!important;min-height:0!important}
.columns,.col{display:contents!important}

@media(max-width:1100px){.main-desks{grid-template-columns:1fr 1fr}.local-expanded{grid-template-columns:1fr 1fr}.local-expanded .desk:last-child{grid-column:1/-1;border-left:0;border-top:1px solid var(--rule-soft);padding:18px 0}.main-desks .desk:last-child{grid-column:1/-1;border-left:0;border-top:1px solid var(--rule-soft);padding:18px 0}.feature-row,.hero{grid-template-columns:1fr}.hero-main{border-right:0;padding-right:0}.feature + .feature{border-left:0;padding-left:0;border-top:1px solid var(--rule-soft);padding-top:18px}.extras-grid{grid-template-columns:repeat(2,1fr);gap:12px}.extras-grid .story{border-right:0;padding:0}}
@media(max-width:760px){body{background:var(--paper)}.paper{width:100%;margin:0;border:0;box-shadow:none;padding:12px}.meta{grid-template-columns:1fr;text-align:center}.meta span:last-child{text-align:center}.masthead-logo{width:94%;max-height:200px}.main-desks,.local-expanded,.support-desks{grid-template-columns:1fr}.local-expanded .desk:last-child{grid-column:auto;border-top:0;padding:16px 0}.desk,.desk:first-child,.desk:last-child,.support-desks .desk:first-child,.support-desks .desk:last-child{padding:16px 0;border-left:0!important}.desk + .desk{border-top:1px solid var(--rule-soft)}.extras-grid{grid-template-columns:1fr}.hero{gap:14px}.hero-main{padding-bottom:12px;border-bottom:1px solid var(--rule-soft)}}
@media(max-width:760px){.todays-thread{grid-template-columns:1fr;gap:3px;margin-bottom:14px}.todays-thread .thread-label{white-space:normal}}
@page{size:landscape;margin:.3in}
</style>
</head>
<body>
<main class="paper" data-layout="pbt-broadsheet-v6" data-skill-build="pbt-v6.0">
<header class="masthead">
  <div class="meta"><span><span class="edition">{{EDITION}}</span> · {{REGION_LABEL}}</span><span>{{DATE}}</span><span>{{DESK_LABEL}}</span></div>
  <div class="nameplate" data-masthead="pbt-exact-graphical-v1">
    <h1 class="semantic-title">The Palm Beach Times</h1>
    {{MASTHEAD_LOGO}}
  </div>
  <div class="mast-sub">{{DECK}}</div>
  <nav class="contents">{{CONTENTS_LINKS}}</nav>
</header>

<section class="todays-thread" aria-label="Today’s Thread">
  <div class="thread-label">Today’s Thread</div>
  <div>{{TODAYS_THREAD}}</div>
</section>

<section class="hero" id="front-page">
  <article class="hero-main">{{FRONT_PAGE}}</article>
  <aside class="hero-briefs">{{MORNING_BRIEFS}}</aside>
</section>

<section class="main-desks" aria-label="Primary desks">
  <section class="desk" id="weather-ocean">{{WEATHER_OCEAN_DESK}}</section>
  <section class="desk" id="money">{{MARKET_CHARTS}}{{MONEY_DESK}}</section>
  <section class="desk" id="local">{{AROUND_TOWN_DESK}}</section>
</section>

<section class="local-expanded" aria-label="Expanded local coverage">
  <section class="desk" id="development">{{DEVELOPMENT_DESK}}</section>
  <section class="desk" id="local-news">{{LOCAL_NEWS_DESK}}</section>
  <section class="desk" id="community-issues">{{COMMUNITY_ISSUES_DESK}}</section>
</section>

<section class="support-desks" aria-label="Supporting desks">
  <section class="desk" id="technology">{{TECH_COMMUNITY_DESK}}</section>
  <section class="desk" id="lifestyle">{{WORLD_LIFESTYLE_DESK}}</section>
</section>

<section class="feature-row">
  <section class="feature" id="comic" data-required-asset="comic">{{COMIC_TILE}}</section>
  <section class="feature" id="screen-guide">{{SCREEN_GUIDE_TILE}}</section>
</section>

<section class="quick-strip">{{EXTRAS_TILE}}</section>
<footer class="footer">{{FOOTER}}</footer>
</main>
</body>
</html>
`;
