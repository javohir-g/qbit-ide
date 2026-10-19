#!/usr/bin/env node
/* A tiny static file server for the simulator:   node ide/tools/serve.js [port]
   (index.html also opens by double click - this is for phones / tablets on the same Wi-Fi and for tests). */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || 8766;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
                '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
server.listen(PORT, '0.0.0.0', () => {
  const ips = [].concat(...Object.values(os.networkInterfaces())).filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('q.bit simulator: http://localhost:' + PORT + '/' + (ips.length ? '   (in the network: ' + ips.map((a) => 'http://' + a + ':' + PORT + '/').join(', ') + ')' : ''));
});
