// Full input state round-trips through the URL hash — no backend needed for sharing (spec §2.1.4).
// Format: #k1=v1&k2=v2... using short keys to keep shared links compact.

const KEY_MAP = {
  propertyValue: 'pv', depositPct: 'dp', rentMonthly0: 'rm', rentGrowth: 'rg',
  vacancyRate: 'vc', bondRate: 'br', bondTermYears: 'bt', ratesTaxesPct: 'rt',
  maintenancePct: 'mp', insurancePct: 'ip', managementFeePct: 'mf', marginalTaxRate: 'tx',
  propertyGrowth: 'pg', metro: 'me', sectionalTitle: 'st', levyMonthly: 'lv',
  agentCommissionPct: 'ac', moneyMarketRate: 'mm', btcCagr: 'bc', btcExchangeFeePct: 'bf',
  horizonMonths: 'hm', realTerms: 'rl', cpiRate: 'cp', lang: 'lang',
};
const REVERSE_MAP = Object.fromEntries(Object.entries(KEY_MAP).map(([k, v]) => [v, k]));
const BOOL_KEYS = new Set(['sectionalTitle', 'realTerms']);
const NUMBER_KEYS = new Set(Object.keys(KEY_MAP).filter(k => !BOOL_KEYS.has(k) && k !== 'metro' && k !== 'lang'));

export function encodeState(inputs) {
  const parts = [];
  for (const [key, short] of Object.entries(KEY_MAP)) {
    if (!(key in inputs)) continue;
    const val = inputs[key];
    if (val === undefined || val === null) continue;
    parts.push(`${short}=${encodeURIComponent(BOOL_KEYS.has(key) ? (val ? 1 : 0) : val)}`);
  }
  return parts.join('&');
}

export function decodeState(hash) {
  const out = {};
  const clean = hash.replace(/^#/, '');
  if (!clean) return out;
  for (const pair of clean.split('&')) {
    const [short, rawVal] = pair.split('=');
    const key = REVERSE_MAP[short];
    if (!key || rawVal === undefined) continue;
    const val = decodeURIComponent(rawVal);
    if (BOOL_KEYS.has(key)) out[key] = val === '1';
    else if (NUMBER_KEYS.has(key)) out[key] = parseFloat(val);
    else out[key] = val;
  }
  return out;
}

export function pushState(inputs) {
  const encoded = encodeState(inputs);
  history.replaceState(null, '', `#${encoded}`);
}

export function readState() {
  return decodeState(location.hash);
}
