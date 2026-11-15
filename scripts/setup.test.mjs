import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('all Windows launch aliases delegate to the single implementation', () => {
  for (const name of ['RUN-ALL.bat','start.bat','START-PORTABLE-AI.bat','start-offline.bat','START-OLLAMA-PORTABLE.bat','START-GGUF-SERVER.bat','REPAIR-APP.bat','STOP-PORTABLE-AI.bat','stop-offline.bat','scripts/setup.bat','scripts/prepare-usb.bat','scripts/verify-links.bat']) {
    const source = read(name);
    assert.match(source, /call "%~dp0.*dispatch\.bat"/i, name);
    assert.doesNotMatch(source, /taskkill|npm (install|ci)|ollama.*serve|Start-Process/i, name);
  }
});

test('only the explicit pull action downloads a model', () => {
  const runtime = read('scripts/runtime.ps1');
  const prepare = runtime.split("elseif ($Action -eq 'prepare') {")[1].split("elseif ($Action -eq 'pull') {")[0];
  assert.doesNotMatch(prepare, /\bpull\s+['"]|AUTO_PULL/);
  assert.match(runtime, /& \$bin pull 'qwen2\.5:3b'/);
  assert.doesNotMatch(read('start.sh'), /ollama.*\bpull\b|llama3\.2|using Cloud/);
  assert.doesNotMatch(read('scripts/setup.sh'), /spawnSync\('ollama'|llama3\.2/);
});

test('offline launcher selects offline mode and cannot silently use online startup', () => {
  assert.match(read('start-offline.bat'), /dispatch\.bat" start -Offline/);
  assert.match(read('scripts/runtime.ps1'), /Offline dependencies missing/);
});

test('setup wrappers and documentation reference existing entry points', () => {
  for (const path of ['scripts/runtime.ps1','scripts/dispatch.bat','server/index.cjs','server/static.cjs','scripts/setup.sh','start.sh']) {
    assert.ok(fs.existsSync(new URL(`../${path}`, import.meta.url)), path);
  }
  assert.doesNotMatch(read('README.md'), /npm run dev:all|models\/ollama|llama3\.2/);
});