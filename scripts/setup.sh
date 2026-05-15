#!/bin/bash
# AI Companion Hub — Setup Script (Linux/macOS)
# Does NOT download any model. Use scripts/advanced/PULL-DEFAULT-MODEL.bat
# (or `ollama pull qwen2.5:3b`) once Ollama is running.

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo ""
echo "================================================"
echo "   AI Companion Hub - First-Time Setup"
echo "================================================"
echo ""

echo "[1/4] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js not found. Install Node 20 LTS from https://nodejs.org${NC}"
    exit 1
fi
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}[ERROR] Node 18+ required. Current: $(node -v)${NC}"; exit 1
fi
echo -e "${GREEN}[OK] $(node -v)${NC}"

echo "[2/4] Installing dependencies..."
if [ -d node_modules/react ]; then
    echo -e "${GREEN}[OK] Dependencies already present${NC}"
elif [ -f package-lock.json ]; then
    npm ci
else
    npm install
fi
echo -e "${GREEN}[OK] Dependencies ready${NC}"

echo "[3/4] Creating canonical directories..."
mkdir -p config logs .ollama models/gguf bin/llama bin/ollama bin/node public/updates projects/3d
echo -e "${GREEN}[OK] Directories ready${NC}"

echo "[4/4] Checking config/settings.json..."
if [ ! -f "config/settings.json" ]; then
    cat > config/settings.json << 'EOF'
{
  "ollama_path": "./bin/ollama",
  "llama_path": "./bin/llama",
  "model_path": "./.ollama",
  "gguf_path": "./models/gguf",
  "log_path": "./logs",
  "default_model": "qwen2.5:3b",
  "auto_start_ollama": true,
  "ollama_port": 11434,
  "llama_port": 8081,
  "app_port": 8080,
  "agent_port": 3847
}
EOF
    echo -e "${GREEN}[OK] Default config created${NC}"
else
    echo -e "${GREEN}[OK] Config exists${NC}"
fi

if ! command -v ollama &> /dev/null && [ ! -x "bin/ollama/ollama" ]; then
    echo -e "${YELLOW}[INFO] Ollama not found. Install for local AI:${NC}"
    echo "   curl -fsSL https://ollama.com/install.sh | sh"
fi

echo ""
echo -e "${GREEN}Setup complete.${NC}"
echo ""
echo "Next:"
echo "  npm run dev:all          (frontend + agent server)"
echo "  ollama serve &           (start Ollama if installed)"
echo "  ollama pull qwen2.5:3b   (optional, fetch default model)"
echo ""
