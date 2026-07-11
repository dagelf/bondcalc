// Language detection + application. No dependencies, no build step.
// Precedence: ?lang= URL param > localStorage > navigator.language prefix match > default.

import { STRINGS, LOCALES, DEFAULT_LOCALE } from './strings.js';

let currentLocale = DEFAULT_LOCALE;

export function detectLocale() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('lang');
  if (fromUrl && LOCALES.includes(fromUrl)) return fromUrl;

  const stored = localStorage.getItem('bondcalc.lang');
  if (stored && LOCALES.includes(stored)) return stored;

  const nav = (navigator.language || '').slice(0, 2).toLowerCase();
  if (LOCALES.includes(nav)) return nav;

  return DEFAULT_LOCALE;
}

export function setLocale(locale) {
  currentLocale = LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
  localStorage.setItem('bondcalc.lang', currentLocale);
  document.documentElement.lang = currentLocale;
  applyToDom();
  return currentLocale;
}

export function getLocale() {
  return currentLocale;
}

/** t('key.path', {var: value}) — falls back to the key itself if missing (visible bug, not a crash). */
export function t(key, vars) {
  const dict = STRINGS[currentLocale] || STRINGS[DEFAULT_LOCALE];
  let str = dict[key] ?? STRINGS[DEFAULT_LOCALE][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, v);
    }
  }
  return str;
}

export function formatCurrency(amount, options = {}) {
  return new Intl.NumberFormat(currentLocale === 'af' ? 'af-ZA' : 'en-ZA', {
    style: 'currency', currency: 'ZAR', maximumFractionDigits: 0, ...options,
  }).format(amount);
}

export function formatPercent(fraction, digits = 1) {
  return new Intl.NumberFormat(currentLocale === 'af' ? 'af-ZA' : 'en-ZA', {
    style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(fraction);
}

export function formatDate(date) {
  return new Intl.DateTimeFormat(currentLocale === 'af' ? 'af-ZA' : 'en-ZA', {
    year: 'numeric', month: 'short', day: 'numeric',
  }).format(date);
}

/** Sweeps the DOM for data-i18n / data-i18n-placeholder / data-i18n-title attributes and applies t(). */
export function applyToDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
}

export { LOCALES };
