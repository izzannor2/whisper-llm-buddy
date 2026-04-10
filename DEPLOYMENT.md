# LocalDev AI — Deployment Guide

## Prerequisites

- Node.js ≥ 18
- npm or bun

## Build

```bash
npm install
npm run build
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

## Backend Secrets (Supabase)

Set these as Supabase secrets for edge function access:

```bash
supabase secrets set GOOGLE_API_KEY=your-google-api-key
supabase secrets set SEARCH_API_KEY=your-brave-search-api-key
```

- `GOOGLE_API_KEY` — Required for self-hosted Google Gemini chat. If not set, the Lovable AI Gateway is used as fallback.
- `SEARCH_API_KEY` — Brave Search API key. If not set, DuckDuckGo is used as fallback.

## Edge Function Deployment

```bash
supabase functions deploy chat
supabase functions deploy memory
supabase functions deploy models
supabase functions deploy plugins
supabase functions deploy run-tool
supabase functions deploy web-search
```

## Production Server

```bash
# Start both agent server and frontend
npm run start:prod

# Or start separately
NODE_ENV=production node server/index.js
npx vite preview
```

## Local Agent Server

The agent server runs on port 3847 and provides shell execution, file operations, and WebSocket terminal streaming. See `server/README.md` for details.

## First-Run Checklist

1. Set environment variables
2. Deploy edge functions  
3. Run `npm run build`
4. Start with `npm run start:prod`
5. Complete the first-run setup wizard in the browser
6. (Optional) Install Ollama for local AI inference
