# LocalDev AI — Agent Server

Express server on port 3847 providing shell execution, file operations, process management, and WebSocket terminal streaming.

## Quick Start

```bash
npm run server        # Start agent server only
npm run dev:all       # Start agent server + Vite frontend
npm run start:prod    # Production mode
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Server version, platform, capabilities, session token |
| POST | `/exec` | Execute shell commands (allowlisted) |
| POST | `/file` | File operations (read/write/delete/mkdir/list) |
| GET | `/processes` | List tracked child processes |
| POST | `/process/kill` | Kill a tracked process by PID |
| WS | `/ws` | Live terminal output stream |

## Security

- **Command allowlist**: Only `node`, `npm`, `npx`, `bun`, `git`, `ls`, `dir`, `cat`, `echo`, `pwd`, `python`, `python3`, `pip`, `ollama`
- **Blocked patterns**: `rm -rf`, `shutdown`, `format`, `del /f`, `mkfs`, fork bombs
- **CORS**: Localhost origins only
- **Session token**: Generated on startup, required via `X-Agent-Session` header for `/exec` and `/file`
- **Rate limiting**: `/exec` = 30/min, chat proxy = 60/min
- **File safety**: All paths restricted to project root, `..` traversal blocked
- **Timeout**: 30s per command, 100KB output cap

## Crash Behavior

When using `npm run dev:all`, the agent server and Vite run via `concurrently` with `--kill-others-on-fail=false`. If the agent server crashes, the frontend continues running. Restart the server manually or re-run `npm run dev:all`.

## Logs

All activity is logged to `logs/server.log` with automatic rotation at 10MB.
