// Deterministic, bounded and token-free editorial preparation.
// Accepts source candidates, never invents dates, never publishes.
const DESKS=["local","around_town","development","money","ai_technology","defense","government","restaurants","screen_guide","weather_ocean"];
const LIMIT_PER_DESK=6, MAX_CANDIDATES=240, MAX_TOTAL=48;
const clean=(x,max=240)=>typeof x==="string"?x.replace(/\s+/g," ").trim().slice(0,max):"";
function urlOf(s){try{const u=new URL(s);if(!["https:","http:"].includes(u.protocol)||u.username||u.password)return null;u.hash="";for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);return u.toString();}catch{return null;}}
function dateOf(s){if(typeof s!=="string")return null;const v=s.trim();const n=Date.parse(v);return Number.isFinite(n)?new Date(n).toISOString():null;}
function localDate(now){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);}
export function buildEditorialPackage(input,now=new Date()){
 const rejected={invalid:0,stale:0,duplicate:0,overflow:0,unverified:0},errors=[];
 if(!input||typeof input!=="object"||Array.isArray(input))return {ok:false,errors:["invalid_input"]};
 if(!Array.isArray(input.candidates))return {ok:false,errors:["candidates_required"]};
 if(input.candidates.length>MAX_CANDIDATES)return {ok:false,errors:["too_many_candidates"]};
 const editionDate=localDate(now),byDesk=Object.fromEntries(DESKS.map(k=>[k,[]]));
 const seen=new Set();
 for(const x of input.candidates){
  const desk=clean(x?.desk,40),title=clean(x?.title,170),url=urlOf(x?.url),published=dateOf(x?.publishedAt);
  const observed=dateOf(x?.observedAt),start=dateOf(x?.eventStart),summary=clean(x?.summary,380);
  if(!DESKS.includes(desk)||!title||!url||!published||!observed){rejected.invalid++;continue;}
  if(x?.verified!==true||!urlOf(x?.evidenceUrl)){rejected.unverified++;continue;}
  const age=(now.getTime()-Date.parse(observed))/86400000;
  const pubAge=(now.getTime()-Date.parse(published))/86400000;
  if(age<-.05||age>2||pubAge<-.1||pubAge>14){rejected.stale++;continue;}
  if(start&&Date.parse(start)<now.getTime()-86400000){rejected.stale++;continue;}
  const key=url.toLowerCase().replace(/\/$/,"");
  if(seen.has(key)){rejected.duplicate++;continue;}
  seen.add(key);
  if(byDesk[desk].length>=LIMIT_PER_DESK){rejected.overflow++;continue;}
  byDesk[desk].push({desk,title,url,publishedAt:published,observedAt:observed,
   eventStart:start,summary,evidenceUrl:urlOf(x.evidenceUrl),source:clean(x.source,90)});
 }
 const candidates=DESKS.flatMap(k=>byDesk[k]).slice(0,MAX_TOTAL);
 const gaps=DESKS.filter(k=>!byDesk[k].length);
 const compact={version:"1",editionDate,timezone:"America/New_York",candidates,
  editorialRules:["Use only supplied citations for factual claims","Never invent dates, financial values, events, or quotes","Do not treat eventStart as publishedAt","Keep each story in only one desk","Report missing coverage and conflicting facts","No publication or Slack delivery"]};
 const payload=JSON.stringify(compact);
 return {ok:true,mode:"zero-model-token-prepare",editionDate,accepted:candidates.length,
  rejected,gaps,payloadBytes:new TextEncoder().encode(payload).length,
  package:compact,readyForEditorialTrial:candidates.length>=15&&gaps.length<=3,
  publication:"DISABLED",slack:"DISABLED"};
}
