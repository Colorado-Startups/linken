// SPDX-License-Identifier: Apache-2.0
// The Post tab's collector, on fictional text and media: a dry run sends nothing, and no request carries a token.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collect } from '../quality/collectors/post/post.mjs';

test('dry runs send nothing, requests carry no token, and the answer stays small', async () => {
  const m = await collect({ root: process.cwd() });
  for (const id of ['post.dry_run_silent', 'post.no_token_in_requests', 'post.halt_stops']) assert.equal(m[id].value, 100, id);
  assert.ok(m['post.plan_tokens'].value <= 200, 'answer stays small');
});
