// Palm Beach Times Publisher: R2-backed staged publishing, version 2.
// Existing routes /health, /, /today, /YYYY-MM-DD and /api/publish remain supported.
// New: POST /api/stage (raw HTML) then POST /api/activate (small JSON).
// Required binding: NEWSPAPERS (existing R2 bucket), PUBLISH_TOKEN (existing secret).

const MAX_HTML_BYTES = 12_000_000;
const MIN_HTML_BYTES = 1000;
const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (request.method === 'GET' && path === '/health') {
        return json({ ok: true, service: 'palm-beach-times-publisher', version: 2,
          r2Configured: !!env.NEWSPAPERS });
      }
      if (request.method === 'GET' && path === '/') {
        return Response.redirect(`${url.origin}/today`, 302);
      }
      if (request.method === 'GET' && path === '/today') return serveLatest(env);
      const dateMatch = path.match(/^\/(\d{4}-\d{2}-\d{2})$/);
      if (request.method === 'GET' && dateMatch) return serveEdition(env, dateMatch[1], false);
      if (request.method === 'POST' && path === '/api/publish') return publishEdition(request, env, url.origin);
      if (request.method === 'POST' && path === '/api/stage') return stageEdition(request, env);
      if (request.method === 'POST' && path === '/api/activate') return activateEdition(request, env, url.origin);
      if (path === '/api/recovery-artifact' && ['GET','PUT'].includes(request.method)) return recoveryArtifact(request, env, url);
      if (request.method === 'GET' && path === '/api/recovery-manifest') return recoveryManifest(request, env, url);
      return new Response('Not found', { status: 404 });
    } catch (error) {
      console.error('PBT publisher error:', error?.message || String(error));
      return json({ ok: false, error: 'Internal publisher error' }, 500);
    }
  },
};

function authorized(request, env) {
  if (!env.PUBLISH_TOKEN) return json({ ok: false, error: 'PUBLISH_TOKEN is not configured' }, 503);
  if ((request.headers.get('Authorization') || '') !== `Bearer ${env.PUBLISH_TOKEN}`) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }
  if (!env.NEWSPAPERS) return json({ ok: false, error: 'NEWSPAPERS R2 binding is not configured' }, 503);
  return null;
}

function validDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

function validHash(hash) { return /^[a-f0-9]{64}$/.test(hash); }

function easternDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

async function digest(buffer) {
  const bytes = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function validateHtml(html, date) {
  if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html) || !/<body[\s>]/i.test(html) || !/<\/body>/i.test(html)) {
    return 'HTML is missing required document tags';
  }
  if (!html.includes(date) && !html.toLowerCase().includes(humanDate(date).toLowerCase())) {
    return 'HTML does not contain its edition date';
  }
  // The production Skill runs additional masthead, comic, charts and content checks before upload.
  return null;
}

function humanDate(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' })
    .format(new Date(`${date}T12:00:00Z`));
}

function metadata(date, title, editionType, sha256, length, publishedAt) {
  return { date, title, editionType, sha256, bytes: String(length), publishedAt };
}

async function verifyObject(bucket, key, expectedSha, expectedBytes) {
  const obj = await bucket.get(key);
  if (!obj || obj.size !== expectedBytes) return false;
  return (await digest(await obj.arrayBuffer())) === expectedSha;
}

async function currentPointer(env) {
  const latest = await env.NEWSPAPERS.get('latest.json');
  if (!latest) return null;
  try {
    const data = JSON.parse(await latest.text());
    return data && validDate(data.date) ? data : null;
  } catch { return null; }
}

