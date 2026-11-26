// SPDX-License-Identifier: Apache-2.0
// linken_status against a fake LinkedIn: who the token is, whether it works, and the ledger tail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LinkError } from '../src/core.ts';
import { helperTransport, keychainStoredAt, linkStatus, tokenExpiry, WARN_DAYS } from '../src/linkedin.ts';
import { API_VERSION } from '../src/session.ts';
import { AUTHOR, fakeLinkedIn, liveConfig, reply, tempDir } from './fake-linkedin.ts';

test('a working token: name, author URN, version, dry-run off and an empty ledger', async () => {
  const linkedin = fakeLinkedIn();
  const status = await linkStatus(liveConfig(), linkedin.transport);
  assert.deepEqual(status, {
    name: 'Test Member',
    author: AUTHOR,
    token_works: true,
    api_version: API_VERSION,
    dry_run: false,
    ledger: [],
    voice: null,
  });
  assert.deepEqual(linkedin.calls, [
    {
      method: 'GET',
      url: 'https://api.linkedin.com/v2/userinfo',
      headers: { 'Linkedin-Version': API_VERSION, 'X-Restli-Protocol-Version': '2.0.0' },
    },
  ]);
});

test('the ledger tail is the last 5 lines, oldest first', async () => {
  const config = liveConfig();
  mkdirSync(config.home, { recursive: true });
  const lines = [1, 2, 3, 4, 5, 6, 7].map((n) => JSON.stringify({ urn: `urn:li:share:${n}` }));
  writeFileSync(join(config.home, 'ledger.jsonl'), `${lines.join('\n')}\n`);
  const status = await linkStatus(config, fakeLinkedIn().transport);
  assert.deepEqual(
    status.ledger,
    [3, 4, 5, 6, 7].map((n) => ({ urn: `urn:li:share:${n}` })),
  );
});

test('a voice guide in the Linken folder comes back as its text, live and dry', async () => {
  const config = liveConfig();
  mkdirSync(config.home, { recursive: true });
  const guide = '# Voice\n\nShort sentences. Puns are fine. Never say "synergy".\n';
  writeFileSync(join(config.home, 'voice.md'), guide);
  assert.equal((await linkStatus(config, fakeLinkedIn().transport)).voice, guide);
  assert.equal((await linkStatus({ ...config, dryRun: true }, fakeLinkedIn().transport)).voice, guide);
});

test('a voice path that is not a readable file is an error, not a silent null', async () => {
  const config = liveConfig();
  mkdirSync(join(config.home, 'voice.md'), { recursive: true });
  await assert.rejects(linkStatus(config, fakeLinkedIn().transport), { code: 'EISDIR' });
});

test('401: the token does not work, and the problem names the fix', async () => {
  const linkedin = fakeLinkedIn({ 'GET /v2/userinfo': () => reply(401, { message: 'Invalid access token' }) });
  const status = await linkStatus(liveConfig(), linkedin.transport);
  assert.equal(status.token_works, false);
  assert.equal(
    status.problem,
    "Token expired or invalid. Generate a new one in LinkedIn's Token Generator and store it (about 1 minute).",
  );
  assert.equal(status.author, null);
  assert.equal(status.api_version, API_VERSION);
});

test('the helper had no usable token (exit 4): the token does not work, and the problem names the fix', async () => {
  const helper = JSON.stringify([process.execPath, '-e', 'process.exit(4)']);
  const status = await linkStatus(liveConfig(), helperTransport(helper));
  assert.equal(status.token_works, false);
  assert.equal(
    status.problem,
    "The LinkedIn helper had no usable token. Generate one in LinkedIn's Token Generator and store it (about 1 minute), and check that LINKEN_HELPER_CMD starts the helper through the key tool.",
  );
});

test('any other failure is an error, not a verdict on the token', async () => {
  const outage = fakeLinkedIn({ 'GET /v2/userinfo': () => reply(503, { message: 'Service unavailable' }) });
  await assert.rejects(linkStatus(liveConfig(), outage.transport), (error: unknown) => {
    assert.ok(error instanceof LinkError);
    assert.equal(error.message, 'LinkedIn returned 503 for GET api.linkedin.com/v2/userinfo. LinkedIn said: Service unavailable');
    return true;
  });
  await assert.rejects(linkStatus(liveConfig(), helperTransport(undefined)), /^Error: LINKEN_HELPER_CMD is not set\./);
});

