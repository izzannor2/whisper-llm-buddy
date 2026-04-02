#!/bin/bash
# LocalDev AI - All-in-One Start Script

RED='\033[0;31m'
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

# Step 1: Check Node.js
echo "[1/5] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "      ${YELLOW}[!] Node.js not found - attempting auto-install...${NC}"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            echo "      [*] Installing Node.js via Homebrew..."
            brew install node
        else
            echo "      [*] Installing Node.js via official installer..."
            curl -fsSL https://nodejs.org/dist/v20.18.0/node-v20.18.0.pkg -o /tmp/nodejs.pkg
            sudo installer -pkg /tmp/nodejs.pkg -target /
            rm -f /tmp/nodejs.pkg
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            echo "      [*] Installing Node.js via NodeSource (apt)..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v dnf &> /dev/null; then
            echo "      [*] Installing Node.js via dnf..."
            sudo dnf install -y nodejs
        elif command -v yum &> /dev/null; then
            echo "      [*] Installing Node.js via yum..."
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo yum install -y nodejs
        elif command -v pacman &> /dev/null; then
            echo "      [*] Installing Node.js via pacman..."
            sudo pacman -Sy --noconfirm nodejs npm
        else
            echo -e "${RED}[ERROR] Could not auto-install Node.js! Install manually: https://nodejs.org${NC}"
            exit 1
        fi
    else
        echo -e "${RED}[ERROR] Unsupported OS. Install Node.js manually: https://nodejs.org${NC}"
        exit 1
    fi

    # Refresh PATH
    export PATH="/usr/local/bin:/usr/bin:$PATH"
    hash -r 2>/dev/null

    if ! command -v node &> /dev/null; then
        echo -e "${RED}[ERROR] Node.js install completed but 'node' not found. Restart your terminal or install manually: https://nodejs.org${NC}"
        exit 1
    fi
    echo -e "      ${GREEN}[OK] Node.js installed successfully!${NC}"
fi
echo -e "      ${GREEN}[OK] Node.js $(node --version)${NC}"

# Step 2: Package manager
PKG_CMD="npm"
if command -v bun &> /dev/null; then
    PKG_CMD="bun"
    echo -e "[2/5] ${GREEN}[OK] Using Bun${NC}"
else
    echo "[2/5] [OK] Using npm"
fi

# Step 3: Dependencies with retry + auto-repair
echo "[3/5] Checking dependencies..."

if [ -d "node_modules" ] && [ ! -d "node_modules/react" ]; then
    echo -e "      ${YELLOW}[!] node_modules corrupted, reinstalling...${NC}"
    rm -rf node_modules
fi

if [ ! -d "node_modules" ]; then
    for attempt in 1 2 3; do
        echo "      [*] Attempt $attempt/3: $PKG_CMD install..."
        if $PKG_CMD install; then
            echo -e "      ${GREEN}[OK] Dependencies installed${NC}"
            break
        fi
        if [ $attempt -eq 3 ]; then
            echo -e "${RED}[ERROR] Failed after 3 attempts!${NC}"
            exit 1
        fi
        echo "      [!] Retrying in 3s..."
        sleep 3
    done
else
    echo -e "      ${GREEN}[OK] Dependencies installed${NC}"
fi

# Step 4: Ollama
echo "[4/6] Checking Ollama..."
OLLAMA_CMD=""
if [ -x "bin/ollama/ollama" ]; then
    OLLAMA_CMD="./bin/ollama/ollama"
elif command -v ollama &> /dev/null; then
    OLLAMA_CMD="ollama"
fi

if [ -z "$OLLAMA_CMD" ]; then
    echo -e "      ${YELLOW}[!] Ollama not found - attempting install...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install ollama 2>/dev/null && OLLAMA_CMD="ollama"
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        curl -fsSL https://ollama.com/install.sh | sh 2>/dev/null && OLLAMA_CMD="ollama"
    fi
fi

LLAMA_SERVER_CMD=""
LLAMA_SERVER_RUNNING=0

if [ -x "bin/llama/llama-server" ]; then
    LLAMA_SERVER_CMD="./bin/llama/llama-server"
elif command -v llama-server &> /dev/null; then
    LLAMA_SERVER_CMD="llama-server"
fi

# Step 5: Environment setup
echo "[5/6] Setting up environment..."
mkdir -p models/gguf bin/llama bin/ollama

GGUF_MODEL=""
if [ -d "models/gguf" ]; then
    GGUF_MODEL=$(find models/gguf -name "*.gguf" -type f | head -n 1)
fi

if [ -n "$GGUF_MODEL" ]; then
    echo "      [*] Found model: $GGUF_MODEL"
    if [ -n "$LLAMA_SERVER_CMD" ]; then
        if ! curl -s http://localhost:8081/health &> /dev/null; then
            echo "      [*] Starting llama-server..."
            $LLAMA_SERVER_CMD -m "$GGUF_MODEL" --port 8081 --host 0.0.0.0 -ngl 99 &> /dev/null &
            for i in $(seq 1 10); do
                if curl -s http://localhost:8081/health &> /dev/null; then
                    echo -e "      ${GREEN}[OK] llama-server ready on port 8081${NC}"
                    LLAMA_SERVER_RUNNING=1
                    break
                fi
                sleep 1
            done
            [ $LLAMA_SERVER_RUNNING -eq 0 ] && echo "      [!] llama-server may still be loading..." && LLAMA_SERVER_RUNNING=1
        else
            echo -e "      ${GREEN}[OK] llama-server already running${NC}"
            LLAMA_SERVER_RUNNING=1
        fi
    fi
fi

# Start Ollama if no llama-server
if [ $LLAMA_SERVER_RUNNING -eq 0 ] && [ -n "$OLLAMA_CMD" ]; then
    if ! curl -s http://localhost:11434/api/tags &> /dev/null; then
        echo "      [*] Starting Ollama..."
        OLLAMA_HOST=127.0.0.1:11434 $OLLAMA_CMD serve &> /dev/null &
        for i in $(seq 1 10); do
            if curl -s http://localhost:11434/api/tags &> /dev/null; then
                echo -e "      ${GREEN}[OK] Ollama ready${NC}"
                break
            fi
            sleep 1
        done
    else
        echo -e "      ${GREEN}[OK] Ollama running${NC}"
    fi
    # Auto-pull a default model if none exist
    MODELS=$(curl -s http://localhost:11434/api/tags 2>/dev/null | grep -o '"name"' | wc -l)
    if [ "$MODELS" -eq 0 ] 2>/dev/null; then
        echo -e "      ${YELLOW}[*] Pulling llama3.2 (first time setup)...${NC}"
        $OLLAMA_CMD pull llama3.2 2>/dev/null &
    fi
elif [ $LLAMA_SERVER_RUNNING -eq 0 ]; then
    echo "      [*] No local LLM found - using Cloud backend"
fi

# Step 5: Start dev server
echo "[5/5] Starting development server..."
echo ""
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo " App: http://localhost:8080"
[ -n "$GGUF_MODEL" ] && echo " LLM: llama-server (port 8081)"
echo " Press Ctrl+C to stop"
echo -e "${CYAN}══════════════════════════════════════════${NC}"
echo ""

# Open browser
(sleep 3 && (xdg-open http://localhost:8080 2>/dev/null || open http://localhost:8080 2>/dev/null || true)) &

$PKG_CMD run dev
