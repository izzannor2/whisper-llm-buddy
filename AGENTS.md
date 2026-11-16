# Reliability conventions

- Windows setup/start/stop/repair entry points are compatibility wrappers over scripts/runtime.ps1; service identities, health checks and dependency installs belong there to prevent duplicate drifting implementations.
- The instant App Builder preview pins its Babel standalone major version compatible with classic React UMD scripts to prevent automatic JSX-runtime module imports.
- Normal local assistant requests resolve role routing immediately before dispatch; explicit external providers remain opt-in and are never automatic backups.
- Regression tests run against source behavior without building; `scripts/reliability.test.mjs` uses TypeScript transpilation only for test loading.
- External coding-assistant Settings provide browser-local preferences and manual repository handoffs, not automatic execution or connection claims, to avoid untrusted code execution and credential storage.