test('a dry run calls no transport and returns the one request', async () => {
  const linkedin = fakeLinkedIn();
  const status = await linkStatus({ ...liveConfig(), dryRun: true }, linkedin.transport);
  assert.equal(linkedin.calls.length, 0);
  assert.deepEqual(status, {
    name: null,
    author: null,
    token_works: null,
    api_version: API_VERSION,
    dry_run: true,
    ledger: [],
    voice: null,
    requests: [
      {
        method: 'GET',
        url: 'https://api.linkedin.com/v2/userinfo',
        headers: { 'Linkedin-Version': API_VERSION, 'X-Restli-Protocol-Version': '2.0.0' },
      },
    ],
  });
});

const DAY = 86_400_000;
const daysAgo = (days: number) => async () => new Date(Date.now() - days * DAY);

test('a token stored 10 days ago: it expires in 49 or 50 days, and there is no warning', async () => {
  const status = await linkStatus(liveConfig(), fakeLinkedIn().transport, daysAgo(10));
  assert.ok([49, 50].includes(status.token_days_left as number), String(status.token_days_left));
  assert.match(status.token_expires as string, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(status.warning, undefined);
});

test(`a token stored 55 days ago: a warning ${WARN_DAYS} days ahead names the fix`, async () => {
  const status = await linkStatus(liveConfig(), fakeLinkedIn().transport, daysAgo(55.5));
  assert.equal(status.token_days_left, 4);
  assert.equal(
    status.warning,
    `The LinkedIn token expires in about 4 days (${status.token_expires}). Generate a new one in LinkedIn's Token Generator and store it with linken-token (about 1 minute).`,
  );
});

test('the warning starts at 7 days left, and a date past 60 days reads 0, not less', () => {
  const stored = new Date('2026-01-01T00:00:00Z');
  const at = (day: number) => tokenExpiry(stored, stored.getTime() + day * DAY);
  assert.deepEqual(at(52), { token_expires: '2026-03-02', token_days_left: 8 });
  assert.equal(at(53).token_days_left, 7);
  assert.match(at(53).warning as string, /^The LinkedIn token expires in about 7 days \(2026-03-02\)\./);
  assert.match(at(59.5).warning as string, /in about 0 days/);
  assert.equal(at(90).token_days_left, 0);
});

test('no expiry fields when the date is unknown, the token fails, or in a dry run', async () => {
  const unknown = await linkStatus(liveConfig(), fakeLinkedIn().transport, async () => null);
  assert.equal('token_expires' in unknown, false);
  const rejected = fakeLinkedIn({ 'GET /v2/userinfo': () => reply(401, { message: 'Invalid access token' }) });
  assert.equal('token_expires' in (await linkStatus(liveConfig(), rejected.transport, daysAgo(59))), false);
  const dry = await linkStatus({ ...liveConfig(), dryRun: true }, fakeLinkedIn().transport, daysAgo(59));
  assert.equal('token_expires' in dry, false);
});

test('the Keychain date comes from the item attributes; security is never asked for the secret', async () => {
  const dir = tempDir();
  const fake = join(dir, 'security');
  writeFileSync(
    fake,
    `#!/bin/sh\necho "$@" > "${join(dir, 'args')}"\necho 'keychain: "/fake.keychain-db"'\necho '    "mdat"<timedate>=0x32303236  "20260101093000Z\\000"'\n`,
    { mode: 0o755 },
  );
  assert.deepEqual(await keychainStoredAt({ PATH: process.env.PATH }, fake)(), new Date('2026-01-01T09:30:00Z'));
  assert.equal(readFileSync(join(dir, 'args'), 'utf8').trim(), 'find-generic-password -s linken-linkedin');
  assert.equal(await keychainStoredAt({}, join(dir, 'missing'))(), null);
});
