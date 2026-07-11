// Core arithmetic: leveraged RE leg vs. symmetric BTC-DCA leg, monthly simulation.
// No dependencies. See methodology.html for the full assumption list and sources.

import { xirr } from './xirr.js';
import {
  transferDuty, bondInitiationFee, transferAttorneyFee, bondAttorneyFee,
  marginalIncomeTaxRate, CGT_INCLUSION_RATE_INDIVIDUAL, CGT_ANNUAL_EXCLUSION,
} from './data.js';

const MONTHS_PER_YEAR = 12;

/** Standard annuity monthly payment for a loan. */
export function monthlyBondPayment(principal, annualRate, termYears) {
  const n = termYears * MONTHS_PER_YEAR;
  const i = annualRate / MONTHS_PER_YEAR;
  if (i === 0) return principal / n;
  return principal * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
}

/** Full amortization schedule: array of {interest, principal, balance} per month, length = horizonMonths (may end before payoff). */
function amortizationSchedule(principal, annualRate, termYears, horizonMonths) {
  const payment = monthlyBondPayment(principal, annualRate, termYears);
  const i = annualRate / MONTHS_PER_YEAR;
  let balance = principal;
  const rows = [];
  for (let m = 0; m < horizonMonths; m++) {
    const interest = balance * i;
    let principalPortion = payment - interest;
    if (principalPortion > balance) principalPortion = balance;
    balance = Math.max(0, balance - principalPortion);
    rows.push({ interest, principal: principalPortion, payment: interest + principalPortion, balance });
  }
  return rows;
}

function upfrontCosts(propertyValue, loanAmount) {
  const duty = transferDuty(propertyValue);
  const transferAttorney = transferAttorneyFee(propertyValue);
  const bondAttorney = bondAttorneyFee(loanAmount);
  const initiation = bondInitiationFee(loanAmount);
  return { duty, transferAttorney, bondAttorney, initiation, total: duty + transferAttorney + bondAttorney + initiation };
}

/**
 * Runs the full RE-vs-BTC simulation for a given input set.
 * @param {object} p - see DEFAULT_INPUTS in main.js for the full shape.
 * @returns {object} { re, btc, kicker, months }
 */
