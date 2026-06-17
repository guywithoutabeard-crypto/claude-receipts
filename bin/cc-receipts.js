#!/usr/bin/env node
import { claudeDir, findTranscripts, aggregateFile, mergeAggs } from '../src/parse.js';
import { render } from '../src/receipt.js';

function parseArgs(argv) {
  const opts = { color: process.stdout.isTTY };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') opts.all = true;
    else if (a === '--list') opts.list = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--no-color') opts.color = false;
    else if (a === '--color') opts.color = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '--session') opts.session = argv[++i];
    else if (a === '--dir') opts.dir = argv[++i];
    else if (a === '--limit') opts.limit = parseInt(argv[++i], 10);
    else if (a.startsWith('--session=')) opts.session = a.slice(10);
    else if (a.startsWith('--dir=')) opts.dir = a.slice(6);
    else if (a.startsWith('--limit=')) opts.limit = parseInt(a.slice(8), 10);
  }
  return opts;
}

const HELP = `cc-receipts — get the receipts on what Claude Code actually ran

Usage:
  cc-receipts                 receipt for your most recent session
  cc-receipts --all           one receipt across every session
  cc-receipts --session <id>  receipt for a specific session id
  cc-receipts --list          list recent sessions (newest first)
  cc-receipts --json          machine-readable output

Options:
  --limit <n>   with --list, how many to show (default 20)
  --dir <path>  override the ~/.claude directory
  --no-color    disable ANSI colors
  -h, --help    show this help

Reads only your local ~/.claude logs. Nothing leaves your machine.`;

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP);
    return;
  }

  const dir = claudeDir(opts.dir);
  const transcripts = findTranscripts(dir);

  if (transcripts.length === 0) {
    console.error(`No Claude Code transcripts found under ${dir}/projects.`);
    process.exit(1);
  }

  if (opts.list) {
    const limit = opts.limit || 20;
    const rows = transcripts.slice(0, limit).map((t) => {
      const when = new Date(t.mtime).toISOString().slice(0, 16).replace('T', ' ');
      const kb = (t.size / 1024).toFixed(0).padStart(6) + 'K';
      return `${t.sessionId.slice(0, 8)}  ${when}  ${kb}  ${t.project}`;
    });
    console.log(['SESSION   MODIFIED            SIZE  PROJECT', ...rows].join('\n'));
    return;
  }

  let agg;
  if (opts.all) {
    agg = mergeAggs(transcripts.map(aggregateFile));
  } else if (opts.session) {
    const match = transcripts.find((t) => t.sessionId.startsWith(opts.session));
    if (!match) {
      console.error(`No session matching "${opts.session}". Try: cc-receipts --list`);
      process.exit(1);
    }
    agg = aggregateFile(match);
  } else {
    agg = aggregateFile(transcripts[0]);
  }

  if (opts.json) {
    console.log(JSON.stringify(agg, null, 2));
    return;
  }

  console.log('\n' + render(agg, { color: opts.color }) + '\n');
}

main();
