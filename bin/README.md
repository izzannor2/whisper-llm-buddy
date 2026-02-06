# LocalDev AI - Local Binaries

Place your local AI runtime binaries here for auto-detection.

## Folder Structure

```
bin/
├── ollama/          # Drop your Ollama installation here
│   └── ollama.exe   # (Windows) or ollama (Linux/macOS)
├── llama/           # Drop your llama.cpp binaries here
│   └── llama-server # or llama-server.exe (Windows)
└── README.md
```

## Setup Instructions

### Ollama
1. Download Ollama from https://ollama.ai
2. Extract or copy the `ollama` executable to `bin/ollama/`
3. The startup scripts will auto-detect and use it

### llama.cpp (for GGUF models)
1. Build or download llama.cpp from https://github.com/ggerganov/llama.cpp
2. Copy `llama-server` (or `llama-server.exe`) to `bin/llama/`
3. Place your `.gguf` model files in the `models/gguf/` folder
4. The startup scripts will auto-launch with your model

## How It Works

The `start.bat` and `start.sh` scripts check these folders FIRST before looking in your system PATH. This means:
- No need to install globally or modify PATH
- Portable setup - copy the whole project and it just works
- Easy version management - swap binaries as needed

## GPU Acceleration

For GPU support, make sure you have the right build:
- **NVIDIA**: Use CUDA-enabled llama.cpp build
- **AMD**: Use ROCm-enabled build  
- **Apple Silicon**: Metal is automatic in macOS builds
