// SPDX-License-Identifier: Apache-2.0
// An export that carries no company or position: missing data is not an empty profile, titles an earlier load saved
// are kept, and archive_load says so. Every person here is fictional.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveConfig, tempDir } from './fake-linkedin.ts';
import { call } from './rpc.ts';
import { connectionsFile, readConnections, writeJson } from '../src/store.ts';

const URL_OF = (slug: string) => `https://www.linkedin.com/in/example-${slug}`;
const WITH_JOB = 'First Name,Last Name,URL,Email Address,Company,Position,Connected On';
const NO_JOB = 'First Name,Last Name,URL,Connected On';
const DAY = '1 Jan 2020';
/** A row for WITH_JOB. */
const full = (first: string, company = '', position = '') => `${first},Example,${URL_OF(first.toLowerCase())},,${company},${position},${DAY}`;
/** A row for NO_JOB. */
const bare = (first: string) => `${first},Example,${URL_OF(first.toLowerCase())},${DAY}`;

function setup() {
  const config = liveConfig();
  const overlay = join(tempDir(), 'overlay.json');
  writeFileSync(overlay, JSON.stringify({ mission: ['founder'] }));
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, LINKEN_GAP: '0-0', LINKEN_RATER: overlay, LINKEN_HALT_FILE: join(tempDir(), 'halt.txt') };
  const tool = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await call(config, undefined, name, args, env);
    return { isError: r.isError, text: r.content[0].text, json: r.isError ? undefined : JSON.parse(r.content[0].text) };
  };
  /** Loads a made-up export with this header and these rows, and returns archive_load's result. */
  const load = async (head: string, rows: string[]) => {
    const dir = join(tempDir(), 'export');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'Connections.csv'), [head, ...rows, ''].join('\n'));
    return (await tool('archive_load', { path: dir })).json;
  };
  return { config, tool, load };
}

test('an export with no job columns rates nobody empty, queues nobody, and says why', async () => {
  const { tool, load } = setup();
  const out = await load(NO_JOB, [bare('Ann'), bare('Bob')]);
  assert.deepEqual(out.by_reason, { low: 2 });
  assert.match(out.note, /no company or no position/);
  assert.equal((await tool('connections_summary')).json.queue, 0);
});

test('an export that carries job data still rates a blank row empty, with no note', async () => {
  const { load } = setup();
  const out = await load(WITH_JOB, [full('Cy'), full('Dee', 'Acme', 'Founder')]);
  assert.deepEqual(out.by_reason, { empty: 1, mission: 1 });
  assert.equal(out.note, undefined);
});

test('a later export with no job data keeps what the earlier load saved, and a full one clears the flag', async () => {
  const { load } = setup();
  await load(WITH_JOB, [full('Dee', 'Acme', 'Founder'), full('Eli')]);
  const kept = { mission: 1, empty: 1, low: 1 };
  assert.deepEqual((await load(NO_JOB, [bare('Dee'), bare('Eli'), bare('Fay')])).by_reason, kept, 'no job columns');
  assert.deepEqual((await load(NO_JOB, [bare('Dee'), bare('Eli'), bare('Fay')])).by_reason, kept, 'again: titles and the flag carry on');
  const blank = await load(WITH_JOB, [full('Dee'), full('Eli'), full('Fay')]);
  assert.deepEqual(blank.by_reason, kept, 'headers over blank cells carry nothing');
  assert.match(blank.note, /earlier load/);
  assert.deepEqual((await load(WITH_JOB, [full('Dee', 'Acme', 'Founder'), full('Eli'), full('Fay')])).by_reason, { mission: 1, empty: 2 }, 'a full export decides again');
});

test('an export with one of the two columns keeps the other from the earlier load', async () => {
  const { load } = setup();
  await load(WITH_JOB, [full('Dee', '', 'Founder'), full('Gus', 'Acme', 'Analyst')]);
  const rows = [`Dee,Example,${URL_OF('dee')},,${DAY}`, `Gus,Example,${URL_OF('gus')},Acme,${DAY}`, `Hal,Example,${URL_OF('hal')},,${DAY}`];
  const out = await load('First Name,Last Name,URL,Company,Connected On', rows);
  assert.deepEqual(out.by_reason, { mission: 1, low: 2 });
  assert.match(out.note, /no company or no position/);
});

test('a store an older Linken filled from an export with no job data is not trusted as blank', async () => {
  const { config, load } = setup();
  await load(NO_JOB, [bare('Ann'), bare('Bob')]);
  // Older versions saved such rows with blank fields and no jobUnknown flag.
  writeJson(connectionsFile(config), readConnections(config).map(({ jobUnknown: _dropped, ...c }) => c));
  assert.deepEqual((await load(NO_JOB, [bare('Ann'), bare('Bob')])).by_reason, { low: 2 });
});
