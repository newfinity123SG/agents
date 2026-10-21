import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
globalThis.crypto ??= webcrypto;
const source=await readFile(new URL('./worker.js',import.meta.url),'utf8');
const {default: worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
class Bucket {
 constructor(){this.entries=new Map();this.metadata=new Map();}
 async get(k,opts={}){const full=this.entries.get(k);const b=full&&opts.range?full.slice(opts.range.offset,opts.range.offset+opts.range.length):full;return b?{size:full.byteLength,arrayBuffer:async()=>b.slice().buffer,text:async()=>new TextDecoder().decode(b),writeHttpMetadata:(headers)=>headers.set('Content-Type','text/html; charset=utf-8'),body:new Blob([b]).stream(),customMetadata:this.metadata.get(k)||{}}:null;}
 async put(k,body,options={}){this.entries.set(k,typeof body==='string'?new TextEncoder().encode(body):new Uint8Array(body).slice());this.metadata.set(k,options.customMetadata||{});}
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

test('manifest rejects incomplete checkpoint without publication',async()=>{
 const date='2026-10-21';
 const cp={schema:'pbt-edition-checkpoint-v1',editionDate:date,storageVerified:false,artifacts:{}};
 const data=new TextEncoder().encode(JSON.stringify(cp));
 const sha=Buffer.from(await crypto.subtle.digest('SHA-256',data)).toString('hex');
 await bucket.put('recovery/'+date+'/checkpoint/'+sha,data);
 const url='https://staging.invalid/api/recovery-manifest?date='+date+'&sha256='+sha;
 const res=await worker.fetch(new Request(url,{headers:{Authorization:headers.Authorization}}),env);
 assert.equal(res.status,409);
 assert.equal((await res.json()).state,'incomplete');
});
test('manifest requires all authentic assets and detects tampering',async()=>{
 const date='2026-10-21', artifacts={};
 for(const name of ['html','comic','market_input','masthead']){
  const data=new TextEncoder().encode('fixture-'+name);
  const sha256=Buffer.from(await crypto.subtle.digest('SHA-256',data)).toString('hex');
  await bucket.put('recovery/'+date+'/'+name+'/'+sha256,data);
  artifacts[name]={sha256,bytes:data.byteLength};
 }
 const cp={schema:'pbt-edition-checkpoint-v1',editionDate:date,storageVerified:true,artifacts};
 const data=new TextEncoder().encode(JSON.stringify(cp));
 const sha=Buffer.from(await crypto.subtle.digest('SHA-256',data)).toString('hex');
 await bucket.put('recovery/'+date+'/checkpoint/'+sha,data);
 const url='https://staging.invalid/api/recovery-manifest?date='+date+'&sha256='+sha;
 const req=()=>new Request(url,{headers:{Authorization:headers.Authorization}});
 const result=await worker.fetch(req(),env);
 assert.equal(result.status,200);
 assert.equal((await result.json()).state,'complete');
 await bucket.put('recovery/'+date+'/comic/'+artifacts.comic.sha256,new TextEncoder().encode('bad'));
 const tampered=await worker.fetch(req(),env);
 assert.equal(tampered.status,409);
});

test('legacy stage activate and public routes preserve bytes',async()=>{
 const date='2026-10-22';
 const html='<!doctype html><html><body data-edition-date="'+date+'">'+('Fresh source-backed content. '.repeat(70))+'</body></html>';
 const raw=new TextEncoder().encode(html);
 const sha=Buffer.from(await crypto.subtle.digest('SHA-256',raw)).toString('hex');
 const e={NEWSPAPERS:new Bucket(),PUBLISH_TOKEN:'local-test-token'};
 const stage=await worker.fetch(new Request('https://staging.invalid/api/stage',{method:'POST',headers:{Authorization:'Bearer local-test-token','X-Edition-Date':date,'X-Content-SHA256':sha},body:raw}),e);
 assert.equal(stage.status,200);
 const activated=await worker.fetch(new Request('https://staging.invalid/api/activate',{method:'POST',headers:{Authorization:'Bearer local-test-token','Content-Type':'application/json'},body:JSON.stringify({date,sha256:sha})}),e);
 assert.equal(activated.status,200,await activated.clone().text());
 for(const path of ['/'+date,'/today']){
  const response=await worker.fetch(new Request('https://staging.invalid'+path),e);
  assert.equal(response.status,200,path);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()),raw,path);
 }
 const older=await worker.fetch(new Request('https://staging.invalid/api/activate',{method:'POST',headers:{Authorization:'Bearer local-test-token','Content-Type':'application/json'},body:JSON.stringify({date:'2026-10-21',sha256:sha})}),e);
 assert.equal(older.status,404);
});

test('staged older edition cannot roll back the latest edition',async()=>{
 const e={NEWSPAPERS:new Bucket(),PUBLISH_TOKEN:'local-test-token'};
 const make=async date=>{
  const data=new TextEncoder().encode('<!doctype html><html><body>'+date+' '+('verified content '.repeat(100))+'</body></html>');
  const sha=Buffer.from(await crypto.subtle.digest('SHA-256',data)).toString('hex');
  const stage=await worker.fetch(new Request('https://test.invalid/api/stage',{method:'POST',headers:{Authorization:'Bearer local-test-token','X-Edition-Date':date,'X-Content-SHA256':sha},body:data}),e);
  assert.equal(stage.status,200);
  return {date,sha,data};
 };
 const old=await make('2026-10-20'),latest=await make('2026-10-21');
 const activate=async x=>worker.fetch(new Request('https://test.invalid/api/activate',{method:'POST',headers:{Authorization:'Bearer local-test-token','Content-Type':'application/json'},body:JSON.stringify({date:x.date,sha256:x.sha})}),e);
 assert.equal((await activate(latest)).status,200);
 const denied=await activate(old);
 assert.equal(denied.status,409);
 assert.match((await denied.json()).error,/Refusing to replace newer/);
 const today=await worker.fetch(new Request('https://test.invalid/today'),e);
 assert.equal(today.status,200);
 assert.deepEqual(new Uint8Array(await today.arrayBuffer()),latest.data);
});

test('authenticated R2 byte-range retrieval returns exact slice and denies bad ranges',async()=>{
 const e={NEWSPAPERS:new Bucket(),PUBLISH_TOKEN:'local-test-token'};
 const raw=new TextEncoder().encode('a'.repeat(40001));
 const sha=Buffer.from(await crypto.subtle.digest('SHA-256',raw)).toString('hex');
 const key='recovery/2026-10-21/html/'+sha;
 await e.NEWSPAPERS.put(key,raw);
 const url='https://test.invalid/api/recovery-artifact?date=2026-10-21&name=html&sha256='+sha+'&offset=18000&length=18000';
 const denied=await worker.fetch(new Request(url),e);
 assert.equal(denied.status,401);
 const result=await worker.fetch(new Request(url,{headers:{Authorization:'Bearer local-test-token'}}),e);
 assert.equal(result.status,200);
 assert.equal(Number(result.headers.get('X-Artifact-Bytes')),raw.length);
 assert.equal(Number(result.headers.get('X-Range-Offset')),18000);
 assert.deepEqual(new Uint8Array(await result.arrayBuffer()),raw.slice(18000,36000));
 const excessive=await worker.fetch(new Request(url.replace('length=18000','length=18001'),{headers:{Authorization:'Bearer local-test-token'}}),e);
 assert.equal(excessive.status,400);
});
