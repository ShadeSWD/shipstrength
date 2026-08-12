/* Эквивалентный брус: общая продольная прочность корпуса.
 * Сечение задаётся элементами (площадь, отстояние от ОЛ); моменты — на тихой
 * воде (ввод) и волновые по IACS UR S11. Единицы: м, см², кН·м, МПа. */
'use strict';

const stBr = {
  L: 100, B: 16, Cb: 0.7, Msw: 180000, // кН·м (тихая вода, перегиб +)
  // kind: 'h' — горизонтальная связь (лист на высоте z), 'v' — вертикальная
  // (стенка высотой hgt с центром на z; учитывается собственный момент инерции)
  els: [
    { name: 'Палуба (настил)', A: 1900, z: 9.55, kind: 'h' },
    { name: 'Продольные рёбра палубы', A: 600, z: 9.3, kind: 'h' },
    { name: 'Ширстрек', A: 900, z: 8.9, kind: 'v', hgt: 1.4 },
    { name: 'Борт (обшивка)', A: 1500, z: 5.0, kind: 'v', hgt: 6.4 },
    { name: 'Скуловой пояс', A: 700, z: 0.9, kind: 'v', hgt: 1.6 },
    { name: 'Настил второго дна', A: 1700, z: 1.5, kind: 'h' },
    { name: 'Продольные рёбра днища', A: 800, z: 0.35, kind: 'h' },
    { name: 'Днище (обшивка)', A: 2000, z: 0.05, kind: 'h' },
  ],
};

function brusCompute() {
  let A = 0, Sz = 0;
  for (const e of stBr.els) { A += e.A; Sz += e.A * e.z; }
  const z0 = Sz / A; // нейтральная ось от ОЛ
  let I = 0, Iown = 0;
  for (const e of stBr.els) {
    I += e.A * 1e-4 * (e.z - z0) ** 2; // переносная часть, м⁴
    if (e.kind === 'v' && e.hgt) Iown += e.A * 1e-4 * e.hgt ** 2 / 12; // собственный
  }
  I += Iown;
  const zTop = Math.max(...stBr.els.map(e => e.z));
  const Wd = I / (zTop - z0);   // м³ (палуба)
  const Wb = I / z0;            // м³ (днище)
  // волновые моменты IACS UR S11 (кН·м)
  const L = stBr.L, B = stBr.B, Cb = Math.max(stBr.Cb, 0.6);
  // волновой коэффициент по Правилам РМРС ч. II, п. 1.3.1.4 (= IACS)
  const C = L <= 90 ? 0.0856 * L : (L < 300 ? 10.75 - ((300 - L) / 100) ** 1.5 : 10.75);
  const Mw_hog = 190 * C * L * L * B * Cb * 1e-3;
  const Mw_sag = -110 * C * L * L * B * (Cb + 0.7) * 1e-3;
  // минимальный момент сопротивления на миделе (РМРС 1.4.6.7-1), см³ → м³
  const Wmin = C * B * L * L * (Cb + 0.7) * 1e-6;
  return { A, z0, I, Iown, Wd, Wb, zTop, C, Mw_hog, Mw_sag, Wmin };
}

function stepLine(formula, subst, result) {
  return `<div style="margin:5px 0;font:14px system-ui"><span style="color:#3a3a42">${formula}</span>` +
    (subst ? ` = <span style="color:#6b6b74">${subst}</span>` : '') +
    ` = <b>${result}</b></div>`;
}

