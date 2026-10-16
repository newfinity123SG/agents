import {buildEditorialPackage} from "./editorial-package.js";
import {evaluateShadowEdition} from "./shadow-quality.js";
import {runExtraction} from "./extraction-diagnostic.js";
import {inspectLocalSources} from "./local-source-diagnostic.js";
import {collectFreeSources} from "./free-sources.js";
// Palm Beach Times: staging-only OpenAI Skill probe and editorial research trial.
// No publishing, R2 writes, Slack calls, crons, or production credentials.
const SKILL_ID = "skill_6acfa1c4e23c8191b11b4aaa56cd19260974294f866c1d1e";
const VERSION = "1";
const MODEL = "gpt-6-astra";
const API = "https://api.openai.com/v1/responses";
const SKILL = {type:"shell",environment:{type:"container_auto",skills:[{type:"skill_reference",skill_id:SKILL_ID,version:VERSION}]}};
const HEADERS = {"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:HEADERS});}
function authorized(req,env){
  return Boolean(env.PROBE_TOKEN && req.headers.get("Authorization")==="Bearer "+env.PROBE_TOKEN);
}
function textOf(response){
  return (Array.isArray(response.output)?response.output:[]).filter(x=>x.type==="message")
    .flatMap(x=>Array.isArray(x.content)?x.content:[])
    .filter(x=>x.type==="output_text").map(x=>x.text).join("\n");
}
function normalize(response,limit=12000){
  return {ok:true,status:response.status,id:response.id,skillId:SKILL_ID,version:VERSION,
    output:textOf(response).slice(0,limit),usage:response.usage??null,
    outputTruncated:textOf(response).length>limit,publication:"DISABLED",delivery:"DISABLED",
    incompleteDetails:response.incomplete_details??null,error:response.error??null};
}
async function openai(path,env,body){
  const res=await fetch(API+path,{method:body?"POST":"GET",
    headers:{Authorization:"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},
    ...(body?{body:JSON.stringify(body)}:{})});
  let data;try{data=await res.json();}catch{return {failed:json({ok:false,error:"Non-JSON OpenAI response",upstreamStatus:res.status},502)};}
  if(!res.ok)return {failed:json({ok:false,error:"OpenAI API request failed",
    upstreamStatus:res.status,upstreamCode:data?.error?.code??null,
    upstreamMessage:String(data?.error?.message??"").slice(0,500)},502)};
  return {data};
}
export default {
  async fetch(req,env){
    const url=new URL(req.url);
    if(req.method==="GET"&&url.pathname==="/health")
      return json({ok:true,service:"pbt-openai-orchestrator-staging",publishing:false,slack:false,
        scheduler:false,skillId:SKILL_ID,skillVersion:VERSION,editorialTrial:true});
    const packageRequest=req.method==="POST"&&url.pathname==="/api/editorial-package";
    const quality=req.method==="POST"&&url.pathname==="/api/shadow-quality";
    const extraction=req.method==="GET"&&url.pathname==="/api/extraction-diagnostic";
    const local=req.method==="GET"&&url.pathname==="/api/local-source-diagnostic";
    const free=req.method==="GET"&&url.pathname==="/api/free-sources";
    const probe=req.method==="POST"&&url.pathname==="/api/skill-probe";
    const draft=req.method==="POST"&&url.pathname==="/api/editorial-trial";
    const status=req.method==="GET"&&url.pathname==="/api/editorial-status";
    if(!packageRequest&&!quality&&!extraction&&!local&&!free&&!probe&&!draft&&!status)return json({ok:false,error:"Not found"},404);
    if(!authorized(req,env))return json({ok:false,error:"Unauthorized"},401);
    if(packageRequest){
      const size=Number(req.headers.get("content-length")||0);
      if(size>131072)return json({ok:false,error:"Input too large"},413);
      let raw;try{raw=await req.text();if(raw.length>131072)return json({ok:false,error:"Input too large"},413);}catch{return json({ok:false,error:"Unable to read input"},400);}
      let input;try{input=JSON.parse(raw);}catch{return json({ok:false,error:"Invalid JSON"},400);}
      const result=buildEditorialPackage(input);
      return json(result,result.ok?200:400);
    }
    if(quality){
      const size=Number(req.headers.get("content-length")||0);
      if(size>65536)return json({ok:false,error:"Manifest too large"},413);
      let raw;try{raw=await req.text();if(raw.length>65536)return json({ok:false,error:"Manifest too large"},413);}
      catch{return json({ok:false,error:"Unable to read manifest"},400);}
      let manifest;try{manifest=JSON.parse(raw);}catch{return json({ok:false,error:"Invalid JSON"},400);}
      return json(evaluateShadowEdition(manifest));
    }
    if(extraction)return json(await runExtraction());
    if(local)return json(await inspectLocalSources());
    if(free)return json(await collectFreeSources(env));
    if(!env.OPENAI_API_KEY)return json({ok:false,error:"Missing OPENAI_API_KEY secret"},503);
    if(status){
      const id=url.searchParams.get("id")||"";
      if(!/^resp_[A-Za-z0-9_-]{8,100}$/.test(id))return json({ok:false,error:"Invalid response ID"},400);
      const r=await openai("/"+encodeURIComponent(id),env);if(r.failed)return r.failed;
      return json(normalize(r.data));
    }
    if(probe){
      const body={model:MODEL,tools:[SKILL],max_output_tokens:850,
        input:"This is a nonpublishing connectivity test. Read the personal-morning-newspaper Skill SKILL.md and inspect the canonical v6 template, six scripts, and locked masthead PNG. Summarize findings under 140 words. Do not research news, create an edition, generate images, publish or contact Slack."};
      const r=await openai("",env,body);if(r.failed)return r.failed;
      return json(normalize(r.data,2000));
    }
    // Research trial only. No fabricated market numbers, no placeholder copy, no publishing.
    // Use background mode: Cloudflare should not wait for a long model/research run.
    const date=new Date().toISOString().slice(0,10);
    const body={model:MODEL,background:true,store:true,
      tools:[SKILL,{type:"web_search"}],max_output_tokens:7000,
      input:`Staging research-only trial for The Palm Beach Times, UTC date ${date}.
Read the personal-morning-newspaper Skill instructions and preserve the original broadsheet v6 layout requirements.
Use live web research to create a STRICTLY CONCISE source-backed editorial planning brief, NOT a publishable edition. Limit research to the minimum needed; do not crawl or repeatedly search the same sources.
Provide 3 sourced news items, 2 sourced AI/technology items, 3 specific Palm Beach/Boca-area local happenings, current weather-source references, and source provenance for US 10Y, Freddie 30Y, BTC and major index charts.
For each claim include ONE source URL, date, and a brief limitation (max 35 words per item). The entire final brief MUST be under 1800 words. Do not expose intermediate research notes or repeat layout rules. Explicitly identify data that cannot be verified, missing licensed intraday OHLCV records, and any unavailable comic-image tooling.
Do NOT invent events, numerical quotes, times, market chart series, source URLs, masthead replacements or illustrations.
Do NOT write files, call a Publisher, contact Slack, generate images, publish an edition or change schedules.
Finish with at most four brief gaps and a GO/NO-GO recommendation. Incomplete source coverage means NO-GO.`};
    const r=await openai("",env,body);if(r.failed)return r.failed;
    return json({ok:true,id:r.data.id,status:r.data.status,editorialTrial:true,
      polling:"GET /api/editorial-status?id="+encodeURIComponent(r.data.id),
      publication:"DISABLED",delivery:"DISABLED"});
  }
};
