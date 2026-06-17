# Receipts

**Get the receipts on what Claude Code actually ran.**

`claude-receipts` reads your local Claude Code logs and prints a shareable card showing, per session: **which models actually ran, whether sub-agents were silently delegated to Haiku, how many tokens you burned, and what it cost** — the stuff `/cost` doesn't break down and the "Claude got worse" threads keep arguing about.

It's a watchdog, not a dashboard. No daemon, no account, no network. It reads `~/.claude` and prints.

```
┌─ CLAUDE CODE RECEIPT ────────────────────────────────────┐
│ session 0d1f828b  ·  2026-06-17  ·  19m                  │
├──────────────────────────────────────────────────────────┤
│ Turns    80                                              │
│ Models   opus-4-8 ×80                                    │
├──────────────────────────────────────────────────────────┤
│ Tokens   11.79M total   est. $25.28 API value            │
│          in 30.9k · out 288k                             │
│          cache  rd 10.19M · wr 1.28M                     │
├──────────────────────────────────────────────────────────┤
│ Thinking 19/80 turns engaged thinking                    │
│ Tier     standard ×80                                    │
└──────────────────────────────────────────────────────────┘
```

## Install

```bash
npx claude-receipts          # run without installing
# or
npm install -g claude-receipts
```

Requires Node 18+. (Not yet published to npm — for now: `git clone` then `node bin/claude-receipts.js`.)

## Usage

```bash
claude-receipts                 # receipt for your most recent session
claude-receipts --all           # one receipt across every session you've run
claude-receipts --session 0d1f  # a specific session (id prefix is enough)
claude-receipts --list          # list recent sessions, newest first
claude-receipts --json          # machine-readable, for piping
```

Flags: `--limit <n>` (with `--list`), `--no-color`, `--dir <path>` (override `~/.claude`), `--help`.

## What it surfaces

- **Silent model swaps.** Every turn logs its real model id. If a sub-agent ran on Haiku, you'll see `⚠ N sub-agent turn(s) ran on Haiku` — the exact behavior behind the spring-2026 "Claude Code got dumber" reports.
- **Where your tokens actually went.** Input vs output vs cache. Cache **reads** are cheap (0.1× input); cache **writes** are paid context rebuilds (1.25–2× input). A high write ratio means idle gaps kept blowing your 5-minute cache — that's the token-burn lever nobody shows you.
- **Cost as API value.** Priced at Anthropic's public list rates, with the 5-minute/1-hour cache-TTL split applied per turn.

## Why it's different

`ccusage` and friends are real-time spend **dashboards**. Receipts is a retrospective **audit** — a single screenshot-native card built for the question "did Claude Code actually run me on what I asked for, and where did the money go?"

## How it works

100% local. It parses the JSONL transcripts Claude Code already writes to `~/.claude/projects/**`. Nothing is uploaded; there are no network calls in the tool at all. Read the ~250 lines of `src/` yourself.

## Honest limitations

- **Reasoning effort (`high`/`medium`/…) is not logged**, so we don't fake a precise effort number. "Thinking engaged" counts turns that carried a thinking block — and on Opus 4.7/4.8 an *empty* thinking block is the default (`display: omitted`), so engagement ≠ effort level. We label it as engagement, nothing more.
- **Cost is list-price API value.** If you're on a Pro/Max subscription you are not billed per token — the dollar figure is the equivalent API spend, useful for comparison, not your invoice.
- Counts only real model turns; harness-injected `<synthetic>` messages are excluded.

## Roadmap

- `--watch` live mode: tail the active session and flag a downgrade the moment it happens
- HTML/PNG share card export
- per-day and per-project rollups
- optional alert when a session crosses a cost or Haiku-delegation threshold

## License

MIT
