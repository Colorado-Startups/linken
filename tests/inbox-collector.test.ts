// SPDX-License-Identifier: Apache-2.0
// The Inbox tab's collector, on the fictional sample: quoted text is flagged, a mark hides a thread, a dry run touches nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect } from '../quality/collectors/inbox/inbox.mjs';

test('quoted text is flagged, a done thread leaves the list, and a dry-run reply touches nothing', async () => {
  const m = await collect({ root: process.cwd() });
  for (const id of ['inbox.untrusted_flagged', 'inbox.mark_hides', 'inbox.reply_silent']) assert.equal(m[id].value, 100, id);
  assert.ok(m['inbox.thread_tokens'].value <= 100, 'answers stay small');
  assert.ok(Number.isFinite(m['inbox.load_ms'].value), 'the load is timed');
});
