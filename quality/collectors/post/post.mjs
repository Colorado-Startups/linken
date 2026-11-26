// SPDX-License-Identifier: Apache-2.0
// Post tab: Linken's own collector. It plans a text post, an image post, a PDF post and a comment as dry runs
// against a transport that records every call, and checks the promises: a dry run sends nothing and saves nothing,
// and no request the server builds carries a token or leaves LinkedIn. Fictional text and media only. Targets: targets/post.json.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const area = 'post';

const IDS = ['dry_run_silent', 'no_token_in_requests', 'plan_ms', 'plan_tokens'].map((id) => `post.${id}`);
const HOSTS = new Set(['api.linkedin.com', 'www.linkedin.com']);
const pct = (n, of) => (of ? Math.round((n / of) * 1000) / 10 : 0);
const tokens = (value) => Math.round(JSON.stringify(value).length / 4);

/** Plans four writes as dry runs in a scratch folder and returns the four metrics, or could_not_check for each. */
export async function collect({ root }) {
  const read_at = new Date().toISOString();
  const work = mkdtempSync(join(tmpdir(), 'linken-post-'));
  try {
    const src = (file) => import(pathToFileURL(join(root, 'src', file)).href);
    const [{ publishPost }, { commentCreate }, { configFrom }] = await Promise.all(['publish.ts', 'comments.ts', 'core.ts'].map(src));
    const config = configFrom({ LINKEN_HOME: join(work, 'home'), LINKEN_DRY_RUN: '1' });
    const calls = [];
    const transport = async (spec) => (calls.push(spec), { status: 500, headers: {}, body: '' });
    const desk = { copy: async () => calls.push('copy'), open: async () => calls.push('open') };
    for (const name of ['sample.png', 'sample.pdf']) writeFileSync(join(work, name), 'fictional media bytes');
    const text = 'A fictional sample post for the Post tab. Nothing is sent.';
    const start = performance.now();
    const textPost = await publishPost({ text }, config, transport);
    const ms = Math.round(performance.now() - start);
    const runs = [
      textPost,
      await publishPost({ text, media: join(work, 'sample.png') }, config, transport),
      await publishPost({ text, media: join(work, 'sample.pdf'), title: 'Sample deck' }, config, transport),
      await commentCreate({ post: 'urn:li:share:7000000000000000000', text }, config, transport, desk),
    ];
    const touched = calls.length > 0 || existsSync(join(config.home, 'ledger.jsonl'));
    const silent = touched ? 0 : runs.filter((r) => r.dry_run === true).length;
    const requests = runs.flatMap((r) => r.requests ?? []);
    const clean = requests.filter((q) => !Object.keys(q.headers ?? {}).some((h) => h.toLowerCase() === 'authorization') && HOSTS.has(new URL(q.url).host));
    const value = (v, source) => ({ value: v, source, read_at });
    return {
      'post.dry_run_silent': value(pct(silent, runs.length), `state: ${runs.length} dry runs (text, image, PDF, comment); ${calls.length} transport or desk calls`),
      'post.no_token_in_requests': value(pct(clean.length, requests.length), `state: ${requests.length} planned requests checked for an Authorization header and a LinkedIn host`),
      'post.plan_ms': value(ms, 'latest: one text post planned as a dry run, wall clock'),
      'post.plan_tokens': value(tokens(textPost), 'state: one text-post dry run answer, characters / 4'),
    };
  } catch (error) {
    return Object.fromEntries(IDS.map((id) => [id, { could_not_check: `the dry run failed: ${error.message}`, source: 'state: dry run' }]));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
