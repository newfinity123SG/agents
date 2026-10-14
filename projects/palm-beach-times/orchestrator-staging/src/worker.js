// PBT OpenAI Skill staging-only probe. No cron, publishing or Slack calls.
// Only authenticated GET /health and POST /api/skill-probe are supported.
const SKILL_ID="skill_6acfa1c4e23c8191b11b4aaa56cd19260974294f866c1d1e";
function json(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}})}
export default {
 async fetch(req,env){
  const url=new URL(req.url);
  if(req.method==="GET"&&url.pathname==="/health")return json({ok:true,service:"pbt-openai-orchestrator-staging",publishing:false,slack:false,scheduler:false,skillId:SKILL_ID,skillVersion:"1"});
  if(req.method!=="POST"||url.pathname!=="/api/skill-probe")return json({ok:false,error:"Not found"},404);
  if(!env.PROBE_TOKEN||req.headers.get("Authorization")!=="Bearer "+env.PROBE_TOKEN)return json({ok:false,error:"Unauthorized"},401);
  if(!env.OPENAI_API_KEY)return json({ok:false,error:"Missing OPENAI_API_KEY secret"},503);
  const body={model:"gpt-6-astra",tools:[{type:"shell",environment:{type:"container_auto",skills:[{type:"skill_reference",skill_id:SKILL_ID,version:"1"}]}}],input:"This is a nonpublishing, low-cost connectivity test. Read the personal-morning-newspaper Skill SKILL.md and report its name, whether the canonical v6 template and scripts are present, and whether a locked masthead PNG is available. Do not research current news, create a newspaper, generate images, contact Slack, or upload files. Keep the response under 140 words.",max_output_tokens:850};
  const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const raw=await response.text();
  let result;try{result=JSON.parse(raw)}catch{return json({ok:false,error:"Malformed OpenAI response",upstreamStatus:response.status},502)}
  if(!response.ok)return json({ok:false,error:"OpenAI API request failed",upstreamStatus:response.status,upstreamCode:result?.error?.code??null,upstreamMessage:String(result?.error?.message??"").slice(0,400)},502);
  const outputs=Array.isArray(result.output)?result.output:[];
  const text=outputs.filter(o=>o.type==="message").flatMap(o=>o.content||[]).filter(c=>c.type==="output_text").map(c=>c.text).join("\n");
  return json({ok:true,status:result.status,id:result.id,skillId:SKILL_ID,version:"1",output:text.slice(0,2000),usage:result.usage??null,publication:"DISABLED",delivery:"DISABLED"});
 }
};
