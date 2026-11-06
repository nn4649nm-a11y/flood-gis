const path = require('path');
const fs = require('fs');
const http = require('http');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

// MIME types ที่รองรับสำหรับ Web GIS
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ตรวจสอบว่ามี express หรือไม่ (ถ้ามีใช้ express, ถ้าไม่มีใช้ http module ปกติ)
let useExpress = false;
try {
  require.resolve('express');
  useExpress = true;
} catch (e) {
  useExpress = false;
}

if (useExpress) {
  const express = require('express');
  const app = express();

  // CORS middleware
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  // Proxy endpoint สำหรับดึง WFS / WMS จาก GeoServer ข้าม CORS (ถ้าจำเป็น)
  app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url query parameter');
    try {
      const response = await fetch(targetUrl);
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err) {
      res.status(500).send('Proxy Error: ' + err.message);
    }
  });

  // สถานะเซิร์ฟเวอร์
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Serve static files
  app.use(express.static(PUBLIC_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.geojson')) {
        res.setHeader('Content-Type', 'application/geo+json; charset=utf-8');
      }
    }
  }));

  app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(` Flood GIS Server กำลังทำงานที่:`);
    console.log(` http://localhost:${PORT}`);
    console.log(`==================================================\n`);
  });
} else {
  // Built-in HTTP server fallback (ทำงานได้ทันทีแม้ไม่ได้รัน npm install)
  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // API Health check
    if (pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', fallback: true }));
      return;
    }

    if (pathname === '/') {
      pathname = '/index.html';
    }

    const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
    if (!safePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(safePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(safePath).pipe(res);
    });
  });

  server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(` Flood GIS Server (Native HTTP) กำลังทำงานที่:`);
    console.log(` http://localhost:${PORT}`);
    console.log(`==================================================\n`);
  });
}

