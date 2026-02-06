# LocalDev AI - Models Directory

Place your model files here and they will be automatically detected and used.

## Folder Structure

```
models/
├── ollama/          # Ollama modelfiles (optional)
├── gguf/            # GGUF model files for llama.cpp
│   └── *.gguf       # Put your .gguf files here
└── README.md
```

## Quick Start

1. **For GGUF models (llama.cpp)**:
   - Download any `.gguf` model file
   - Place it in the `models/gguf/` folder
   - Run `start.bat` (Windows) or `./start.sh` (Linux/macOS)
   - The script will auto-detect and launch llama-server with your model

2. **For Ollama models**:
   - Ollama manages its own model storage
   - Just run `ollama pull <model-name>` to download models
   - The scripts will detect Ollama and use available models

## Recommended Models

### Small & Fast (4-8GB RAM)
- `llama-3.2-1b-instruct-q8_0.gguf` (~1.3GB)
- `qwen2.5-1.5b-instruct-q8_0.gguf` (~1.6GB)

### Balanced (8-16GB RAM)
- `llama-3.2-3b-instruct-q8_0.gguf` (~3.4GB)
- `qwen2.5-7b-instruct-q4_k_m.gguf` (~4.4GB)

### High Quality (16GB+ RAM)
- `llama-3.1-8b-instruct-q4_k_m.gguf` (~4.9GB)
- `qwen2.5-14b-instruct-q4_k_m.gguf` (~8.4GB)

## Download Sources

- **Hugging Face**: https://huggingface.co/models?search=gguf
- **TheBloke's Models**: https://huggingface.co/TheBloke

## GPU Acceleration

The scripts will auto-detect and use GPU layers if available:
- NVIDIA: Requires CUDA-enabled llama.cpp build
- AMD: Requires ROCm-enabled build
- Apple Silicon: Metal acceleration is automatic
