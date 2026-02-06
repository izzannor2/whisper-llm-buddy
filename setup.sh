#!/bin/bash
# LocalDev AI - Linux/macOS Setup Script
# This script sets up and runs the development environment

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       LocalDev AI - Setup Script         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for Node.js
echo "[1/4] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed!${NC}"
    echo "   Please install from https://nodejs.org"
    echo "   Or use: brew install node (macOS) / sudo apt install nodejs (Ubuntu)"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node --version) found${NC}"

# Check for npm
echo "[2/4] Checking npm..."
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed!${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm --version) found${NC}"

# Install dependencies
echo "[3/4] Installing dependencies..."
if [ ! -d "node_modules" ]; then
    echo "   Running npm install..."
    npm install
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Failed to install dependencies${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

# Check for optional services
echo "[4/4] Checking optional services..."

# Check Ollama
if command -v ollama &> /dev/null; then
    echo -e "${GREEN}✓ Ollama found${NC}"
else
    echo -e "${YELLOW}   ⚠ Ollama not found (optional - for local LLM)${NC}"
    echo "     Install from https://ollama.ai"
fi

# Check llama-server
if command -v llama-server &> /dev/null; then
    echo -e "${GREEN}✓ llama.cpp server found${NC}"
else
    echo -e "${YELLOW}   ⚠ llama-server not found (optional - for GGUF models)${NC}"
    echo "     Build from https://github.com/ggerganov/llama.cpp"
fi

echo ""
echo "══════════════════════════════════════════"
echo " Setup complete! Starting dev server..."
echo "══════════════════════════════════════════"
echo ""
echo " The app will open at http://localhost:8080"
echo " Press Ctrl+C to stop the server"
echo ""

# Start the dev server
npm run dev
