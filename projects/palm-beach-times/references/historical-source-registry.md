# Palm Beach Times Historical Source Registry — Archive Pass 1

**Evidence:** Six archived HTML editions: 2026-10-07, 08, 10, 13, 14 and 15. The 2026-10-10 republication source duplicates the 10th and was deduplicated. An extractor found **159 HTTP(S) outbound links over 72 unique hostnames**.

**Interpretation:** This is a catalogue of *outbound links in the finished paper*, grouped under their actual HTML section IDs. It does **not** prove the underlying research ingestion source, completeness of the historic newspaper archive, the provider's API/RSS terms, or current feed availability. Nested HTML sections may classify a few links imprecisely; inspect the detailed CSV before production use.

## Sections and observed sources

| Paper section | Observed domains (archive examples) |
|---|---|
| Around Town: Boca/Delray/West Palm (`local`) | wpb.org, artsinboca.org, myboca.us, thepalmbeaches.com, artsgarage.org, patch.com, business.bocachamber.com, thecoastalstar.com, downtownwpb.com, delraybeachfl.gov, downtowndelraybeach.com, kravis.org |
| Palm Beach County & South Florida News (`local-news`) | wptv.com, palmbeachcounty.com, tri-rail.com, wpb.org |
| Community Issues (`community-issues`) | wptv.com, wpbf.com, myboca.us, wpb.org |
| Development & Deals (`development`) | bocadailynews.com, wptv.com, apnews.com, wpb.org, washingtonpost.com, myboca.us |
| Restaurant Openings (`restaurant-openings`) | bocamag.com, nypost.com, mamannyc.com, business.palmbeaches.org, norawpb.com, cityplace.com, crowncarib.com, downtowndelraybeach.com |
| AI & Technology (`technology`) | anthropic.com, wsj.com, lemonde.fr, bleepingcomputer.com, diff.wikimedia.org, apnews.com, washingtonpost.com, businessinsider.com, axios.com, techcrunch.com, about.fb.com, blogs.microsoft.com |
| Money (`money`) | finance.yahoo.com, bls.gov, apnews.com, home.treasury.gov, kiplinger.com, businessinsider.com, freddiemac.gcs-web.com, sca.isr.umich.edu, freddiemac.com |
| Weather & Ocean (`weather-ocean`) | forecast.weather.gov, myboca.us, tidesandcurrents.noaa.gov |
| Screen Guide (`screen-guide`) | netflix.com, tomsguide.com, decider.com, boxofficemojo.com, vitalthrills.com, warnerbros.com, sonypictures.com, 20thcenturystudios.com |
| World & Lifestyle (`lifestyle`) | nhl.com, apnews.com, sports.yahoo.com, wsj.com, bocamag.com, frieze.com, expedia.com |
| Front page (`front-page`) | washingtonpost.com, nhc.noaa.gov, bocamag.com, bocapost.com, wptv.com, page.alertsense.com |

Other local sources and less frequent domains are retained in the locally exported full archive CSV/JSON, not inferred from this abbreviated inventory.

## Frequency highlights

- **wptv.com:** 19 links / five editions.
- **wpb.org:** 8 links / five editions.
- **myboca.us:** 9 links / four editions.
- **anthropic.com:** 5 links / four editions.
- **forecast.weather.gov:** 7 links / four editions.
- **apnews.com:** 7 links / three editions.
- **bls.gov:** 6 links / three editions.
- **bocamag.com:** 5 links / two editions.

## Automated-ingestion priorities

1. **Free primary public sources**: official city/county/event calendars, NWS, NOAA, BLS, Treasury, Freddie/FRED. Prefer structured APIs or official calendars when supported.
2. **Local reporting discovery**: WPTV, WPBF, Boca Magazine, Boca Post, Boca Daily News, Coastal Star, Patch; verify RSS/robots/rights and use headline/URL/date summaries, not copied article bodies.
3. **Official event/business pages**: Boca, Delray and WPB government sites, arts venues, downtown and chamber calendars, official restaurant openings. Verify event occurrence dates.
4. **AI/technology**: Anthropic, Meta, Microsoft official announcements plus TechCrunch, Axios, BleepingComputer, AP, WSJ, etc. Separate press claims from independently reported facts.
5. **Money/screens/lifestyle**: official data sources and official studio/streaming schedules first; editorial reporting second. Never infer a real-time chart series from link counts.

## Next ingestion gates

- Pull additional editions from the existing Publisher's dated URLs or R2 **read-only** if accessible; don't assume the six saved HTML files are the full archive.
- Verify the 72-domain exact catalog, date-by-date and section-by-section, against the exported detailed registry.
- Create a provider-method map (API/RSS/HTML calendar/search-only), freshness SLA, attribution/rights constraints, retries, and duplicate story keys.
- Only mark a provider `automated` after a successful, authorized, current, repeatable data fetch.
- Preserve every discovered source; do not narrow editorial coverage simply because a source lacks a free API.
