# Linken spec

🎯 Your LinkedIn, run by Claude. Nothing posts until you click.

This page says what Linken is, what it does, and what it will not do.

| Part | Where |
| --- | --- |
| 1 · Who it is for, 2 · The jobs | [Spec: jobs](docs/spec-jobs.md) |
| 3 · Rules that never bend, 4 · Out of scope | This page |
| 5 · How it is built, 6 · Done means | [Spec: build](docs/spec-build.md) |
| How to start | [README](README.md) |
| The clean-up rules | [How it decides](docs/decide.md) |

## 3 · Rules that never bend

| # | Rule | Enforced by |
| --- | --- | --- |
| 1 | 👤 Every post and comment waits for your click in the approval dialog | `trusted/linken-linkedin` dialog |
| 2 | 🛑 The halt file `~/.linken/halt` stops every LinkedIn write and the next removal | `src/connections.ts` |
| 3 | ⏱️ Daily and sitting caps, with random 15 to 45 second gaps. A cap can go down, never up | `src/connections.ts`, [clean-up guide](docs/connections.md) |
| 4 | 🔎 The live profile page decides a removal. The export only suggests | `src/levels.ts` |
| 5 | 🏠 The token stays in the Keychain. Data stays in `~/.linken`. Nothing leaves your machine but the API call you approved | `trusted/`, `install.sh` |
| 6 | 🧪 `LINKEN_DRY_RUN=1` rehearses every write with no LinkedIn call. Dev sessions always use it | `src/session.ts`, `src/linkedin.ts` |
| 7 | 🙈 No member data in this repo: fixtures are fictional | `tests/privacy.test.ts` |

### 👥 Grow, planned (#103)

| Rule | Detail |
| --- | --- |
| 📦 Source | Only your own export: invitations you received, people who wrote to you, people you wrote to but never connected with |
| 🙅 Never | No search of LinkedIn, no stranger lists, no bought data |
| 👤 You act | Linken opens the profile. You send the invite in LinkedIn |
| ⏱️ Pace | Same halt file and daily caps as clean-up |
| 🧭 Fit | Ranked by your `mission` and `places` words in `~/.linken/rater.json` |

## 4 · Out of scope

| Not doing | Why |
| --- | --- |
| 🤖 Posting on a schedule, or without a click | A post is the member's own act |
| 📨 Sending messages or invitations for you | `reply_open` and Grow open LinkedIn for you; you press send |
| 🕷️ Scraping other people's profiles in bulk | Only the one page you open is read, one at a time |
| ☁️ A hosted service | Local only: no server holds anyone's token or data |
| 📈 Growth hacks (engagement pods, auto-likes) | They break LinkedIn's terms and the member's trust |

## 7 · Changing this spec

A change to sections 3 or 4 is a vision change. It needs its own pull request and the maintainer's approval in [MAINTAINERS.md](MAINTAINERS.md).
