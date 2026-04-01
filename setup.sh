#!/bin/bash
# LocalDev AI - Setup Script for Linux/macOS
# Your Local AI Development Environment

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
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
echo -e "[1/6] Checking Node.js..."
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
# Step 2: Check npm / bun
# ========================================
echo -e "[2/6] Checking package manager..."
PKG_CMD="npm"
if command -v bun &> /dev/null; then
    echo -e "      ${GREEN}[OK] Bun $(bun --version) found (preferred)${NC}"
    PKG_CMD="bun"
elif command -v npm &> /dev/null; then
    echo -e "      ${GREEN}[OK] npm $(npm --version) found${NC}"
else
    echo -e "      ${RED}[ERROR] No package manager found!${NC}"
    exit 1
fi

# ========================================
# Step 3: Install dependencies (with retry)
# ========================================
echo -e "[3/6] Installing dependencies..."

# Auto-repair: check if node_modules is corrupted
if [ -d "node_modules" ] && [ ! -d "node_modules/react" ]; then
    echo -e "      ${YELLOW}[!] node_modules appears corrupted, reinstalling...${NC}"
    rm -rf node_modules
fi

if [ -d "node_modules" ]; then
    echo -e "      ${GREEN}[OK] Dependencies already installed${NC}"
    echo -e "      [*] Checking for updates..."
    $PKG_CMD install --silent 2>/dev/null || $PKG_CMD install
else
    INSTALL_SUCCESS=0
    for attempt in 1 2 3; do
        echo "      [*] Attempt $attempt/3: Running $PKG_CMD install..."
        if $PKG_CMD install; then
            INSTALL_SUCCESS=1
            break
        else
            echo -e "      ${YELLOW}[!] Attempt $attempt failed, retrying in 3 seconds...${NC}"
            sleep 3
        fi
    done
    if [ $INSTALL_SUCCESS -eq 0 ]; then
        echo -e "      ${RED}[ERROR] Failed to install dependencies after 3 attempts!${NC}"
        echo "      Please check your internet connection and try again."
        exit 1
    fi
    echo -e "      ${GREEN}[OK] Dependencies installed successfully${NC}"
fi

# ========================================
# Step 4: Create models directory
# ========================================
echo -e "[4/6] Setting up directories..."
mkdir -p "models/gguf" "models/ollama" "bin/llama" "bin/ollama"
echo -e "      ${GREEN}[OK] Directory structure ready${NC}"

# Check for existing GGUF models
GGUF_COUNT=$(find models/gguf -name "*.gguf" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$GGUF_COUNT" -gt 0 ]; then
    echo -e "      ${GREEN}[OK] Found $GGUF_COUNT GGUF model(s) ready to use${NC}"
else
    echo -e "      ${YELLOW}[!] No GGUF models found${NC}"
    echo "          Add .gguf files to models/gguf/ for auto-loading"
fi

# ========================================
# Step 5: Check Ollama (optional)
# ========================================
echo -e "[5/6] Checking Ollama (Local LLM)..."
OLLAMA_CMD=""
if [ -x "bin/ollama/ollama" ]; then
    OLLAMA_CMD="./bin/ollama/ollama"
    echo -e "      ${GREEN}[OK] Local Ollama found in bin/ollama/${NC}"
elif command -v ollama &> /dev/null; then
    OLLAMA_CMD="ollama"
    echo -e "      ${GREEN}[OK] Ollama found${NC}"
fi

if [ -n "$OLLAMA_CMD" ]; then
    if ! curl -s http://localhost:11434/api/tags &> /dev/null; then
        echo "      [*] Starting Ollama server..."
        OLLAMA_HOST=127.0.0.1:11434 $OLLAMA_CMD serve &> /dev/null &
        sleep 2
    fi
    echo "      [*] Checking for AI models..."
    if $OLLAMA_CMD list 2>/dev/null | grep -qi "llama"; then
        echo -e "      ${GREEN}[OK] Llama model available${NC}"
    else
        echo -e "      ${YELLOW}[!] No Llama model found${NC}"
        echo "          Run: ollama pull llama3.2"
    fi
else
    echo -e "      ${YELLOW}[!] Ollama not found (optional)${NC}"
    echo "          Install from: https://ollama.ai"
    echo "          Or place ollama binary in bin/ollama/"
fi

# ========================================
# Step 6: Check llama.cpp (optional)
# ========================================
echo -e "[6/6] Checking llama.cpp (GGUF models)..."
if [ -x "bin/llama/llama-server" ]; then
    echo -e "      ${GREEN}[OK] llama-server found in bin/llama/${NC}"
elif command -v llama-server &> /dev/null; then
    echo -e "      ${GREEN}[OK] llama-server found in PATH${NC}"
else
    echo -e "      ${YELLOW}[!] llama.cpp not found (optional)${NC}"
    echo "          Build from: https://github.com/ggerganov/llama.cpp"
    echo "          Or place llama-server in bin/llama/"
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
echo "   - Run: ./start.sh (or $PKG_CMD run dev)"
echo ""
echo " The app will open at: http://localhost:8080"
echo ""
echo " Model Setup:"
echo "   - GGUF models: Place in models/gguf/"
echo "   - Ollama: Run \"ollama pull llama3.2\""
echo "   - Scripts auto-detect and launch models!"
echo ""
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo ""

# Ask if user wants to start now
read -p "Start the app now? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Starting LocalDev AI..."
    ./start.sh
fi