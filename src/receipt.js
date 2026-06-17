// Renders an aggregate into a shareable ASCII "receipt" card.

const ESC = /\x1b\[[0-9;]*m/g;
const vlen = (s) => s.replace(ESC, '').length;

const WIDTH = 60; // total card width
const INNER = WIDTH - 4; // content width between "│ " and " │"

function makeColor(enabled) {
  const wrap = (code) => (s) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);
  return {
    dim: wrap('2'),
    bold: wrap('1'),
    red: wrap('31'),
    green: wrap('32'),
    yellow: wrap('33'),
    cyan: wrap('36'),
  };
}

function pad(s, w) {
  const len = vlen(s);
  return len >= w ? s : s + ' '.repeat(w - len);
}

function fmtInt(n) {
  return n.toLocaleString('en-US');
}

function fmtTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e5) return Math.round(n / 1e3) + 'k';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

function fmtUSD(n) {
  if (n >= 1) return '$' + n.toFixed(2);
  if (n > 0) return '$' + n.toFixed(4);
  return '$0';
}

function shortModel(id) {
  return id.replace(/^claude-/, '');
}

// Trim a plain (uncolored) string to fit a column, with an ellipsis.
function clip(s, max) {
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + '…';
}

function duration(firstTs, lastTs) {
  if (!firstTs || !lastTs) return null;
  const ms = new Date(lastTs) - new Date(firstTs);
  if (!(ms >= 0)) return null;
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h${min % 60}m`;
}

function dateOf(ts) {
  if (!ts) return null;
  return new Date(ts).toISOString().slice(0, 10);
}

export function render(agg, { color = true } = {}) {
  const c = makeColor(color);
  const lines = [];

  const top = (title) => {
    const inner = WIDTH - 2; // chars between the corner glyphs
    const used = 2 + title.length + 1; // "─ " + title + " "
    const d = Math.max(0, inner - used);
    return c.dim('┌─ ') + c.bold(title) + c.dim(' ' + '─'.repeat(d) + '┐');
  };
  const rule = () => c.dim('├' + '─'.repeat(WIDTH - 2) + '┤');
  const bottom = () => c.dim('└' + '─'.repeat(WIDTH - 2) + '┘');
  const row = (s) => c.dim('│ ') + pad(s, INNER) + c.dim(' │');
  const label = (k, v) => row(c.dim(pad(k, 9)) + v);

  // --- header ---
  const idShort = agg.sessionId === 'ALL' ? 'ALL SESSIONS' : agg.sessionId.slice(0, 8);
  const date = dateOf(agg.firstTs);
  const dur = duration(agg.firstTs, agg.lastTs);
  const headBits = [
    agg.sessionId === 'ALL' ? `${fmtInt(agg.sessions)} sessions` : `session ${idShort}`,
    date,
    dur,
  ].filter(Boolean);

  lines.push(top('CLAUDE CODE RECEIPT'));
  lines.push(row(c.cyan(headBits.join('  ·  '))));
  lines.push(rule());

  // --- turns + models ---
  lines.push(label('Turns', fmtInt(agg.turns)));

  const modelList = Object.entries(agg.models)
    .sort((a, b) => b[1] - a[1])
    .map(([m, n]) => `${shortModel(m)} ×${n}`)
    .join(' · ');
  lines.push(label('Models', clip(modelList || '—', INNER - 9)));

  if (agg.haikuSidechain > 0) {
    lines.push(
      row(c.yellow(`⚠ ${agg.haikuSidechain} sub-agent turn(s) ran on Haiku`)),
    );
  } else if (agg.sidechainTurns > 0) {
    lines.push(label('Subagents', `${fmtInt(agg.sidechainTurns)} turn(s)`));
  }

  lines.push(rule());

  // --- tokens + cost ---
  const t = agg.tokens;
  const promptTotal = t.input + t.cacheRead + t.cacheCreate5m + t.cacheCreate1h;
  const grandTotal = promptTotal + t.output;
  const cacheWrite = t.cacheCreate5m + t.cacheCreate1h;

  const costStr = fmtUSD(agg.cost) + (agg.knownCost ? '' : '~');
  lines.push(label('Tokens', `${fmtTokens(grandTotal)} total   ` + c.bold(`est. ${costStr} API value`)));
  lines.push(label('', c.dim(`in ${fmtTokens(t.input)} · out ${fmtTokens(t.output)}`)));

  // Cache: reads are cheap (0.1x); writes are paid context rebuilds (1.25–2x).
  const writePct = cacheWrite + t.cacheRead > 0
    ? Math.round((cacheWrite / (cacheWrite + t.cacheRead)) * 100)
    : 0;
  const cacheLine = `cache  rd ${fmtTokens(t.cacheRead)} · wr ${fmtTokens(cacheWrite)}`;
  lines.push(label('', c.dim(cacheLine)));
  if (writePct >= 40 && cacheWrite > 0) {
    lines.push(row(c.yellow(`⚠ ${writePct}% of cached context was rebuilt (cache writes)`)));
  }

  lines.push(rule());

  // --- thinking + tier ---
  lines.push(label('Thinking', `${fmtInt(agg.thinkingTurns)}/${fmtInt(agg.turns)} turns engaged thinking`));

  const tierStr = Object.entries(agg.serviceTiers)
    .map(([k, n]) => `${k} ×${n}`)
    .join(' · ');
  if (tierStr) lines.push(label('Tier', clip(tierStr, INNER - 9)));

  if (agg.webSearch || agg.webFetch) {
    lines.push(label('Web', `${fmtInt(agg.webSearch)} searches · ${fmtInt(agg.webFetch)} fetches`));
  }

  lines.push(bottom());

  // --- footnotes (outside the card) ---
  const notes = [
    '“empty” thinking text is normal on Opus 4.7/4.8 (display omitted) —',
    'thinking-block presence is engagement, not effort level.',
    'cost is list-price API value; subscription plans are not billed per token.',
  ];
  lines.push('');
  for (const n of notes) lines.push(c.dim('  * ' + n));
  lines.push('');
  lines.push(c.cyan('  get the receipts on what Claude Code actually ran'));

  return lines.join('\n');
}
