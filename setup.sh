#!/bin/bash
# LocalDev AI - Setup Script for Linux/macOS
# Your Local AI Development Environment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       ${BOLD}LocalDev AI - Full Setup${NC}${CYAN}           ║${NC}"
echo -e "${CYAN}║                                          ║${NC}"
echo -e "${CYAN}║   Your Local AI Development Environment  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ========================================
# Step 1: Check Node.js
# ========================================
echo -e "[1/5] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "      ${RED}[ERROR] Node.js is not installed!${NC}"
    echo ""
    echo "      Please install Node.js from: https://nodejs.org"
    echo "      Or use your package manager:"
    echo "        - macOS: brew install node"
    echo "        - Ubuntu: sudo apt install nodejs npm"
    echo "        - Arch: sudo pacman -S nodejs npm"
    exit 1
fi
echo -e "      ${GREEN}[OK] Node.js $(node --version) found${NC}"

# ========================================
# Step 2: Check npm
# ========================================
echo -e "[2/5] Checking npm..."
if ! command -v npm &> /dev/null; then
    echo -e "      ${RED}[ERROR] npm is not installed!${NC}"
    exit 1
fi
echo -e "      ${GREEN}[OK] npm $(npm --version) found${NC}"

# ========================================
# Step 3: Install dependencies
# ========================================
echo -e "[3/5] Installing dependencies..."
if [ -d "node_modules" ]; then
    echo -e "      ${GREEN}[OK] Dependencies already installed${NC}"
    echo -e "      [*] Checking for updates..."
    npm install --silent
else
    echo "      [*] Running npm install (this may take a minute)..."
    npm install
    if [ $? -ne 0 ]; then
        echo -e "      ${RED}[ERROR] Failed to install dependencies!${NC}"
        exit 1
    fi
    echo -e "      ${GREEN}[OK] Dependencies installed successfully${NC}"
fi

# ========================================
# Step 4: Check Ollama (optional)
# ========================================
echo -e "[4/5] Checking Ollama (Local LLM)..."
if command -v ollama &> /dev/null; then
    echo -e "      ${GREEN}[OK] Ollama found${NC}"
    
    # Try to start Ollama if not running
    if ! curl -s http://localhost:11434/api/tags &> /dev/null; then
        echo "      [*] Starting Ollama server..."
        ollama serve &> /dev/null &
        sleep 2
    fi
    
    # Check for models
    echo "      [*] Checking for AI models..."
    if ollama list 2>/dev/null | grep -qi "llama"; then
        echo -e "      ${GREEN}[OK] Llama model available${NC}"
    else
        echo -e "      ${YELLOW}[!] No Llama model found${NC}"
        echo "          Run: ollama pull llama3.2"
    fi
else
    echo -e "      ${YELLOW}[!] Ollama not found (optional)${NC}"
    echo "          Install from: https://ollama.ai"
    echo "          Required for local AI features"
fi

# ========================================
# Step 5: Check llama.cpp (optional)
# ========================================
echo -e "[5/5] Checking llama.cpp (GGUF models)..."
if command -v llama-server &> /dev/null; then
    echo -e "      ${GREEN}[OK] llama-server found${NC}"
elif command -v llama-cli &> /dev/null; then
    echo -e "      ${GREEN}[OK] llama-cli found${NC}"
else
    echo -e "      ${YELLOW}[!] llama.cpp not found (optional)${NC}"
    echo "          Build from: https://github.com/ggerganov/llama.cpp"
    echo "          Required for custom GGUF models"
fi

# ========================================
# Setup Complete
# ========================================
echo ""
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo -e "${BOLD} Setup Complete!${NC}"
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo ""
echo " To start the app:"
echo "   - Run: ./start.sh (or npm run dev)"
echo ""
echo " The app will open at: http://localhost:8080"
echo ""
echo " Quick Tips:"
echo "   - Use Ollama for local AI (ollama pull llama3.2)"
echo "   - Enable GPU acceleration in Settings"
echo "   - Try App Builder mode for full IDE experience"
echo ""
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo ""

# Ask if user wants to start now
read -p "Start the app now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Starting LocalDev AI..."
    npm run dev
fi
