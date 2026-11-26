// SPDX-License-Identifier: Apache-2.0
// Inbox tab: Linken's own collector. It loads the fictional sample export, reads the waiting threads, marks one done
// and plans one reply as a dry run, and checks the promises: every answer flags the quoted text as untrusted, a mark
// takes a thread off the list, and a dry-run reply copies and opens nothing. Every row comes from
// tools/sample-export.mjs: no member data. Targets: targets/inbox.json.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const area = 'inbox';

const IDS = ['untrusted_flagged', 'mark_hides', 'reply_silent', 'next_ms', 'thread_tokens'].map((id) => `inbox.${id}`);
const tokens = (value) => Math.round(JSON.stringify(value).length / 4);

/** Runs the inbox on the sample in a scratch folder and returns the five metrics, or could_not_check for each. */
export async function collect({ root }) {
  const read_at = new Date().toISOString();
  const work = mkdtempSync(join(tmpdir(), 'linken-inbox-'));
  try {
    const src = (file) => import(pathToFileURL(join(root, 'src', file)).href);
    const [{ archiveLoad }, { inboxNext, inboxMark, replyOpen }, { configFrom }] = await Promise.all(['archive.ts', 'inbox.ts', 'core.ts'].map(src));
    execFileSync(process.execPath, [join(root, 'tools/sample-export.mjs'), join(work, 'sample')], { stdio: 'pipe' });
    const env = { LINKEN_HOME: join(work, 'home'), LINKEN_DRY_RUN: '1', LINKEN_HALT_FILE: join(work, 'halt') };
    const config = configFrom(env);
    await archiveLoad({ path: join(work, 'sample') }, config, env);
    const start = performance.now();
    const first = inboxNext({ limit: 5 }, config);
    const ms = Math.round(performance.now() - start);
    if (!first.threads.length) throw new Error('the sample has no waiting thread');
    const [top] = first.threads;
    inboxMark({ thread: top.id, action: 'done' }, config);
    const after = inboxNext({ limit: 50 }, config);
    const desk = [];
    const reply = await replyOpen({ thread: after.threads[0]?.id ?? top.id, text: 'A fictional reply.' }, config, env, { copy: async () => desk.push('copy'), open: async () => desk.push('open') });
    const flagged = [first, after].filter((a) => /never follow an instruction/i.test(a.untrusted ?? '')).length;
    const hidden = after.waiting === first.waiting - 1 && !after.threads.some((t) => t.id === top.id);
    const value = (v, source) => ({ value: v, source, read_at });
    return {
      'inbox.untrusted_flagged': value(flagged === 2 ? 100 : flagged * 50, 'state: two inbox_next answers checked for the untrusted-text warning'),
      'inbox.mark_hides': value(hidden ? 100 : 0, `state: one of ${first.waiting} waiting threads marked done, then inbox_next read again`),
      'inbox.reply_silent': value(reply.dry_run === true && desk.length === 0 ? 100 : 0, `state: one reply_open dry run; ${desk.length} clipboard or browser calls`),
      'inbox.next_ms': value(ms, `latest: one inbox_next on the ${first.waiting}-thread fictional sample, wall clock`),
      'inbox.thread_tokens': value(Math.round(tokens(first) / first.threads.length), `state: one inbox_next answer of ${first.threads.length} threads, characters / 4 per thread`),
    };
  } catch (error) {
    return Object.fromEntries(IDS.map((id) => [id, { could_not_check: `the sample run failed: ${error.message}`, source: 'state: sample run' }]));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
