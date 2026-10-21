// Read-only publication integrity probe. Never writes, publishes or invokes a model.
const BASE="https://palm-beach-times-publisher.steven-a00.workers.dev";
async function inspect(url, expectedDate, fetcher) {
  try {
    const r=await fetcher(url,{method:"GET",redirect:"error",headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(10000)});
    if(!r.ok)return {ok:false,status:r.status,error:"http_status"};
    if(!(r.headers.get("content-type")||"").toLowerCase().includes("text/html"))
      return {ok:false,status:r.status,error:"not_html"};
    const bytes=await r.arrayBuffer();
    if(bytes.byteLength<10000||bytes.byteLength>10000000)
      return {ok:false,status:r.status,error:"unexpected_html_size",bytes:bytes.byteLength};
    const html=new TextDecoder().decode(bytes);
    if(!html.includes(expectedDate))
      return {ok:false,status:r.status,error:"date_missing",bytes:bytes.byteLength};
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)))
      .map(b=>b.toString(16).padStart(2,"0")).join("");
    return {ok:true,status:r.status,bytes:bytes.byteLength,sha256:digest,hasDate:true};
  }catch(e){return {ok:false,error:"fetch_failed",detail:String(e?.name||"error").slice(0,80)};}
}
export async function checkPublication(date,fetcher=fetch) {
  if(!/^20\\d{2}-(0[1-9]|1[0-2])-([0-2]\\d|3[01])$/.test(date))
    return {ok:false,stage:"invalid_date",date};
  const [dated,today]=await Promise.all([
    inspect(BASE+"/"+date,date,fetcher),inspect(BASE+"/today",date,fetcher)
  ]);
  if(!dated.ok)return {ok:false,stage:"dated_unavailable",date,dated,today,
    slackDelivery:"not_checked",modelCalls:0};
  if(!today.ok)return {ok:false,stage:"today_unavailable",date,dated,today,
    slackDelivery:"not_checked",modelCalls:0};
  if(dated.sha256!==today.sha256)return {ok:false,stage:"body_mismatch",date,dated,today,
    slackDelivery:"not_checked",modelCalls:0};
  return {ok:true,stage:"public_bodies_match",date,dated,today,
    htmlQuality:"not_checked",slackDelivery:"not_checked",modelCalls:0};
}
