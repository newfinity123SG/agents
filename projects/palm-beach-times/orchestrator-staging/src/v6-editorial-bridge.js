// Transform a validated editorial draft into safe v6 story fragments.
// This is intentionally PARTIAL; assets/charts/joke cannot be invented here.
import {validateEditorialDraft} from "./editorial-output-validator.js";
const MAP={local:"LOCAL_NEWS_DESK",around_town:"AROUND_TOWN_DESK",development:"DEVELOPMENT_DESK",
 money:"MONEY_DESK",ai_technology:"AI_TECHNOLOGY_DESK",defense:"WORLD_LIFESTYLE_DESK",
 government:"COMMUNITY_ISSUES_DESK",restaurants:"RESTAURANT_OPENINGS_TILE",screen_guide:"SCREEN_GUIDE_TILE",
 weather_ocean:"WEATHER_OCEAN_DESK"};
const RESERVED=["MASTHEAD_LOGO","CONTENTS_LINKS","TODAYS_THREAD","FRONT_PAGE","MORNING_BRIEFS","DAILY_JOKE_TILE",
"MARKET_CHARTS","MARKET_DRIVERS","COMIC_TILE","EXTRAS_TILE","FOOTER"];
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
.replace(/"/g,"&quot;").replace(/'/g,"&#39;");
export function buildV6EditorialFragments(draft,sourcePackage){
 const validation=validateEditorialDraft(draft,sourcePackage);
 if(!validation.pass)return {ok:false,failures:validation.failures,fragments:{},publishing:false};
 const byField=new Map();
 for(const story of validation.stories){
  const field=MAP[story.desk];if(!field)continue;
  if(!byField.has(field))byField.set(field,[]);
  byField.get(field).push('<article class="pbt-sourced-story"><h3>'+esc(story.title)+'</h3>'+
   '<p>'+esc(story.summary)+'</p><p class="source"><a href="'+esc(story.url)+
   '" rel="noopener noreferrer">'+esc(story.source||"Source")+'</a></p></article>');
 }
 const fragments={DATE_ISO:sourcePackage.editionDate};
 for(const [field,blocks] of byField)fragments[field]=blocks.join("\n");
 const required=[...new Set([...RESERVED,...Object.values(MAP)])];
 return {ok:true,fragments,readyForAssembly:false,
  missingFields:required.filter(field=>!fragments[field]),
  storyCount:validation.storyCount,unmappedFields:[],
  note:"Partial content fragments only. Canonical assembler and strict validation must run with all genuine assets and sections.",
  publishing:false,slack:false};
}
