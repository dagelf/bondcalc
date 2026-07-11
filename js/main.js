import { runSimulation } from './model.js';
import { xirr } from './xirr.js';
import { t, setLocale, detectLocale, formatCurrency, formatPercent, formatDate, applyToDom, LOCALES } from './i18n.js';
import { getBtcZarSpot } from './pricing.js';
import { renderWealthChart, renderWaterfall } from './chart.js';
import { encodeState, readState, pushState } from './state.js';
import { METRO_CAGR, BTC_ZAR_FALLBACK, DATA_EFFECTIVE_DATE } from './data.js';

const DEFAULT_INPUTS = {
  propertyValue: 1500000,
  depositPct: 0.10,
  rentMonthly0: 11000,
  rentGrowth: 0.06,
  vacancyRate: 0.05,
  bondRate: 0.105,
  bondTermYears: 20,
  ratesTaxesPct: 0.01,
  maintenancePct: 0.01,
  insurancePct: 0.0025,
  managementFeePct: 0.10,
  marginalTaxRate: 0.36,
  propertyGrowth: METRO_CAGR.national.cagr,
  metro: 'national',
  sectionalTitle: false,
  levyMonthly: 2500,
  agentCommissionPct: 0.05,
  vatRate: 0.15,
  moneyMarketRate: 0.07,
  btcCagr: 0.20,
  btcExchangeFeePct: 0.001,
  horizonMonths: 120,
  realTerms: false,
  cpiRate: 0.045,
};

const BTC_PRESETS = { bear: 0, gold: 0.08, half: 0.25 };

let inputs = { ...DEFAULT_INPUTS };
let btcSpot = { ...BTC_ZAR_FALLBACK, isLive: false };

function currentParams() {
  return { ...inputs, btcSpotZar: btcSpot.price, vatRate: inputs.vatRate ?? 0.15 };
}

function render() {
  const result = runSimulation(currentParams());
  const bearSeries = runSimulation({ ...currentParams(), btcCagr: BTC_PRESETS.bear }).series;
  const halfSeries = runSimulation({ ...currentParams(), btcCagr: BTC_PRESETS.half }).series;

  const deflate = inputs.realTerms
    ? (v, m) => v / Math.pow(1 + inputs.cpiRate, m / 12)
    : (v) => v;

  document.getElementById('re-irr').textContent = isFinite(result.re.irr) ? formatPercent(result.re.irr) : '—';
  document.getElementById('btc-irr').textContent = isFinite(result.btc.irr) ? formatPercent(result.btc.irr) : '—';

  const kickerEl = document.getElementById('kicker');
  kickerEl.textContent = isFinite(result.kicker)
    ? t('results.kicker', { rate: formatPercent(result.kicker) })
    : t('results.kickerUndefined');

  const series = result.series.map((d, i) => ({
    month: d.month,
    reWealth: deflate(d.reWealth, d.month),
    btcWealth: deflate(d.btcWealth, d.month),
  }));
  const band = {
    btcBandLow: bearSeries.map((d, i) => deflate(Math.min(d.btcWealth, halfSeries[i].btcWealth), d.month)),
    btcBandHigh: bearSeries.map((d, i) => deflate(Math.max(d.btcWealth, halfSeries[i].btcWealth), d.month)),
  };

  renderWealthChart(document.getElementById('chart'), series, band, {
    logScale: document.getElementById('log-scale')?.checked ?? false,
    labels: { re: t('chart.re'), btc: t('chart.btc'), band: t('chart.btcBand') },
  });

  const wf = result.re.waterfall;
  renderWaterfall(document.getElementById('waterfall'), [
    { label: t('waterfall.interest'), value: wf.interest },
    { label: t('waterfall.rates'), value: wf.rates },
    { label: t('waterfall.maintenance'), value: wf.maintenance },
    { label: t('waterfall.insurance'), value: wf.insurance },
    { label: t('waterfall.levies'), value: wf.levies },
    { label: t('waterfall.management'), value: wf.management },
    { label: t('waterfall.incomeTax'), value: Math.max(0, wf.incomeTax) },
    { label: t('waterfall.agentCommission'), value: wf.agentCommission },
    { label: t('waterfall.cgt'), value: wf.cgt },
    { label: t('waterfall.upfrontCosts'), value: wf.upfrontCosts },
  ]);
  document.getElementById('waterfall-title').textContent = t('waterfall.title', { years: Math.round(inputs.horizonMonths / 12) });

  document.getElementById('pricing-line').textContent = t('pricing.asOf', {
    price: formatCurrency(btcSpot.price), date: formatDate(new Date(btcSpot.asOf)), source: btcSpot.source,
  }) + (btcSpot.isLive ? '' : ` — ${t('pricing.stale')}`);

  pushState({ ...inputs, lang: undefined });
}

