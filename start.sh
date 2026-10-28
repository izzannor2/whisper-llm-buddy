#!/bin/bash
# LocalDev AI - Portable Start Script (USB-safe)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# USB-safe: resolve script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Set portable model storage
export OLLAMA_MODELS="$SCRIPT_DIR/.ollama"

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       ${BOLD}LocalDev AI - Quick Start${NC}${CYAN}          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# Self-healing: create directories
mkdir -p config logs .ollama models/gguf bin/llama bin/ollama projects/3d

# Create default config if missing
if [ ! -f "config/settings.json" ]; then
    cat > config/settings.json << 'EOF'
{
  "ollama_path": "./bin/ollama",
  "llama_path": "./bin/llama",
  "model_path": "./.ollama",
  "gguf_path": "./models/gguf",
  "log_path": "./logs",
  "auto_start_ollama": true,
  "default_model": "",
  "ollama_port": 11434,
  "llama_port": 8081,
  "app_port": 8080,
  "agent_port": 3847
}
EOF
fi

# Start logging
echo "[$(date)] === LocalDev AI Starting ===" >> logs/app.log

# Step 1: Check Node.js (portable first)
echo "[1/6] Checking Node.js..."

if [ -x "$SCRIPT_DIR/bin/node/bin/node" ]; then
    export PATH="$SCRIPT_DIR/bin/node/bin:$PATH"
    echo -e "      ${GREEN}[OK] Using portable Node.js${NC}"
elif ! command -v node &> /dev/null; then
    echo -e "      ${YELLOW}[!] Node.js not found - attempting auto-install...${NC}"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install node
        else
            curl -fsSL https://nodejs.org/dist/v20.18.0/node-v20.18.0.pkg -o /tmp/nodejs.pkg
            sudo installer -pkg /tmp/nodejs.pkg -target /
            rm -f /tmp/nodejs.pkg
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y nodejs
        elif command -v pacman &> /dev/null; then
            sudo pacman -Sy --noconfirm nodejs npm
        else
            echo -e "${RED}[ERROR] Could not install Node.js! Install manually: https://nodejs.org${NC}"
            exit 1
        fi
    fi

    export PATH="/usr/local/bin:/usr/bin:$PATH"
    hash -r 2>/dev/null

    if ! command -v node &> /dev/null; then
        echo -e "${RED}[ERROR] Node.js not found. Restart terminal or install manually.${NC}"
        exit 1
    fi
    echo -e "      ${GREEN}[OK] Node.js installed!${NC}"
fi
echo -e "      ${GREEN}[OK] Node.js $(node --version)${NC}"

# Step 2: Package manager
PKG_CMD="npm"
echo "[2/6] [OK] Using npm"

# Step 3: Dependencies (self-healing)
echo "[3/6] Checking dependencies..."

if [ -d "node_modules" ] && { [ ! -d "node_modules/react" ] || [ ! -d "node_modules/vite" ]; }; then
    echo -e "      ${YELLOW}[!] node_modules incomplete, reinstalling...${NC}"
    rm -rf node_modules
fi

if [ ! -d "node_modules" ]; then
    for attempt in 1 2 3; do
        echo "      [*] Attempt $attempt/3: $PKG_CMD install..."
        INSTALL_CMD="install"
        [ -f package-lock.json ] && INSTALL_CMD="ci"
        if "$PKG_CMD" "$INSTALL_CMD"; then
            echo -e "      ${GREEN}[OK] Dependencies installed${NC}"
            break
        fi
        if [ $attempt -eq 3 ]; then
            echo -e "${RED}[ERROR] Failed after 3 attempts!${NC}"
            echo "[$(date)] FATAL: npm install failed" >> logs/app.log
            exit 1
        fi
        sleep 3
    done
else
    echo -e "      ${GREEN}[OK] Dependencies ready${NC}"
fi

# Step 4: Start Agent Server
echo "[4/6] Starting agent server..."
if curl -fsS --max-time 2 http://localhost:3847/status &> /dev/null; then
    echo "      [OK] Agent already running"
elif [ -f "server/index.cjs" ]; then
    node server/index.cjs >> logs/server.log 2>&1 &
    AGENT_PID=$!
    echo "[$(date)] Started agent server (PID $AGENT_PID)" >> logs/app.log
    
    # Wait for agent server to be ready
    for i in $(seq 1 10); do
        if curl -fsS --max-time 2 http://localhost:3847/status &> /dev/null; then
            echo -e "      ${GREEN}[OK] Agent server ready on port 3847${NC}"
            break
        fi
        sleep 1
    done
