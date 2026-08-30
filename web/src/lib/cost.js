// Cloud-cost savings helpers. The hub is the source of truth for the rates
// (server/config.js CLOUD_PRICING, delivered in the WS hello snapshot) and for
// per-task savedUsd/savedInr; these are display fallbacks + formatters only.
// Methodology (conservative floor): gate-passed on-device output tokens ×
// cloud OUTPUT rate. Input-side savings are real but deliberately not counted.

export const DEFAULT_PRICING = { model: 'claude-opus-5', outputUsdPerMTok: 25, usdToInr: 95.4 };

/** ₹ saved by one task, preferring the hub-computed field. */
export function taskSavedInr(task, pricing) {
  if (task.savedInr != null) return task.savedInr;
  if (task.fallback || task.state !== 'completed') return 0;
  const p = pricing || DEFAULT_PRICING;
  return ((task.tokensOut || 0) * p.outputUsdPerMTok * p.usdToInr) / 1e6;
}

export function inrToUsd(inr, pricing) {
  return inr / (pricing?.usdToInr || DEFAULT_PRICING.usdToInr);
}

export function fmtInr(inr) {
  if (inr >= 1000) return '₹' + Math.round(inr).toLocaleString('en-IN');
  if (inr >= 100) return '₹' + inr.toFixed(1);
  return '₹' + inr.toFixed(2);
}

export function fmtUsd(usd) {
  return '$' + (usd >= 1 ? usd.toFixed(2) : usd.toFixed(3));
}

// The fun-fact ladder: everyday Indian price tags, largest unit that fits wins.
// Counts are floored — the fact must never overstate what the ₹ figure shows.
const LADDER = [
  { price: 200, line: (n) => `${n} multiplex movie ticket${n > 1 ? 's' : ''} of cloud spend — popcorn not included` },
  { price: 80, line: (n) => `${n} masala dosa${n > 1 ? 's' : ''} of Opus output, cooked on-device instead` },
  { price: 30, line: (n) => `${n} auto minimum-fare${n > 1 ? 's' : ''} — and unlike an auto, the phones agreed to go` },
  { price: 20, line: (n) => `${n} vada pav${n > 1 ? 's' : ''} the cloud never got to bill` },
  { price: 15, line: (n) => `${n} cutting chai${n > 1 ? 's' : ''} brewed by the fleet, not the cloud` },
  { price: 5, line: (n) => `${n} pack${n > 1 ? 's' : ''} of Parle-G — the true unit of Indian compute` },
];

// ~400 tokens ≈ one printed page of Harry Potter (77k words ≈ 100k tokens / ~250 pages).
const TOKENS_PER_HP_PAGE = 400;

/** One funny-but-honest line for the given savings. Never returns overstated counts. */
export function funFact(inr, tokens) {
  const pages = Math.floor((tokens || 0) / TOKENS_PER_HP_PAGE);
  for (const rung of LADDER) {
    const n = Math.floor(inr / rung.price);
    if (n >= 1) {
      let s = rung.line(n);
      if (pages >= 1) s += ` · the phones also typed ~${pages} page${pages > 1 ? 's' : ''} of Harry Potter so Claude didn't have to`;
      return s;
    }
  }
  if (pages >= 1) return `the phones typed ~${pages} page${pages > 1 ? 's' : ''} of Harry Potter so Claude didn't have to`;
  if (inr > 0) return `${Math.max(1, Math.round((inr / 15) * 100))}% of a cutting chai and climbing`;
  return '';
}
