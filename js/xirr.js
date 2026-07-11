// XIRR — money-weighted return over an irregular cash-flow vector.
// Newton-Raphson with a bisection fallback when Newton fails to converge or leaves the
// bracket. No dependencies. Validated against LibreOffice XIRR in test/fixtures.js.

const DAY_MS = 86400000;

function npv(rate, flows) {
  const t0 = flows[0].date;
  let sum = 0;
  for (const { date, amount } of flows) {
    const years = (date - t0) / DAY_MS / 365;
    sum += amount / Math.pow(1 + rate, years);
  }
  return sum;
}

function dNpv(rate, flows) {
  const t0 = flows[0].date;
  let sum = 0;
  for (const { date, amount } of flows) {
    const years = (date - t0) / DAY_MS / 365;
    if (years === 0) continue;
    sum += -years * amount / Math.pow(1 + rate, years + 1);
  }
  return sum;
}

/**
 * @param {{date: Date, amount: number}[]} flows - unsorted OK; needs at least one negative and one positive amount.
 * @param {number} guess - initial rate guess.
 * @returns {number} annualized rate, e.g. 0.15 for 15%.
 */
export function xirr(flows, guess = 0.1) {
  const sorted = [...flows].sort((a, b) => a.date - b.date);
  const hasPos = sorted.some(f => f.amount > 0);
  const hasNeg = sorted.some(f => f.amount < 0);
  if (!hasPos || !hasNeg) return NaN;

  // Newton-Raphson
  let rate = guess;
  for (let i = 0; i < 50; i++) {
    const f = npv(rate, sorted);
    const df = dNpv(rate, sorted);
    if (df === 0) break;
    const next = rate - f / df;
    if (!isFinite(next) || next <= -0.999999) break;
    if (Math.abs(next - rate) < 1e-9) return next;
    rate = next;
  }
  if (isFinite(rate) && Math.abs(npv(rate, sorted)) < 1e-3) return rate;

  // Bisection fallback: search a wide bracket for a sign change.
  let lo = -0.9999, hi = 10;
  let fLo = npv(lo, sorted), fHi = npv(hi, sorted);
  if (fLo * fHi > 0) {
    // widen / scan for a bracket
    const points = [];
    for (let r = -0.99; r <= 10; r += 0.05) points.push(r);
    let bracketed = false;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const fa = npv(a, sorted), fb = npv(b, sorted);
      if (fa === 0) return a;
      if (fa * fb < 0) { lo = a; hi = b; fLo = fa; fHi = fb; bracketed = true; break; }
    }
    if (!bracketed) return NaN;
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, sorted);
    if (Math.abs(fMid) < 1e-6 || (hi - lo) < 1e-9) return mid;
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; } else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}
