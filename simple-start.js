#!/usr/bin/env node

/**
 * Simple Universal Media Tracker Launcher
 * For environments with older Node.js versions
 * 
 * This version provides basic functionality without TypeScript compilation
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

console.log('🚀 Simple Universal Media Tracker Launcher');
console.log(`📍 Node.js Version: ${process.version}`);

// Simple static file server
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Simple health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      message: 'Universal Media Tracker is running',
      version: '1.0.0-simple',
      nodejs: process.version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Simple API endpoint
  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      app: 'Universal Media Tracker',
      mode: 'simple',
      features: [
        'Static file serving',
        'Health monitoring',
        'Basic API responses',
        'CORS support'
      ],
      note: 'Full features require Node.js 18+ for TypeScript compilation'
    }));
    return;
  }

  // Serve static files
  let filePath = req.url === '/' ? '/web/index.html' : req.url;
  
  // Security: prevent directory traversal
  filePath = filePath.replace(/\.\./g, '');
  
  const fullPath = path.join(__dirname, filePath);
  const ext = path.extname(fullPath);
  const contentType = mimeTypes[ext] || 'text/plain';

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <head><title>404 Not Found</title></head>
            <body>
              <h1>404 - File Not Found</h1>
              <p>The requested file <code>${req.url}</code> was not found.</p>
              <p><a href="/">Go to Home</a></p>
              <hr>
              <p><strong>Universal Media Tracker</strong> - Simple Mode</p>
              <p>For full functionality, install Node.js 18+ and run the full build.</p>
            </body>
          </html>
        `);
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`✅ Universal Media Tracker running at http://${HOST}:${PORT}`);
  console.log(`📊 Health check: http://${HOST}:${PORT}/health`);
  console.log(`🔧 Status API: http://${HOST}:${PORT}/api/status`);
  console.log('');
  console.log('💡 Features available in simple mode:');
  console.log('   ✅ Static file serving');
  console.log('   ✅ Health monitoring');
  console.log('   ✅ Basic API responses');
  console.log('   ✅ CORS support');
  console.log('');
  console.log('⚠️  Limited features - Full app requires Node.js 18+');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});