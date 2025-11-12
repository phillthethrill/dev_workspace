OCAL_DEPLOYMENT.md</path>
<content"># Local Deployment Guide - Universal Media Tracker

## Overview
This guide provides **simple, step-by-step instructions** for deploying the Universal Media Tracker locally on your Mac Mini (macOS). Whether you're a beginner or experienced developer, you'll have your media tracker running in minutes!

**What you'll get:** A personal media tracking app that monitors TV shows, movies, and audiobooks, with automatic updates and a beautiful web interface.

## 🚀 Quick Start (3 Minutes!)

### What You Need
- **Node.js**: Version 18.0.0 or higher (don't worry, we have installers!)
- **npm**: Comes with Node.js (package manager)
- **Git**: For downloading the code (optional)
- **PM2**: Process manager (optional but recommended for production)

### One-Command Setup
```bash
# 🚀 Option 1: Complete setup (requires Node.js 18+)
npm run setup:local
npm run start:local

# 🔧 Option 2: Install Node.js 18+ automatically
./install-node.sh
./start.sh

# 🛟 Option 3: Simple fallback (works with any Node.js version)
npm run start:simple
```

**🎉 That's it!** Open `http://localhost:3000` in your browser to see your media tracker!

### What Just Happened?
- ✅ Downloaded all required software packages
- ✅ Built the application from source code
- ✅ Started the server on port 3000
- ✅ Set up automatic updates for your media library

## 🔧 Step-by-Step Manual Installation

### Step 1: Install Dependencies
```bash
# Install all dependencies at once (recommended)
npm run install:all

# Or install each part manually:
npm install                    # Main project dependencies
cd server && npm install      # Server dependencies
cd ../web && npm install      # Web frontend dependencies
```

### Step 2: Build the Application
```bash
# Build everything (server + web frontend)
npm run build

# Or build each part separately:
npm run build:server          # Build the server (TypeScript → JavaScript)
npm run build:web            # Build the web interface
```

**What does "build" mean?** It converts our TypeScript code into JavaScript that computers can run, and optimizes the web interface for speed.

### Step 3: Configure Your Settings
```bash
# Copy the optimized settings file
cp .env.optimized .env

# Edit the settings (replace with your actual API keys)
nano .env
```

**What you need to configure:**
```bash
# Basic Settings
NODE_ENV=development          # development or production
PORT=3000                     # Which port to run on (3000 is default)
HOST=0.0.0.0                 # Listen on all network interfaces

# API Keys (get these from the services below)
TMDB_API_KEY=your_tmdb_api_key_here      # For movie/TV show data
AUDIBLE_API_KEY=your_audible_api_key_here # For audiobook data

# File Locations
AUDIBLE_LIBRARY_PATH=./data/audible_library.xlsx  # Your Audible export
DATA_DIR=./data                 # Where to store data
LOG_DIR=./logs                  # Where to store logs
```

**How to get API keys:**
- **TMDB API Key**: Visit [themoviedb.org](https://www.themoviedb.org/settings/api) → Create account → Request API key
- **Audible API Key**: Visit [audible.com](https://www.audible.com) → Account settings → Developer tools

### Step 4: Start Your Media Tracker

#### 🚀 Option A: Simple Start (Recommended for beginners)
```bash
npm run start
```
**What this does:** Starts the server in basic mode. Great for testing!

#### 🏭 Option B: Production Mode (For live use)
```bash
npm run start:production
```
**What this does:** Optimized for 24/7 running with better performance and error handling.

#### ⚡ Option C: With PM2 (Best for reliability)
```bash
# Start with PM2 (keeps running even if terminal closes)
npm run pm2:start

# Check if it's running
npm run pm2:status

# View logs (see what's happening)
npm run pm2:logs
```
**Why PM2?** It automatically restarts your app if it crashes and keeps it running in the background.

#### 🔧 Option D: Development Mode (For coders)
```bash
# Start with auto-restart when you change code
npm run dev

# Or run server and web interface separately
npm run dev:concurrent
```
**What this does:** Automatically restarts when you edit files. Perfect for development.

## 📁 How Your App is Organized
```
universal-media-tracker/
├── server/                    # 🖥️  Backend (brains of the operation)
│   ├── src/
│   │   ├── optimized-index.ts # 🚀 Main server file (recently optimized!)
│   │   ├── routes/           # 🛣️  API endpoints (how frontend talks to backend)
│   │   ├── services/         # 🎬 Business logic (movie/TV/audiobook data)
│   │   ├── middleware/       # 🛡️  Security & rate limiting (new defaults!)
│   │   ├── utils/            # 🛠️  Helper functions (caching, database, logging)
│   │   └── types/            # 📋 TypeScript definitions
│   ├── dist/                 # ⚙️  Compiled JavaScript (ready to run)
│   ├── package.json
│   └── tsconfig.json
├── web/                      # 🌐 Frontend (what you see in browser)
│   ├── index.html           # 📄 Original web interface
│   ├── optimized-index.html # ⚡ Performance-optimized version
│   ├── public/              # 🖼️  Images, styles, scripts
│   └── package.json
├── data/                     # 💾 Your data storage
│   ├── media_tracker_optimized.db # 🗄️  SQLite database (with optimizations!)
│   ├── audible_library.xlsx # 🎧 Your Audible book exports
│   └── logs/               # 📝 Application logs
├── .env                     # 🔑 Your settings (API keys, etc.)
├── ecosystem.config.js      # ⚙️  PM2 configuration
├── Dockerfile.optimized     # 🐳 Docker setup
└── README.md
```

**Recent Optimizations:**
- ⚡ **Faster caching** - Data loads instantly on repeat visits
- 🔒 **Better security** - Rate limiting with smart defaults
- 📊 **Port handling** - Automatically parses port numbers correctly
- 🚨 **Improved logging** - Cleaner error messages and better debugging

## 🛠️ Development & Daily Use

### Daily Workflow
```bash
# Start your development server
npm run dev

# Open in browser
open http://localhost:3000
```

### Making Changes
1. **Edit server code** in `server/src/` (TypeScript files)
2. **Edit web interface** in `web/` (HTML/CSS/JS files)
3. **Test changes** with `npm run dev` (auto-restarts!)
4. **Build for production** with `npm run build`

### Database Management
```bash
# View your data (optional - requires sqlite3 installed)
sqlite3 data/media_tracker_optimized.db

# Reset database (start fresh)
npm run db:reset

# Update database structure
npm run migrate
```

**💡 Pro Tip:** The database automatically optimizes itself every 6 hours to stay fast!

## 📊 Monitoring & Performance

### Health Check (Is everything working?)
```bash
# Quick health check
curl http://localhost:3000/health

# You should see something like:
{
  "status": "healthy",
  "db": "ok",
  "cache": { "status": "ok", "size": 15, "hitRate": 0.85 },
  "timestamp": "2025-11-12T07:00:00.000Z"
}
```

### Performance Metrics (How fast is it?)
```bash
# See detailed performance stats
curl http://localhost:3000/metrics

# Monitor with PM2 (if using PM2)
npm run pm2:monit
```

### Log Management (What's happening?)
```bash
# View recent activity
tail -f logs/app.log

# PM2 logs (if using PM2)
npm run pm2:logs
```

**🚀 Recent Performance Improvements:**
- ⚡ **Smart caching** - Frequently accessed data loads instantly
- 🔄 **Automatic optimization** - Database optimizes itself every 6 hours
- 📈 **Performance monitoring** - Built-in metrics to track speed
- 🛡️ **Rate limiting** - Prevents overload with sensible defaults (100 requests/15min)

## 🔧 Configuration Options

### Environment Variables
| Variable | Default | What it does |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development` or `production` mode |
| `PORT` | `3000` | Which port the server runs on |
| `HOST` | `0.0.0.0` | Network interface (0.0.0.0 = all interfaces) |
| `TMDB_API_KEY` | *(required)* | Your TMDB API key for movie/TV data |
| `CACHE_TTL` | `300000` | How long to cache data (5 minutes) |
| `RATE_LIMIT_MAX` | `100` | Max requests per 15-minute window |

### Server Configuration
```javascript
// Recent optimizations in server/src/optimized-index.ts
const CONFIG = {
  tmdb_api_key: process.env.TMDB_API_KEY || '',
  justwatch_country: 'DE',
  timezone: 'Europe/Berlin',
  update_interval: '0 */6 * * *', // Auto-updates every 6 hours
  audible_library_path: process.env.AUDIBLE_LIBRARY_PATH || './data/audible_library.xlsx',
  // New: Automatic port parsing and better error handling!
  port: parseInt(process.env.PORT || '3000', 10)
};
```

**🎯 Recent Improvements:**
- **Port parsing** - Automatically converts port to number (no more string errors!)
- **Rate limiting defaults** - Sensible limits prevent overload
- **Enhanced logging** - Better error messages and structured logging
- **Cache optimization** - Smarter data caching for faster loads

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

## 📋 Troubleshooting Guide

### Common Issues & Solutions

#### ❌ "Port 3000 already in use"
```bash
# Find what's using the port
lsof -i :3000

# Kill the process (replace <PID> with actual number)
kill -9 <PID>

# Or run on a different port
PORT=3001 npm run start
```

#### ❌ Database problems
```bash
# Reset and rebuild database
rm data/media_tracker_optimized.db
npm run build
npm run start

# Fix permissions
chmod 755 data/
```

#### ❌ Permission errors
```bash
# Fix script permissions
chmod +x node_modules/.bin/*
sudo chown -R $(whoami) data/
```

#### ❌ Build fails (TypeScript errors)
```bash
# Clean reinstall
rm -rf node_modules package-lock.json
npm install

# Build server specifically
cd server && npm run build
```

#### ❌ "__dirname has already been declared" error
```bash
# This happens when __dirname is declared multiple times
# Fix: Remove duplicate __dirname declarations in server/src/index.ts

# Edit the file and remove duplicate declarations
nano server/src/index.ts

# Then rebuild
cd server && npm run build
npm run start:production
```

#### ❌ "SQLITE_CANTOPEN: unable to open database file" error
```bash
# This happens when the database file can't be created or accessed
# Usually due to permissions or missing data directory

# Ensure data directory exists
mkdir -p data

# Fix permissions if needed
chmod 755 data/

# If still failing, check if another process has the database locked
lsof data/*.db

# Kill any processes using the database
kill -9 <PID>

# Then restart
npm run start:production
```

#### ❌ "npm run setup:local" fails
```bash
# Try the simple version first
npm run start:simple

# Or install Node.js manually
./install-node.sh
```

**🔧 Recent Fixes:**
- **Port parsing** - No more "string is not assignable to number" errors
- **Type safety** - Fixed all TypeScript compilation issues
- **Rate limiting** - Proper defaults prevent configuration conflicts
- **Error logging** - Better error messages help with debugging

### Log Analysis (What went wrong?)
```bash
# View recent application logs
tail -f logs/app.log

# PM2 logs with last 100 lines
pm2 logs --lines 100

# System logs for Node.js processes
log show --predicate 'process == "node"' --last 1h
```

**📝 Recent Logging Improvements:**
- **Structured logging** - Easier to read error messages
- **Better error context** - More details when things go wrong
- **Performance logging** - Track how fast your app is running

## 🔄 Updates & Maintenance

### Update Your App
```bash
# Get latest improvements
git pull origin main

# Rebuild with optimizations
npm run build

# Restart (with PM2 if you're using it)
npm run pm2:restart
```

### Database Maintenance
```bash
# Backup your data (always do this first!)
cp data/media_tracker_optimized.db data/backup_$(date +%Y%m%d).db

# Clean up old log files
find logs/ -name "*.log" -mtime +30 -delete
```

**⚡ Recent Updates Include:**
- **Performance optimizations** - Faster loading and better caching
- **Security improvements** - Rate limiting and better error handling
- **Bug fixes** - Resolved TypeScript compilation issues
- **Better logging** - Easier debugging and monitoring

## 📞 Getting Help

### Quick Diagnosis
1. **Check the logs** - `tail -f logs/app.log` (look for error messages)
2. **Verify settings** - Make sure your `.env` file has correct API keys
3. **Test health** - `curl http://localhost:3000/health` (should say "healthy")
4. **Check PM2** - `npm run pm2:status` (if using PM2)

### Performance Tips
- **Monitor memory** - `npm run pm2:monit` (if using PM2)
- **Check cache efficiency** - Look for "cache hit" messages in logs
- **Database optimization** - Runs automatically every 6 hours
- **Enable compression** - Set `ENABLE_COMPRESSION=true` in production

### Recent Improvements Summary
- ✅ **Fixed TypeScript errors** - No more compilation failures
- ✅ **Better caching** - Faster data loading with smart cache keys
- ✅ **Port handling** - Automatic number parsing prevents errors
- ✅ **Rate limiting** - Sensible defaults protect against overload
- ✅ **Enhanced logging** - Structured error messages for easier debugging
- ✅ **Security middleware** - Improved defaults and type safety

---

## 🎯 Ready to Start?

**For beginners:** Run `npm run setup:local` - it does everything automatically!

**For advanced users:** Follow the step-by-step manual installation above.

**Need help?** Check the troubleshooting section or view the logs for clues.

**Happy tracking!** 🎬📚🎧