/* UI решателя балок: редактор пролётов, эпюры Q/M, прогиб, реакции. */
'use strict';

function diagChart(host, title, unit, X, Y, opts = {}) {
  const W = 960, H = 220, padL = 56, padR = 14, padT = 24, padB = 24;
  host.innerHTML = '';
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'geo-board' }, host);
  const x1 = Math.max(...X);
  let y0 = Math.min(...Y, 0), y1 = Math.max(...Y, 0);
  if (y1 - y0 < 1e-9) { y1 = 1; y0 = -1; }
  const pad = (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
  const SX = v => padL + v / x1 * (W - padL - padR);
  const SY = v => padT + (y1 - v) / (y1 - y0) * (H - padT - padB);
  for (let k = 0; k <= 4; k++) {
    const v = y0 + (y1 - y0) * k / 4;
    svgEl('line', { x1: padL, y1: SY(v), x2: W - padR, y2: SY(v), stroke: '#e7e5de' }, svg);
    const t = svgEl('text', { x: padL - 5, y: SY(v) + 3, 'text-anchor': 'end' }, svg);
    t.style.cssText = 'font:10px system-ui;fill:#8a8a92';
    t.textContent = fmt(v, Math.abs(y1 - y0) > 20 ? 0 : 2);
  }
  // нулевая линия и опоры
  svgEl('line', { x1: padL, y1: SY(0), x2: W - padR, y2: SY(0), stroke: '#6b6b74', 'stroke-width': 1.4 }, svg);
  for (const s of opts.sup || []) {
    svgEl('path', {
      d: `M ${SX(s)} ${SY(0)} l -6 10 l 12 0 z`,
      fill: '#fff', stroke: '#16161a', 'stroke-width': 1.2,
    }, svg);
  }
  // заливка эпюры к нулю + контур
  const pts = X.map((x, i) => SX(x).toFixed(1) + ',' + SY(Y[i]).toFixed(1));
  svgEl('polygon', {
    points: `${SX(X[0])},${SY(0)} ${pts.join(' ')} ${SX(x1)},${SY(0)}`,
    fill: opts.fill || 'rgba(21,94,117,.14)', stroke: 'none',
  }, svg);
  svgEl('polyline', {
    points: pts.join(' '), fill: 'none',
    stroke: opts.color || '#155e75', 'stroke-width': 2, 'stroke-linejoin': 'round',
  }, svg);
  const tt = svgEl('text', { x: padL, y: 14 }, svg);
  tt.style.cssText = 'font:600 12px system-ui;fill:#3a3a42';
  tt.textContent = `${title}, ${unit}`;
  // ховер
  const hl = svgEl('line', { y1: padT, y2: H - padB, stroke: '#155e75', opacity: 0 }, svg);
  const hd = svgEl('circle', { r: 3.6, fill: opts.color || '#155e75', opacity: 0 }, svg);
  const ht = svgEl('text', { opacity: 0 }, svg);
  ht.style.cssText = 'font:600 11px system-ui;fill:#16161a;paint-order:stroke;stroke:#ffffffdd;stroke-width:3px';
  svg.addEventListener('pointermove', ev => {
    const r = svg.getBoundingClientRect();
    const xv = (ev.clientX - r.left) / r.width * W;
    let bi = 0;
    for (let i = 0; i < X.length; i++) if (Math.abs(SX(X[i]) - xv) < Math.abs(SX(X[bi]) - xv)) bi = i;
    hl.setAttribute('x1', SX(X[bi])); hl.setAttribute('x2', SX(X[bi]));
    hd.setAttribute('cx', SX(X[bi])); hd.setAttribute('cy', SY(Y[bi]));
    ht.setAttribute('x', Math.min(SX(X[bi]) + 8, W - 130));
    ht.setAttribute('y', Math.max(SY(Y[bi]) - 8, padT + 10));
    ht.textContent = `x=${fmt(X[bi], 2)} м → ${fmt(Y[bi], 2)} ${unit}`;
    for (const e of [hl, hd, ht]) e.setAttribute('opacity', 1);
  });
  svg.addEventListener('pointerleave', () => { for (const e of [hl, hd, ht]) e.setAttribute('opacity', 0); });
}

