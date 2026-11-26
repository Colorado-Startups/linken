# The trusted helper: guarantees

Part of [the trusted helper](README.md).

Tests: [helper.test.ts](../tests/helper.test.ts) (H), [launcher.test.ts](../tests/launcher.test.ts) (L), [token.test.ts](../tests/token.test.ts) (T), [install.test.ts](../tests/install.test.ts) (I).

| Guarantee | Test |
| --- | --- |
| Token goes only to `api.linkedin.com` and `www.linkedin.com`; no redirects | H "host pinning", "a refused host exits 2", "a redirect is not followed" |
| 3 caller headers at most, never `Authorization` | H "header allowlist", "a caller-supplied Authorization is rejected" |
| Every write needs Publish; Cancel is the default; 600 s silence is a no | H "the gate", "not approved", "askHuman runs /usr/bin/osascript" |
| Only reads, upload registrations and uploads skip the dialog | H "a read, an upload registration and a file upload are sent without a dialog" |
| Post text is a dialog argument, never script | H "the dialog arguments" |
| Token never on stdout, stderr or a command line | H "the token never appears in the output", "run as a program"; L "the token variable is in no command's arguments"; T "a good token goes to security on stdin" |
| Node gets `HOME` and the token only (macOS adds `__CF_USER_TEXT_ENCODING` itself); the spec arrives unchanged | L "the launcher hands Node the token through a pipe" |
| The launcher is the reviewed five lines, and executable | L "the launcher is the reviewed five lines" |
| The installer refuses a Node the member can write before it runs it, by its real path and its folder; a named Node gets the same checks; a write test that cannot run is a refusal | I "a Node the member can write is refused, and it is never run", "the real path decides", "the folder decides too", "a named Node gets the same checks", "a write test that cannot run is a refusal" |
| A bad token starts nothing or stores nothing | L "an empty token…"; T "a cancel, an empty answer or a bad character" |
