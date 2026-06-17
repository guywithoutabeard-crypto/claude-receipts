import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { costFor } from './pricing.js';

export function claudeDir(override) {
  return override || join(homedir(), '.claude');
}

// Find every session transcript under ~/.claude/projects, newest first.
export function findTranscripts(dir) {
  const projects = join(dir, 'projects');
  const out = [];
  let projDirs = [];
  try {
    projDirs = readdirSync(projects);
  } catch {
    return out;
  }
  for (const p of projDirs) {
    const full = join(projects, p);
    let files = [];
    try {
      files = readdirSync(full);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue;
      const path = join(full, f);
      let st;
      try {
        st = statSync(path);
      } catch {
        continue;
      }
      out.push({
        path,
        project: p,
        sessionId: f.replace(/\.jsonl$/, ''),
        mtime: st.mtimeMs,
        size: st.size,
      });
    }
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

function newAgg() {
  return {
    sessionId: null,
    project: null,
    sessions: 1,
    turns: 0,
    models: {}, // model id -> turn count
    sidechainTurns: 0,
    sidechainModels: {}, // sub-agent model id -> turn count
    haikuSidechain: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0 },
    cost: 0,
    knownCost: true, // false if any turn used a model we couldn't price exactly
    thinkingTurns: 0,
    serviceTiers: {},
    webSearch: 0,
    webFetch: 0,
    firstTs: null,
    lastTs: null,
  };
}

function accumulate(a, rec) {
  const m = rec.message || {};
  const model = m.model || 'unknown';
  const usage = m.usage || {};

  // "<synthetic>" messages are injected by the harness, not real API calls.
  if (model === '<synthetic>') return;

  a.turns++;
  a.models[model] = (a.models[model] || 0) + 1;

  if (rec.isSidechain) {
    a.sidechainTurns++;
    a.sidechainModels[model] = (a.sidechainModels[model] || 0) + 1;
    if (/haiku/.test(model)) a.haikuSidechain++;
  }

  a.tokens.input += usage.input_tokens || 0;
  a.tokens.output += usage.output_tokens || 0;
  a.tokens.cacheRead += usage.cache_read_input_tokens || 0;

  const cc = usage.cache_creation || {};
  const c5 = cc.ephemeral_5m_input_tokens ?? 0;
  const c1 = cc.ephemeral_1h_input_tokens ?? 0;
  const totalCreate = usage.cache_creation_input_tokens ?? c5 + c1;
  if (c5 || c1) {
    a.tokens.cacheCreate5m += c5;
    a.tokens.cacheCreate1h += c1;
  } else {
    a.tokens.cacheCreate5m += totalCreate;
  }

  const { usd, known } = costFor(model, usage);
  a.cost += usd;
  if (!known) a.knownCost = false;

  // A thinking-type block means the model engaged thinking this turn. Its text
  // may be empty (display defaults to "omitted" on 4.7/4.8) — presence, not text.
  if (Array.isArray(m.content) && m.content.some((b) => b && b.type === 'thinking')) {
    a.thinkingTurns++;
  }

  const tier = usage.service_tier;
  if (tier) a.serviceTiers[tier] = (a.serviceTiers[tier] || 0) + 1;

  const stu = usage.server_tool_use || {};
  a.webSearch += stu.web_search_requests || 0;
  a.webFetch += stu.web_fetch_requests || 0;

  const ts = rec.timestamp;
  if (ts) {
    if (!a.firstTs || ts < a.firstTs) a.firstTs = ts;
    if (!a.lastTs || ts > a.lastTs) a.lastTs = ts;
  }
}

export function aggregateFile(file) {
  const a = newAgg();
  a.sessionId = file.sessionId;
  a.project = file.project;
  let raw;
  try {
    raw = readFileSync(file.path, 'utf8');
  } catch {
    return a;
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.type !== 'assistant') continue;
    accumulate(a, rec);
  }
  return a;
}

// Merge many session aggregates into one (for `--all`).
export function mergeAggs(aggs) {
  const out = newAgg();
  out.sessions = 0;
  out.sessionId = 'ALL';
  out.project = null;
  for (const a of aggs) {
    out.sessions += a.sessions;
    out.turns += a.turns;
    out.sidechainTurns += a.sidechainTurns;
    out.haikuSidechain += a.haikuSidechain;
    out.thinkingTurns += a.thinkingTurns;
    out.webSearch += a.webSearch;
    out.webFetch += a.webFetch;
    out.cost += a.cost;
    if (!a.knownCost) out.knownCost = false;
    for (const k of Object.keys(out.tokens)) out.tokens[k] += a.tokens[k];
    for (const [m, n] of Object.entries(a.models)) out.models[m] = (out.models[m] || 0) + n;
    for (const [m, n] of Object.entries(a.sidechainModels))
      out.sidechainModels[m] = (out.sidechainModels[m] || 0) + n;
    for (const [t, n] of Object.entries(a.serviceTiers))
      out.serviceTiers[t] = (out.serviceTiers[t] || 0) + n;
    if (a.firstTs && (!out.firstTs || a.firstTs < out.firstTs)) out.firstTs = a.firstTs;
    if (a.lastTs && (!out.lastTs || a.lastTs > out.lastTs)) out.lastTs = a.lastTs;
  }
  return out;
}
