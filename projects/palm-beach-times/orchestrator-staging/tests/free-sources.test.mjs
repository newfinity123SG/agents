import test from "node:test";import assert from "node:assert/strict";
import {collectFreeSources} from "../src/free-sources.js";
test("free source collector has provenance and blocks invented stock charts",async()=>{
 const old=globalThis.fetch;globalThis.fetch=async(url)=>{
  const u=String(url);
  if(u.includes("fredgraph.csv"))return new Response("DATE,value\n2026-10-14,4.25\n");
  if(u.includes("/points/"))return Response.json({properties:{forecast:"https://api.weather.gov/gridpoints/MFL/100,100/forecast"}});
  if(u.includes("/gridpoints/"))return Response.json({properties:{updateTime:new Date().toISOString(),periods:[{name:"Today",startTime:new Date().toISOString(),endTime:new Date().toISOString(),temperature:82,temperatureUnit:"F",shortForecast:"Sunny",windSpeed:"5 mph"}]}});
  throw new Error("Unexpected URL "+u);
 };
 try{
  const d=await collectFreeSources({});
  assert.equal(d.cost,"no OpenAI usage");
  assert.equal(d.publishable,false);
  assert.equal(d.indexCharts.status,"blocked");
  assert.equal(d.sources.bitcoin.status,"not_configured");
  assert.equal(d.sources.bocaWeather.status,"ok");
  assert.equal(d.sources.ust10.source.includes("fredgraph.csv"),true);
 }finally{globalThis.fetch=old;}
});
