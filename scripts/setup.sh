#!/bin/bash
# LocalDev AI — Setup Script
# Usage: bash scripts/setup.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      LocalDev AI — Setup Script          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Check Node.js version
echo "[1/4] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js not found. Install from https://nodejs.org (v18+)${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}[ERROR] Node.js v18+ required. Current: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}[OK] Node.js $(node -v)${NC}"

# Install dependencies
echo "[2/4] Installing dependencies..."
if command -v bun &> /dev/null; then
    bun install
else
    npm install
fi
echo -e "${GREEN}[OK] Dependencies installed${NC}"

# Create directories
echo "[3/4] Creating directories..."
mkdir -p config logs models/gguf models/ollama bin/llama bin/ollama
echo -e "${GREEN}[OK] Directories ready${NC}"

# Create default config if missing
echo "[4/4] Checking config..."
if [ ! -f "config/settings.json" ]; then
    cat > config/settings.json << 'EOF'
{
  "ollama_path": "./bin/ollama",
  "llama_path": "./bin/llama",
  "model_path": "./.ollama",
  "log_path": "./logs",
  "auto_start_ollama": true,
  "ollama_port": 11434,
  "llama_port": 8081,
  "app_port": 8080
}
EOF
    echo -e "${GREEN}[OK] Default config created${NC}"
else
    echo -e "${GREEN}[OK] Config exists${NC}"
fi

# Optionally download Ollama
if ! command -v ollama &> /dev/null && [ ! -x "bin/ollama/ollama" ]; then
    echo ""
    echo -e "${YELLOW}Ollama not found. Install it for local AI inference:${NC}"
    echo "  curl -fsSL https://ollama.com/install.sh | sh"
    echo "  OR download to bin/ollama/"
fi

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Copy .env.example to .env and fill in your values"
echo "  2. Run: npm run dev        (frontend only)"
echo "  3. Run: npm run dev:all    (frontend + agent server)"
echo "  4. Run: ollama serve       (for local AI)"
echo ""
