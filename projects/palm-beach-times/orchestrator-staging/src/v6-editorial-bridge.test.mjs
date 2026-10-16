import test from "node:test";import assert from "node:assert/strict";
import {buildV6EditorialFragments} from "./v6-editorial-bridge.js";
const source={editionDate:"2026-10-16",candidates:[{desk:"local",url:"https://example.gov/a",publishedAt:"2026-10-16T10:00:00Z",source:"City",evidenceUrl:"https://example.gov/a"}]};
const draft={editionDate:"2026-10-16",desks:{local:[{url:"https://example.gov/a",publishedAt:"2026-10-16T10:00:00Z",title:"<Unsafe> headline",summary:"Important & verified"}]}};
test("escapes all editorial text and preserves sourced URL",()=>{const x=buildV6EditorialFragments(draft,source);assert.equal(x.ok,true);assert.match(x.fragments.LOCAL_NEWS_DESK,/&lt;Unsafe&gt;/);assert.match(x.fragments.LOCAL_NEWS_DESK,/Important &amp; verified/);assert.match(x.fragments.LOCAL_NEWS_DESK,/https:\/\/example.gov\/a/);});
test("never claims complete assembly without charts and comic",()=>{const x=buildV6EditorialFragments(draft,source);assert.equal(x.readyForAssembly,false);assert.ok(x.missingFields.includes("COMIC_TILE"));assert.ok(x.missingFields.includes("MARKET_CHARTS"));});
test("refuses unsourced additions",()=>{const invalid={...draft,desks:{local:[{...draft.desks.local[0],url:"https://wrong.com"}]}};assert.equal(buildV6EditorialFragments(invalid,source).ok,false);});
