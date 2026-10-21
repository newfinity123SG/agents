// Validate editorial model output against exact source records before rendering.
// Pure function: no model, network, publishing, or Slack calls.
const desks=new Set(["local","around_town","development","money","ai_technology","defense","government","restaurants","screen_guide","weather_ocean"]);
function norm(s){try{const u=new URL(s);if(!["https:","http:"].includes(u.protocol))return null;u.hash="";for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);return u.toString().replace(/\/$/,"").toLowerCase();}catch{return null;}}
const words=s=>typeof s==="string"?s.trim().split(/\s+/).filter(Boolean).length:Infinity;
export function validateEditorialDraft(draft,sourcePackage){
 const failures=[],stories=[],used=new Set();
 if(!draft||typeof draft!=="object"||Array.isArray(draft))return {pass:false,failures:["invalid_draft"],stories:[]};
 if(!sourcePackage||!Array.isArray(sourcePackage.candidates))return {pass:false,failures:["invalid_source_package"],stories:[]};
 if(draft.editionDate!==sourcePackage.editionDate)failures.push("date_mismatch");
 const sourceByUrl=new Map(sourcePackage.candidates.map(s=>[norm(s.url),s]));
 if(!draft.desks||typeof draft.desks!=="object"||Array.isArray(draft.desks))failures.push("invalid_desks");
 else for(const [desk,items] of Object.entries(draft.desks)){
  if(!desks.has(desk)||!Array.isArray(items)){failures.push("invalid_desk:"+desk);continue;}
  if(items.length>6)failures.push("desk_limit:"+desk);
  for(const item of items){
   const url=norm(item?.url),src=sourceByUrl.get(url);
   if(!url||!src){failures.push("unknown_source:"+desk);continue;}
   if(used.has(url)){failures.push("duplicate_url:"+desk);continue;}used.add(url);
   if(src.desk!==desk){failures.push("source_desk_mismatch:"+desk);continue;}
   if(item.publishedAt!==src.publishedAt){failures.push("source_date_mismatch:"+desk);continue;}
   if(typeof item.summary!=="string"||!item.summary.trim()||words(item.summary)>65){failures.push("invalid_summary:"+desk);continue;}
   if(typeof item.title!=="string"||!item.title.trim()||item.title.length>170){failures.push("invalid_title:"+desk);continue;}
   stories.push({desk,title:item.title.trim(),summary:item.summary.trim(),url:src.url,publishedAt:src.publishedAt,
    evidenceUrl:src.evidenceUrl,source:src.source,verified:true});
  }
 }
 if(stories.length>20)failures.push("total_story_limit");
 return {pass:failures.length===0,failures,storyCount:stories.length,stories,
  warnings:stories.length<12?["story_count_below_editorial_target"]:[],publishing:false,slack:false};
}
