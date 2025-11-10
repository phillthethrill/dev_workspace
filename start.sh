#!/bin/bash

# Universal Media Tracker - Local Startup Script
# Optimized for Mac Mini macOS deployment

set -e

echo "🚀 Starting Universal Media Tracker..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ required. Current version: $(node --version)"
    exit 1
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