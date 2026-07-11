// Baked-in reference data. Regenerate with `node tools/build-data.mjs` (manual, monthly).
// Every figure here carries a source + effective date so the UI can show it inline.

export const DATA_EFFECTIVE_DATE = '2026-07-11';

// SARS transfer duty, individuals, tax year 2026/2027 (effective 1 April 2026, unchanged from 2025/26).
// Source: https://www.sars.gov.za/tax-rates/transfer-duty/
export const TRANSFER_DUTY_BRACKETS = [
  { upTo: 1210000, base: 0, rate: 0, above: 0 },
  { upTo: 1663800, base: 0, rate: 0.03, above: 1210000 },
  { upTo: 2329300, base: 13614, rate: 0.06, above: 1663800 },
  { upTo: 2994800, base: 53544, rate: 0.08, above: 2329300 },
  { upTo: 13310000, base: 106784, rate: 0.11, above: 2994800 },
  { upTo: Infinity, base: 1241456, rate: 0.13, above: 13310000 },
];

// SARS individual income tax brackets, tax year 2026/2027 (1 Mar 2026 - 28 Feb 2027).
// Source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/
export const INCOME_TAX_BRACKETS = [
  { upTo: 245100, base: 0, rate: 0.18, above: 0 },
  { upTo: 383100, base: 44118, rate: 0.26, above: 245100 },
  { upTo: 530200, base: 79998, rate: 0.31, above: 383100 },
  { upTo: 695800, base: 125599, rate: 0.36, above: 530200 },
  { upTo: 887000, base: 185215, rate: 0.39, above: 695800 },
  { upTo: 1878600, base: 259783, rate: 0.41, above: 887000 },
  { upTo: Infinity, base: 666339, rate: 0.45, above: 1878600 },
];
export const PRIMARY_REBATE_2027 = 17820;

// CGT: 40% inclusion rate for individuals, unchanged for 2026/27.
// Source: https://www.sars.gov.za/tax-rates/income-tax/capital-gains-tax-cgt/
export const CGT_INCLUSION_RATE_INDIVIDUAL = 0.40;
export const CGT_ANNUAL_EXCLUSION = 50000;

// Bond origination costs — regulated/typical SA convention. Initiation fee is NCA-capped;
// attorney bond-registration and transfer-attorney fees are conveyancing-tariff estimates
// (Law Society guideline scale), banded by property/loan value. These are the one line item
// in the model that is a genuine lookup table rather than a closed-form calc — flagged in the UI.
// Source: National Credit Act reg. 44 (initiation fee cap); typical conveyancer fee guides.
export function bondInitiationFee(loanAmount) {
  // NCA cap: R1,207.50 + 10% of amount above R10,000, capped at R6,037.50 (incl. VAT), 2024 gazette values.
  const fee = 1207.5 + 0.10 * Math.max(0, loanAmount - 10000);
  return Math.min(fee, 6037.5) * 1.15; // + VAT
}

function tieredFee(value, table) {
  for (const band of table) {
    if (value <= band.upTo) return band.base + band.rate * Math.max(0, value - band.above);
  }
  return 0;
}

// Approximate attorney fee bands (bond registration attorney + transfer attorney), including VAT,
// disbursements and deeds office fees. Indicative — actual conveyancer quotes vary by firm.
const ATTORNEY_FEE_BANDS = [
  { upTo: 500000, base: 12500, rate: 0, above: 0 },
  { upTo: 1000000, base: 12500, rate: 0.012, above: 500000 },
  { upTo: 2000000, base: 18500, rate: 0.010, above: 1000000 },
  { upTo: 5000000, base: 28500, rate: 0.008, above: 2000000 },
  { upTo: Infinity, base: 52500, rate: 0.006, above: 5000000 },
];
export function transferAttorneyFee(propertyValue) {
  return tieredFee(propertyValue, ATTORNEY_FEE_BANDS);
}
export function bondAttorneyFee(loanAmount) {
  return tieredFee(loanAmount, ATTORNEY_FEE_BANDS) * 0.75; // bond registration leg is typically ~75% of transfer leg
}

export function transferDuty(propertyValue) {
  return tieredFee(propertyValue, TRANSFER_DUTY_BRACKETS);
}

export function marginalIncomeTaxRate(taxableIncome) {
  const bracket = INCOME_TAX_BRACKETS.find(b => taxableIncome <= b.upTo) || INCOME_TAX_BRACKETS[INCOME_TAX_BRACKETS.length - 1];
  return bracket.rate;
}

// SA metro nominal house price CAGR, trailing 10-year, FNB House Price Index / Lightstone methodology.
// PLACEHOLDER figures pending live index licence — clearly labelled as such in the UI, user-overridable.
// Source: https://www.fnb.co.za/economics/#f_property (manual monthly refresh via tools/build-data.mjs)
export const METRO_CAGR = {
  'national': { label: 'National average', cagr: 0.045, source: 'FNB HPI, 10yr trailing (placeholder)' },
  'cape-town': { label: 'Cape Town', cagr: 0.072, source: 'FNB HPI, 10yr trailing (placeholder)' },
  'johannesburg': { label: 'Johannesburg', cagr: 0.028, source: 'FNB HPI, 10yr trailing (placeholder)' },
  'pretoria': { label: 'Pretoria', cagr: 0.035, source: 'FNB HPI, 10yr trailing (placeholder)' },
  'durban': { label: 'Durban / eThekwini', cagr: 0.038, source: 'FNB HPI, 10yr trailing (placeholder)' },
  'port-elizabeth': { label: 'Gqeberha / Nelson Mandela Bay', cagr: 0.033, source: 'FNB HPI, 10yr trailing (placeholder)' },
};

// BTC/USD annual close, for the historical reference line only (never used as a default forward
// assumption — see spec §8.2). Sparse yearly series is enough for a reference line.
// Source: https://www.coindesk.com/price/bitcoin/ (manual monthly refresh)
export const BTC_USD_ANNUAL_CLOSE = {
  2016: 963, 2017: 13880, 2018: 3742, 2019: 7193, 2020: 28994,
  2021: 46306, 2022: 16547, 2023: 42258, 2024: 93429, 2025: 103000,
};

// Static fallback spot price, used only if the live pricing fetch (js/pricing.js) fails entirely.
export const BTC_ZAR_FALLBACK = { price: 1950000, asOf: '2026-07-01', source: 'static fallback, refreshed monthly' };
