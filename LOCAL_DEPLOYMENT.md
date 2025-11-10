OCAL_DEPLOYMENT.md</path>
<content"># Local Deployment Guide - Universal Media Tracker

## Overview
This guide provides step-by-step instructions for deploying the Universal Media Tracker locally on your Mac Mini (macOS).

## 🚀 Quick Start

### Prerequisites
- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Git**: Latest version
- **PM2**: Process manager (optional but recommended)

### One-Command Setup
```bash
npm run setup:local
npm run start:local
```

**That's it!** Your media tracker will be running at `http://localhost:3000`

## 🔧 Manual Installation

### 1. Install Dependencies
```bash
# Install all dependencies
npm run install:all

# Or manually
npm install
cd server && npm install
cd ../web && npm install
```

### 2. Build Application
```bash
# Build both server and web
npm run build

# Or individually
npm run build:server
npm run build:web
```

### 3. Setup Environment
```bash
# Copy optimized environment file
cp .env.optimized .env

# Edit with your API keys
nano .env
```

**Required Environment Variables**:
```bash
# Server Configuration
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# API Keys
TMDB_API_KEY=your_tmdb_api_key_here
AUDIBLE_API_KEY=your_audible_api_key_here

# File Paths
AUDIBLE_LIBRARY_PATH=./data/audible_library.xlsx
DATA_DIR=./data
LOG_DIR=./logs
```

### 4. Start Application

#### Option A: Simple Start
```bash
npm run start
```

#### Option B: Production Mode
```bash
npm run start:production
```

#### Option C: With PM2 (Recommended)
```bash
# Start with PM2
npm run pm2:start

# Check status
npm run pm2:status

# View logs
npm run pm2:logs
```

#### Option D: Development Mode
```bash
# Start in development with hot reload
npm run dev

# Or run server and web separately
npm run dev:concurrent
```

## 📁 Project Structure
```
universal-media-tracker/
├── server/                    # Backend Node.js application
│   ├── src/
│   │   ├── index.ts         # Main server file
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── utils/           # Utilities
│   │   └── types/           # TypeScript types
│   ├── dist/                # Compiled JavaScript
│   ├── package.json
│   └── tsconfig.json
├── web/                      # Frontend HTML/CSS/JS
│   ├── index.html           # Original frontend
│   ├── optimized-index.html # Performance-optimized frontend
│   ├── public/              # Static assets
│   └── package.json
├── data/                     # Application data
│   ├── media_tracker.db     # SQLite database
│   ├── audible_library.xlsx # Audible library export
│   └── logs/               # Application logs
├── .env                     # Environment configuration
├── ecosystem.config.js      # PM2 configuration
├── Dockerfile.optimized     # Docker configuration
└── README.md
```

## 🛠️ Development Workflow

### Daily Development
```bash
# Start development server
npm run dev

# Access application
open http://localhost:3000
```

### Adding New Features
1. Edit TypeScript files in `server/src/`
2. Frontend changes in `web/`
3. Test locally with `npm run dev`
4. Build and restart: `npm run start`

### Database Management
```bash
# View database (optional)
sqlite3 data/media_tracker.db

# Reset database
npm run db:reset

# Run migrations
npm run migrate
```

## 📊 Performance & Monitoring

### Health Check
```bash
# Check application health
curl http://localhost:3000/health

# Should return:
{
  "ok": true,
  "time": "2025-11-10T14:00:00.000Z",
  "db": "ok",
  "version": "1.0.0",
  "uptime": 3600
}
```

### Performance Metrics
```bash
# Get performance metrics
curl http://localhost:3000/metrics

# Monitor PM2 processes
npm run pm2:monit
```

### Log Management
```bash
# View application logs
tail -f logs/app.log

# PM2 logs
npm run pm2:logs
```

## 🔧 Configuration Options

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Application environment |
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server host |
| `TMDB_API_KEY` | - | TMDB API key (required) |
| `CACHE_TTL` | `300000` | Cache TTL in milliseconds |
| `RATE_LIMIT_MAX` | `100` | Rate limit per 15 minutes |

### Server Configuration
```javascript
// In server/src/index.ts
const CONFIG = {
  tmdb_api_key: process.env.TMDB_API_KEY || '',
  justwatch_country: 'DE',
  timezone: 'Europe/Berlin',
  update_interval: '0 */6 * * *', // Every 6 hours
  audible_library_path: process.env.AUDIBLE_LIBRARY_PATH || './data/audible_library.xlsx'
};
```

## 🚀 Production Deployment

### Using PM2 (Recommended)
```bash
# Start in production mode
NODE_ENV=production npm run pm2:start

# Enable auto-restart on system reboot
pm2 startup
pm2 save
```

### Using Docker
```bash
# Build Docker image
npm run docker:build

# Run with environment file
npm run docker:run
```

### Process Management
```bash
# Start application
npm run pm2:start

# Stop application
npm run pm2:stop

# Restart application
npm run pm2:restart

# Check status
npm run pm2:status

# View logs
npm run pm2:logs

# Monitor resources
npm run pm2:monit
```

## 🛡️ Security Considerations

### Development Security
- Use `NODE_ENV=development` for debugging
- Set strong API keys
- Enable rate limiting
- Use HTTPS in production

### Production Security
- Set `NODE_ENV=production`
- Use environment variables for secrets
- Enable security headers
- Configure CORS properly
- Set up firewall rules

## 📋 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port
PORT=3001 npm run start
```

#### Database Issues
```bash
# Reset database
rm data/media_tracker.db
npm run build
npm run start

# Permissions issue
chmod 755 data/
```

#### Permission Issues
```bash
# Fix permissions
chmod +x node_modules/.bin/*
sudo chown -R $(whoami) data/
```

#### Build Errors
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# TypeScript issues
cd server && npm run build
```

### Log Analysis
```bash
# Application logs
tail -f logs/app.log

# PM2 logs
pm2 logs --lines 100

# System logs
log show --predicate 'process == "node"' --last 1h
```

## 🔄 Updates & Maintenance

### Update Application
```bash
# Pull latest changes
git pull origin main

# Rebuild application
npm run build

# Restart with PM2
npm run pm2:restart
```

### Database Maintenance
```bash
# Backup database
cp data/media_tracker.db data/backup_$(date +%Y%m%d).db

# Clean old logs
find logs/ -name "*.log" -mtime +30 -delete
```

## 📞 Support

### Getting Help
1. Check `logs/app.log` for errors
2. Verify environment variables
3. Test with `curl http://localhost:3000/health`
4. Check PM2 status: `npm run pm2:status`

### Performance Optimization
- Monitor memory usage: `npm run pm2:monit`
- Check cache hit rates in logs
- Optimize database queries
- Enable compression in production

---

**Ready to start?** Run `npm run setup:local` and you're ready to go! 🚀