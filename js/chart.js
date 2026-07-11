// Hand-rolled SVG charts. No charting library — it's two lines on a plane (spec §3).

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/**
 * Renders the net-wealth-over-time line chart into `container`.
 * @param {HTMLElement} container
 * @param {{month:number, reWealth:number, btcWealth:number}[]} series
 * @param {{btcBandLow:number[], btcBandHigh:number[]}} band - wealth series for the Bear/Half-of-history presets
 * @param {{logScale:boolean, labels:{re:string, btc:string, band:string}}} opts
 */
export function renderWealthChart(container, series, band, opts) {
  const width = 640, height = 340, pad = { top: 16, right: 16, bottom: 28, left: 64 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;

  const allValues = series.flatMap(d => [d.reWealth, d.btcWealth])
    .concat(band ? band.btcBandLow.concat(band.btcBandHigh) : []);
  const minRaw = Math.min(0, ...allValues);
  const maxRaw = Math.max(1, ...allValues);

  const toY = opts.logScale
    ? (v) => {
        const lo = Math.log10(Math.max(1, minRaw + Math.abs(minRaw) + 1));
        const hi = Math.log10(Math.max(10, maxRaw + Math.abs(minRaw) + 1));
        const val = Math.log10(Math.max(1, v + Math.abs(minRaw) + 1));
        return pad.top + plotH - ((val - lo) / (hi - lo || 1)) * plotH;
      }
    : (v) => pad.top + plotH - ((v - minRaw) / (maxRaw - minRaw || 1)) * plotH;

  const toX = (m) => pad.left + (m / series.length) * plotW;

  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', role: 'img' });
  svg.style.height = 'auto';
  svg.style.display = 'block';

  // axes
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const v = minRaw + (i / yTicks) * (maxRaw - minRaw);
    const y = toY(v);
    svg.appendChild(el('line', { x1: pad.left, x2: width - pad.right, y1: y, y2: y, stroke: '#e2e6ea', 'stroke-width': 1 }));
    const label = el('text', { x: pad.left - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#5a6472' });
    label.textContent = compactCurrency(v);
    svg.appendChild(label);
  }

  // uncertainty band
  if (band) {
    const points = series.map((d, i) => `${toX(i)},${toY(band.btcBandHigh[i])}`)
      .concat(series.slice().reverse().map((d, i) => `${toX(series.length - 1 - i)},${toY(band.btcBandLow[series.length - 1 - i])}`));
    svg.appendChild(el('polygon', { points: points.join(' '), fill: '#f7931a', 'fill-opacity': 0.12, stroke: 'none' }));
  }

  const linePath = (key, color) => {
    const points = series.map((d, i) => `${toX(i)},${toY(d[key])}`).join(' ');
    svg.appendChild(el('polyline', { points, fill: 'none', stroke: color, 'stroke-width': 2.5 }));
  };
  linePath('reWealth', '#0b3d63');
  linePath('btcWealth', '#f7931a');

  svg.appendChild(el('line', { x1: pad.left, x2: width - pad.right, y1: pad.top + plotH, y2: pad.top + plotH, stroke: '#b7bec7' }));

  container.innerHTML = '';
  container.appendChild(svg);

  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  legend.innerHTML = `
    <span><i style="background:#0b3d63"></i>${opts.labels.re}</span>
    <span><i style="background:#f7931a"></i>${opts.labels.btc}</span>
    ${band ? `<span><i style="background:#f7931a;opacity:.25"></i>${opts.labels.band}</span>` : ''}
  `;
  container.appendChild(legend);
}

/**
 * Renders the RE-leg waterfall as horizontal bars into `container`.
 * @param {HTMLElement} container
 * @param {{label:string, value:number}[]} items - largest-first is not required; sorted internally.
 */
export function renderWaterfall(container, items) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map(i => i.value));
  container.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'waterfall';
  for (const { label, value } of sorted) {
    const row = document.createElement('div');
    row.className = 'waterfall-row';
    const bar = document.createElement('div');
    bar.className = 'waterfall-bar';
    bar.style.width = `${Math.max(2, (value / max) * 100)}%`;
    const text = document.createElement('span');
    text.className = 'waterfall-label';
    text.textContent = label;
    const val = document.createElement('span');
    val.className = 'waterfall-value';
    val.textContent = compactCurrency(value);
    row.append(text, bar, val);
    list.appendChild(row);
  }
  container.appendChild(list);
}

function compactCurrency(v) {
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${sign}R${(abs / 1e6).toFixed(1)}m`;
  if (abs >= 1e3) return `${sign}R${(abs / 1e3).toFixed(0)}k`;
  return `${sign}R${abs.toFixed(0)}`;
}
