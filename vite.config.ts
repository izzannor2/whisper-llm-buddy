import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Portable directories that must NEVER be scanned, served, or watched by Vite.
// These contain native binaries, GGUF models, llama.cpp tooling and runtime logs.
const PORTABLE_IGNORES = [
  "**/bin/**",
  "**/models/**",
  "**/.ollama/**",
  "**/logs/**",
  "**/config/**",
  "**/dist/**",
];

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    fs: {
      // Hard deny — blocks Vite from serving anything inside these folders.
      deny: ["bin", "models", ".ollama", "logs", "config", "**/llama.cpp/**"],
    },
    watch: {
      ignored: PORTABLE_IGNORES,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  optimizeDeps: {
    // node-fetch lives inside bin/llama tooling — never let the dep scanner pull it.
    exclude: ["node-fetch", "fsevents"],
    entries: [
      "index.html",
      "src/**/*.{ts,tsx,js,jsx}",
      "!**/bin/**",
      "!**/models/**",
      "!**/.ollama/**",
      "!**/logs/**",
    ],
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-router-dom",
      "react-resizable-panels",
      "react-markdown",
      "react-syntax-highlighter",
      "react-hook-form",
      "@monaco-editor/react",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-dialog",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-slider",
      "@radix-ui/react-context-menu",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-tabs",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-accordion",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-switch",
      "@radix-ui/react-toast",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-avatar",
      "@radix-ui/react-label",
      "@radix-ui/react-separator",
      "@radix-ui/react-progress",
      "@radix-ui/react-slot",
    ],
    force: true,
  },
  build: {
    rollupOptions: {
      external: [/^node-fetch$/, /[\\/]bin[\\/]/, /[\\/]llama\.cpp[\\/]/],
    },
  },
}));
