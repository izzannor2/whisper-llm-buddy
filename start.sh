#!/bin/bash
# LocalDev AI - Quick Start Script for Linux/macOS

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       ${BOLD}LocalDev AI - Quick Start${NC}${CYAN}          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}[!] Dependencies not installed. Running setup first...${NC}"
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo -e "${RED}[ERROR] Failed to install dependencies!${NC}"
        echo "Please run ./setup.sh first or check your Node.js installation."
        exit 1
    fi
    echo ""
    echo -e "${GREEN}[OK] Dependencies installed successfully!${NC}"
    echo ""
fi

# Check if Ollama is running (optional)
echo "[*] Checking Ollama status..."
if curl -s http://localhost:11434/api/tags &> /dev/null; then
    echo -e "${GREEN}[OK] Ollama is running${NC}"
else
    echo -e "${YELLOW}[!] Ollama not detected at localhost:11434${NC}"
    if command -v ollama &> /dev/null; then
        echo "    Starting Ollama in background..."
        ollama serve &> /dev/null &
        sleep 2
    else
        echo "    Ollama not installed - AI features will use fallback"
        echo "    Install from: https://ollama.ai"
    fi
fi

echo ""
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo " Starting development server..."
echo " App will open at: http://localhost:8080"
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo ""
echo " Press Ctrl+C to stop the server"
echo ""

# Open browser after delay (works on Linux and macOS)
(sleep 3 && (xdg-open http://localhost:8080 2>/dev/null || open http://localhost:8080 2>/dev/null || echo "Open http://localhost:8080 in your browser")) &

# Start the dev server
npm run dev
