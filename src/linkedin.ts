// SPDX-License-Identifier: Apache-2.0
// Every LinkedIn request Linken makes, built here as a spec and handed to a transport. This file never calls fetch and
// never sends, stores or returns the token: the trusted helper (trusted/linken-linkedin.mjs) adds the token, asks the
// member before each write, and sends. The helper gets the token from the process that starts it, in the supported
// setup a key tool. Two functions here keep the token away from the server's side: refuseToken, which every tool
// handler calls first and which only tests whether the server's environment holds a token, and childEnv, the minimal
// environment of every process the server starts. Request shapes follow learn.microsoft.com/linkedin (posts-api, images-api, documents-api,
// little-text-format and sign-in-with-linkedin-v2; view li-lms-2026-10, read 2026-11-12).
import { execFile, spawn } from 'node:child_process';
import { childEnv, LinkError, type Config, type HelperResult, type Transport } from './core.ts';
import { lastLedgerLines, readHomeText } from './ledger.ts';
import { API_VERSION, TOKEN_INVALID, openSession, whoAmI, where } from './session.ts';

const TOKEN_MISSING =
  "The LinkedIn helper had no usable token. Generate one in LinkedIn's Token Generator and store it (about 1 minute), and check that LINKEN_HELPER_CMD starts the helper through the key tool.";
const HELPER_EXAMPLE =
  'Set it to the command that starts the helper with the token, as a JSON array of strings, for example ["/bin/sh","-c","LINKEDIN_ACCESS_TOKEN=\\"$(/usr/bin/security find-generic-password -s linken-linkedin -w)\\" exec /usr/local/bin/linken-linkedin"].';
const TOKEN_IN_SERVER_ENV =
  "LINKEDIN_ACCESS_TOKEN is set in the Linken server's environment. The server must not hold the token. Remove it and let the helper command supply the token (for example a key tool that starts linken-linkedin).";

/** The command in LINKEN_HELPER_CMD, or a LinkError that names the fix. */
function helperCommand(raw: string | undefined): string[] {
  if (!raw) throw new LinkError(`LINKEN_HELPER_CMD is not set. ${HELPER_EXAMPLE}`);
  let command: unknown = null;
  try {
    command = JSON.parse(raw);
  } catch {
    // Not JSON: the check below reports it.
  }
  // A program name, then its arguments. An argument may be empty; the program may not.
  const valid = Array.isArray(command) && command.every((part) => typeof part === 'string') && !!command[0];
  if (!valid) throw new LinkError(`LINKEN_HELPER_CMD is not valid. ${HELPER_EXAMPLE}`);
  return command as string[];
}

/**
 * Throws when `env`, the server's own environment, holds a non-empty LINKEDIN_ACCESS_TOKEN. Every tool handler calls
 * it first, live and in a dry run, before a gate or the helper can start. It tests the value and does nothing else
 * with it.
 */
export function refuseToken(env: Record<string, string | undefined>): void {
  if (env.LINKEDIN_ACCESS_TOKEN) throw new LinkError(TOKEN_IN_SERVER_ENV);
}

/** What the helper wrote on stdout, parsed; empty when there was no JSON, so the exit code alone decides. */
function helperOutput(stdout: string): Partial<HelperResult> & { error?: unknown } {
  try {
    return JSON.parse(stdout) ?? {};
  } catch {
    return {};
  }
}

/** Starts the helper `command` without a shell, writes `spec` to its stdin, and returns its exit code and stdout. */
function runHelper(command: string[], spec: Spec, env: Record<string, string | undefined>) {
  return new Promise<{ code: number | null; stdout: string }>((resolve) => {
    const child = spawn(command[0], command.slice(1), { stdio: ['pipe', 'pipe', 'ignore'], env: childEnv(env) });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (out += chunk));
    child.on('error', () => resolve({ code: null, stdout: '' }));
    child.on('close', (exit) => resolve({ code: exit, stdout: out }));
    // A helper that exits before reading its input is reported by its exit code, not by this pipe.
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(spec));
  });
}

/** The result of a helper that exited 0, or a LinkError when it printed no status. */
function helperAnswer(result: Partial<HelperResult>, spec: Spec): HelperResult {
  if (typeof result.status !== 'number') {
    throw new LinkError(`The LinkedIn helper returned no result for ${where(spec)}. Check the profile before trying again.`);
  }
  return { status: result.status, headers: result.headers ?? {}, body: result.body ?? null };
}

