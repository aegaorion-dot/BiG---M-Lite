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
  const rel = reqPath === '/' ? '/index.html' : reqPath.split('?')[0];
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
      if (size > limit) { reject(new Error('Request body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function createServer({ port = 3100 } = {}) {
  const store = createWebStore();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        let body = null;
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          const raw = await readBody(req);
          body = raw ? JSON.parse(raw) : {};
        }
        const out = await handleApi(store, req.method, url.pathname, Object.fromEntries(url.searchParams), body);
        return send(res, out.status, out.headers, out.body);
      }
      if (req.method !== 'GET') return send(res, 405, { 'content-type': 'text/plain' }, 'Method not allowed');
      return serveStatic(url.pathname, res);
    } catch (e) {
      return send(res, 500, { 'content-type': 'application/json' }, JSON.stringify({ ok: false, error: e.message }));
    }
  });
  return { server, store, port };
}

if (require.main === module) {
  const port = Number(process.env.BIGM_PORT ?? process.env.PORT ?? 3100);
  const { server } = createServer({ port });
  server.listen(port, () => {
    console.log(`BiG-M Lite web berjalan di http://localhost:${port}`);
  });
}

module.exports = { createServer };
