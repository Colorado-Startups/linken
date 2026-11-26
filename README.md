# Linken

<p align="center"><img src="docs/linken.jpg" alt="Linken, an elf hero in a LinkedIn-blue tunic" width="320"></p>

Your LinkedIn, run by Claude. Nothing posts until you click.

| ✍️ Post | 📥 Inbox | 🧹 Clean up |
| --- | --- | --- |
| Posts, comments and replies you approve | Drafts replies from your own data export | Keeps who matters, removes clear spam, paced |

```mermaid
flowchart LR
  A[🤖 Your AI tool] --> B[📝 Draft]
  B --> C{👤 You approve?}
  C -->|yes| D[✅ LinkedIn API]
  C -->|no| E[🛑 Nothing sent]
```

## 🎒 Try it in 2 minutes

| # | |
| --- | --- |
| 1 | `npm run sample` |
| 2 | Claude: `archive_load` `~/.linken-sample` |
| 3 | `connections_summary` |

## Install

macOS, Node 26 or newer. Install first: step 2 needs the `linken-token` that step 1 installs.

| # | Do |
| --- | --- |
| 1️⃣ | `git clone https://github.com/Colorado-Startups/linken && cd linken && npm ci && sudo ./install.sh` |
| 2️⃣ | Make a LinkedIn app on a Page you administer, add its 2 products, generate a token, then run `linken-token`: [setup](docs/setup.md) |
| 3️⃣ | `/plugin install linken --marketplace Colorado-Startups/linken`, then ask Claude to call `linken_status` |

| Learned the hard way | Do |
| --- | --- |
| 🪪 Several Pages share a name | Pick the Page by its URL. The app's Page cannot change after you save |
| ⏳ The token lasts 60 days | Generate it only after step 1, and repeat step 2 to renew |

## 🛡️ Safety

| Guard | |
| --- | --- |
| 👤 Approval | Every post waits for your click |
| 🛑 Halt | `~/.linken/halt` stops everything |
| ⏱️ Pace | Daily caps, random gaps |
| 🏠 Local | Token in the Keychain, data in `~/.linken` |
| 🔎 Proof | Nobody is removed on old data: the live profile decides |

## Links

| Page | |
| --- | --- |
| 📊 Quality | <https://colorado-startups.github.io/linken/> |
| ⚙️ Process | <https://colorado-startups.github.io/linken/process.html> |
| 🔧 Setup | [docs/setup.md](docs/setup.md) |
| 🧭 How it decides | [docs/decide.md](docs/decide.md) |
| 🧹 Clean-up guide | [docs/connections.md](docs/connections.md) |
| 🧩 Code | `src/` server · `rules/` word lists · `tests/` · `quality/` scores |
| 📜 Legal | [Apache-2.0](LICENSE), [trademarks](TRADEMARKS.md) |

Open source from Colorado Startups. Not affiliated with LinkedIn or Anthropic.
