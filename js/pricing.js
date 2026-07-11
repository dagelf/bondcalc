// Live BTC/ZAR spot price, zero dependencies: native fetch + AbortController + localStorage.
// Used only to anchor the chart's t=0 BTC price and the "priced as of" credibility line — the
// model's forward return is always the user's chosen CAGR slider, never derived from live price
// (spec §1.2/§8.2: the tool must stay defensible with a BTC price feed of zero).
//
// Fallback chain: cached value (<1h old) -> Luno public ticker (ZA exchange, CORS-open, no key)
// -> CoinGecko simple price (CORS-open, no key) -> baked-in static fallback from data.js.

import { BTC_ZAR_FALLBACK } from './data.js';

const CACHE_KEY = 'bondcalc.btcZarSpot';
const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(entry) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...entry, fetchedAt: Date.now() }));
  } catch {
    // localStorage unavailable (private mode, quota) — degrade silently, live price just won't be cached.
  }
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFromLuno() {
  const json = await fetchWithTimeout('https://api.luno.com/api/1/ticker?pair=XBTZAR', FETCH_TIMEOUT_MS);
  const price = parseFloat(json.last_trade);
  if (!isFinite(price) || price <= 0) throw new Error('bad payload');
  return { price, source: 'Luno XBTZAR' };
}

async function fetchFromCoinGecko() {
  const json = await fetchWithTimeout('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=zar', FETCH_TIMEOUT_MS);
  const price = json?.bitcoin?.zar;
  if (!isFinite(price) || price <= 0) throw new Error('bad payload');
  return { price, source: 'CoinGecko' };
}

/**
 * @returns {Promise<{price: number, asOf: string, source: string, isLive: boolean}>}
 */
export async function getBtcZarSpot() {
  const cached = readCache();
  if (cached) return { ...cached, asOf: new Date(cached.fetchedAt).toISOString().slice(0, 10), isLive: true };

  for (const fetcher of [fetchFromLuno, fetchFromCoinGecko]) {
    try {
      const { price, source } = await fetcher();
      const entry = { price, source };
      writeCache(entry);
      return { ...entry, asOf: new Date().toISOString().slice(0, 10), isLive: true };
    } catch {
      continue; // try next source in the chain
    }
  }

  return { ...BTC_ZAR_FALLBACK, isLive: false };
}
