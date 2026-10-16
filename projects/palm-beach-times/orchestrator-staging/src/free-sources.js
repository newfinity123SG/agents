// Public-source fetchers only. No OpenAI calls or billable model tokens.
// Every reading carries observation date, source and freshness status.
const TIMEOUT_MS=8500;
async function get(url, headers={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{
    const r=await fetch(url,{headers:{"User-Agent":"PalmBeachTimes/1.0 (newspaper staging; contact via publisher)",...headers},signal:controller.signal});
    if(!r.ok)throw new Error("HTTP "+r.status);
    return await r.text();
  }finally{clearTimeout(timer);}
}
function safeValue(n){const v=Number(n);return Number.isFinite(v)?v:null;}
function daysAgo(iso,now){return (now-Date.parse(iso+"T00:00:00Z"))/86400000;}
async function fred(series,maxAgeDays,now){
  const url="https://fred.stlouisfed.org/graph/fredgraph.csv?id="+encodeURIComponent(series);
  try{
    const raw=await get(url);
    const rows=raw.trim().split(/\r?\n/).slice(1);
    for(let i=rows.length-1;i>=0;i--){
      const [date,value]=rows[i].split(",");
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
      const n=safeValue(value);
      if(n===null)continue;
      const age=daysAgo(date,now);
      return {status:age>=0&&age<=maxAgeDays?"ok":"stale",value:n,observationDate:date,ageDays:Math.round(age*10)/10,units:"percent",source:url,series};
    }
    return {status:"unavailable",reason:"No numeric observations",source:url,series};
  }catch(e){return {status:"unavailable",reason:String(e.message).slice(0,100),source:url,series};}
}
async function weather(now){
  const url="https://api.weather.gov/points/26.3683,-80.1289";
  try{
    const point=JSON.parse(await get(url,{Accept:"application/geo+json"}));
    const endpoint=point.properties?.forecast;
    if(!endpoint||!endpoint.startsWith("https://api.weather.gov/"))throw new Error("Invalid forecast endpoint");
    const data=JSON.parse(await get(endpoint,{Accept:"application/geo+json"}));
    const periods=(data.properties?.periods||[]).slice(0,4);
    if(!periods.length)throw new Error("Missing forecast periods");
    const updated=data.properties?.updateTime||null;
    const hours=updated?(now-Date.parse(updated))/3600000:null;
    return {status:hours!==null&&hours>=-0.05&&hours<=12?"ok":"stale",
      updated,ageHours:hours===null?null:Math.round(hours*10)/10,source:endpoint,
      periods:periods.map(p=>({name:p.name,startTime:p.startTime,endTime:p.endTime,temperature:p.temperature,temperatureUnit:p.temperatureUnit,shortForecast:p.shortForecast,windSpeed:p.windSpeed}))};
  }catch(e){return {status:"unavailable",reason:String(e.message).slice(0,100),source:url};}
}
async function bitcoin(key,now){
  if(!key)return {status:"not_configured",reason:"Optional free CoinGecko demo API key not set"};
  const url="https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true&include_24hr_change=true";
  try{
    const d=JSON.parse(await get(url,{"x-cg-demo-api-key":key}));
    const last=d.bitcoin?.last_updated_at;
    const age=Number.isFinite(last)?(now-last*1000)/60000:null;
    return {status:age!==null&&age>=0&&age<=30?"ok":"stale",usd:safeValue(d.bitcoin?.usd),
      change24hPct:safeValue(d.bitcoin?.usd_24h_change),observationTime:Number.isFinite(last)?new Date(last*1000).toISOString():null,
      ageMinutes:age===null?null:Math.round(age),source:url};
  }catch(e){return {status:"unavailable",reason:String(e.message).slice(0,100),source:url};}
}
export async function collectFreeSources(env){
  const now=Date.now();
  const [ust10,freddie,forecast,btc]=await Promise.all([
    fred("DGS10",7,now),fred("MORTGAGE30US",12,now),weather(now),bitcoin(env.COINGECKO_DEMO_API_KEY,now)
  ]);
  return {asOf:new Date(now).toISOString(),cost:"no OpenAI usage",
    sources:{ust10,freddie30:freddie,bocaWeather:forecast,bitcoin:btc},
    indexCharts:{status:"blocked",reason:"No verified licensed intraday 48-point+ volume series for S&P 500, Dow, Nasdaq. Never synthesize points."},
    tides:{status:"pending_station_verification",reason:"NOAA station and product must be verified before publication"},
    publishable:false};
}
