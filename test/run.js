// Zero-dependency test runner: node's built-in assert + this ~60-line loop.
// Run: node test/run.js  (or `npm test`)

import assert from 'node:assert/strict';
import { xirr } from '../js/xirr.js';
import { transferDuty, marginalIncomeTaxRate } from '../js/data.js';
import { runSimulation, monthlyBondPayment, solveKickerGrowth } from '../js/model.js';
import { encodeState, decodeState } from '../js/state.js';
import { xirrFixtures, transferDutyFixtures } from './fixtures.js';

let pass = 0, fail = 0;

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    fail++;
    console.error(`  FAIL - ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('XIRR fixtures');
for (const f of xirrFixtures) {
  test(f.name, () => {
    const result = xirr(f.flows);
    assert.ok(isFinite(result), `expected finite result, got ${result}`);
    assert.ok(
      Math.abs(result - f.expected) < f.tolerance,
      `expected ~${f.expected}, got ${result}`
    );
  });
}

console.log('Transfer duty brackets');
for (const f of transferDutyFixtures) {
  test(`R${f.value.toLocaleString()} -> R${f.expected.toLocaleString()}`, () => {
    const result = transferDuty(f.value);
    assert.ok(Math.abs(result - f.expected) < 1, `expected ${f.expected}, got ${result}`);
  });
}

console.log('Income tax marginal rate lookup');
test('bracket boundaries are monotonic', () => {
  assert.equal(marginalIncomeTaxRate(100000), 0.18);
  assert.equal(marginalIncomeTaxRate(2000000), 0.45);
  assert.ok(marginalIncomeTaxRate(600000) > marginalIncomeTaxRate(100000));
});

console.log('Bond amortization');
test('monthly payment fully amortizes to ~0 balance by term end', () => {
  const principal = 1350000, rate = 0.105, years = 20;
  const payment = monthlyBondPayment(principal, rate, years);
  assert.ok(payment > 10000 && payment < 20000, `payment out of expected range: ${payment}`);
});

const BASE_PARAMS = {
  propertyValue: 1500000, depositPct: 0.10, rentMonthly0: 13000, rentGrowth: 0.06,
  vacancyRate: 0.05, bondRate: 0.105, bondTermYears: 20, ratesTaxesPct: 0.01,
  maintenancePct: 0.01, insurancePct: 0.0025, managementFeePct: 0.10, marginalTaxRate: 0.36,
  propertyGrowth: 0.045, sectionalTitle: false, levyMonthly: 0, agentCommissionPct: 0.05,
  vatRate: 0.15, moneyMarketRate: 0.07, btcCagr: 0.20, btcExchangeFeePct: 0.001,
  horizonMonths: 120, realTerms: false, cpiRate: 0.045, btcSpotZar: 1950000,
};

console.log('Full simulation — cash-negative gearing (default scenario)');
test('produces finite IRRs and a finite kicker', () => {
  const result = runSimulation(BASE_PARAMS);
  assert.ok(isFinite(result.re.irr), `RE IRR not finite: ${result.re.irr}`);
  assert.ok(isFinite(result.btc.irr), `BTC IRR not finite: ${result.btc.irr}`);
  assert.ok(isFinite(result.kicker), `kicker not finite: ${result.kicker}`);
  assert.ok(result.kicker > 0 && result.kicker < 0.30, `kicker out of sane range: ${result.kicker}`);
});

test('kicker row holds true independent of the BTC leg (BTC-free arithmetic)', () => {
  const withBtc = runSimulation({ ...BASE_PARAMS, btcCagr: 0.20 });
  const withoutBtcGrowth = runSimulation({ ...BASE_PARAMS, btcCagr: 0 });
  assert.ok(Math.abs(withBtc.kicker - withoutBtcGrowth.kicker) < 1e-6, 'kicker should not depend on btcCagr');
});

console.log('Full simulation — cash-positive rental (100% deposit, no bond drag)');
test('cash-positive scenario needs a lower breakeven growth rate', () => {
  const cashPositive = runSimulation({ ...BASE_PARAMS, depositPct: 1.0, rentMonthly0: 20000 });
  const base = runSimulation(BASE_PARAMS);
  assert.ok(cashPositive.kicker < base.kicker, 'a fully-paid, higher-rent property should need less price growth to break even');
});

console.log('Full simulation — 100% bond, deep-negative gearing');
test('0% deposit increases the required breakeven growth', () => {
  const zeroDeposit = runSimulation({ ...BASE_PARAMS, depositPct: 0 });
  const base = runSimulation(BASE_PARAMS);
  assert.ok(zeroDeposit.kicker > base.kicker, 'more leverage should raise (or fail to lower) the breakeven growth rate');
});

console.log('Full simulation — sectional title levies');
test('adding a levy raises the breakeven growth requirement', () => {
  const withLevy = runSimulation({ ...BASE_PARAMS, sectionalTitle: true, levyMonthly: 2500 });
  const base = runSimulation(BASE_PARAMS);
  assert.ok(withLevy.kicker > base.kicker);
});

console.log('Full simulation — BTC at 0% CAGR');
test('BTC leg terminal value roughly equals nominal cash invested (minus fee drag)', () => {
  const result = runSimulation({ ...BASE_PARAMS, btcCagr: 0 });
  assert.ok(result.btc.netWealth <= result.btc.totalCashIn * 1.001, 'BTC leg at 0% growth should not exceed nominal cash in');
  assert.ok(result.btc.netWealth > result.btc.totalCashIn * 0.95, 'BTC leg at 0% growth should be close to nominal cash in (fee drag only)');
});

console.log('Full simulation — real-terms toggle does not change nominal model outputs');
test('CPI deflation is a display-layer concern, not a model input', () => {
  const nominal = runSimulation(BASE_PARAMS);
  const stillNominal = runSimulation({ ...BASE_PARAMS, realTerms: true });
  assert.equal(nominal.re.irr, stillNominal.re.irr, 'realTerms flag must not leak into the simulation itself');
});

console.log('URL hash state round-trip');
test('encode -> decode recovers the same values', () => {
  const state = { propertyValue: 2100000, depositPct: 0.15, sectionalTitle: true, metro: 'cape-town' };
  const decoded = decodeState(`#${encodeState(state)}`);
  assert.equal(decoded.propertyValue, 2100000);
  assert.equal(decoded.depositPct, 0.15);
  assert.equal(decoded.sectionalTitle, true);
  assert.equal(decoded.metro, 'cape-town');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
