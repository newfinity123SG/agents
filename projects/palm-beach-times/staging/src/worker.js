// Isolated PBT staging publisher. NO Slack, no cron, no production bucket.
// The v6 renderer remains the canonical original and runs separately.
const MAX_BYTES=12_000_000;
const enc=new TextEncoder();
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",b))).map(n=>n.toString(16).padStart(2,"0")).join("");
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+"T12:00:00Z"))&&new Date(d+"T12:00:00Z").toISOString().slice(0,10)===d;
const required=["data-layout=\"pbt-broadsheet-v6\"","data-skill-build=\"pbt-v6.0\"","class=\"market-glance\"","data:image/","id=\"screen-guide\""];
function validate(html,date) {
  if(!html.toLowerCase().startsWith("<!doctype html>")||!html.trimEnd().toLowerCase().endsWith("</html>"))return "Incomplete HTML";
  if(!html.includes('data-edition-date="'+date+'"')||!html.includes('data-joke-date="'+date+'"'))return "Edition or joke date incorrect";
  for(const marker of required)if(!html.includes(marker))return "Missing v6 marker: "+marker;
  if(/\{\{[A-Z0-9_]+\}\}/.test(html))return "Unresolved placeholder";
  return null;
}
async function read(env,key){
 const obj=await env.NEWSPAPERS.get(key);
 if(!obj)return new Response("Not found",{status:404});
 const headers=new Headers();
 headers.set("Content-Type","text/html; charset=utf-8");
 headers.set("Cache-Control","no-store");
 headers.set("X-Content-Type-Options","nosniff");
 if(obj.customMetadata?.sha256)headers.set("X-Content-SHA256",obj.customMetadata.sha256);
 return new Response(obj.body,{headers});
}
export default {
 async fetch(request,env){
  if(!env.NEWSPAPERS)return json({ok:false,error:"Missing isolated NEWSPAPERS R2 binding"},503);
  const url=new URL(request.url),path=url.pathname;
  if(request.method==="GET"&&path==="/health")return json({ok:true,service:"pbt-staging-only",delivery:"DISABLED",scheduler:"DISABLED"});
  if(request.method==="GET"&&path==="/")return Response.redirect(url.origin+"/today",302);
  if(request.method==="GET"&&path==="/today"){
   const p=await env.NEWSPAPERS.get("latest.json");if(!p)return json({ok:false,error:"No staging edition"},404);
   const info=await p.json();return read(env,info.key);
  }
  if(request.method==="GET"&&/^\/\d{4}-\d{2}-\d{2}$/.test(path))return read(env,"editions/"+path.slice(1)+".html");
  // Artifact recovery: immutable content-addressed R2 writes, staging bucket only.
  // This does not invoke the newspaper generator, OpenAI, Slack or production Publisher.
  if(path==="/api/recovery-artifact"&&["PUT","GET"].includes(request.method)){
   if(!env.PUBLISH_TOKEN||request.headers.get("Authorization")!=="Bearer "+env.PUBLISH_TOKEN)
    return json({ok:false,error:"Unauthorized"},401);
   const date=request.headers.get("X-Edition-Date")||"";
   const name=request.headers.get("X-Artifact-Name")||"";
   const expected=request.headers.get("X-Content-SHA256")||"";
   if(!validDate(date)||!["html","comic","market_input","masthead","checkpoint"].includes(name)||
      !/^[a-f0-9]{64}$/.test(expected))
    return json({ok:false,error:"Invalid recovery metadata"},400);
   const key="recovery/"+date+"/"+name+"/"+expected;
   if(request.method==="PUT"){
    const bytes=await request.arrayBuffer();
    if(bytes.byteLength<1||bytes.byteLength>MAX_BYTES)return json({ok:false,error:"Invalid artifact size"},413);
    if(await digest(bytes)!==expected)return json({ok:false,error:"Digest mismatch"},422);
    const prior=await env.NEWSPAPERS.get(key);
    if(prior){
     if(prior.size!==bytes.byteLength||await digest(await prior.arrayBuffer())!==expected)
      return json({ok:false,error:"Existing artifact corrupt"},409);
    }else await env.NEWSPAPERS.put(key,bytes,{customMetadata:{date,name,sha256:expected}});
    const check=await env.NEWSPAPERS.get(key);
    if(!check||check.size!==bytes.byteLength||await digest(await check.arrayBuffer())!==expected)
     return json({ok:false,error:"Artifact readback verification failed"},502);
    return json({ok:true,stage:"ARTIFACT_VERIFIED",date,name,sha256:expected,bytes:bytes.byteLength});
   }
   const obj=await env.NEWSPAPERS.get(key);
   if(!obj)return json({ok:false,error:"Artifact not found"},404);
   const bytes=await obj.arrayBuffer();
   if(await digest(bytes)!==expected)return json({ok:false,error:"Stored artifact digest mismatch"},502);
   return new Response(bytes,{headers:{"Content-Type":"application/octet-stream",
     "Cache-Control":"no-store","X-Content-SHA256":expected}});
  }
  if(path==="/api/recovery-manifest"&&request.method==="GET"){
   if(!env.PUBLISH_TOKEN||request.headers.get("Authorization")!=="Bearer "+env.PUBLISH_TOKEN)
    return json({ok:false,error:"Unauthorized"},401);
   const date=url.searchParams.get("date")||"";
   const sha256=url.searchParams.get("sha256")||"";
   if(!validDate(date)||!/^[a-f0-9]{64}$/.test(sha256))
    return json({ok:false,error:"Invalid manifest locator"},400);
   const key="recovery/"+date+"/checkpoint/"+sha256;
   const obj=await env.NEWSPAPERS.get(key);
   if(!obj)return json({ok:false,state:"not_found",date},404);
   if(obj.size>65536)return json({ok:false,state:"invalid",error:"Manifest too large"},422);
   const bytes=await obj.arrayBuffer();
   if(await digest(bytes)!==sha256)return json({ok:false,state:"invalid",error:"Manifest digest mismatch"},422);
   let manifest;try{manifest=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes))}
   catch{return json({ok:false,state:"invalid",error:"Malformed manifest"},422)}
   if(manifest?.schema!=="pbt-edition-checkpoint-v1"||manifest?.editionDate!==date||
      manifest?.storageVerified!==true)
    return json({ok:false,state:"incomplete",date,error:"Not a committed verified checkpoint"},409);
   const names=["html","comic","market_input","masthead"];
   for(const name of names){
    const rec=manifest?.artifacts?.[name];
    if(!rec||!/^[a-f0-9]{64}$/.test(rec.sha256)||!Number.isSafeInteger(rec.bytes)||rec.bytes<1)
     return json({ok:false,state:"incomplete",date,error:"Missing asset metadata: "+name},409);
    const asset=await env.NEWSPAPERS.get("recovery/"+date+"/"+name+"/"+rec.sha256);
    if(!asset||asset.size!==rec.bytes)
     return json({ok:false,state:"incomplete",date,error:"Missing stored asset: "+name},409);
    if(await digest(await asset.arrayBuffer())!==rec.sha256)
     return json({ok:false,state:"corrupt",date,error:"Invalid stored asset: "+name},422);
   }
   return json({ok:true,state:"complete",date,manifestSha256:sha256,artifacts:manifest.artifacts,
     uploadId:manifest.uploadId??null,acknowledgedChunks:manifest.acknowledgedChunks??0,
     publication:"NOT_VERIFIED",delivery:"NOT_VERIFIED"});
  }
  if(request.method!=="POST"||!["/api/stage","/api/activate"].includes(path))return json({ok:false,error:"Not found"},404);
  if(!env.PUBLISH_TOKEN||request.headers.get("Authorization")!=="Bearer "+env.PUBLISH_TOKEN)return json({ok:false,error:"Unauthorized"},401);
  if(path==="/api/stage"){
   const date=request.headers.get("X-Edition-Date")||"",expected=request.headers.get("X-Content-SHA256")||"";
   if(!validDate(date)||!/^[a-f0-9]{64}$/.test(expected))return json({ok:false,error:"Invalid date or digest"},400);
   const bytes=await request.arrayBuffer();if(bytes.byteLength<1000||bytes.byteLength>MAX_BYTES)return json({ok:false,error:"Out-of-range edition bytes"},413);
   const actual=await digest(bytes);if(actual!==expected)return json({ok:false,error:"Digest mismatch"},422);
   let html;try{html=new TextDecoder("utf-8",{fatal:true}).decode(bytes)}catch{return json({ok:false,error:"Non-UTF8"},422)}
   const error=validate(html,date);if(error)return json({ok:false,error},422);
   const key="staging/"+date+"/"+actual+".html";
   await env.NEWSPAPERS.put(key,bytes,{httpMetadata:{contentType:"text/html; charset=utf-8"},customMetadata:{date,sha256:actual}});
   const back=await env.NEWSPAPERS.get(key);
   if(!back||back.size!==bytes.byteLength||await digest(await back.arrayBuffer())!==actual)return json({ok:false,error:"Staging readback failed"},502);
   return json({ok:true,date,sha256:actual,bytes:bytes.byteLength,stage:"STAGED"});
  }
  let body;try{body=await request.json()}catch{return json({ok:false,error:"Bad JSON"},400)}
  const {date,sha256}=body||{};
  if(!validDate(date)||typeof sha256!=="string"||!/^[a-f0-9]{64}$/.test(sha256))return json({ok:false,error:"Invalid manifest"},400);
  const current=await env.NEWSPAPERS.get("latest.json");
  if(current){const prev=await current.json();if(prev.date>date)return json({ok:false,error:"Would regress staging /today"},409)}
  const staged=await env.NEWSPAPERS.get("staging/"+date+"/"+sha256+".html");
  if(!staged)return json({ok:false,error:"Missing staged edition"},404);
  const bytes=await staged.arrayBuffer();
  if(await digest(bytes)!==sha256)return json({ok:false,error:"Corrupt staging edition"},422);
  const key="editions/"+date+".html";
  await env.NEWSPAPERS.put(key,bytes,{httpMetadata:{contentType:"text/html; charset=utf-8"},customMetadata:{date,sha256}});
  const back=await env.NEWSPAPERS.get(key);
  if(!back||await digest(await back.arrayBuffer())!==sha256)return json({ok:false,error:"Readback failed"},502);
  await env.NEWSPAPERS.put("latest.json",JSON.stringify({date,key,sha256}));
  return json({ok:true,date,sha256,url:url.origin+"/"+date,todayUrl:url.origin+"/today",delivery:"DISABLED"});
 }
};
