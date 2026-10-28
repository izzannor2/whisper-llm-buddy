# Reliability conventions

- Windows launchers use project-root paths, HTTP-failing health probes, and preserve exit codes before leaving local variable scope so startup cannot silently report success.
- The instant App Builder preview pins its Babel standalone major version compatible with classic React UMD scripts to prevent automatic JSX-runtime module imports.
- Normal local assistant requests resolve role routing immediately before dispatch; explicit external providers remain opt-in and are never automatic backups.
- Regression tests run against source behavior without building; `scripts/reliability.test.mjs` uses TypeScript transpilation only for test loading.