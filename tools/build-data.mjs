#!/usr/bin/env node
// Manual, monthly data refresh (spec §3: "a tiny `make data` script, run manually monthly").
// Zero dependencies — native fetch only. Run: node tools/build-data.mjs
//
// This does NOT touch tax brackets/CGT/transfer duty automatically (those need a human to read
// the SARS gazette and confirm the effective date — see js/data.js). It refreshes the two feeds
// that are safe to pull mechanically: the BTC/ZAR fallback spot price and the BTC/USD annual
// close used for the historical reference line. After running, review the diff in js/data.js
// before committing — this script prints suggested values, it does not write the file for you.

async function main() {
  console.log('Fetching current BTC/ZAR spot (for BTC_ZAR_FALLBACK)...');
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=zar');
    const json = await res.json();
    const price = json?.bitcoin?.zar;
    const today = new Date().toISOString().slice(0, 10);
    console.log(`  BTC_ZAR_FALLBACK = { price: ${Math.round(price)}, asOf: '${today}', source: 'static fallback, refreshed monthly' };`);
  } catch (err) {
    console.error('  Failed to fetch BTC/ZAR spot:', err.message);
  }

  console.log('\nReminders for the parts of js/data.js that need a human:');
  console.log('  - TRANSFER_DUTY_BRACKETS / INCOME_TAX_BRACKETS / CGT_* — check sars.gov.za for the current tax year.');
  console.log('  - METRO_CAGR — needs a licensed FNB HPI / Lightstone feed; currently placeholder figures.');
  console.log('  - BTC_USD_ANNUAL_CLOSE — append the just-completed calendar year once it closes.');
  console.log('  - Bump DATA_EFFECTIVE_DATE to today once the above is reviewed.');
}

main();
