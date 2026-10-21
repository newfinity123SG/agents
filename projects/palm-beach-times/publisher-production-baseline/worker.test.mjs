import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
globalThis.crypto ??= webcrypto;
const source=await readFile(new URL('./worker.js',import.meta.url),'utf8');
const {default: worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
class Bucket {
 constructor(){this.entries=new Map();}
 async get(k){const b=this.entries.get(k);return b?{size:b.byteLength,arrayBuffer:async()=>b.slice().buffer}:null;}
 async put(k,body){this.entries.set(k,new Uint8Array(body).slice());}
}
const bucket=new Bucket(), env={NEWSPAPERS:bucket,PUBLISH_TOKEN:'local-test-token'};
const bytes=new TextEncoder().encode('recovery-safe-test');
const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
const headers={'Authorization':'Bearer local-test-token','X-Edition-Date':'2026-10-21','X-Artifact-Name':'comic','X-Content-SHA256':hash};
const endpoint='https://staging.invalid/api/recovery-artifact';
test('no unauthorized recovery writes',async()=>{
 const r=await worker.fetch(new Request(endpoint,{method:'PUT',body:bytes,headers:{...headers,Authorization:'Bearer bad'}}),env);
 assert.equal(r.status,401);assert.equal(bucket.entries.size,0);
});
test('recovery artifact digest and independent retrieval',async()=>{
 const r=await worker.fetch(new Request(endpoint,{method:'PUT',body:bytes,headers}),env);
 assert.equal(r.status,200,await r.text());
 const get=new Request(endpoint+'?date=2026-10-21&name=comic&sha256='+hash,{headers:{Authorization:headers.Authorization}});
 const response=await worker.fetch(get,env);
 assert.equal(response.status,200);
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
});
test('tampered upload rejected',async()=>{
 const wrong={...headers,'X-Content-SHA256':'0'.repeat(64)};
 const r=await worker.fetch(new Request(endpoint,{method:'PUT',body:bytes,headers:wrong}),env);
 assert.equal(r.status,422);
});
test('legacy health behavior unchanged',async()=>{
 const r=await worker.fetch(new Request('https://staging.invalid/health'),env);
 const j=await r.json();assert.equal(j.version,2);assert.equal(j.service,'palm-beach-times-publisher');
});
