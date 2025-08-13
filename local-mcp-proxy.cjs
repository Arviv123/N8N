// local-mcp-proxy.cjs  —  MCP Inspector local proxy (CommonJS, no deps)
const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PORT ? Number(process.env.PORT) : 6277;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Cache-Control');
}

function health(_req, res) {
  cors(res);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, time: new Date().toISOString() }));
}

function proxySSE(req, res) {
  try {
    cors(res);
    const u = new URL(req.url, `http://${req.headers.host}`);
    const target = u.searchParams.get('url');
    if (!target) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'missing url param' }));
    }
    const t = new URL(target);
    const client = t.protocol === 'https:' ? https : http;

    const options = {
      method: req.method,
      protocol: t.protocol,
      hostname: t.hostname,
      port: t.port || (t.protocol === 'https:' ? 443 : 80),
      path: t.pathname + (t.search || ''),
      headers: {
        'Accept': req.headers['accept'] || 'text/event-stream',
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'User-Agent': 'mcp-inspector-local-proxy',
      }
    };

    const upstream = client.request(options, (ur) => {
      const isSSE = (ur.headers['content-type'] || '').includes('text/event-stream');
      res.writeHead(ur.statusCode || 200, {
        'Content-Type': isSSE ? 'text/event-stream' : (ur.headers['content-type'] || 'application/json'),
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      ur.on('data', (chunk) => res.write(chunk));
      ur.on('end', () => res.end());
      ur.on('error', () => { try { res.end(); } catch (_) {} });
    });

    upstream.on('error', (e) => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad gateway', message: e.message }));
    });

    if (req.method === 'POST') {
      req.on('data', (c) => upstream.write(c));
      req.on('end', () => upstream.end());
    } else {
      upstream.end();
    }
  } catch (err) {
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'proxy error', message: err?.message || 'unknown' }));
  }
}

const server = http.createServer((req, res) => {
  const { method, url } = req;

  if (method === 'OPTIONS' || method === 'HEAD') {
    cors(res); res.writeHead(200); return res.end();
  }
  if (url.startsWith('/health')) return health(req, res);
  if (url.startsWith('/sse'))    return proxySSE(req, res);
  if (url.startsWith('/config')) {
    cors(res); res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }
  cors(res);
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.keepAliveTimeout = 75_000;
server.headersTimeout   = 80_000;

server.listen(PORT, () => {
  console.log(`MCP Inspector Local Proxy listening on http://localhost:${PORT}`);
  console.log(`- GET  /health`);
  console.log(`- GET/POST /sse?url=<ENCODED_TARGET_URL>`);
});