function brusRender() {
  const r = brusCompute();
  // таблица элементов (редактируемая)
  const tb = document.getElementById('els-rows');
  tb.innerHTML = stBr.els.map((e, i) => `
    <tr>
      <td>${e.name} <span class="small">${e.kind === 'v' ? '(верт., h=' + e.hgt + ' м)' : '(гориз.)'}</span></td>
      <td><input type="number" min="0" step="50" value="${e.A}" data-i="${i}" data-k="A" style="width:78px"></td>
      <td><input type="number" min="0" max="12" step="0.05" value="${e.z}" data-i="${i}" data-k="z" style="width:70px"></td>
      <td class="small">${fmt(e.A * 1e-4 * (e.z - r.z0) ** 2, 2)} м⁴</td>
    </tr>`).join('');
  tb.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
    stBr.els[+inp.dataset.i][inp.dataset.k] = +inp.value || 0;
    brusRender();
  }));

  const Mtot_h = stBr.Msw + r.Mw_hog;              // перегиб
  const Mtot_s = -Math.abs(stBr.Msw) * 0.7 + r.Mw_sag; // прогиб (условно)
  const sDeck_h = Mtot_h / r.Wd / 1000;  // МПа
  const sBott_h = Mtot_h / r.Wb / 1000;
  const sDeck_s = Math.abs(Mtot_s) / r.Wd / 1000;
  const sBott_s = Math.abs(Mtot_s) / r.Wb / 1000;
  const allow = 175; // МПа (сталь НТ, k=1, IACS)
  const rows = [
    ['Перегиб: палуба', sDeck_h], ['Перегиб: днище', sBott_h],
    ['Прогиб: палуба', sDeck_s], ['Прогиб: днище', sBott_s],
  ];
  document.getElementById('brus-out').innerHTML = `
    <tr><td>Суммарная площадь</td><td>${fmt(r.A, 0)} см²</td></tr>
    <tr><td>Нейтральная ось от ОЛ</td><td>${fmt(r.z0, 2)} м</td></tr>
    <tr><td>Момент инерции I (в т.ч. собственный верт. стенок ${fmt(r.Iown, 2)})</td><td>${fmt(r.I, 2)} м⁴</td></tr>
    <tr><td>W палубы / W днища</td><td>${fmt(r.Wd, 2)} / ${fmt(r.Wb, 2)} м³</td></tr>
    <tr><td>Волновой коэффициент C</td><td>${fmt(r.C, 2)}</td></tr>
    <tr><td>M волновой (перегиб / прогиб)</td>
        <td>${fmt(r.Mw_hog / 1000, 0)} / ${fmt(r.Mw_sag / 1000, 0)} МН·м</td></tr>
    <tr><td>Минимальный W по Правилам (1.4.6.7)</td>
        <td>${fmt(r.Wmin, 2)} м³ — фактический ${fmt(Math.min(r.Wd, r.Wb), 2)} м³
        <span class="badge ${Math.min(r.Wd, r.Wb) >= r.Wmin ? 'ok' : 'bad'}">${Math.min(r.Wd, r.Wb) >= r.Wmin ? 'достаточно' : 'МАЛО'}</span></td></tr>`;
  document.getElementById('brus-sigma').innerHTML = rows.map(([n, s]) => `
    <tr><td>${n}</td><td>${fmt(s, 0)} МПа</td>
    <td><span class="badge ${s <= allow ? 'ok' : 'bad'}">${s <= allow ? '≤ 175 МПа' : 'ПРЕВЫШЕНИЕ'}</span></td></tr>`).join('');

  // эскиз сечения: горизонтальные связи — полосами по ширине,
  // вертикальные — стенками по бортам, толщина линии ∝ площади
  // --- решение по шагам с подстановками ---
  const L = stBr.L, Bw = stBr.B, Cb = Math.max(stBr.Cb, 0.6);
  let SA = 0, SAz = 0;
  for (const e of stBr.els) { SA += e.A; SAz += e.A * e.z; }
  const st1 = [];
  st1.push(`<h4 style="margin:8px 0 2px">Шаг 1. Нейтральная ось</h4>`);
  st1.push(`<p style="margin:2px 0 6px;font:13px system-ui;color:#6b6b74">Это центр тяжести сечения: относительно этой оси корпус изгибается. Всё, что выше, при перегибе растягивается, что ниже — сжимается (при прогибе наоборот). Ошибка в z₀ сдвигает ВСЕ плечи (zᵢ−z₀), поэтому шаг проверяют первым.</p>`);
  st1.push(stepLine('z₀ = ΣAᵢzᵢ / ΣAᵢ', `${fmt(SAz, 0)} / ${fmt(SA, 0)}`, `${fmt(r.z0, 2)} м`));
  st1.push(`<h4 style="margin:8px 0 2px">Шаг 2. Момент инерции</h4>`);
  st1.push(`<p style="margin:2px 0 6px;font:13px system-ui;color:#6b6b74">Мера сопротивления сечения изгибу. Каждая связь входит переносным членом Aᵢ(zᵢ−z₀)² — работает квадрат расстояния до нейтральной оси, поэтому палуба и днище (дальше всех от оси) дают львиную долю I, а связи у самой оси (борт в середине) почти не участвуют. Высокие вертикальные стенки добавляют собственный момент A·h²/12.</p>`);
  st1.push(stepLine('I = ΣAᵢ(zᵢ−z₀)² + Σi_соб', `${fmt(r.I - r.Iown, 2)} + ${fmt(r.Iown, 2)}`, `${fmt(r.I, 2)} м⁴`));
  st1.push(`<h4 style="margin:8px 0 2px">Шаг 3. Моменты сопротивления</h4>`);
  st1.push(`<p style="margin:2px 0 6px;font:13px system-ui;color:#6b6b74">W = I/расстояние до крайнего волокна. Их два, потому что нейтральная ось не посередине: до палубы и до днища расстояния разные — где дальше, там W меньше и напряжение больше.</p>`);
  st1.push(stepLine('W_палубы = I/(z_верх − z₀)', `${fmt(r.I, 2)} / (${fmt(r.zTop, 2)} − ${fmt(r.z0, 2)})`, `${fmt(r.Wd, 2)} м³`));
  st1.push(stepLine('W_днища = I/z₀', `${fmt(r.I, 2)} / ${fmt(r.z0, 2)}`, `${fmt(r.Wb, 2)} м³`));
  st1.push(`<h4 style="margin:8px 0 2px">Шаг 4. Волновые моменты (РМРС 1.4.4.1 / IACS UR S11)</h4>`);
  st1.push(`<p style="margin:2px 0 6px;font:13px system-ui;color:#6b6b74">Стандартизованная волна правил: коэффициент c_w зависит только от длины, момент — от главных размерений и полноты C_b. Перегиб (вершина волны на миделе) растягивает палубу, прогиб (подошва) — днище; прогибочный момент больше по модулю из-за члена (C_b+0,7).</p>`);
  st1.push(stepLine('c_w = 10,75 − ((300−L)/100)^1,5', L <= 90 ? `0,0856·${L}` : `10,75 − ((300−${L})/100)^1,5`, fmt(r.C, 2)));
  st1.push(stepLine('M_w,пер = 190·c_w·B·L²·C_b·10⁻³',
    `190·${fmt(r.C, 2)}·${Bw}·${L}²·${fmt(Cb, 2)}·10⁻³`, `${fmt(r.Mw_hog / 1000, 0)} МН·м`));
  st1.push(stepLine('M_w,прог = −110·c_w·B·L²·(C_b+0,7)·10⁻³',
    `−110·${fmt(r.C, 2)}·${Bw}·${L}²·${fmt(Cb + 0.7, 2)}·10⁻³`, `${fmt(r.Mw_sag / 1000, 0)} МН·м`));
  st1.push(`<h4 style="margin:8px 0 2px">Шаг 5. Напряжения (перегиб)</h4>`);
  st1.push(`<p style="margin:2px 0 6px;font:13px system-ui;color:#6b6b74">Расчётный момент = тихая вода + волна, напряжение σ = M/W сравнивается с допускаемым 175/k МПа. Для прогиба расчёт повторяют с M_w,прог — тогда критично днище, а сжатую палубу проверяют на устойчивость (редуцирование, гл. 6 теории).</p>`);
  const Mth = stBr.Msw + r.Mw_hog;
  st1.push(stepLine('M = M_тв + M_w,пер', `${fmt(stBr.Msw / 1000, 0)} + ${fmt(r.Mw_hog / 1000, 0)}`, `${fmt(Mth / 1000, 0)} МН·м`));
  st1.push(stepLine('σ_палубы = M/W_палубы', `${fmt(Mth / 1000, 0)}·10³ / ${fmt(r.Wd, 2)} / 10³`, `${fmt(Mth / r.Wd / 1000, 0)} МПа`));
  st1.push(stepLine('σ_днища = M/W_днища', `${fmt(Mth / 1000, 0)}·10³ / ${fmt(r.Wb, 2)} / 10³`, `${fmt(Mth / r.Wb / 1000, 0)} МПа`));
  const stepsEl = document.getElementById('brus-steps');
  if (stepsEl) stepsEl.innerHTML = st1.join('');

  // --- разбор роли каждой связи ---
  const roles = [
    'верхний «поясок» эквивалентного бруса: дальше всех от нейтральной оси, при перегибе растянута — обычно самое напряжённое место корпуса;',
    'продольные рёбра жёсткости палубы: работают вместе с настилом (тот же z), добавляют площадь пояску и держат пластину от выпучивания;',
    'утолщённый верхний пояс бортовой обшивки: соединяет палубу с бортом, из-за высокого z вносит заметный вклад; классическое место усталостных трещин;',
    'стенка «двутавра»: сама по себе почти не даёт I (её центр у нейтральной оси, плечо мало́), но связывает пояски и несёт касательные напряжения от перерезывающей силы;',
    'скруглённый переход борт–днище: работает как нижний угловой пояс и добавляет собственный момент инерции как высокая стенка;',
    'второй (нижний) поясок: настил двойного дна поднят над обшивкой, поэтому его плечо меньше днищевого, но площадь велика;',
    'продольный набор днища: как и рёбра палубы — добавка к нижнему пояску;',
    'нижний «поясок»: при прогибе на волне растянуто, при перегибе сжато — проверяется и на прочность, и на устойчивость.',
  ];
  const notesEl = document.getElementById('brus-els-notes');
  if (notesEl) notesEl.innerHTML = stBr.els.map((e, i) => {
    const lever = e.z - r.z0;
    const part = e.A * 1e-4 * lever * lever / r.I * 100;
    return `<li><b>${e.name}</b> (A=${fmt(e.A, 0)} см², z=${fmt(e.z, 2)} м, плечо ${fmt(lever, 2)} м,
      вклад в I ≈ ${fmt(part, 0)} %): ${roles[i] || ''}</li>`;
  }).join('');

  drawMidship(r);
}

