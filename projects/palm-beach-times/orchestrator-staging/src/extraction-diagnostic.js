// Read-only, token-free controlled extraction diagnostic. No publication or persistence.
const SOURCES=[
{id:"boca-events",format:"rss",url:"https://www.myboca.us/RSSFeed.aspx?CID=Community-Events-58&ModID=58"},
{id:"boca-releases",format:"rss",url:"https://www.myboca.us/RSSFeed.aspx?CID=Media-Releases-14&ModID=1"},
{id:"boca-development",format:"rss",url:"https://www.myboca.us/RSSFeed.aspx?CID=Economic-Development-23&ModID=1"},
{id:"boca-gumbo",format:"rss",url:"https://www.myboca.us/RSSFeed.aspx?CID=Gumbo-Limbo-Nature-Center-47&ModID=58"},
{id:"boca-calendar",format:"html",url:"https://www.myboca.us/calendar.aspx"},
{id:"west-palm-events",format:"html",url:"https://www.wpb.org/Events-directory"}
];
function clean(v){return (v||"").replace(/<!\[CDATA\[|\]\]>/g,"").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim().slice(0,240);}
function tag(block,name){let re=new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i");return clean(block.match(re)?.[1]);}
export function parseRss(xml){
 const blocks=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0,12);
 return blocks.map(m=>({title:tag(m[1],"title"),url:tag(m[1],"link"),published:tag(m[1],"pubDate"),guid:tag(m[1],"guid")}))
 .filter(v=>v.title && /^https?:\/\//i.test(v.url) && v.published && !Number.isNaN(Date.parse(v.published)));
}
export function parseHtmlEvidence(html){
 // Conservative: an HTML page alone is not proof of structured dated events.
 const jsonld=[...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
 const events=[];
 for(const match of jsonld){try{
  const data=JSON.parse(match[1]);const pending=Array.isArray(data)?data:[data];
  while(pending.length){const x=pending.pop();if(!x||typeof x!=="object")continue;
   if(Array.isArray(x["@graph"]))pending.push(...x["@graph"]);
   if((x["@type"]==="Event"||(Array.isArray(x["@type"])&&x["@type"].includes("Event")))&&x.name&&x.startDate){
    events.push({title:clean(x.name),startDate:String(x.startDate),url:typeof x.url==="string"?x.url:null,
      venue:clean(x.location?.name)});}
  }
 }catch{/* Invalid JSON-LD never passes verification. */}}
 return events.slice(0,12).filter(x=>!Number.isNaN(Date.parse(x.startDate)));
}
async function inspect(source){
 const c=new AbortController();const timeout=setTimeout(()=>c.abort(),8000);const started=Date.now();
 try{
 const r=await fetch(source.url,{signal:c.signal,headers:{Accept:source.format==="rss"?"application/rss+xml, application/xml, text/xml":"text/html"}});
 const type=r.headers.get("content-type")||"";const length=Number(r.headers.get("content-length")||0);
 if(length>1024*1024)return {id:source.id,url:source.url,httpStatus:r.status,status:"oversized",recordCount:0};
 const reader=r.body?.getReader();let bytes=0;const chunks=[];
 if(reader){while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1024*1024){await reader.cancel();return {id:source.id,url:source.url,httpStatus:r.status,status:"oversized",recordCount:0};}chunks.push(value);}}
 const data=new Uint8Array(bytes);let pos=0;for(const chunk of chunks){data.set(chunk,pos);pos+=chunk.length;}
 const body=new TextDecoder().decode(data);
 const records=r.ok?(source.format==="rss"?parseRss(body):parseHtmlEvidence(body)):[];
 const feedDetected=/<rss[\s>]|<feed[\s>]|<rdf:RDF[\s>]/i.test(body.slice(0,4000));
 return {id:source.id,url:source.url,finalUrl:r.url,httpStatus:r.status,contentType:type.slice(0,90),bytes,
  format:source.format,feedDetected,recordCount:records.length,
  status:!r.ok?"http_error":records.length?"records_parsed":"no_verifiable_records",
  records,elapsedMs:Date.now()-started,automated:false};
 }catch(e){return {id:source.id,url:source.url,status:"fetch_failed",error:String(e?.name==="AbortError"?"timeout":e?.message).slice(0,100),recordCount:0};}
 finally{clearTimeout(timeout);}
}
export async function runExtraction(){
 const results=[];for(let i=0;i<SOURCES.length;i+=3)results.push(...await Promise.all(SOURCES.slice(i,i+3).map(inspect)));
 return {mode:"staging-extraction-diagnostic",asOf:new Date().toISOString(),modelTokens:0,checked:results.length,
 publishing:false,slack:false,results};
}
