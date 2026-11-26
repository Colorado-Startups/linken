// SPDX-License-Identifier: Apache-2.0
// install.sh: the checks it makes before it writes anything. The helper runs Node with the token, so the installer
// must refuse a Node the member can write, and it must decide that before it runs that Node as root. Fake id, uname,
// su, sudo and install stand in for the real ones, so nothing here needs root and nothing is installed: the fake
// `install` stops the script at its first write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './fake-linkedin.ts';

const SCRIPT = fileURLToPath(new URL('../install.sh', import.meta.url));
/** The fake `install` exits with this, so a run that passed every check is told apart from a refusal (exit 1). */
const REACHED_INSTALL = 97;
/** Root can write every file, so the installer refuses every Node: the tests that need an accepted Node are skipped. */
const AS_ROOT = process.getuid?.() === 0 ? 'this test needs an account that is not root' : false;

function script(path: string, body: string) {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

/** A temporary folder with the fakes, and a fake Node in a folder the account can write (`open`) or cannot (`shut`). */
function stage(major = 26) {
  const dir = tempDir();
  const bin = join(dir, 'bin');
  const open = join(dir, 'open');
  const shut = join(dir, 'shut');
  for (const folder of [bin, open, shut]) mkdirSync(folder);
  script(join(bin, 'id'), 'echo 0');
  script(join(bin, 'uname'), 'echo Darwin');
  script(join(bin, 'sudo'), '[ "$2" != ghost ] || { echo "sudo: unknown user ghost" >&2; exit 1; }\nshift 2\n"$@"');
  script(join(bin, 'install'), `echo reached > ${dir}/install\nexit ${REACHED_INSTALL}`);
  const node = `echo ran >> ${dir}/node-ran\necho ${major}`;
  script(join(open, 'node'), node);
  script(join(shut, 'node'), node);
  script(join(open, 'locked'), node);
  symlinkSync(join(open, 'node'), join(shut, 'link-to-open'));
  for (const locked of [join(open, 'locked'), join(shut, 'node'), shut]) chmodSync(locked, 0o555);
  const link = join(shut, 'link-to-open');
  return { dir, bin, open: join(open, 'node'), locked: join(open, 'locked'), shut: join(shut, 'node'), link };
}

/** Runs install.sh as the fake root. `onPath` is the Node that `su -l member -c 'command -v node'` finds. */
function run(staged: ReturnType<typeof stage>, onPath: string, named?: string, account = 'member') {
  script(join(staged.bin, 'su'), `echo called >> ${staged.dir}/su\necho ${onPath}`);
  const result = spawnSync('/bin/sh', [SCRIPT, ...(named === undefined ? [] : [named])], {
    env: { PATH: `${staged.bin}:/usr/bin:/bin`, SUDO_USER: account },
    encoding: 'utf8',
  });
  const happened = (name: string) => existsSync(join(staged.dir, name));
  const { status, stderr } = result;
  return { status, stderr, nodeRan: happened('node-ran'), askedPath: happened('su'), wrote: happened('install') };
}

test('a Node the member can write is refused, and it is never run', () => {
  const staged = stage();
  const result = run(staged, staged.open);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Your account can write /);
  assert.match(result.stderr, /sudo \.\/install\.sh \/usr\/local\/bin\/node/);
  assert.equal(result.nodeRan, false, 'the write test comes before the version check');
  assert.equal(result.wrote, false);
});

test('the real path decides: a link to a writable Node is refused by its target', () => {
  const staged = stage();
  const result = run(staged, staged.link);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(`Your account can write ${realpathSync(staged.open)}.`), result.stderr);
  assert.equal(result.nodeRan, false);
});

test('the folder decides too: a Node the member cannot write, in a folder the member can, is refused', () => {
  const staged = stage();
  const result = run(staged, staged.locked);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Your account can write /);
  assert.equal(result.nodeRan || result.wrote, false);
});

test('a write test that cannot run is a refusal, not a pass', () => {
  const staged = stage();
  const result = run(staged, staged.shut, staged.open, 'ghost');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot run the write test as ghost/);
  assert.equal(result.nodeRan || result.wrote, false, 'a failed sudo must not read as "cannot write"');
});

test('a Node the member cannot write passes every check', { skip: AS_ROOT }, () => {
  const staged = stage();
  const result = run(staged, staged.shut);
  assert.equal(result.stderr, '');
  assert.equal(result.status, REACHED_INSTALL);
  assert.deepEqual([result.nodeRan, result.wrote], [true, true]);
});

test('a named Node is used in place of the one on the PATH', { skip: AS_ROOT }, () => {
  const staged = stage();
  const result = run(staged, staged.open, staged.shut);
  assert.equal(result.status, REACHED_INSTALL, result.stderr);
  assert.equal(result.askedPath, false, 'the PATH is not searched');
});

test('a named Node gets the same checks: writable, relative, odd characters, too old', () => {
  const writable = stage();
  assert.match(run(writable, writable.shut, writable.open).stderr, /Your account can write /);

  const relative = run(stage(), '/nowhere/node', './install.sh');
  assert.equal(relative.status, 1);
  assert.match(relative.stderr, /Give the full path to Node/);

  const odd = stage();
  script(join(odd.dir, 'no$de'), 'echo 26');
  assert.match(run(odd, odd.shut, join(odd.dir, 'no$de')).stderr, /Unsupported characters/);

  const missing = run(stage(), '/nowhere/node', '/nowhere/node');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Node 26 or newer not found/);
  for (const result of [relative, missing]) assert.equal(result.nodeRan || result.wrote, false);
});

test('a Node older than 26 is refused', { skip: AS_ROOT }, () => {
  const staged = stage(25);
  const result = run(staged, staged.shut);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Node 25 is older than 26/);
  assert.equal(result.wrote, false);
});
