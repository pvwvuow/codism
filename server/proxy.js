import crypto from 'crypto';
import { db } from './db.js';

const UPSTREAM = (process.env.UPSTREAM_BASE_URL || 'https://codecraftapi.com/v1').replace(/\/$/, '');
const UPSTREAM_KEY = process.env.UPSTREAM_API_KEY || '';

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

export async function resolveApiKey(req) {
  const auth = req.headers.authorization || '';
  let raw = null;
  if (auth.startsWith('Bearer ')) raw = auth.slice(7).trim();
  else if (req.headers['x-api-key']) raw = String(req.headers['x-api-key']).trim();
  else if (req.query.api_key) raw = String(req.query.api_key).trim();

  if (!raw) return { error: 'Missing API key. Use Authorization: Bearer YOUR_KEY', status: 401 };

  // raw format: codism_xxxxx  -> we store hash
  const hash = sha256(raw);
  const keyRow = db.prepare('SELECT api_keys.*, users.email as user_email FROM api_keys JOIN users ON users.id=api_keys.user_id WHERE key_hash=? AND is_active=1').get(hash);
  if (!keyRow) return { error: 'Invalid API key', status: 401 };

  // daily/monthly limit
  if (keyRow.daily_limit > 0) {
    const c = db.prepare(`SELECT COUNT(*) as cnt FROM usage_logs WHERE api_key_id=? AND date(created_at)=date('now')`).get(keyRow.id).cnt;
    if (c >= keyRow.daily_limit) return { error: 'Daily limit reached', status: 429 };
  }
  if (keyRow.monthly_limit > 0) {
    const c = db.prepare(`SELECT COUNT(*) as cnt FROM usage_logs WHERE api_key_id=? AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`).get(keyRow.id).cnt;
    if (c >= keyRow.monthly_limit) return { error: 'Monthly limit reached', status: 429 };
  }

  // model restriction
  let allowedModels = [];
  try { if (keyRow.allowed_models) allowedModels = JSON.parse(keyRow.allowed_models); } catch {}
  return { keyRow, raw, allowedModels };
}

export async function proxyToUpstream(req, res) {
  const resolved = await resolveApiKey(req);
  if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });

  const { keyRow, allowedModels } = resolved;

  // Check model restriction if body has model
  let bodyText = null;
  let bodyJson = null;
  // we need raw body for streaming
  if (req.bodyBuf) bodyText = req.bodyBuf.toString('utf8');
  else if (req.body && typeof req.body === 'object') { bodyText = JSON.stringify(req.body); bodyJson = req.body; }
  if (bodyText) {
    try { bodyJson = JSON.parse(bodyText); } catch {}
  }
  if (bodyJson?.model && allowedModels.length > 0 && !allowedModels.includes(bodyJson.model)) {
    return res.status(403).json({ error: `Model ${bodyJson.model} not allowed for this key` });
  }

  const upstreamPath = req.originalUrl.replace(/^\/v1/, '');
  // originalUrl includes /v1/... we map to UPSTREAM + path
  const targetUrl = UPSTREAM + upstreamPath.split('?')[0] + (req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?')[1].replace(/^.*?\?/, '') : '');
  // Simpler: construct from path + query
  const qs = req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : '';
  // req.url here is already stripped of /v1 mount prefix, so need to reconstruct
  // Express mount: app.use('/v1', proxy) -> req.url = /chat/completions...
  const finalUrl = UPSTREAM + req.url;

  const headers = {};
  // forward relevant headers but override auth
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  headers['authorization'] = `Bearer ${UPSTREAM_KEY}`;
  if (req.headers['accept']) headers['accept'] = req.headers['accept'];

  const method = req.method;
  const hasBody = !['GET','HEAD'].includes(method);

  const started = Date.now();
  try {
    const upstreamRes = await fetch(finalUrl, {
      method,
      headers,
      body: hasBody ? (req.bodyBuf || bodyText || undefined) : undefined,
      duplex: hasBody ? 'half' : undefined,
    });

    // Handle streaming
    const contentType = upstreamRes.headers.get('content-type') || '';
    const isStream = contentType.includes('text/event-stream') || bodyJson?.stream === true;

    // Mirror status and headers
    res.status(upstreamRes.status);
    // copy safe headers
    for (const [k,v] of upstreamRes.headers.entries()) {
      if (['content-encoding','content-length','transfer-encoding','connection'].includes(k.toLowerCase())) continue;
      res.setHeader(k, v);
    }

    if (isStream || !upstreamRes.body) {
      if (upstreamRes.body) {
        for await (const chunk of upstreamRes.body) res.write(chunk);
        res.end();
      } else {
        const txt = await upstreamRes.text();
        res.send(txt);
      }
      logUsage({ keyRow, endpoint: req.path, status: upstreamRes.status, latency: Date.now()-started, model: bodyJson?.model });
      return;
    }

    const buf = Buffer.from(await upstreamRes.arrayBuffer());
    res.send(buf);

    // Try to parse usage
    let usage = null; let modelUsed = bodyJson?.model || null;
    try {
      const j = JSON.parse(buf.toString('utf8'));
      if (j.usage) usage = j.usage;
      if (j.model) modelUsed = j.model;
    } catch {}
    logUsage({ keyRow, endpoint: req.path, status: upstreamRes.status, latency: Date.now()-started, model: modelUsed, usage });

  } catch (e) {
    console.error('Proxy error', e);
    res.status(502).json({ error: 'Upstream error', detail: String(e.message || e) });
  }
}

function logUsage({ keyRow, endpoint, status, latency, model, usage }) {
  try {
    db.prepare(`INSERT INTO usage_logs(api_key_id,user_id,model,prompt_tokens,completion_tokens,total_tokens,endpoint,status,latency_ms)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(
        keyRow.id, keyRow.user_id, model || null,
        usage?.prompt_tokens || 0, usage?.completion_tokens || 0, usage?.total_tokens || 0,
        endpoint, status, latency
    );
  } catch(e){ console.error('log failed', e); }
}