export function runSimulation(p) {
  const H = p.horizonMonths;
  const loanAmount = p.propertyValue * (1 - p.depositPct);
  const deposit = p.propertyValue * p.depositPct;
  const costs = upfrontCosts(p.propertyValue, loanAmount);
  const upfront = deposit + costs.total;

  const schedule = amortizationSchedule(loanAmount, p.bondRate, p.bondTermYears, H);

  const reFlows = [{ date: monthDate(0), amount: -upfront }];
  const btcFlows = [{ date: monthDate(0), amount: -upfront }];

  let reBank = 0;           // surplus RE cash, compounding at money-market rate
  const btcPrice0 = p.btcSpotZar;
  let btcUnits = (upfront * (1 - p.btcExchangeFeePct)) / btcPrice0; // t=0 buy, identical capital to the RE leg
  let btcCostBasis = upfront;
  const series = [];        // for charting: { month, reWealth, btcWealth }

  let propertyValue = p.propertyValue;
  let cumInterest = 0, cumRates = 0, cumMaintenance = 0, cumInsurance = 0,
      cumLevies = 0, cumManagement = 0, cumIncomeTax = 0;

  for (let m = 0; m < H; m++) {
    const year = Math.floor(m / MONTHS_PER_YEAR);
    propertyValue = p.propertyValue * Math.pow(1 + p.propertyGrowth, m / MONTHS_PER_YEAR);

    const rentGross = p.rentMonthly0 * Math.pow(1 + p.rentGrowth, year) * (1 - p.vacancyRate);
    const management = rentGross * p.managementFeePct;
    const netRentBeforeTax = rentGross - management;

    const rates = (p.ratesTaxesPct / MONTHS_PER_YEAR) * propertyValue;
    const maintenance = (p.maintenancePct / MONTHS_PER_YEAR) * propertyValue;
    const insurance = (p.insurancePct / MONTHS_PER_YEAR) * propertyValue;
    const levies = p.sectionalTitle ? p.levyMonthly : 0;

    const bondRow = schedule[m];
    const taxableRentalIncome = netRentBeforeTax - rates - maintenance - insurance - levies - bondRow.interest;
    const incomeTax = taxableRentalIncome * p.marginalTaxRate; // can be negative (offsets other income)

    const cashOut = management + bondRow.payment + rates + maintenance + insurance + levies + incomeTax;
    const netCashflow = rentGross - cashOut;

    cumInterest += bondRow.interest; cumRates += rates; cumMaintenance += maintenance;
    cumInsurance += insurance; cumLevies += levies; cumManagement += management; cumIncomeTax += incomeTax;

    reBank *= 1 + p.moneyMarketRate / MONTHS_PER_YEAR;

    const btcPrice = btcPrice0 * Math.pow(1 + p.btcCagr, (m + 1) / MONTHS_PER_YEAR);

    if (netCashflow < 0) {
      const shortfall = -netCashflow;
      reFlows.push({ date: monthDate(m + 1), amount: -shortfall });
      btcFlows.push({ date: monthDate(m + 1), amount: -shortfall });
      const invested = shortfall * (1 - p.btcExchangeFeePct);
      btcUnits += invested / btcPrice;
      btcCostBasis += shortfall;
    } else if (netCashflow > 0) {
      reBank += netCashflow;
    }

    series.push({
      month: m + 1,
      reWealth: reMarkToMarket(propertyValue, bondRow.balance, reBank, p, costs),
      btcWealth: btcUnits * btcPrice,
    });
  }

  const finalBondBalance = schedule.length ? schedule[schedule.length - 1].balance : loanAmount;
  const finalBtcPrice = btcPrice0 * Math.pow(1 + p.btcCagr, H / MONTHS_PER_YEAR);

  const reTerminal = settleRealEstate(propertyValue, finalBondBalance, reBank, p, costs);
  reFlows.push({ date: monthDate(H), amount: reTerminal.netProceeds + reBank });

  const btcGrossValue = btcUnits * finalBtcPrice;
  const btcGain = Math.max(0, btcGrossValue - btcCostBasis);
  const btcTaxableGain = Math.max(0, btcGain - CGT_ANNUAL_EXCLUSION) * CGT_INCLUSION_RATE_INDIVIDUAL;
  const btcCgt = btcTaxableGain * p.marginalTaxRate;
  const btcTerminal = btcGrossValue - btcCgt;
  btcFlows.push({ date: monthDate(H), amount: btcTerminal });

  const reIrr = xirr(reFlows);
  const btcIrr = xirr(btcFlows);

  const totalCashInRE = upfront + reFlows.slice(1, -1).filter(f => f.amount < 0).reduce((s, f) => s - f.amount, 0);
  const totalCashInBtc = totalCashInRE; // identical by construction

  return {
    months: H,
    re: {
      irr: reIrr,
      netWealth: reTerminal.netProceeds + reBank,
      totalCashIn: totalCashInRE,
      propertyValueFinal: propertyValue,
      bondBalanceFinal: finalBondBalance,
      reBank,
      waterfall: {
        interest: cumInterest, rates: cumRates, maintenance: cumMaintenance,
        insurance: cumInsurance, levies: cumLevies, management: cumManagement,
        incomeTax: cumIncomeTax, agentCommission: reTerminal.commission, cgt: reTerminal.cgt,
        upfrontCosts: costs.total,
      },
      costs,
    },
    btc: {
      irr: btcIrr,
      netWealth: btcTerminal,
      totalCashIn: totalCashInBtc,
      grossValue: btcGrossValue,
      cgt: btcCgt,
      units: btcUnits,
    },
    series,
    kicker: solveKickerGrowth(p),
  };
}

function reMarkToMarket(propertyValue, bondBalance, reBank, p, costs) {
  const settled = settleRealEstate(propertyValue, bondBalance, reBank, p, costs);
  return settled.netProceeds + reBank;
}

function settleRealEstate(propertyValue, bondBalance, reBank, p, costs) {
  const commission = propertyValue * p.agentCommissionPct * (1 + p.vatRate);
  const proceeds = propertyValue - commission;
  const baseCost = p.propertyValue + costs.duty + costs.transferAttorney;
  const capitalGain = Math.max(0, proceeds - baseCost);
  const taxableGain = Math.max(0, capitalGain - CGT_ANNUAL_EXCLUSION) * CGT_INCLUSION_RATE_INDIVIDUAL;
  const cgt = taxableGain * p.marginalTaxRate;
  const netProceeds = proceeds - cgt - bondBalance;
  return { commission, proceeds, capitalGain, cgt, netProceeds };
}

