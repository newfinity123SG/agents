// Pure, token-free acceptance checks for shadow editions. No publishing.
const REQUIRED=["local","around_town","development","money","ai_technology","restaurants","screen_guide","weather_ocean"];
const validUrl=s=>{try{const x=new URL(s);return x.protocol==="https:"||x.protocol==="http:";}catch{return false;}};
const day=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T12:00:00Z"));
function classify(stories,editionDate){
 const unique=new Set();let duplicates=0,undated=0,unverified=0,future=0;
 const domains=new Set();
 for(const s of stories){
   const url=typeof s.url==="string"?s.url:"";
   if(!validUrl(url)||!day(s.publishedDate)){undated++;continue;}
   const canonical=new URL(url);canonical.hash="";
   ["utm_source","utm_medium","utm_campaign","fbclid","gclid"].forEach(k=>canonical.searchParams.delete(k));
   const key=canonical.toString().replace(/\/$/,"").toLowerCase();
   if(unique.has(key))duplicates++;else unique.add(key);
   domains.add(canonical.hostname.toLowerCase().replace(/^www\./,""));
   if(!s.verified)unverified++;
   if(s.publishedDate>editionDate)future++;
 }
 return {duplicates,undatedOrInvalid:undated,unverified,futureDated:future,uniqueDomains:domains.size,uniqueStories:unique.size};
}
export function evaluateShadowEdition(manifest){
 const failures=[],warnings=[];
 if(!manifest||typeof manifest!=="object"||Array.isArray(manifest))return {pass:false,failures:["invalid_manifest"],warnings:[]};
 if(!day(manifest.editionDate))failures.push("edition_date_invalid");
 if(manifest.layout!=="pbt-broadsheet-v6")failures.push("layout_mismatch");
 if(manifest.skillBuild!=="pbt-v6.0")failures.push("skill_build_mismatch");
 const assets=manifest.assets||{};
 if(assets.lockedMasthead!==true)failures.push("masthead_missing");
 if(assets.embeddedComic!==true)failures.push("comic_missing");
 if(assets.marketDriverLedger!==true)failures.push("market_drivers_missing");
 if(assets.jokeOfTheDay!==true)failures.push("joke_missing");
 const sections=new Set(Array.isArray(manifest.sections)?manifest.sections:[]);
 for(const section of REQUIRED)if(!sections.has(section))failures.push("section_missing:"+section);
 const charts=manifest.charts||{};
 for(const name of ["sp500","dow","nasdaq"]){
  const chart=charts[name];
  if(!chart||!Number.isInteger(chart.observations)||chart.observations<48||
    !Number.isInteger(chart.positiveVolumeObservations)||chart.positiveVolumeObservations<48||
    chart.realObservations!==true||!validUrl(chart.sourceUrl))
    failures.push("chart_unverified:"+name);
 }
 const stories=Array.isArray(manifest.stories)?manifest.stories:[];
 if(stories.length<15)failures.push("story_coverage_below_minimum");
 const findings=classify(stories,manifest.editionDate);
 if(findings.duplicates)failures.push("duplicate_story_urls");
 if(findings.undatedOrInvalid)failures.push("story_source_or_date_missing");
 if(findings.unverified)failures.push("unverified_stories");
 if(findings.futureDated)failures.push("future_dated_stories");
 if(findings.uniqueDomains<10)warnings.push("limited_source_diversity");
 const usage=manifest.modelUsage||{};
 if(!Number.isInteger(usage.totalTokens)||usage.totalTokens<0)failures.push("model_usage_unmeasured");
 else if(usage.totalTokens>30000)warnings.push("token_target_exceeded");
 if(manifest.publisherTouched===true||manifest.slackSent===true)failures.push("shadow_isolation_violation");
 return {pass:failures.length===0,editionDate:manifest.editionDate??null,failures,warnings,
   metrics:{stories:stories.length,...findings,totalTokens:usage.totalTokens??null},
   shadowOnly:true,publication:"DISABLED",slack:"DISABLED"};
}
