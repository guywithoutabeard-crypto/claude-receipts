// Per–million-token list prices (USD), from Anthropic's published pricing (June 2026).
// Cache write costs 1.25x input for 5-minute TTL, 2.0x input for 1-hour TTL.
// Cache read costs 0.1x input. We derive those from the base input rate below.
const TABLE = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-mythos-5': { input: 10, output: 50 },
};

// Fallback by model family for IDs not in the table (dated snapshots, older minors).
// `exact: false` flags that the number is inferred, not the published rate.
function familyRate(model) {
  if (/opus/.test(model)) return { input: 5, output: 25 };
  if (/sonnet/.test(model)) return { input: 3, output: 15 };
  if (/haiku/.test(model)) return { input: 1, output: 5 };
  if (/fable|mythos/.test(model)) return { input: 10, output: 50 };
  return null;
}

export function rateFor(model) {
  if (!model) return null;
  if (TABLE[model]) return { model, exact: true, ...TABLE[model] };
  const fam = familyRate(model);
  return fam ? { model, exact: false, ...fam } : null;
}

// USD cost for one turn's usage object. Returns { usd, known } where known=false
// means the model wasn't in our price table (cost is a family-inferred estimate or 0).
export function costFor(model, usage = {}) {
  const r = rateFor(model);
  if (!r) return { usd: 0, known: false };

  const inputRate = r.input / 1e6;
  const outputRate = r.output / 1e6;
  const write5mRate = inputRate * 1.25;
  const write1hRate = inputRate * 2.0;
  const readRate = inputRate * 0.1;

  const cc = usage.cache_creation || {};
  const c5 = cc.ephemeral_5m_input_tokens ?? 0;
  const c1 = cc.ephemeral_1h_input_tokens ?? 0;
  const totalCreate = usage.cache_creation_input_tokens ?? c5 + c1;
  // Use the per-TTL breakdown when present; otherwise treat all writes as 5m.
  const create5 = c5 || c1 ? c5 : totalCreate;
  const create1 = c1;

  const usd =
    (usage.input_tokens ?? 0) * inputRate +
    (usage.output_tokens ?? 0) * outputRate +
    create5 * write5mRate +
    create1 * write1hRate +
    (usage.cache_read_input_tokens ?? 0) * readRate;

  return { usd, known: r.exact };
}