async function activateObject(env, date, title, editionType, bytes, sha256, origin) {
  const existing = await currentPointer(env);
  if (existing?.date && existing.date > date) {
    return json({ ok: false, error: `Refusing to replace newer /today edition ${existing.date}` }, 409);
  }
  const key = `editions/${date}.html`;
  const publishedAt = new Date().toISOString();
  await env.NEWSPAPERS.put(key, bytes, {
    httpMetadata: { contentType: 'text/html; charset=utf-8', cacheControl: 'public, max-age=300' },
    customMetadata: metadata(date, title, editionType, sha256, bytes.byteLength, publishedAt),
  });
  if (!(await verifyObject(env.NEWSPAPERS, key, sha256, bytes.byteLength))) {
    return json({ ok: false, error: 'Dated edition failed R2 read-back verification' }, 502);
  }
  // The pointer is updated last so failed writes do not expose a partial edition as /today.
  await env.NEWSPAPERS.put('latest.json', JSON.stringify({
    key, date, title, editionType, publishedAt, sha256, bytes: bytes.byteLength,
  }), { httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-store' } });
  return json({ ok: true, date, title, editionType, sha256, bytes: bytes.byteLength,
    url: `${origin}/${date}`, todayUrl: `${origin}/today`, delivery: 'NOT_SENT' });
}

// Compatibility route for existing publisher MCP. Prefer staged uploads for large editions.
async function publishEdition(request, env, origin) {
  const authError = authorized(request, env);
  if (authError) return authError;
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_HTML_BYTES * 1.5) return json({ ok: false, error: 'JSON request is too large; use /api/stage' }, 413);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Body must be valid JSON' }, 400); }
  const date = String(body?.date || '').trim();
  const html = typeof body?.html === 'string' ? body.html : '';
  const title = String(body?.title || 'The Palm Beach Times').trim().slice(0, 150);
  const editionType = String(body?.editionType || 'weekday').trim().slice(0, 60);
  if (!validDate(date)) return json({ ok: false, error: 'date must be a real YYYY-MM-DD date' }, 400);
  const bytes = encoder.encode(html);
  if (bytes.byteLength < MIN_HTML_BYTES || bytes.byteLength > MAX_HTML_BYTES) {
    return json({ ok: false, error: 'HTML byte size is outside limits' }, 413);
  }
  const htmlError = validateHtml(html, date);
  if (htmlError) return json({ ok: false, error: htmlError }, 422);
  const sha256 = await digest(bytes);
  return activateObject(env, date, title, editionType, bytes, sha256, origin);
}

// Upload full binary-safe UTF-8 HTML body. Headers:
// Authorization: Bearer <existing PUBLISH_TOKEN>
// X-Edition-Date: YYYY-MM-DD
// X-Content-SHA256: 64 lowercase hex characters
// X-Edition-Title and X-Edition-Type are optional.
async function stageEdition(request, env) {
  const authError = authorized(request, env);
  if (authError) return authError;
  const date = (request.headers.get('x-edition-date') || '').trim();
  const expected = (request.headers.get('x-content-sha256') || '').trim().toLowerCase();
  const title = (request.headers.get('x-edition-title') || 'The Palm Beach Times').trim().slice(0, 150);
  const editionType = (request.headers.get('x-edition-type') || 'weekday').trim().slice(0, 60);
  if (!validDate(date) || !validHash(expected)) return json({ ok: false, error: 'Invalid edition date or SHA-256' }, 400);
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_HTML_BYTES) return json({ ok: false, error: 'HTML exceeds size limit' }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength < MIN_HTML_BYTES || bytes.byteLength > MAX_HTML_BYTES) {
    return json({ ok: false, error: 'HTML byte size is outside limits' }, 413);
  }
  const sha256 = await digest(bytes);
  if (sha256 !== expected) return json({ ok: false, error: 'SHA-256 mismatch, upload rejected' }, 422);
  let html;
  try { html = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return json({ ok: false, error: 'HTML must be valid UTF-8' }, 422); }
  const htmlError = validateHtml(html, date);
  if (htmlError) return json({ ok: false, error: htmlError }, 422);
  const key = `staging/${date}/${sha256}.html`;
  await env.NEWSPAPERS.put(key, bytes, {
    httpMetadata: { contentType: 'text/html; charset=utf-8', cacheControl: 'no-store' },
    customMetadata: metadata(date, title, editionType, sha256, bytes.byteLength, new Date().toISOString()),
  });
  if (!(await verifyObject(env.NEWSPAPERS, key, sha256, bytes.byteLength))) {
    return json({ ok: false, error: 'Staged file failed R2 read-back verification' }, 502);
  }
  return json({ ok: true, stage: 'STAGED', date, sha256, bytes: bytes.byteLength, key });
}

// Activate only a previously verified staging object, using tiny JSON:
// {"date":"YYYY-MM-DD","sha256":"<digest>"}
async function activateEdition(request, env, origin) {
  const authError = authorized(request, env);
  if (authError) return authError;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Body must be valid JSON' }, 400); }
  const date = String(body?.date || '');
  const sha256 = String(body?.sha256 || '').toLowerCase();
  if (!validDate(date) || !validHash(sha256)) return json({ ok: false, error: 'Invalid edition date or SHA-256' }, 400);
  const key = `staging/${date}/${sha256}.html`;
  const object = await env.NEWSPAPERS.get(key);
  if (!object) return json({ ok: false, error: 'Staged edition not found' }, 404);
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.byteLength < MIN_HTML_BYTES || bytes.byteLength > MAX_HTML_BYTES || (await digest(bytes)) !== sha256) {
    return json({ ok: false, error: 'Staged edition failed integrity check' }, 422);
  }
  const attrs = object.customMetadata || {};
  if (attrs.date !== date || attrs.sha256 !== sha256) return json({ ok: false, error: 'Staged metadata mismatch' }, 422);
  return activateObject(env, date, attrs.title || 'The Palm Beach Times', attrs.editionType || 'weekday', bytes, sha256, origin);
}

