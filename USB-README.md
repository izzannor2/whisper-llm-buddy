# Portable USB use

1. On a connected Windows PC, run `scripts\prepare-usb.bat`. It downloads portable Node 20 and Ollama, installs dependencies, and builds `dist/`. It does not download models.
2. Start `RUN-ALL.bat`, then manually run `scripts\advanced\PULL-DEFAULT-MODEL.bat` if you want its suggested model. Alternatively add your own GGUF in `models/gguf/` with llama-server in `bin/llama/`.
3. Confirm the model is detected and answers a chat request before disconnecting.
4. Copy the entire folder, including `.ollama/`, `models/gguf/`, `bin/`, `node_modules/`, and `dist/`.
5. On the destination PC, run `start-offline.bat`. It uses the same launcher in offline mode and never installs dependencies. Missing portable files are reported.

Run `STOP-PORTABLE-AI.bat` to stop this project's service listeners. External services are left untouched. Use `REPAIR-APP.bat` for safe caches/dependency repair on a connected PC.

See [README](README.md) for the canonical setup, logs, ports and testing instructions. No alternative setup implementation is maintained here. Native runtimes and GPU support must match the destination PC; fully offline AI requires an installed local model. Some browser features such as instant App Builder preview may require externally loaded libraries; the prebuilt app alone does not guarantee those features work disconnected.
