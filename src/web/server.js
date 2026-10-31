'use strict';

/**
 * Web server — Node http bawaan (tanpa dependensi), menyajikan:
 * - /api/*  -> engine nyata via src/web/api.js
 * - /       -> SPA statis dari public/
 * State in-memory (tanpa database/microservice), sesuai kontrak fondasi.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createWebStore } = require('./store');
const { handleApi } = require('./api');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, headers, body) {
  res.writeHead(status, { 'x-content-type-options': 'nosniff', ...headers });
  res.end(body);
}

function serveStatic(reqPath, res) {
  const pathname = reqPath.split('?')[0];
  const rel = pathname === '/' ? '/index.html' : pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const safe = path.normalize(rel).replace(/^([/\\])+/, '');
  const file = path.join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return send(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'Not found');
  }
  const ext = path.extname(file).toLowerCase();
  const data = fs.readFileSync(file);
  return send(res, 200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' }, data);
}

function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { chunks.length=0;reject(Object.assign(new Error('Request body too large'),{status:413}));return; }
      chunks.push(c);
    });
    req.on('end', () => {req.setTimeout(0);if(size<=limit)resolve(Buffer.concat(chunks).toString('utf8'));});
    req.on('error', (error) => {req.setTimeout(0);reject(error);});
    req.setTimeout(30000,()=>{req.setTimeout(0);reject(Object.assign(Error('Upload timed out'),{status:408}));req.destroy();});
  });
}

function createServer({ port = 3100, persistPath = null, orgId = null, authToken = null, profileProvider = null, extractionProvider, semanticProvider, museRuntime, fxProvider, languagePackService, store:providedStore=null, nikosStore:providedNikosStore=null } = {}) {
  const store = providedStore??createWebStore({ persistPath, orgId, authToken, profileProvider, extractionProvider, semanticProvider, museRuntime, fxProvider, languagePackService });
  const nikosStore=providedNikosStore??createWebStore({persistPath:persistPath?path.join(path.dirname(persistPath),'nikos-demo','store.json'):null,orgId:'org-nikos-demo',authToken,profileProvider,extractionProvider,semanticProvider,fxProvider});
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        let body = null;
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          const raw = await readBody(req,['/api/intake/upload','/api/intake/external/upload'].includes(url.pathname)?12*1024*1024:512*1024);
          body = raw ? JSON.parse(raw) : {};
        }
        const query=Object.fromEntries(url.searchParams),bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        if(bearer){if(body)body.authToken=bearer;else query.token=bearer;}
        const requestStore=req.headers['x-bigm-scenario']==='nikos'?nikosStore:store;
        const out = await handleApi(requestStore, req.method, url.pathname, query, body);
        return send(res, out.status, out.headers, out.body);
      }
      if (req.method !== 'GET') return send(res, 405, { 'content-type': 'text/plain' }, 'Method not allowed');
      let staticPath = url.pathname;
      if (staticPath === '/' || staticPath === '/index.html' || staticPath === '/v2') staticPath = '/v2/';
      else if (staticPath === '/legacy') staticPath = '/';
      else if (staticPath.startsWith('/legacy/')) staticPath = staticPath.slice('/legacy'.length);
      return serveStatic(staticPath, res);
    } catch (e) {
      return send(res, e.status??(e instanceof SyntaxError?400:500), { 'content-type': 'application/json' }, JSON.stringify({ ok: false, error: e.message }));
    }
  });
  return { server, store, nikosStore, port };
}

if (require.main === module) {
  require('./environment').loadEnvironment(path.join(__dirname, '..', '..', '.env'));
  const port = Number(process.env.BIGM_PORT ?? process.env.PORT ?? 3100);
  const persistPath = process.env.BIGM_DATA_PATH || path.join(__dirname, '..', '..', 'data', 'store.json');
  const authToken = process.env.BIGM_API_TOKEN ?? null;
  const { server } = createServer({ port, persistPath, authToken });
  server.listen(port, '127.0.0.1', () => {
    console.log(`BiG-M Lite web berjalan di http://localhost:${port}`);
  });
}

module.exports = { createServer };