else
    echo "      [*] No agent server found, skipping"
fi

# Step 5: Detect and start AI engines
echo "[5/6] Setting up AI engines..."

OLLAMA_CMD=""
LLAMA_SERVER_CMD=""
LLAMA_SERVER_RUNNING=0

# Check llama-server (portable first)
if [ -x "$SCRIPT_DIR/bin/llama/llama-server" ]; then
    LLAMA_SERVER_CMD="$SCRIPT_DIR/bin/llama/llama-server"
    echo -e "      ${GREEN}[OK] Found portable llama-server${NC}"
elif command -v llama-server &> /dev/null; then
    LLAMA_SERVER_CMD="llama-server"
fi

# Check Ollama (portable first)
if [ -x "$SCRIPT_DIR/bin/ollama/ollama" ]; then
    OLLAMA_CMD="$SCRIPT_DIR/bin/ollama/ollama"
    echo -e "      ${GREEN}[OK] Found portable Ollama${NC}"
elif command -v ollama &> /dev/null; then
    OLLAMA_CMD="ollama"
fi

# Check for GGUF models
GGUF_MODEL=""
if [ -d "models/gguf" ]; then
    GGUF_MODEL=$(find "$SCRIPT_DIR/models/gguf" -name "*.gguf" -type f 2>/dev/null | head -n 1)
fi

# Start llama-server if model found
if [ -n "$GGUF_MODEL" ]; then
    echo "      [*] Found model: $(basename "$GGUF_MODEL")"
    if [ -n "$LLAMA_SERVER_CMD" ]; then
        if ! curl -fsS --max-time 2 http://localhost:8081/health &> /dev/null; then
            echo "      [*] Starting llama-server..."
            "$LLAMA_SERVER_CMD" -m "$GGUF_MODEL" --port 8081 --host 127.0.0.1 -ngl 99 >> logs/llama.log 2>&1 &
            echo "[$(date)] Started llama-server with $GGUF_MODEL" >> logs/app.log
            for i in $(seq 1 10); do
                if curl -fsS --max-time 2 http://localhost:8081/health &> /dev/null; then
                    echo -e "      ${GREEN}[OK] llama-server ready on port 8081${NC}"
                    LLAMA_SERVER_RUNNING=1
                    break
                fi
                sleep 1
            done
            [ $LLAMA_SERVER_RUNNING -eq 0 ] && echo "      [WARN] llama-server not ready. Check logs/llama.log."
        else
            echo -e "      ${GREEN}[OK] llama-server already running${NC}"
            LLAMA_SERVER_RUNNING=1
        fi
    fi
fi

# Start Ollama independently of llama-server
if [ -n "$OLLAMA_CMD" ]; then
    if ! curl -fsS --max-time 2 http://localhost:11434/api/tags &> /dev/null; then
        echo "      [*] Starting Ollama..."
        OLLAMA_HOST=127.0.0.1:11434 "$OLLAMA_CMD" serve >> logs/ollama.log 2>&1 &
        echo "[$(date)] Started Ollama" >> logs/app.log
        for i in $(seq 1 10); do
            if curl -fsS --max-time 2 http://localhost:11434/api/tags &> /dev/null; then
                echo -e "      ${GREEN}[OK] Ollama ready${NC}"
                break
            fi
            sleep 1
        done
    else
        echo -e "      ${GREEN}[OK] Ollama running${NC}"
    fi
elif [ $LLAMA_SERVER_RUNNING -eq 0 ]; then
    echo "      [WARN] No local AI engine found. Install Ollama or llama.cpp and choose a model."
fi

# Step 6: Start dev server
echo "[6/6] Starting development server..."
echo ""
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo " App:     http://localhost:8080"
echo " Agent:   http://localhost:3847"
[ -n "$GGUF_MODEL" ] && echo " Llama:   http://localhost:8081"
[ -n "$OLLAMA_CMD" ] && echo " Ollama:  http://localhost:11434"
echo " Models:  $SCRIPT_DIR/models/"
echo " Logs:    $SCRIPT_DIR/logs/"
echo " Press Ctrl+C to stop"
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo ""

echo "[$(date)] App server starting on port 8080" >> logs/app.log

# Open browser
(sleep 3 && (xdg-open http://localhost:8080 2>/dev/null || open http://localhost:8080 2>/dev/null || true)) &

"$PKG_CMD" run dev -- --host 0.0.0.0 --port 8080 --strictPort
