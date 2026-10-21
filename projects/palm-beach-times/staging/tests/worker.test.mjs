// Runnable integration tests for isolated staging transport. No network, no secrets, no Slack.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

globalThis.crypto ??= webcrypto;
const source = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

class FakeR2 {
  constructor() { this.store = new Map(); }
  async put(key, value, options = {}) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
    this.store.set(key, { bytes: bytes.slice(), customMetadata: options.customMetadata ?? {} });
  }
  async get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    return {
      size: item.bytes.byteLength,
      customMetadata: item.customMetadata,
      arrayBuffer: async () => item.bytes.slice().buffer,
      json: async () => JSON.parse(new TextDecoder().decode(item.bytes)),
      body: new Blob([item.bytes]).stream(),
    };
  }
}
const token = 'test-only-local-token';
const date = '2026-10-14';
const html = '<!doctype html><html data-layout="pbt-broadsheet-v6" data-skill-build="pbt-v6.0" data-edition-date="' + date + '" data-joke-date="' + date + '"><body><div class="market-glance"></div><img src="data:image/png;base64,AA=="><section id="screen-guide"></section>' + 'news '.repeat(210) + '</body></html>';
const data = new TextEncoder().encode(html);
const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(x=>x.toString(16).padStart(2,'0')).join('');
const env = () => ({ NEWSPAPERS: new FakeR2(), PUBLISH_TOKEN: token });
const request = (path, body, headers={}) => new Request('https://staging.example.test'+path,{method:'POST',headers,body});

test('no publisher stage without authorization', async () => {
  const e=env();
  const r=await worker.fetch(request('/api/stage',data,{'X-Edition-Date':date,'X-Content-SHA256':hash}),e);
  assert.equal(r.status,401);
  assert.equal(e.NEWSPAPERS.store.size,0);
});

test('reject digest mismatch before R2 writes',async()=>{
  const e=env();
  const r=await worker.fetch(request('/api/stage',data,{'Authorization':'Bearer '+token,'X-Edition-Date':date,'X-Content-SHA256':'0'.repeat(64)}),e);
  assert.equal(r.status,422);
  assert.equal(e.NEWSPAPERS.store.size,0);
});

test('stage, activate, dated retrieval, today retrieval preserve exact bytes',async()=>{
  const e=env();
  const sr=await worker.fetch(request('/api/stage',data,{'Authorization':'Bearer '+token,'X-Edition-Date':date,'X-Content-SHA256':hash}),e);
  assert.equal(sr.status,200,await sr.text());
  const ar=await worker.fetch(request('/api/activate',JSON.stringify({date,sha256:hash}),{'Authorization':'Bearer '+token,'Content-Type':'application/json'}),e);
  assert.equal(ar.status,200,await ar.text());
  for (const path of ['/'+date,'/today']) {
    const response=await worker.fetch(new Request('https://staging.example.test'+path),e);
    assert.equal(response.status,200);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),data);
  }
});

test('do not regress latest pointer',async()=>{
  const e=env();
  await e.NEWSPAPERS.put('latest.json',JSON.stringify({date:'2026-10-15',key:'editions/2026-10-15.html'}));
  const r=await worker.fetch(request('/api/activate',JSON.stringify({date,sha256:hash}),{'Authorization':'Bearer '+token,'Content-Type':'application/json'}),e);
  assert.equal(r.status,409);
});

test('recovery artifact survives separate requests and verifies exact bytes',async()=>{
 const e=env(), bytes=new TextEncoder().encode('october-artifact');
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const headers={'Authorization':'Bearer '+token,'X-Edition-Date':date,'X-Artifact-Name':'comic','X-Content-SHA256':sha};
 const req=(method,body)=>new Request('https://staging.example.test/api/recovery-artifact',{method,headers,...(body?{body}:{})});
 const put=await worker.fetch(req('PUT',bytes),e);assert.equal(put.status,200,await put.text());
 const get=await worker.fetch(req('GET'),e);assert.equal(get.status,200);
 assert.deepEqual(new Uint8Array(await get.arrayBuffer()),bytes);
 const repeat=await worker.fetch(req('PUT',bytes),e);assert.equal(repeat.status,200);
 assert.equal(e.NEWSPAPERS.store.size,1);
});
test('recovery artifact rejects wrong digest and unauthenticated writes',async()=>{
 const e=env(), bytes=new TextEncoder().encode('something');
 const meta={'X-Edition-Date':date,'X-Artifact-Name':'comic','X-Content-SHA256':'0'.repeat(64)};
 const put=(headers)=>worker.fetch(new Request('https://staging.example.test/api/recovery-artifact',{method:'PUT',headers,body:bytes}),e);
 assert.equal((await put(meta)).status,401);
 assert.equal((await put({...meta,Authorization:'Bearer '+token})).status,422);
 assert.equal(e.NEWSPAPERS.store.size,0);
});