function bindInput(id, key, transform = (v) => parseFloat(v)) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    inputs[key] = transform(el.type === 'checkbox' ? el.checked : el.value);
    syncDependentDefaults(key);
    render();
  });
}

function syncDependentDefaults(changedKey) {
  if (changedKey === 'metro') {
    inputs.propertyGrowth = METRO_CAGR[inputs.metro]?.cagr ?? inputs.propertyGrowth;
    const growthEl = document.getElementById('propertyGrowth');
    if (growthEl) growthEl.value = inputs.propertyGrowth;
  }
}

function populateInputsFromState() {
  const fromHash = readState();
  inputs = { ...DEFAULT_INPUTS, ...fromHash };
  for (const [key, val] of Object.entries(inputs)) {
    const el = document.getElementById(key);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!val;
    else el.value = val;
  }
  const horizonEl = document.getElementById('horizonYears');
  if (horizonEl) horizonEl.value = inputs.horizonMonths / 12;
}

function wireBtcPresets() {
  document.querySelectorAll('[data-btc-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-btc-preset');
      inputs.btcCagr = BTC_PRESETS[preset];
      document.getElementById('btcCagr').value = inputs.btcCagr;
      render();
    });
  });
}

function wireShare() {
  document.getElementById('copy-link')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(location.href);
    const status = document.getElementById('share-status');
    status.textContent = t('share.copied');
    setTimeout(() => (status.textContent = ''), 2000);
  });
}

function wireLangSwitcher() {
  const select = document.getElementById('lang-select');
  if (!select) return;
  select.innerHTML = LOCALES.map(l => `<option value="${l}">${l.toUpperCase()}</option>`).join('');
  select.value = detectLocale();
  select.addEventListener('change', () => {
    setLocale(select.value);
    render();
  });
}

async function init() {
  setLocale(detectLocale());
  populateInputsFromState();
  wireLangSwitcher();
  wireBtcPresets();
  wireShare();

  [
    'propertyValue', 'depositPct', 'rentMonthly0', 'rentGrowth', 'vacancyRate', 'bondRate',
    'bondTermYears', 'ratesTaxesPct', 'maintenancePct', 'insurancePct', 'managementFeePct',
    'marginalTaxRate', 'propertyGrowth', 'levyMonthly', 'agentCommissionPct', 'moneyMarketRate',
    'btcCagr', 'btcExchangeFeePct', 'cpiRate',
  ].forEach(key => bindInput(key, key));
  bindInput('metro', 'metro', (v) => v);
  bindInput('sectionalTitle', 'sectionalTitle', (v) => !!v);
  bindInput('realTerms', 'realTerms', (v) => !!v);
  document.getElementById('log-scale')?.addEventListener('input', render);

  document.getElementById('horizonYears')?.addEventListener('input', (e) => {
    inputs.horizonMonths = Math.round(parseFloat(e.target.value) * 12);
    render();
  });

  document.getElementById('metro')?.replaceChildren(
    ...Object.entries(METRO_CAGR).map(([key, m]) => {
      const opt = document.createElement('option');
      opt.value = key; opt.textContent = m.label;
      return opt;
    })
  );
  const metroEl = document.getElementById('metro');
  if (metroEl) metroEl.value = inputs.metro;

  applyToDom();
  document.getElementById('data-effective-date').textContent = DATA_EFFECTIVE_DATE;

  render(); // instant render with fallback price — no blank state (spec §8.3)

  btcSpot = await getBtcZarSpot();
  render(); // re-render once live price resolves
}

document.addEventListener('DOMContentLoaded', init);

// Exposed for the node test runner / debugging in-browser console.
export { runSimulation, xirr, DEFAULT_INPUTS };
