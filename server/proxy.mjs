import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';

const env = {};
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
}
const key = process.env.GEOGRID_API_KEY ?? env.GEOGRID_API_KEY;
const base = process.env.GEOGRID_API_URL ?? env.GEOGRID_API_URL ?? 'https://geogrid.dev/api/v1';

createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (!key || key.includes('replace_me')) return send(503, { error: { code: 'no_key', message: 'GEOGRID_API_KEY missing in .env' } });
  if (!/^\/scans(\/[\w-]+)?$/.test(req.url.split('?')[0])) return send(404, { error: { code: 'not_found' } });
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    const upstream = await fetch(base + req.url, {
      method: req.method,
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    res.writeHead(upstream.status, { 'content-type': 'application/json' });
    res.end(await upstream.text());
  } catch (e) {
    send(502, { error: { code: 'upstream_unreachable', message: String(e.message) } });
  }
}).listen(3002, () => console.log('Geogrid proxy on :3002'));
