// SPDX-License-Identifier: Apache-2.0
// Skills over MCP (the Skills extension, SEP-2640): the server serves the three skills in skills/ to a client that runs
// it as a plain MCP server, and serves none when LINKEN_MCP_SKILLS=0, as the plugin sets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { fakeLinkedIn, liveConfig } from './fake-linkedin.ts';
import { buildServer, serverSkills, SKILLS_DIR } from '../src/server.ts';

const NAMES = ['linken-cleanup', 'linken-inbox', 'linken-post'];

async function rpc(env: Record<string, string | undefined>, method: string, params: Record<string, unknown> = {}) {
  const skills = await serverSkills(env);
  const request = new Request('https://link.example.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const handler = createMcpHandler(() => buildServer(liveConfig(), { transport: fakeLinkedIn().transport, env: {}, skills }));
  const text = await (await handler.fetch(request)).text();
  const data = text.split('\n').find((line) => line.startsWith('data: '));
  return JSON.parse(data ? data.slice('data: '.length) : text);
}

test('skills/list serves the three skills, each with its frontmatter and a manifest', async () => {
  const out = await rpc({}, 'skills/list');
  assert.equal(out.error, undefined, JSON.stringify(out.error));
  const skills = out.result.skills as { uri: string; frontmatter: { name: string; description: string }; resources: { uri: string }[] }[];
  assert.deepEqual(skills.map((skill) => skill.frontmatter.name).sort(), NAMES);
  for (const skill of skills) {
    assert.equal(skill.uri, `skill://${skill.frontmatter.name}/SKILL.md`);
    assert.ok(skill.frontmatter.description.length > 40, `${skill.frontmatter.name} has a description`);
    assert.ok(skill.resources.some((file) => file.uri === skill.uri), 'the manifest lists SKILL.md');
  }
});

test('resources/read returns a SKILL.md exactly as it is in the repo', async () => {
  const out = await rpc({}, 'resources/read', { uri: 'skill://linken-post/SKILL.md' });
  assert.equal(out.error, undefined, JSON.stringify(out.error));
  assert.equal(out.result.contents[0].text, readFileSync(`${SKILLS_DIR}/linken-post/SKILL.md`, 'utf8'));
});

test('an unknown skill is invalid params, and the tools are still there', async () => {
  assert.equal((await rpc({}, 'skills/get', { uri: 'skill://nope/SKILL.md' })).error.code, -32602);
  assert.equal((await rpc({}, 'tools/list')).result.tools.length, 13);
});

test('LINKEN_MCP_SKILLS=0 serves no skills, and a missing folder serves none', async () => {
  assert.equal(await serverSkills({ LINKEN_MCP_SKILLS: '0' }), undefined);
  assert.equal(await serverSkills({}, `${SKILLS_DIR}/does-not-exist`), undefined);
  assert.ok((await rpc({ LINKEN_MCP_SKILLS: '0' }, 'skills/list')).error, 'skills/list is not served');
});

test('the plugin turns MCP skills off, since it ships the same skills as plugin skills', () => {
  const plugin = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
  assert.equal(plugin.mcpServers.linken.env.LINKEN_MCP_SKILLS, '0');
});
