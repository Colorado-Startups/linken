// SPDX-License-Identifier: Apache-2.0
// An export without the Company and Position columns: a missing column is not an empty profile, titles an earlier load
// knew are kept, and archive_load says so. Every person here is fictional.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveConfig, tempDir } from './fake-linkedin.ts';
import { call } from './rpc.ts';

const URL_OF = (slug: string) => `https://www.linkedin.com/in/example-${slug}`;
const WITH_JOB = 'First Name,Last Name,URL,Email Address,Company,Position,Connected On';
const NO_JOB = 'First Name,Last Name,URL,Connected On';

function setup() {
  const config = liveConfig();
  const overlay = join(tempDir(), 'overlay.json');
  writeFileSync(overlay, JSON.stringify({ mission: ['founder'] }));
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, LINKEN_GAP: '0-0', LINKEN_RATER: overlay, LINKEN_HALT_FILE: join(tempDir(), 'halt.txt') };
  const tool = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await call(config, undefined, name, args, env);
    return { isError: r.isError, text: r.content[0].text, json: r.isError ? undefined : JSON.parse(r.content[0].text) };
  };
  const exportOf = (head: string, rows: string[]) => {
    const dir = join(tempDir(), 'export');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'Connections.csv'), [head, ...rows, ''].join('\n'));
    return dir;
  };
  return { tool, exportOf };
}

test('an export with no job columns rates nobody empty and says why', async () => {
  const { tool, exportOf } = setup();
  const dir = exportOf(NO_JOB, [`Ann,Example,${URL_OF('ann')},1 Jan 2020`, `Bob,Example,${URL_OF('bob')},1 Jan 2020`]);
  const out = (await tool('archive_load', { path: dir })).json;
  assert.equal(out.by_reason.empty, undefined);
  assert.deepEqual(out.by_reason, { low: 2 });
  assert.match(out.note, /no Company or Position column/);
  assert.equal((await tool('connections_list', { reason: 'empty' })).json.total, 0);
});

test('an export with the job columns still rates a blank row empty, with no note', async () => {
  const { tool, exportOf } = setup();
  const out = (await tool('archive_load', { path: exportOf(WITH_JOB, [`Cy,Example,${URL_OF('cy')},,,,1 Jan 2020`]) })).json;
  assert.deepEqual(out.by_reason, { empty: 1 });
  assert.equal(out.note, undefined);
});

test('a later export with no job columns keeps what the earlier load knew', async () => {
  const { tool, exportOf } = setup();
  await tool('archive_load', {
    path: exportOf(WITH_JOB, [`Dee,Example,${URL_OF('dee')},,Acme,Founder,1 Jan 2020`, `Eli,Example,${URL_OF('eli')},,,,1 Jan 2020`]),
  });
  const later = exportOf(NO_JOB, [`Dee,Example,${URL_OF('dee')},1 Jan 2020`, `Eli,Example,${URL_OF('eli')},1 Jan 2020`, `Fay,Example,${URL_OF('fay')},1 Jan 2020`]);
  const out = (await tool('archive_load', { path: later })).json;
  assert.deepEqual(out.by_reason, { mission: 1, empty: 1, low: 1 });
  const kept = (await tool('connections_list', { reason: 'mission' })).json;
  assert.equal(kept.total, 1);
  assert.match(JSON.stringify(kept), /Founder/);
  // A third load without the columns changes nothing: the saved titles and the unknown flag both carry on.
  assert.deepEqual((await tool('archive_load', { path: later })).json.by_reason, { mission: 1, empty: 1, low: 1 });
});
