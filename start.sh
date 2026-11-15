#!/usr/bin/env bash
# Canonical Linux/macOS startup. No automatic installs of runtimes/models.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
export OLLAMA_MODELS="$ROOT/.ollama"
export OLLAMA_HOST="127.0.0.1:11434"
if [ -x "$ROOT/bin/node/bin/node" ]; then export PATH="$ROOT/bin/node/bin:$PATH"; fi
bash "$ROOT/scripts/setup.sh"
probe() { curl -fsS --max-time 2 "$1" >/dev/null 2>&1; }
wait_ready() {
  local name="$1" url="$2" pid="$3" limit="$4"
  for ((i=0;i<limit;i++)); do
    if probe "$url"; then echo "[OK] $name ready: $url"; return 0; fi
    if ! kill -0 "$pid" 2>/dev/null; then break; fi
    sleep 1
  done
  echo "[ERROR] $name failed. See logs/$name.log"
  tail -30 "$ROOT/logs/$name.log" || true
  return 1
}
if ! probe http://127.0.0.1:11434/api/tags; then
  ollama_bin=""
  if [ -x "$ROOT/bin/ollama/ollama" ]; then ollama_bin="$ROOT/bin/ollama/ollama";
  elif command -v ollama >/dev/null; then ollama_bin="$(command -v ollama)"; fi
  if [ -n "$ollama_bin" ]; then
    "$ollama_bin" serve >> "$ROOT/logs/ollama.log" 2>&1 &
    wait_ready ollama http://127.0.0.1:11434/api/tags "$!" 45
  else echo "[WARN] Ollama not installed. Add a local model manually."; fi
fi
llama_bin=""
if [ -x "$ROOT/bin/llama/llama-server" ]; then llama_bin="$ROOT/bin/llama/llama-server";
elif command -v llama-server >/dev/null; then llama_bin="$(command -v llama-server)"; fi
model=""
while IFS= read -r -d '' file; do model="$file"; break; done < <(find "$ROOT/models/gguf" -type f -name '*.gguf' -print0)
if [ -n "$llama_bin" ] && [ -n "$model" ] && ! probe http://127.0.0.1:8081/health; then
  "$llama_bin" -m "$model" --host 127.0.0.1 --port 8081 >> "$ROOT/logs/llama.log" 2>&1 &
  wait_ready llama http://127.0.0.1:8081/health "$!" 120
fi
if ! probe http://127.0.0.1:3847/status; then
  PORT=3847 node "$ROOT/server/index.cjs" >> "$ROOT/logs/agent.log" 2>&1 &
  wait_ready agent http://127.0.0.1:3847/status "$!" 45
fi
if ! probe http://127.0.0.1:8080; then
  if [ "${HUB_OFFLINE:-0}" = "1" ]; then
    test -f dist/index.html || { echo "Missing dist/index.html; build before offline use."; exit 1; }
    PORT=8080 node "$ROOT/server/static.cjs" >> "$ROOT/logs/web.log" 2>&1 &
  else
    node "$ROOT/node_modules/vite/bin/vite.js" --host 127.0.0.1 --port 8080 --strictPort >> "$ROOT/logs/web.log" 2>&1 &
  fi
  wait_ready web http://127.0.0.1:8080 "$!" 45
fi
probe http://127.0.0.1:3847/dev-server/status || { echo "Agent preview endpoint unavailable."; exit 1; }
echo "[OK] App: http://localhost:8080 | agent: http://127.0.0.1:3847/status"
if [ "${HUB_NO_BROWSER:-0}" != "1" ]; then
  if command -v xdg-open >/dev/null; then xdg-open http://localhost:8080 >/dev/null 2>&1 || true;
  elif command -v open >/dev/null; then open http://localhost:8080 || true; fi
fi