async function serveLatest(env) {
  if (!env.NEWSPAPERS) return json({ ok: false, error: 'NEWSPAPERS R2 binding is not configured' }, 503);
  let key = null;
  const latest = await currentPointer(env);
  if (latest && typeof latest.key === 'string' && /^editions\/\d{4}-\d{2}-\d{2}\.html$/.test(latest.key)) {
    key = latest.key;
  }
  if (!key) {
    let cursor;
    do {
      const listed = await env.NEWSPAPERS.list({ prefix: 'editions/', cursor });
      for (const item of listed.objects) {
        if (/^editions\/\d{4}-\d{2}-\d{2}\.html$/.test(item.key) && (!key || item.key > key)) key = item.key;
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }
  if (!key) return new Response('No Palm Beach Times edition has been published yet.', {
    status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
  return serveObject(env, key, true);
}

async function serveEdition(env, date, isToday) {
  if (!validDate(date)) return new Response('Edition not found', { status: 404 });
  return serveObject(env, `editions/${date}.html`, isToday);
}

async function serveObject(env, key, isToday) {
  if (!env.NEWSPAPERS) return json({ ok: false, error: 'NEWSPAPERS R2 binding is not configured' }, 503);
  const object = await env.NEWSPAPERS.get(key);
  if (!object) return new Response('Edition not found', {
    status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Cache-Control', isToday ? 'no-store' : 'public, max-age=300');
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  if (object.customMetadata?.date) headers.set('X-Edition-Date', object.customMetadata.date);
  if (object.customMetadata?.sha256) headers.set('X-Content-SHA256', object.customMetadata.sha256);
  return new Response(object.body, { headers });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const RECOVERY_TYPES = new Set(['html','comic','market_input','masthead','checkpoint']);
async function recoveryArtifact(request, env, url) {
  const blocked = authorized(request, env);
  if (blocked) return blocked;
  const get = request.method === 'GET';
  const date = get ? url.searchParams.get('date') : request.headers.get('X-Edition-Date');
  const name = get ? url.searchParams.get('name') : request.headers.get('X-Artifact-Name');
  const sha = get ? url.searchParams.get('sha256') : request.headers.get('X-Content-SHA256');
  if (!validDate(date) || !RECOVERY_TYPES.has(name) || !validHash(sha))
    return json({ok:false,error:'Invalid recovery metadata'},400);
  const key = 'recovery/' + date + '/' + name + '/' + sha;
  if (!get) {
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_HTML_BYTES)
      return json({ok:false,error:'Artifact size invalid'},413);
    if (await digest(bytes) !== sha) return json({ok:false,error:'Digest mismatch'},422);
    const previous = await env.NEWSPAPERS.get(key);
    if (previous && (previous.size !== bytes.byteLength || await digest(await previous.arrayBuffer()) !== sha))
      return json({ok:false,error:'Existing artifact mismatch'},409);
    if (!previous) await env.NEWSPAPERS.put(key,bytes,{customMetadata:{date,name,sha256:sha}});
    if (!await verifyObject(env.NEWSPAPERS,key,sha,bytes.byteLength))
      return json({ok:false,error:'Artifact readback failed'},502);
    return json({ok:true,stage:'ARTIFACT_VERIFIED',date,name,sha256:sha,bytes:bytes.byteLength});
  }
  const obj=await env.NEWSPAPERS.get(key);
  if (!obj) return json({ok:false,error:'Artifact not found'},404);
  const bytes=await obj.arrayBuffer();
  if (await digest(bytes) !== sha) return json({ok:false,error:'Artifact checksum mismatch'},422);
  return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-Content-SHA256':sha}});
}

async function recoveryManifest(request, env, url) {
  const blocked=authorized(request,env); if(blocked)return blocked;
  const date=url.searchParams.get('date'), sha=url.searchParams.get('sha256');
  if(!validDate(date)||!validHash(sha))return json({ok:false,error:'Invalid checkpoint locator'},400);
  const checkpoint=await env.NEWSPAPERS.get('recovery/'+date+'/checkpoint/'+sha);
  if(!checkpoint)return json({ok:false,state:'not_found'},404);
  if(checkpoint.size>65536)return json({ok:false,state:'invalid',error:'Checkpoint too large'},422);
  const raw=await checkpoint.arrayBuffer();
  if(await digest(raw)!==sha)return json({ok:false,state:'corrupt',error:'Checkpoint checksum mismatch'},422);
  let cp;
  try{cp=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))}
  catch{return json({ok:false,state:'invalid',error:'Invalid checkpoint JSON'},422)}
  if(cp?.schema!=='pbt-edition-checkpoint-v1'||cp?.editionDate!==date||cp?.storageVerified!==true)
    return json({ok:false,state:'incomplete'},409);
  for(const name of ['html','comic','market_input','masthead']){
    const a=cp.artifacts?.[name];
    if(!a||!validHash(a.sha256)||!Number.isSafeInteger(a.bytes)||a.bytes<1)
      return json({ok:false,state:'incomplete',missing:name},409);
    const stored=await env.NEWSPAPERS.get('recovery/'+date+'/'+name+'/'+a.sha256);
    if(!stored||stored.size!==a.bytes)return json({ok:false,state:'incomplete',missing:name},409);
    if(await digest(await stored.arrayBuffer())!==a.sha256)
      return json({ok:false,state:'corrupt',artifact:name},422);
  }
  return json({ok:true,state:'complete',date,checkpointSha256:sha,artifacts:cp.artifacts,
    publication:'NOT_VERIFIED',delivery:'NOT_VERIFIED'});
}
