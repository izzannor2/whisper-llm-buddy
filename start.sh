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

# ========================================
# Check for GGUF models in models/gguf/
# ========================================
GGUF_MODEL=""
LLAMA_SERVER_RUNNING=0

if [ -d "models/gguf" ]; then
    GGUF_MODEL=$(find models/gguf -name "*.gguf" -type f | head -n 1)
fi

if [ -n "$GGUF_MODEL" ]; then
    echo "[*] Found GGUF model: $GGUF_MODEL"
    
    # Check if llama-server is available
    if command -v llama-server &> /dev/null; then
        # Check if llama-server is already running
        if ! curl -s http://localhost:8081/health &> /dev/null; then
            echo "[*] Starting llama-server with detected model..."
            llama-server -m "$GGUF_MODEL" --port 8081 --host 0.0.0.0 -ngl 99 &> /dev/null &
            LLAMA_SERVER_RUNNING=1
            sleep 3
            echo -e "${GREEN}[OK] llama-server started on port 8081${NC}"
        else
            echo -e "${GREEN}[OK] llama-server already running on port 8081${NC}"
            LLAMA_SERVER_RUNNING=1
        fi
    else
        echo -e "${YELLOW}[!] llama-server not found in PATH${NC}"
        echo "    Install from: https://github.com/ggerganov/llama.cpp"
        echo "    The model will be available when llama-server is installed"
    fi
else
    echo "[*] No GGUF models found in models/gguf/"
    echo "    Add .gguf files there for auto-detection"
fi

# ========================================
# Check if Ollama is running (fallback)
# ========================================
if [ $LLAMA_SERVER_RUNNING -eq 0 ]; then
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
            echo "    Ollama not installed - AI features will use Cloud backend"
            echo "    Install from: https://ollama.ai"
        fi
    fi
fi

echo ""
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo " Starting development server..."
echo " App will open at: http://localhost:8080"
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo ""
if [ -n "$GGUF_MODEL" ]; then
    echo " Local LLM: llama-server (port 8081)"
fi
echo " Press Ctrl+C to stop the server"
echo ""

# Open browser after delay (works on Linux and macOS)
(sleep 3 && (xdg-open http://localhost:8080 2>/dev/null || open http://localhost:8080 2>/dev/null || echo "Open http://localhost:8080 in your browser")) &

# Start the dev server
npm run dev