/**
 * Solves for the property price CAGR at which the RE leg's own money-weighted return is exactly 0%
 * — i.e. break-even after all carry costs, taxes and transaction costs. Pure RE arithmetic; does not
 * reference the BTC leg at all (spec §1.3 / §8.2: must survive with Bitcoin removed from the page).
 */
export function solveKickerGrowth(p, tolerance = 1e-5) {
  // At very low growth the property can end up underwater (sale proceeds don't cover the
  // outstanding bond), which makes every cash flow negative — XIRR has no real root there.
  // Treat that as "worse than any finite IRR" so bisection still has a sign to work with.
  const irrAtGrowth = (growth) => {
    const flows = reFlowsOnly({ ...p, propertyGrowth: growth });
    const result = xirr(flows);
    if (isFinite(result)) return result;
    const netNominal = flows.reduce((sum, f) => sum + f.amount, 0);
    return netNominal < 0 ? -1 : 1;
  };
  let lo = -0.5, hi = 1.0;
  let fLo = irrAtGrowth(lo), fHi = irrAtGrowth(hi);
  if (fLo > 0) return lo;   // breaks even even at -50% price growth (deeply cash-positive deal)
  if (fHi < 0) return NaN;  // no growth rate in [-50%, 100%] makes this deal break even
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const fMid = irrAtGrowth(mid);
    if (Math.abs(fMid) < tolerance || (hi - lo) < 1e-7) return mid;
    if (fMid < 0) { lo = mid; fLo = fMid; } else { hi = mid; fHi = fMid; }
  }
  return (lo + hi) / 2;
}

/** Cash-flow vector for the RE leg only (used by the kicker solver — no BTC dependency). */
function reFlowsOnly(p) {
  const H = p.horizonMonths;
  const loanAmount = p.propertyValue * (1 - p.depositPct);
  const deposit = p.propertyValue * p.depositPct;
  const costs = upfrontCosts(p.propertyValue, loanAmount);
  const upfront = deposit + costs.total;
  const schedule = amortizationSchedule(loanAmount, p.bondRate, p.bondTermYears, H);
  const flows = [{ date: monthDate(0), amount: -upfront }];
  let reBank = 0;
  let propertyValue = p.propertyValue;
  for (let m = 0; m < H; m++) {
    const year = Math.floor(m / MONTHS_PER_YEAR);
    propertyValue = p.propertyValue * Math.pow(1 + p.propertyGrowth, m / MONTHS_PER_YEAR);
    const rentGross = p.rentMonthly0 * Math.pow(1 + p.rentGrowth, year) * (1 - p.vacancyRate);
    const management = rentGross * p.managementFeePct;
    const netRentBeforeTax = rentGross - management;
    const rates = (p.ratesTaxesPct / MONTHS_PER_YEAR) * propertyValue;
    const maintenance = (p.maintenancePct / MONTHS_PER_YEAR) * propertyValue;
    const insurance = (p.insurancePct / MONTHS_PER_YEAR) * propertyValue;
    const levies = p.sectionalTitle ? p.levyMonthly : 0;
    const bondRow = schedule[m];
    const taxableRentalIncome = netRentBeforeTax - rates - maintenance - insurance - levies - bondRow.interest;
    const incomeTax = taxableRentalIncome * p.marginalTaxRate;
    const cashOut = management + bondRow.payment + rates + maintenance + insurance + levies + incomeTax;
    const netCashflow = rentGross - cashOut;
    reBank *= 1 + p.moneyMarketRate / MONTHS_PER_YEAR;
    if (netCashflow < 0) flows.push({ date: monthDate(m + 1), amount: netCashflow });
    else if (netCashflow > 0) reBank += netCashflow;
  }
  const finalBondBalance = schedule.length ? schedule[schedule.length - 1].balance : loanAmount;
  const settled = settleRealEstate(propertyValue, finalBondBalance, reBank, p, costs);
  flows.push({ date: monthDate(H), amount: settled.netProceeds + reBank });
  return flows;
}

function monthDate(m) {
  const d = new Date(Date.UTC(2000, 0, 1));
  d.setUTCMonth(d.getUTCMonth() + m);
  return d;
}

export { marginalIncomeTaxRate };
