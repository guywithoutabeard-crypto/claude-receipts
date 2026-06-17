import { rateFor, costFor } from '../src/pricing.js';

let pass = 0;
let fail = 0;
function eq(label, got, want) {
  if (Math.abs(got - want) < 1e-6) pass++;
  else {
    fail++;
    console.error(`FAIL  ${label}: got ${got}, want ${want}`);
  }
}
function ok(label, cond) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL  ${label}`);
  }
}

// rate table
ok('opus-4-8 exact', rateFor('claude-opus-4-8').input === 5 && rateFor('claude-opus-4-8').exact === true);
ok('haiku-4-5 rates', rateFor('claude-haiku-4-5').input === 1 && rateFor('claude-haiku-4-5').output === 5);
ok('sonnet family inferred', rateFor('claude-sonnet-4-5').input === 3 && rateFor('claude-sonnet-4-5').exact === false);
ok('unknown model -> null', rateFor('totally-made-up-model') === null);

// cost math (per 1,000,000 tokens)
eq('1M input opus', costFor('claude-opus-4-8', { input_tokens: 1_000_000 }).usd, 5);
eq('1M output opus', costFor('claude-opus-4-8', { output_tokens: 1_000_000 }).usd, 25);
eq('1M cache read opus (0.1x)', costFor('claude-opus-4-8', { cache_read_input_tokens: 1_000_000 }).usd, 0.5);
eq('1M cache write 5m opus (1.25x)', costFor('claude-opus-4-8', { cache_creation: { ephemeral_5m_input_tokens: 1_000_000 } }).usd, 6.25);
eq('1M cache write 1h opus (2x)', costFor('claude-opus-4-8', { cache_creation: { ephemeral_1h_input_tokens: 1_000_000 } }).usd, 10);
eq('1M output haiku', costFor('claude-haiku-4-5', { output_tokens: 1_000_000 }).usd, 5);
ok('unknown model known=false', costFor('made-up', { input_tokens: 1000 }).known === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