/* схема балки с нагрузками */
function drawScheme(host, sup, spans) {
  const W = 960, H = 120, padL = 56, padR = 14, y = 78;
  host.innerHTML = '';
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'geo-board' }, host);
  const x1 = sup[sup.length - 1];
  const SX = v => padL + v / x1 * (W - padL - padR);
  svgEl('line', { x1: SX(0), y1: y, x2: SX(x1), y2: y, stroke: '#16161a', 'stroke-width': 3 }, svg);
  sup.forEach((s, i) => {
    svgEl('path', { d: `M ${SX(s)} ${y} l -7 12 l 14 0 z`, fill: '#fff', stroke: '#16161a', 'stroke-width': 1.3 }, svg);
    const t = svgEl('text', { x: SX(s), y: y + 26, 'text-anchor': 'middle' }, svg);
    t.style.cssText = 'font:10px system-ui;fill:#6b6b74';
    t.textContent = i;
  });
  let x0 = 0;
  spans.forEach(sp => {
    if (sp.q) {
      for (let k = 0; k <= 10; k++) {
        const x = x0 + k / 10 * sp.L;
        svgEl('line', { x1: SX(x), y1: y - 22, x2: SX(x), y2: y - 4, stroke: '#155e75', 'stroke-width': 1 }, svg);
      }
      svgEl('line', { x1: SX(x0), y1: y - 22, x2: SX(x0 + sp.L), y2: y - 22, stroke: '#155e75', 'stroke-width': 1.4 }, svg);
      const t = svgEl('text', { x: SX(x0 + sp.L / 2), y: y - 27, 'text-anchor': 'middle' }, svg);
      t.style.cssText = 'font:10px system-ui;fill:#155e75';
      t.textContent = `q=${sp.q}`;
    }
    if (sp.P) {
      const xa = x0 + clamp(sp.a, 0, sp.L);
      svgEl('line', { x1: SX(xa), y1: y - 42, x2: SX(xa), y2: y - 5, stroke: '#b3382e', 'stroke-width': 2.4 }, svg);
      svgEl('path', { d: `M ${SX(xa)} ${y - 4} l -5 -9 l 10 0 z`, fill: '#b3382e' }, svg);
      const t = svgEl('text', { x: SX(xa) + 4, y: y - 44, }, svg);
      t.style.cssText = 'font:10px system-ui;fill:#b3382e';
      t.textContent = `P=${sp.P}`;
    }
    const t = svgEl('text', { x: SX(x0 + sp.L / 2), y: y + 40, 'text-anchor': 'middle' }, svg);
    t.style.cssText = 'font:10.5px system-ui;fill:#3a3a42';
    t.textContent = `L=${sp.L} м`;
    x0 += sp.L;
  });
}

function renderSpanEditor() {
  const tb = document.getElementById('span-rows');
  tb.innerHTML = stB.spans.map((sp, i) => `
    <tr>
      <td>пролёт ${i + 1}</td>
      <td><input type="number" step="0.5" min="1" max="20" value="${sp.L}" data-i="${i}" data-k="L" style="width:64px"></td>
      <td><input type="number" step="1" min="0" max="500" value="${sp.q}" data-i="${i}" data-k="q" style="width:64px"></td>
      <td><input type="number" step="5" min="0" max="2000" value="${sp.P}" data-i="${i}" data-k="P" style="width:70px"></td>
      <td><input type="number" step="0.25" min="0" value="${sp.a}" data-i="${i}" data-k="a" style="width:64px"></td>
    </tr>`).join('');
  tb.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
    stB.spans[+inp.dataset.i][inp.dataset.k] = +inp.value || 0;
    recomputeBeam();
  }));
}