/* конструктивный мидель с выносками к каждой связи; нейтральная ось и
 * подписи живые (пересчитываются при правке таблицы) */
function drawMidship(r) {
  const host = document.getElementById('b-section');
  if (!host) return;
  const e = stBr.els, k = 24, base = 392, cx = 360;
  const half = Math.min(stBr.B, 20) / 2 * k;
  const zTop = 9.6, yDeck = base - zTop * k, Rb = 1.7 * k;
  const xl = cx - half, xr = cx + half;
  const yb = base, yBilge = base - 1.7 * k, yVd = base - e[5].z * k;
  const yna = base - r.z0 * k;
  const lbl = (x, y, t, anchor, color) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" style="font:10.5px system-ui;fill:${color || '#3a3a42'}">${t}</text>`;
  const lead = (x1, y1, x2, y2) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8a8a92" stroke-width=".8"/>`;
  let g = '';
  // контур обшивки
  g += `<path d="M ${xl} ${yDeck + 4} L ${xl} ${yBilge} Q ${xl} ${yb} ${xl + Rb} ${yb}
        L ${xr - Rb} ${yb} Q ${xr} ${yb} ${xr} ${yBilge} L ${xr} ${yDeck + 4}"
        fill="none" stroke="#16161a" stroke-width="2.2"/>`;
  // палуба с погибью
  g += `<path d="M ${xl} ${yDeck + 4} Q ${cx} ${yDeck - 6} ${xr} ${yDeck + 4}"
        fill="none" stroke="#155e75" stroke-width="3"/>`;
  // ширстрек
  const ySheerB = base - (e[2].z - e[2].hgt / 2) * k;
  g += `<line x1="${xl}" y1="${yDeck + 4}" x2="${xl}" y2="${ySheerB}" stroke="#155e75" stroke-width="4"/>`;
  g += `<line x1="${xr}" y1="${yDeck + 4}" x2="${xr}" y2="${ySheerB}" stroke="#155e75" stroke-width="4"/>`;
  // скуловой пояс
  g += `<path d="M ${xl} ${yBilge} Q ${xl} ${yb} ${xl + Rb} ${yb}" fill="none" stroke="#155e75" stroke-width="3.4"/>`;
  g += `<path d="M ${xr} ${yBilge} Q ${xr} ${yb} ${xr - Rb} ${yb}" fill="none" stroke="#155e75" stroke-width="3.4"/>`;
  // настил второго дна + флоры
  g += `<line x1="${xl + 6}" y1="${yVd}" x2="${xr - 6}" y2="${yVd}" stroke="#155e75" stroke-width="2.4"/>`;
  for (let x = xl + 40; x < xr - 20; x += 56)
    g += `<line x1="${x}" y1="${yVd}" x2="${x}" y2="${yb}" stroke="#b9b7ae" stroke-width="1.2"/>`;
  // продольные рёбра — зубчики
  const yRd = base - e[1].z * k, yRb2 = base - e[6].z * k;
  for (let x = xl + 24; x < xr - 12; x += 36) {
    g += `<line x1="${x}" y1="${yDeck + 5}" x2="${x}" y2="${yRd + 4}" stroke="#155e75" stroke-width="1.4"/>`;
    g += `<line x1="${x + 18}" y1="${yb - 1}" x2="${x + 18}" y2="${yRb2 - 3}" stroke="#155e75" stroke-width="1.4"/>`;
  }
  // ДП и ОЛ
  g += `<line x1="${cx}" y1="${yDeck - 16}" x2="${cx}" y2="${yb + 10}" stroke="#8a8a92" stroke-width=".9" stroke-dasharray="8 4"/>`;
  g += `<line x1="${xl - 34}" y1="${yb}" x2="${xr + 44}" y2="${yb}" stroke="#6b6b74" stroke-width="1"/>`;
  g += lbl(xl - 34, yb + 16, 'ОЛ (основная линия)', 'start', '#6b6b74');
  g += lbl(cx + 4, yDeck - 20, 'ДП', 'start', '#8a8a92');
  // нейтральная ось — живая
  g += `<line x1="${xl - 34}" y1="${yna}" x2="${xr + 34}" y2="${yna}" stroke="#b3382e" stroke-width="1.6" stroke-dasharray="7 4"/>`;
  g += lbl(xl - 34, yna - 6, 'нейтральная ось', 'start', '#b3382e');
  // размер z0 — по ДП, стрелка от ОЛ до нейтральной оси
  const xd = cx + 14;
  g += `<line x1="${xd}" y1="${yb - 2}" x2="${xd}" y2="${yna + 2}" stroke="#b3382e" stroke-width="1.2"/>`;
  g += `<path d="M ${xd} ${yb - 2} l -4 -8 l 8 0 z M ${xd} ${yna + 2} l -4 8 l 8 0 z" fill="#b3382e"/>`;
  g += `<text x="${xd + 8}" y="${(yb + yna) / 2 + 4}" style="font:11px system-ui;fill:#b3382e">z₀ = ${fmt(r.z0, 2)} м</text>`;
  // выноски: текст в колонках, лидер начинается от фиксированной кромки колонки
  const co = [
    [0, 6,   104, 'start', cx - 80, yDeck - 1],
    [1, 6,   146, 'start', xl + 60, yRd + 2],
    [2, 754, 118, 'end',   xr + 2, (yDeck + ySheerB) / 2],
    [3, 6,   252, 'start', xl, base - e[3].z * k],
    [4, 754, 328, 'end',   xr - 4, yb - 12],
    [5, 6,   330, 'start', xl + 90, yVd],
    [6, 754, 258, 'end',   xr - 42, yRb2 - 4],
    [7, 754, 400, 'end',   cx + 90, yb],
  ];
  for (const [i, tx, ty, anchor, ax, ay] of co) {
    const el = e[i];
    const edge = anchor === 'start' ? 148 : 604; // кромка текстовой колонки
    g += lead(edge, ty - 3, ax, ay);
    g += lbl(tx, ty - 8, el.name, anchor);
    g += lbl(tx, ty + 4, `A=${fmt(el.A, 0)} см², z=${fmt(el.z, 2)} м`, anchor, '#6b6b74');
  }
  g += lead(330, yb + 8, 330, yb - 12);
  g += lbl(276, yb + 20, 'флоры (поперечные — в брус не входят)', 'start', '#8a8a92');
  host.innerHTML = `<svg viewBox="0 0 760 430" class="geo-board">${g}</svg>`;
}

