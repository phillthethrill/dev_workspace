const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Vercel build process...');

// Create build directory
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Copy web files to dist
if (fs.existsSync('web')) {
  console.log('📁 Copying web files...');
  
  // Create dist/web directory
  if (!fs.existsSync('dist/web')) {
    fs.mkdirSync('dist/web', { recursive: true });
  }
  
  // Copy web files
  const webFiles = [
    'index.html',
    'optimized-index.html'
  ];
  
  webFiles.forEach(file => {
    if (fs.existsSync(`web/${file}`)) {
      fs.copyFileSync(`web/${file}`, `dist/web/${file}`);
      console.log(`✅ Copied ${file}`);
    }
  });
  
  // Copy public files
  if (fs.existsSync('public')) {
    const copyRecursive = (src, dest) => {
      if (fs.statSync(src).isDirectory()) {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest);
        }
        fs.readdirSync(src).forEach(childItemName => {
          copyRecursive(
            path.join(src, childItemName),
            path.join(dest, childItemName)
          );
        });
      } else {
        fs.copyFileSync(src, dest);
      }
    };
    
    if (!fs.existsSync('dist/public')) {
      fs.mkdirSync('dist/public', { recursive: true });
    }
    
    copyRecursive('public', 'dist/public');
    console.log('✅ Copied public files');
  }
}

// Create a simple Vercel-compatible serverless function
console.log('🔧 Creating Vercel serverless function...');

const serverlessFunction = `
// Vercel Serverless Function for Media Tracker
import { createServer } from 'http';

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }
  
  const url = new URL(req.url, 'http://localhost');
  
  if (url.pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      status: 'ok',
      message: 'Media Tracker API is running',
      platform: 'vercel',
      timestamp: new Date().toISOString()
    }));
    return;
  }
  
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify({
      message: 'API endpoint - backend features limited on Vercel static deployment',
      suggestion: 'Use server.js for full functionality'
    }));
    return;
  }
  
  // Serve static files
  let filePath = 'dist/web/index.html';
  if (url.pathname !== '/') {
    filePath = 'dist/web' + url.pathname;
    if (!fs.existsSync(filePath)) {
      filePath = 'dist/web/index.html';
    }
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.end(content);
  } catch (error) {
    res.setHeader('Content-Type', 'text/html');
    res.statusCode = 404;
    res.end('<h1>404 - File not found</h1>');
  }
});

export default server;
`;

fs.writeFileSync('api/index.js', serverlessFunction);
console.log('✅ Created serverless function');

// Create deployment info
const deploymentInfo = {
  platform: 'vercel',
  buildTime: new Date().toISOString(),
  features: {
    staticFiles: true,
    serverlessFunctions: true,
    api: 'limited',
    database: 'not available on static deployment'
  },
  limitations: [
    'Database operations not available',
    'File system access limited',
    'Background jobs not available',
    'Real-time features limited'
  ],
  recommendations: [
    'Use server.js for full Node.js functionality',
    'Consider other platforms for database features',
    'Use Vercel Functions for API endpoints',
    'Deploy static files for frontend only'
  ]
};

fs.writeFileSync('dist/deployment-info.json', JSON.stringify(deploymentInfo, null, 2));
console.log('✅ Created deployment info');

console.log('🎉 Vercel build completed successfully!');
console.log('');
console.log('📋 Deployment Info:');
console.log('- Static files: dist/web/');
console.log('- Serverless function: api/index.js');
console.log('- Frontend: Available');
console.log('- Backend: Limited (Vercel static deployment)');
console.log('');
console.log('💡 For full functionality, consider deploying with:');
console.log('  - Docker: npm run docker:build');
console.log('  - PM2: npm run pm2:start');
console.log('  - Server.js: node server/dist/index.js');