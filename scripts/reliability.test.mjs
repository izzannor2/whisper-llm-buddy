import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function loadSource(file, dependencies = {}) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => {
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}

test('assistant routing resolves provider IDs to real model names', () => {
  const model = { id: 'ollama:installed-coder', name: 'installed-coder', provider: 'ollama' };
  const snap = { ollama: [model], gguf: [] };
  globalThis.localStorage = { getItem: key => key === 'model-routing-v1'
    ? JSON.stringify({ assistant: { provider: 'auto', model: model.id } }) : null };
  const routing = loadSource('src/lib/model-routing.ts', { './model-registry': { getCachedRegistry: () => snap } });
  const resolved = routing.resolveModelSync('assistant', snap);
  assert.equal(resolved.provider, 'ollama');
  assert.equal(resolved.model, 'installed-coder');
  assert.equal(resolved.fallbackReason, 'ok');
});

test('disabling first-available fallback leaves an unconfigured assistant empty', () => {
  const snap = { ollama: [{ name: 'installed-coder', provider: 'ollama' }], gguf: [] };
  globalThis.localStorage = { getItem: key => key === 'model-routing-toggles-v1'
    ? JSON.stringify({ useFirstAvailableFallback: false }) : null };
  const routing = loadSource('src/lib/model-routing.ts', { './model-registry': { getCachedRegistry: () => snap } });
  assert.equal(routing.resolveModelSync('assistant', snap).detected, null);
  assert.equal(routing.resolveModelSync('assistant', snap).model, '');
});

test('an empty registry does not invent a model or cloud fallback', () => {
  globalThis.localStorage = { getItem: () => null };
  const snap = { ollama: [], gguf: [], cloud: [{ name: 'external' }] };
  const routing = loadSource('src/lib/model-routing.ts', { './model-registry': { getCachedRegistry: () => snap } });
  assert.equal(routing.resolveModelSync('assistant', snap).detected, null);
  assert.equal(routing.resolveModelSync('assistant', snap).model, '');
});

test('preview builder excludes entry-point imports and preserves editable App geometry', () => {
  const { buildPreviewHTML } = loadSource('src/lib/preview-builder.ts');
  const file = (path, content) => ({ path, content, isDirectory: false });
  const html = buildPreviewHTML([
    file('/src/main.tsx', 'import App from "./App"; ENTRY_POINT_SHOULD_NOT_RUN;'),
    file('/src/App.tsx', 'import React from "react";\nfunction App() { return <div>Rendered application</div>; }\nexport default App;'),
  ]);
  assert.equal(html.includes('ENTRY_POINT_SHOULD_NOT_RUN'), false);
  assert.equal(html.includes('import React from'), false);
  assert.equal(html.includes('Rendered application'), true);
});