/** The helper's answer for its exit code: the result on 0, otherwise a LinkError that names what to check. */
function helperExit(code: number | null, result: Partial<HelperResult> & { error?: unknown }, spec: Spec): HelperResult {
  switch (code) {
    case 0:
      return helperAnswer(result, spec);
    case 2:
      throw new LinkError(
        `The LinkedIn helper refused ${where(spec)}: ${String(result.error ?? 'no reason given').slice(0, 300)}.`,
      );
    case 3:
      throw new LinkError('You cancelled in the approval dialog. Nothing was sent.');
    case 4:
      throw new LinkError(TOKEN_MISSING);
    case 5:
      throw new LinkError(
        `Could not reach LinkedIn (${where(spec)}). Check the network. If this was the post itself, check the profile before trying again.`,
      );
    case null:
      throw new LinkError('Could not start the LinkedIn helper. Check that the command in LINKEN_HELPER_CMD exists.');
    default:
      throw new LinkError(
        `The LinkedIn helper command failed (exit ${code}). Check LINKEN_HELPER_CMD and that the token is stored.`,
      );
  }
}

/**
 * The default transport: runs the LINKEN_HELPER_CMD command without a shell, writes the spec to its stdin, and reads its
 * one JSON result from stdout. The helper's stderr is dropped, so nothing it prints there can reach a result or a log.
 * `env` is the server's own environment: the transport checks it with refuseToken too, so it starts nothing when used
 * on its own with the token present, and the command starts with childEnv(env), never with `env` itself.
 */
export function helperTransport(
  raw: string | undefined,
  env: Record<string, string | undefined> = process.env,
): Transport {
  return async (spec) => {
    refuseToken(env);
    const command = helperCommand(raw);
    const { code, stdout } = await runHelper(command, spec, env);
    return helperExit(code, helperOutput(stdout), spec);
  };
}

/** When the member stored the token: the Keychain item's modification date, or null. */
export type StoredAt = () => Promise<Date | null>;
const DAY_MS = 86_400_000;
/** LinkedIn's Token Generator tokens last 60 days, with no refresh (docs/setup.md, step 5). */
const TOKEN_DAYS = 60;
/** linken_status warns this many days ahead. */
export const WARN_DAYS = 7;

/**
 * Reads when the linken-linkedin Keychain item last changed, from `security find-generic-password` without -w or -g,
 * so security prints the item's attributes and never its secret. Null off macOS, with no item, or on any failure.
 */
export function keychainStoredAt(env: Record<string, string | undefined>, security = '/usr/bin/security'): StoredAt {
  return () => new Promise((done) => {
    execFile(security, ['find-generic-password', '-s', 'linken-linkedin'], { env: childEnv(env) }, (error, out) => {
      const m = /"mdat"<timedate>=\S*\s+"(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z/.exec(String(out));
      done(error || !m ? null : new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])));
    });
  });
}

/** When the token expires, about, and a warning that names the fix once it is WARN_DAYS or fewer away. */
export function tokenExpiry(stored: Date, now = Date.now()): Record<string, unknown> {
  const expires = new Date(stored.getTime() + TOKEN_DAYS * DAY_MS);
  const days = Math.max(0, Math.floor((expires.getTime() - now) / DAY_MS));
  const when = expires.toISOString().slice(0, 10);
  const out: Record<string, unknown> = { token_expires: when, token_days_left: days };
  if (days <= WARN_DAYS) {
    out.warning = `The LinkedIn token expires in about ${days} day${days === 1 ? '' : 's'} (${when}). Generate a new one in LinkedIn's Token Generator and store it with linken-token (about 1 minute).`;
  }
  return out;
}

/**
 * What `linken_status` returns: who the token signs in as, whether the token works (null in a dry run, which does not
 * check), the pinned API version, whether dry-run is on, the last 5 ledger lines, and the member's voice guide (null
 * without one). With a working token and a known store date, it adds when the token expires, and a warning WARN_DAYS
 * ahead. A missing or rejected token is an answer, not an error. Any other failure is thrown.
 */
export async function linkStatus(
  config: Config,
  transport: Transport,
  storedAt: StoredAt = async () => null,
): Promise<Record<string, unknown>> {
  const voice = readHomeText(config.home, 'voice.md');
  const fixed = { api_version: API_VERSION, dry_run: config.dryRun, ledger: lastLedgerLines(config.home, 5), voice };
  const nobody = { name: null, author: null };
  try {
    const session = openSession(config, transport);
    const me = await whoAmI(session);
    if (session.planned) return { ...nobody, token_works: null, ...fixed, requests: session.planned };
    const stored = await storedAt();
    return { ...me, token_works: true, ...(stored && tokenExpiry(stored)), ...fixed };
  } catch (error) {
    if (!(error instanceof LinkError) || ![TOKEN_MISSING, TOKEN_INVALID].includes(error.message)) throw error;
    return { ...nobody, token_works: false, problem: error.message, ...fixed };
  }
}
