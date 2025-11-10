#!/bin/bash

# Node.js Installer for Universal Media Tracker
# Installs Node.js 18+ if version is too old

set -e

echo "🔍 Checking Node.js version..."

# Check current Node.js version
CURRENT_VERSION=$(node --version 2>/dev/null || echo "none")
echo "Current Node.js version: $CURRENT_VERSION"

# Extract major version number
if [[ "$CURRENT_VERSION" =~ v([0-9]+) ]]; then
    MAJOR_VERSION=${BASH_REMATCH[1]}
else
    MAJOR_VERSION=0
fi

echo "Major version: $MAJOR_VERSION"

# Check if version is sufficient
if [ "$MAJOR_VERSION" -ge 18 ]; then
    echo "✅ Node.js version is sufficient (v18+ required)"
    exit 0
fi

echo "⚠️  Node.js version is too old (v$MAJOR_VERSION < v18)"
echo "🔧 Attempting to install Node.js 18+..."

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    echo "📱 Detected macOS"
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        echo "🍺 Homebrew not found. Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        # Add Homebrew to PATH for Apple Silicon Macs
        if [[ $(uname -m) == "arm64" ]]; then
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi
    fi
    
    echo "🔄 Installing Node.js via Homebrew..."
    brew install node@18
    
    # Link the version
    brew link node@18 --force
    
    # Add to PATH
    echo 'export PATH="/usr/local/opt/node@18/bin:$PATH"' >> ~/.zshrc
    export PATH="/usr/local/opt/node@18/bin:$PATH"
    
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    echo "🐧 Detected Linux"
    
    # Try to install via package manager or use NodeSource
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Windows (Git Bash/Cygwin)
    echo "🪟 Detected Windows"
    echo "Please install Node.js 18+ manually from: https://nodejs.org/"
    exit 1
else
    echo "❌ Unsupported operating system: $OSTYPE"
    echo "Please install Node.js 18+ manually from: https://nodejs.org/"
    exit 1
fi

# Verify installation
echo "🔍 Verifying new Node.js version..."
NEW_VERSION=$(node --version 2>/dev/null || echo "none")
echo "New Node.js version: $NEW_VERSION"

if [[ "$NEW_VERSION" =~ v([0-9]+) ]]; then
    NEW_MAJOR=${BASH_REMATCH[1]}
    if [ "$NEW_MAJOR" -ge 18 ]; then
        echo "✅ Successfully installed Node.js v$NEW_MAJOR"
        echo "🎉 You can now run the Universal Media Tracker!"
        echo ""
        echo "Next steps:"
        echo "  1. Restart your terminal"
        echo "  2. Run: ./start.sh"
        exit 0
    fi
fi

echo "❌ Failed to install Node.js 18+"
echo "Please install manually from: https://nodejs.org/"
exit 1