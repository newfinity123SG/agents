// Palm Beach Times historical local source diagnostic.
// URLs below are candidates, not approved feeds. Performs no AI requests or publishing.
export const CANDIDATES=[
  {domain:"wptv.com",section:"local-news",url:"https://www.wptv.com/news/local-news/southern-palm-beach-county.rss",kind:"rss_candidate"},
  {domain:"wpbf.com",section:"local-news",url:"https://www.wpbf.com/rss",kind:"rss_candidate"},
  {domain:"bocamag.com",section:"local",url:"https://www.bocamag.com/feed/",kind:"rss_candidate"},
  {domain:"bocapost.com",section:"local-news",url:"https://www.bocapost.com/feed/",kind:"rss_candidate"},
  {domain:"myboca.us",section:"local",url:"https://www.myboca.us/rss.aspx",kind:"rss_candidate"},
  {domain:"delraybeachfl.gov",section:"local",url:"https://www.delraybeachfl.gov/government/city-manager/media-communications-office/city-news",kind:"site_reachability"},
  {domain:"wpb.org",section:"local",url:"https://www.wpb.org/Residents/Community-Events/Events",kind:"site_reachability"},
  {domain:"delraybeach.legistar.com",section:"community-issues",url:"https://delraybeach.legistar.com/Calendar.aspx",kind:"site_reachability"},
  {domain:"thecoastalstar.com",section:"local",url:"https://www.thecoastalstar.com/",kind:"site_reachability"}
];
async function check(candidate) {
 const control=new AbortController();
 const timer=setTimeout(()=>control.abort(),6000);
 const started=Date.now();
 try {
  const r=await fetch(candidate.url,{signal:control.signal,redirect:"follow",headers:{"Accept":"application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8"}});
  const type=(r.headers.get("content-type")||"").toLowerCase();
  const final=new URL(r.url);
  // Only inspect content and return status. Never persist copyrighted page bodies.
  const reader=r.body?.getReader();
  let chunk=new Uint8Array(0);
  if(reader){
    const first=await reader.read();
    if(first.value)chunk=first.value.slice(0,32768);
    await reader.cancel();
  }
  const sample=new TextDecoder().decode(chunk);
  const feed=/<rss[\s>]|<feed[\s>]|<rdf:RDF[\s>]/i.test(sample);
  const available=r.ok && (candidate.kind!=="rss_candidate"||feed);
  return {domain:candidate.domain,section:candidate.section,kind:candidate.kind,
   url:candidate.url,httpStatus:r.status,finalHost:final.hostname,
   contentType:type.slice(0,80),rssOrAtomDetected:feed,
   result:available?"reachable_candidate":r.ok?"not_a_feed":r.status===404?"missing_endpoint":r.status===403||r.status===451?"access_restricted":r.status===526?"tls_failure":"http_error",
   elapsedMs:Date.now()-started,automated:false};
 } catch(e){
  return {domain:candidate.domain,section:candidate.section,kind:candidate.kind,url:candidate.url,
   result:"fetch_failed",error:String(e?.name==="AbortError"?"timeout":e?.message||"network error").slice(0,90),
   elapsedMs:Date.now()-started,automated:false};
 } finally {clearTimeout(timer);}
}
export async function inspectLocalSources(){
 // Bounded concurrency and one HTTP request per candidate; this is an on-demand diagnostic.
 const output=[];
 for(let i=0;i<CANDIDATES.length;i+=4){
  output.push(...await Promise.all(CANDIDATES.slice(i,i+4).map(check)));
 }
 return {asOf:new Date().toISOString(),mode:"nonpublishing-diagnostic",modelTokens:0,
  checked:output.length,results:output,warning:"Reachable does not mean licensed, structured, fresh or activated. Review feeds before ingesting."};
}
