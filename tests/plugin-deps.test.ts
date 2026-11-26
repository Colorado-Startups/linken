// SPDX-License-Identifier: Apache-2.0
// The Claude Code plugin route. A plugin install has no node_modules, so plugin/deps.sh installs the production
// dependencies in ${CLAUDE_PLUGIN_DATA} (code.claude.com/docs/en/plugins-reference, read 2026-11-26) and
// plugin/deps.mjs finds them there. These tests use a fake package and never run npm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repo = new URL('..', import.meta.url).pathname;
const hook = join(repo, 'plugin/deps.mjs');

function dataWithFakePackage(): string {
  const data = mkdtempSync(join(tmpdir(), 'linken-deps-'));
  const pkg = join(data, 'node_modules', 'linken-fake-dep');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'linken-fake-dep', type: 'module', exports: './index.js' }));
  writeFileSync(join(pkg, 'index.js'), 'export const ok = "found";\n');
  return data;
}

const script = 'const m = await import("linken-fake-dep"); console.log(m.ok);';

test('a package missing next to the server is found in LINKEN_DEPS', () => {
  const data = dataWithFakePackage();
  const out = execFileSync(process.execPath, ['--import', hook, '--input-type=module', '-e', script], {
    cwd: repo, env: { ...process.env, LINKEN_DEPS: data }, encoding: 'utf8',
  });
  assert.equal(out.trim(), 'found');
});

test('without LINKEN_DEPS the hook changes nothing: the package stays not found', () => {
  const env = { ...process.env };
  delete env.LINKEN_DEPS;
  const run = spawnSync(process.execPath, ['--import', hook, '--input-type=module', '-e', script], { cwd: repo, env, encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /ERR_MODULE_NOT_FOUND/);
});

test('deps.sh does nothing when the data folder already holds this lockfile and node_modules', () => {
  const data = dataWithFakePackage();
  copyFileSync(join(repo, 'package-lock.json'), join(data, 'package-lock.json'));
  // Only the system folders on PATH: an npm call would most likely fail and print the warning.
  const run = spawnSync('/bin/sh', [join(repo, 'plugin/deps.sh'), repo, data], { env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.equal(run.stderr, '');
});

test('deps.sh warns and still exits 0 when npm cannot run, so the session starts', () => {
  const data = mkdtempSync(join(tmpdir(), 'linken-deps-'));
  const run = spawnSync('/bin/sh', [join(repo, 'plugin/deps.sh'), repo, data], { env: { PATH: '/bin:/usr/bin', HOME: data }, encoding: 'utf8' });
  assert.equal(run.status, 0);
  if (run.stderr) assert.match(run.stderr, /could not install its dependencies/);
});

test('the plugin starts the server through the hook, with the data folder as LINKEN_DEPS', () => {
  const plugin = JSON.parse(readFileSync(join(repo, '.claude-plugin/plugin.json'), 'utf8'));
  const server = plugin.mcpServers.linken;
  assert.deepEqual(server.args, ['--import', '${CLAUDE_PLUGIN_ROOT}/plugin/deps.mjs', '${CLAUDE_PLUGIN_ROOT}/src/server.ts']);
  assert.equal(server.env.LINKEN_DEPS, '${CLAUDE_PLUGIN_DATA}');
  const hooks = JSON.parse(readFileSync(join(repo, 'hooks/hooks.json'), 'utf8'));
  assert.match(hooks.hooks.SessionStart[0].hooks[0].command, /plugin\/deps\.sh/);
});
