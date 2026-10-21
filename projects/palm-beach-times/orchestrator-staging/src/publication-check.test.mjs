import test from "node:test";
import assert from "node:assert/strict";
import {checkPublication} from "./publication-check.js";
function response(html,status=200,type="text/html") {
 return new Response(html,{status,headers:{"content-type":type}});
}
const valid=(date)=>"<html><body>"+date+" "+("content ".repeat(2000))+"</body></html>";
test("identical published bodies pass, Slack remains explicitly unchecked",async()=>{
 const r=await checkPublication("2026-10-21",async()=>response(valid("2026-10-21")));
 assert.equal(r.stage,"public_bodies_match");assert.equal(r.slackDelivery,"not_checked");
 assert.equal(r.modelCalls,0);
});
test("missing edition fails even if today exists",async()=>{
 const r=await checkPublication("2026-10-21",async(url)=>url.endsWith("/today")?response(valid("2026-10-21")):response("missing",404));
 assert.equal(r.stage,"dated_unavailable");assert.equal(r.dated.status,404);
});
test("wrong today date fails closed",async()=>{
 const r=await checkPublication("2026-10-21",async(url)=>response(valid(url.endsWith("/today")?"2026-10-20":"2026-10-21")));
 assert.equal(r.stage,"today_unavailable");
});
test("different bodies fail closed",async()=>{
 const r=await checkPublication("2026-10-21",async(url)=>response(valid("2026-10-21")+(url.endsWith("/today")?"X":"")));
 assert.equal(r.stage,"body_mismatch");
});
test("invalid date never fetches",async()=>{
 const r=await checkPublication("yesterday",async()=>{throw Error("should not fetch")});
 assert.equal(r.stage,"invalid_date");
});
