

# Fix: SWC Native Binding Error on Node.js 24

## Problem
You're running **Node.js v24.14.1**, but the `@swc/core` package (used by `@vitejs/plugin-react-swc`) doesn't have prebuilt native binaries for Node 24 yet. This causes the "Failed to load native binding" crash on startup.

## Two Options

### Option A: Downgrade Node.js to v20 LTS (Recommended)
Install Node.js 20 LTS instead. This is the version the project was built for (per project standards). Everything will work immediately.
- Download from: https://nodejs.org/en/download/ (pick "20.x LTS")
- Or via winget: `winget install OpenJS.NodeJS.LTS --version 20.18.0`
- Then delete `node_modules` and run `npm install` again

### Option B: Switch from SWC to Babel (code change)
If you want to keep Node 24, we swap the Vite React plugin from SWC to standard Babel:

**File: `package.json`**
- Remove `@vitejs/plugin-react-swc` from devDependencies
- Add `@vitejs/plugin-react` instead

**File: `vite.config.ts`**
- Change import from `@vitejs/plugin-react-swc` to `@vitejs/plugin-react`

This is a 2-line change. Build times will be slightly slower but everything works on Node 24.

## Recommendation
**Option A** is best — Node 20 LTS is the project standard and avoids any compatibility surprises with other packages too. Option B is the fallback if you specifically need Node 24.

