import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync(new URL('../src/lib/assistant-handoff.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function('module', 'exports', output)(module, module.exports);
const { normalizeGithubRepository, buildAssistantHandoff, readAssistantPreferences } = module.exports;

test('repository handoff accepts GitHub repositories and removes the clone suffix', () => {
  assert.equal(normalizeGithubRepository(' https://github.com/owner/project.git '), 'https://github.com/owner/project');
});
test('repository handoff rejects credentials, non-GitHub hosts, and file links', () => {
  for (const url of ['https://github.com.evil.test/a/b', 'https://token@github.com/a/b', 'http://github.com/a/b', 'https://github.com/a/b/blob/main/file', 'https://github.com/a/b?token=secret']) {
    assert.throws(() => normalizeGithubRepository(url));
  }
});
test('handoff includes the chosen assistant, repository, and real task', () => {
  const handoff = buildAssistantHandoff({ assistant: 'claude-code', repository: 'https://github.com/owner/project', task: 'Re-engineer the existing editor', customName: '' });
  assert.ok(handoff.includes('Claude Code'));
  assert.ok(handoff.includes('https://github.com/owner/project'));
  assert.ok(handoff.includes('Re-engineer the existing editor'));
  assert.throws(() => buildAssistantHandoff({ repository: 'https://github.com/a/b', task: '' }));
});
test('assistant preferences tolerate corrupt storage and retain saved selections', () => {
  assert.equal(readAssistantPreferences('{bad').assistant, 'codex');
  assert.equal(readAssistantPreferences('null').repository, '');
  assert.equal(readAssistantPreferences(JSON.stringify({ assistant: 'openclaw', repository: 'https://github.com/a/b' })).assistant, 'openclaw');
});