function beamSteps(d) {
  const sp = stB.spans, n = sp.length;
  const out = [];
  out.push('<h4 style="margin:8px 0 2px">Шаг 1. Грузовые члены пролётов</h4>');
  sp.forEach((s, i) => {
    const t = loadTerms(s);
    const parts = [];
    if (s.q) parts.push(`q: qL³/4 = ${s.q}·${s.L}³/4 = ${fmt(s.q * s.L ** 3 / 4, 1)}`);
    if (s.P) {
      const a = clamp(s.a, 0, s.L), b = s.L - a;
      parts.push(`P слева: Pa(L²−a²)/L = ${s.P}·${a}·(${s.L}²−${a}²)/${s.L} = ${fmt(s.P * a * (s.L * s.L - a * a) / s.L, 1)};
        справа: Pb(L²−b²)/L = ${fmt(s.P * b * (s.L * s.L - b * b) / s.L, 1)}`);
    }
    out.push(`<div style="font:13.5px system-ui;margin:3px 0">пролёт ${i + 1}: ${parts.join('; ') || 'нагрузки нет'} → 6B/L = ${fmt(t.right, 1)}, 6A/L = ${fmt(t.left, 1)} кН·м²</div>`);
  });
  if (n > 1) {
    out.push('<h4 style="margin:8px 0 2px">Шаг 2. Уравнения трёх моментов</h4>');
    for (let i = 0; i < n - 1; i++) {
      const Ll = sp[i].L, Lr = sp[i + 1].L;
      const tl = loadTerms(sp[i]), tr = loadTerms(sp[i + 1]);
      out.push(`<div style="font:13.5px system-ui;margin:3px 0">опора ${i + 1}:
        ${Ll}·M${i} + ${2 * (Ll + Lr)}·M${i + 1} + ${Lr}·M${i + 2} = −(${fmt(tl.right, 1)} + ${fmt(tr.left, 1)}) = ${fmt(-(tl.right + tr.left), 1)}</div>`);
    }
    out.push('<h4 style="margin:8px 0 2px">Шаг 3. Решение системы (прогонка)</h4>');
  } else {
    out.push('<h4 style="margin:8px 0 2px">Шаг 2–3. Один пролёт: опорные моменты нулевые</h4>');
  }
  out.push(`<div style="font:14px system-ui">${d.Ms.map((m, i) => `M<sub>${i}</sub> = <b>${fmt(m, 2)}</b>`).join('; ')} кН·м</div>`);
  out.push('<h4 style="margin:8px 0 2px">Шаг 4. Эпюры и реакции</h4>');
  out.push(`<div style="font:13.5px system-ui">M(x) = M_балочная(x) + M_лев·(1−x/L) + M_прав·(x/L);
    Q(x) = Q_балочная(x) + (M_прав − M_лев)/L; реакции — скачки Q:
    ${d.R.map((r, i) => `R<sub>${i}</sub>=${fmt(r, 1)}`).join(', ')} кН
    (ΣR = ${fmt(d.R.reduce((a, b) => a + b, 0), 1)} кН — сверьте с суммарной нагрузкой)</div>`);
  const el = document.getElementById('beam-steps');
  if (el) el.innerHTML = out.join('');
}

function recomputeBeam() {
  const d = diagrams();
  beamSteps(d);
  drawScheme(document.getElementById('b-scheme'), d.sup, stB.spans);
  diagChart(document.getElementById('c-Q'), 'Эпюра поперечных сил Q', 'кН', d.X, d.Q, { sup: d.sup });
  diagChart(document.getElementById('c-M'), 'Эпюра изгибающих моментов M', 'кН·м', d.X, d.M,
    { sup: d.sup, color: '#8a3d2c', fill: 'rgba(179,56,46,.12)' });
  diagChart(document.getElementById('c-v'), 'Прогиб v', 'мм', d.X, d.V.map(v => v * 1000),
    { sup: d.sup, color: '#1d7a3e', fill: 'rgba(29,122,62,.10)' });
  document.getElementById('react-out').innerHTML =
    d.R.map((r, i) => `R<sub>${i}</sub> = <b>${fmt(r, 2)}</b> кН`).join(' · ') +
    ` &nbsp;·&nbsp; опорные моменты: ` +
    d.Ms.map((m, i) => `M<sub>${i}</sub> = ${fmt(m, 2)}`).join(', ') + ' кН·м';
  const mmax = Math.max(...d.M.map(Math.abs));
  const vmax = Math.max(...d.V.map(Math.abs)) * 1000;
  document.getElementById('summary-out').innerHTML =
    `|M|<sub>max</sub> = <b>${fmt(mmax, 2)} кН·м</b> · |v|<sub>max</sub> = <b>${fmt(vmax, 2)} мм</b>` +
    ` (E = ${fmt(stB.E / 1e6, 0)} ГПа, I = ${fmt(stB.I * 1e8, 0)} см⁴)`;
}

document.getElementById('in-n').addEventListener('input', e => {
  const n = +e.target.value;
  document.getElementById('out-n').textContent = n;
  while (stB.spans.length < n) stB.spans.push({ L: 4, q: 15, P: 0, a: 2 });
  stB.spans.length = n;
  renderSpanEditor();
  recomputeBeam();
});
for (const [id, key, mul] of [['in-E', 'E', 1e6], ['in-I', 'I', 1e-8]]) {
  document.getElementById(id).addEventListener('input', e => {
    stB[key] = (+e.target.value || 1) * mul;
    recomputeBeam();
  });
}
renderSpanEditor();
recomputeBeam();
