#!/bin/bash

# Universal Media Tracker - Local Startup Script
# Optimized for Mac Mini macOS deployment

set -e

echo "🚀 Starting Universal Media Tracker..."

# Check if Node.js is installed and version is sufficient
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "🔧 Installing Node.js 18+..."
    ./install-node.sh
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install Node.js. Please install manually from https://nodejs.org/"
        exit 1
    fi
fi

# Check Node.js version
NODE_VERSION=$(node --version 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1 || echo "0")
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "⚠️  Node.js version $NODE_VERSION is too old (v18+ required)"
    echo "🔧 Attempting to install Node.js 18+..."
    ./install-node.sh
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install Node.js. Please install manually from https://nodejs.org/"
        exit 1
    fi
    
    # Re-check version after installation
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo "❌ Still using old Node.js version after installation"
        echo "💡 Try restarting your terminal and running this script again"
        exit 1
    fi
fi

echo "✅ Node.js $(node --version) detected"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    if [ -f ".env.optimized" ]; then
        cp .env.optimized .env
        echo "⚠️  Please edit .env file and add your API keys:"
        echo "   - TMDB_API_KEY=your_api_key_here"
        echo "   - AUDIBLE_API_KEY=your_api_key_here"
        echo ""
    else
        echo "❌ .env.optimized not found. Please ensure environment files exist."
        exit 1
    fi
fi

# Check if npm is working correctly
echo "🔍 Checking npm version compatibility..."
NPM_VERSION=$(npm --version 2>/dev/null || echo "unknown")
echo "Current npm version: $NPM_VERSION"

if [ "$NPM_VERSION" = "3.10.9" ]; then
    echo "⚠️  npm version 3.10.9 is too old for TypeScript compilation"
    echo "🔧 Fixing npm version compatibility..."
    ./fix-npm.sh
    
    # Check if npm was fixed
    NEW_NPM_VERSION=$(npm --version 2>/dev/null || echo "unknown")
    if [ "$NEW_NPM_VERSION" = "3.10.9" ]; then
        echo "❌ npm version still old after fix attempt"
        echo "💡 Please restart your terminal and run this script again"
        echo "   Or use: npm run start:simple"
        exit 1
    else
        echo "✅ npm updated to version: $NEW_NPM_VERSION"
    fi
elif [ "$NPM_VERSION" = "unknown" ]; then
    echo "❌ npm not found or not working"
    ./fix-npm.sh
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm run install:all
fi

# Check if app is built
if [ ! -d "server/dist" ]; then
    echo "🔨 Building application..."
    npm run build
fi

# Create data directory
mkdir -p data logs

echo ""
echo "🌐 Starting Universal Media Tracker..."
echo "📍 URL: http://localhost:3000"
echo "📋 Health Check: http://localhost:3000/health"
echo ""
echo "💡 Quick Commands:"
echo "   - Stop: Ctrl+C"
echo "   - PM2: npm run pm2:start"
echo "   - Logs: npm run pm2:logs"
echo ""

# Start the application
if command -v pm2 &> /dev/null; then
    echo "🔄 Starting with PM2..."
    npm run pm2:start
else
    echo "🔄 Starting with Node.js..."
    npm run start:production
fi

echo ""
echo "✅ Universal Media Tracker is running!"
echo "🌐 Access at: http://localhost:3000"