/* приём размерений, переданных по URL из «Статики корабля» (solver → brus) */
(function brusApplyQuery() {
  const Q = new URLSearchParams(location.search);
  const qn = k => { const v = parseFloat(Q.get(k)); return isFinite(v) ? v : null; };
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const got = [];
  const L = qn('L'); if (L != null) { stBr.L = cl(L, 60, 300); got.push(`L = ${fmt(stBr.L, 0)} м`); }
  const B = qn('B'); if (B != null) { stBr.B = cl(B, 10, 40); got.push(`B = ${fmt(stBr.B, 1)} м`); }
  const Cb = qn('Cb'); if (Cb != null) { stBr.Cb = cl(Cb, 0.55, 0.85); got.push(`C_b = ${fmt(stBr.Cb, 3)}`); }
  if (!got.length) return;
  document.getElementById('in-L').value = stBr.L;
  document.getElementById('in-Bb').value = stBr.B;
  document.getElementById('in-Cb').value = stBr.Cb;
  const d = document.createElement('div');
  d.className = 'note tip';
  d.innerHTML = `<b>Размерения переданы из «Статики корабля»</b> (расчёт посадки и остойчивости):
    ${got.join('; ')} — подставлены во входы; волновые моменты IACS ниже считаются от них.
    Момент на тихой воде и состав сечения задайте по своему проекту.
    <a class="btn" href="brus" style="margin-left:10px">сбросить</a>`;
  const main = document.querySelector('main.wrap');
  if (main) main.insertBefore(d, main.children[2] || null);
})();

for (const [id, key] of [['in-L', 'L'], ['in-Bb', 'B'], ['in-Cb', 'Cb'], ['in-Msw', 'Msw']]) {
  const el = document.getElementById(id);
  el.addEventListener('input', e => { stBr[key] = +e.target.value || 1; brusRender(); });
}
brusRender();
