#!/bin/bash

# npm Version Fix for Universal Media Tracker
# Fixes npm version mismatch after Node.js installation

set -e

echo "🔧 Fixing npm version compatibility..."

# Check current Node.js version
NODE_VERSION=$(node --version)
echo "Node.js version: $NODE_VERSION"

# Find the correct npm path for Node.js v18
if [[ "$NODE_VERSION" =~ v18\. ]]; then
    # Try different possible npm locations
    POSSIBLE_NPM_PATHS=(
        "/opt/homebrew/bin/npm"
        "/opt/homebrew/Cellar/node@18/*/bin/npm"
        "/usr/local/bin/npm"
        "$(dirname $(which node))/npm"
    )
    
    NPM_PATH=""
    for path_pattern in "${POSSIBLE_NPM_PATHS[@]}"; do
        if [[ "$path_pattern" == *"*"* ]]; then
            # Handle glob patterns
            found_path=$(ls -d $path_pattern 2>/dev/null | head -1)
            if [[ -n "$found_path" && -f "$found_path" ]]; then
                NPM_PATH="$found_path"
                break
            fi
        elif [[ -f "$path_pattern" ]]; then
            NPM_PATH="$path_pattern"
            break
        fi
    done
    
    if [[ -n "$NPM_PATH" ]]; then
        echo "✅ Found npm at: $NPM_PATH"
        NPM_VERSION=$($NPM_PATH --version 2>/dev/null || echo "unknown")
        echo "npm version: $NPM_VERSION"
        
        if [[ "$NPM_VERSION" != "3.10.9" ]]; then
            echo "🔄 Updating PATH to use correct npm..."
            
            # Add to PATH for current session
            export PATH="$(dirname $NPM_PATH):$PATH"
            
            # Add to shell profile
            NPM_DIR="$(dirname $NPM_PATH)"
            if ! grep -q "export PATH=\"$NPM_DIR:\$PATH\"" ~/.zshrc 2>/dev/null; then
                echo "export PATH=\"$NPM_DIR:\$PATH\"" >> ~/.zshrc
                echo "✅ Added npm to PATH in ~/.zshrc"
            fi
            
            if ! grep -q "export PATH=\"$NPM_DIR:\$PATH\"" ~/.bash_profile 2>/dev/null; then
                echo "export PATH=\"$NPM_DIR:\$PATH\"" >> ~/.bash_profile
                echo "✅ Added npm to PATH in ~/.bash_profile"
            fi
        fi
    else
        echo "⚠️  npm not found in expected locations"
        echo "🔄 Trying to reinstall npm..."
        
        # Try to use curl to download and install npm
        curl -qL https://www.npmjs.com/install.sh | sh
    fi
else
    echo "❌ Node.js v18+ not detected: $NODE_VERSION"
    echo "Please run: ./install-node.sh"
    exit 1
fi

# Update npm to latest version
echo "📦 Updating npm to latest version..."
$NPM_PATH install -g npm@latest

# Verify npm is working
echo "🔍 Verifying npm installation..."
NPM_VERSION=$($NPM_PATH --version 2>/dev/null || echo "unknown")
echo "Final npm version: $NPM_VERSION"

if [[ "$NPM_VERSION" == "3.10.9" ]]; then
    echo "❌ npm version still 3.10.9 - manual intervention required"
    echo "💡 Try:"
    echo "   1. Restart your terminal"
    echo "   2. Run: $NPM_PATH install -g npm@latest"
    echo "   3. Or use: npm run start:simple"
    exit 1
fi

# Test npm functionality
echo "🧪 Testing npm functionality..."
$NPM_PATH --help >/dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ npm is working correctly!"
    echo ""
    echo "🎉 You can now build the application:"
    echo "   npm run build"
    echo "   npm run start:local"
else
    echo "❌ npm test failed"
    exit 1
fi

echo ""
echo "💡 Next steps:"
echo "   1. Restart your terminal to load the new PATH"
echo "   2. Run: npm run build"
echo "   3. Or: npm run start:simple"