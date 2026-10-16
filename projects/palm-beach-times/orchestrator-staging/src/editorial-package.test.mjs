import test from "node:test";
import assert from "node:assert/strict";
import {buildEditorialPackage} from "./editorial-package.js";
const now=new Date("2026-10-16T11:00:00.000Z");
const row={desk:"local",title:"Boca public meeting",url:"https://example.gov/news/1?utm_source=test",
 publishedAt:"2026-10-16T09:00:00Z",observedAt:"2026-10-16T10:00:00Z",
 summary:"Verified city notice",evidenceUrl:"https://example.gov/news/1",source:"City",verified:true};
test("accepts verified recent item and strips tracking",()=>{
 const r=buildEditorialPackage({candidates:[row]},now);
 assert.equal(r.ok,true);assert.equal(r.accepted,1);
 assert.equal(r.package.candidates[0].url,"https://example.gov/news/1");
 assert.equal(r.publication,"DISABLED");
});
test("dedupes tracked links",()=>{
 const r=buildEditorialPackage({candidates:[row,{...row,url:"https://example.gov/news/1?fbclid=hi"}]},now);
 assert.equal(r.accepted,1);assert.equal(r.rejected.duplicate,1);
});
test("rejects unverified, undated and stale material",()=>{
 const r=buildEditorialPackage({candidates:[{...row,verified:false},{...row,url:"https://example.gov/news/2",publishedAt:null},{...row,url:"https://example.gov/news/3",observedAt:"2026-10-12T00:00:00Z"}]},now);
 assert.equal(r.accepted,0);assert.equal(r.rejected.unverified,1);assert.equal(r.rejected.invalid,1);assert.equal(r.rejected.stale,1);
});
test("rejects unbounded input",()=>{const r=buildEditorialPackage({candidates:Array(241).fill(row)},now);assert.equal(r.ok,false);});
test("does not silently accept missing candidates",()=>assert.equal(buildEditorialPackage({},now).ok,false));
