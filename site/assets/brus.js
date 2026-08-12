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
  drawEqBeam(r);
  drawLengthDiagrams(r);
}

/* --- схема «сечение → эквивалентный брус» с эпюрой напряжений --- */
function drawEqBeam(r) {
  const host = document.getElementById('b-beam');
  if (!host) return;
  const e = stBr.els;
  const k = 17, base = 250, zTop = 9.6;
  const cxA = 130, halfA = Math.min(stBr.B, 20) / 2 * k * 0.62;
  const yD = base - zTop * k, yNA = base - r.z0 * k;
  const lbl = (x, y, t, anchor, color, size) =>
    `<text x="${x}" y="${y}" text-anchor="${anchor || 'start'}"
      style="font:${size || 11}px system-ui;fill:${color || '#3a3a42'}">${t}</text>`;

  // площади поясков и стенки, см² → ширина полоски на схеме
  const Adeck = e.filter(q => q.z > zTop * 0.75).reduce((s2, q) => s2 + q.A, 0);
  const Abot = e.filter(q => q.z < zTop * 0.25).reduce((s2, q) => s2 + q.A, 0);
  const Aweb = e.filter(q => q.z >= zTop * 0.25 && q.z <= zTop * 0.75).reduce((s2, q) => s2 + q.A, 0);
  const wpx = a => clamp(a / 90, 6, 30);

  let g = '';
  // ---- слева: реальное сечение (упрощённо) ----
  g += `<path d="M ${cxA - halfA} ${yD + 3} L ${cxA - halfA} ${base - 1.7 * k}
        Q ${cxA - halfA} ${base} ${cxA - halfA + 26} ${base}
        L ${cxA + halfA - 26} ${base} Q ${cxA + halfA} ${base} ${cxA + halfA} ${base - 1.7 * k}
        L ${cxA + halfA} ${yD + 3}" fill="none" stroke="#16161a" stroke-width="1.8"/>`;
  g += `<path d="M ${cxA - halfA} ${yD + 3} Q ${cxA} ${yD - 5} ${cxA + halfA} ${yD + 3}"
        fill="none" stroke="#155e75" stroke-width="3"/>`;
  const yVd = base - e[5].z * k;
  g += `<line x1="${cxA - halfA + 6}" y1="${yVd}" x2="${cxA + halfA - 6}" y2="${yVd}" stroke="#155e75" stroke-width="2.2"/>`;
  for (let x = cxA - halfA + 26; x < cxA + halfA - 14; x += 34)
    g += `<line x1="${x}" y1="${yVd}" x2="${x}" y2="${base}" stroke="#b9b7ae" stroke-width="1.1"/>`;
  g += lbl(cxA, yD - 22, 'реальное сечение', 'middle', '#6b6b74');
  g += lbl(cxA - halfA - 4, base + 26, 'поперечный набор в брус не входит', 'start', '#8a8a92', 10.5);

  // ---- стрелка «сводится к» ----
  const xA = cxA + halfA + 18, xB = xA + 74;
  g += `<line x1="${xA}" y1="${(yD + base) / 2}" x2="${xB - 10}" y2="${(yD + base) / 2}" stroke="#6b6b74" stroke-width="1.6"/>`;
  g += `<path d="M ${xB} ${(yD + base) / 2} l -10 -5 l 0 10 z" fill="#6b6b74"/>`;
  g += lbl((xA + xB) / 2, (yD + base) / 2 - 10, 'сводится к', 'middle', '#6b6b74');

  // ---- справа: эквивалентный брус (двутавр) ----
  const cxB = xB + 96, halfB = 74;
  const tD = wpx(Adeck), tB = wpx(Abot), tW = clamp(Aweb / 200, 5, 20);
  g += `<rect x="${cxB - halfB}" y="${yD}" width="${2 * halfB}" height="${tD}"
        fill="rgba(21,94,117,.28)" stroke="#155e75" stroke-width="1.4"/>`;
  g += `<rect x="${cxB - halfB}" y="${base - tB}" width="${2 * halfB}" height="${tB}"
        fill="rgba(21,94,117,.28)" stroke="#155e75" stroke-width="1.4"/>`;
  g += `<rect x="${cxB - tW / 2}" y="${yD + tD}" width="${tW}" height="${base - tB - yD - tD}"
        fill="rgba(21,94,117,.16)" stroke="#155e75" stroke-width="1.2"/>`;
  g += lbl(cxB - halfB, yD - 8, `поясок палубы ${fmt(Adeck, 0)} см²`, 'start', '#155e75');
  g += lbl(cxB - halfB, base + 16, `поясок днища ${fmt(Abot, 0)} см²`, 'start', '#155e75');
  g += lbl(cxB + tW / 2 + 8, (yD + base) / 2 - 6, `стенка (борта)`, 'start', '#155e75');
  g += lbl(cxB + tW / 2 + 8, (yD + base) / 2 + 8, `${fmt(Aweb, 0)} см²`, 'start', '#155e75');
  // нейтральная ось
  g += `<line x1="${cxA - halfA - 16}" y1="${yNA}" x2="${cxB + halfB + 4}" y2="${yNA}"
        stroke="#b3382e" stroke-width="1.5" stroke-dasharray="7 4"/>`;
  g += lbl(cxA - halfA - 16, yNA - 6, `нейтральная ось z₀ = ${fmt(r.z0, 2)} м`, 'start', '#b3382e');

  // ---- эпюра напряжений справа ----
  const cxS = cxB + halfB + 150, sMax = 52;
  g += `<line x1="${cxS}" y1="${yD - 10}" x2="${cxS}" y2="${base + 10}" stroke="#6b6b74" stroke-width="1"/>`;
  const sD = (r.zTop - r.z0), sB = -r.z0, sm = Math.max(sD, -sB);
  const xD = cxS + sD / sm * sMax, xB2 = cxS + sB / sm * sMax;
  g += `<polygon points="${cxS},${yNA} ${xD},${yD} ${cxS},${yD}" fill="rgba(179,56,46,.20)" stroke="#b3382e" stroke-width="1.4"/>`;
  g += `<polygon points="${cxS},${yNA} ${xB2},${base} ${cxS},${base}" fill="rgba(21,94,117,.20)" stroke="#155e75" stroke-width="1.4"/>`;
  const Mth = stBr.Msw + r.Mw_hog;
  g += lbl(xD + 6, yD + 6, `${fmt(Mth / r.Wd / 1000, 0)} МПа — растяжение`, 'start', '#b3382e');
  g += lbl(cxS + 6, base + 16, `${fmt(Math.abs(Mth / r.Wb / 1000), 0)} МПа — сжатие`, 'start', '#155e75');
  g += lbl(cxS + 6, yNA - 6, 'σ = 0', 'start', '#6b6b74');
  g += lbl(cxS, yD - 20, 'эпюра σ по высоте (перегиб)', 'middle', '#6b6b74');

  host.innerHTML = `<svg viewBox="0 0 900 300" class="geo-board">${g}</svg>`;
}

/* --- эпюры нагрузки, перерезывающей силы и момента по длине корпуса --- */
function drawLengthDiagrams(r) {
  const host = document.getElementById('b-length');
  if (!host) return;
  const sel = document.getElementById('in-case');
  const mode = sel ? sel.value : 'hog';
  const L = stBr.L, N = 40;
  // погонный вес: полнее в средней части, добавка машинного отделения в корме
  const w = [], sup = [];
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    w.push(0.62 + 0.55 * Math.sin(Math.PI * Math.pow(t, 0.9)) + (t < 0.22 ? 0.30 : 0));
    // поддержание: строевая (полнее в середине) с волновой модуляцией
    const wave = mode === 'still' ? 0 : (mode === 'hog' ? 1 : -1) * 0.45 * Math.cos(2 * Math.PI * (t - 0.5));
    sup.push((0.70 + 0.52 * Math.sin(Math.PI * t)) * (1 + wave));
  }
  // уравновешивание: поддержание нормируем на суммарный вес и убираем момент
  const sw = w.reduce((a, b) => a + b, 0), ss = sup.reduce((a, b) => a + b, 0);
  for (let i = 0; i < N; i++) sup[i] *= sw / ss;
  let mw = 0, ms = 0;
  for (let i = 0; i < N; i++) { const x = (i + 0.5) / N - 0.5; mw += w[i] * x; ms += sup[i] * x; }
  for (let i = 0; i < N; i++) sup[i] += (mw - ms) * ((i + 0.5) / N - 0.5) * 12 / N;
  const q = w.map((v, i) => v - sup[i]);
  // интегрирование
  const Q = [0], M = [0];
  for (let i = 0; i < N; i++) Q.push(Q[i] + q[i]);
  for (let i = 0; i < N; i++) M.push(M[i] + (Q[i] + Q[i + 1]) / 2);
  // нормировка момента на расчётный (кН·м → МН·м)
  const Mtarget = (mode === 'still' ? stBr.Msw : mode === 'hog' ? stBr.Msw + r.Mw_hog : stBr.Msw + r.Mw_sag) / 1000;
  const Mmid = M[Math.round(N / 2)] || 1;
  const kM = Mtarget / Mmid;
  const Mn = M.map(v => v * kM), Qn = Q.map(v => v * kM * 4 / L * 10);

  const W = 880, H = 108, padL = 74, padR = 130;
  const plot = (arr, title, unit, color, y0, showMid) => {
    const n = arr.length - 1;
    const mx = Math.max(...arr.map(Math.abs), 1e-6);
    const X = i => padL + i / n * (W - padL - padR);
    const Y = v => y0 + H / 2 - v / mx * (H / 2 - 12);
    let s = `<line x1="${padL}" y1="${Y(0)}" x2="${W - padR}" y2="${Y(0)}" stroke="#6b6b74" stroke-width="1"/>`;
    const pts = arr.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    s += `<polygon points="${X(0)},${Y(0)} ${pts} ${X(n)},${Y(0)}" fill="${color}22" stroke="none"/>`;
    s += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/>`;
    s += `<text x="${padL}" y="${y0 + 12}" style="font:600 12px system-ui;fill:#3a3a42">${title}</text>`;
    if (showMid) {
      const im = Math.round(n / 2);
      s += `<line x1="${X(im)}" y1="${y0 + 4}" x2="${X(im)}" y2="${y0 + H - 4}" stroke="#8a8a92" stroke-width="1" stroke-dasharray="4 3"/>`;
      s += `<circle cx="${X(im)}" cy="${Y(arr[im])}" r="4" fill="${color}"/>`;
      s += `<text x="${X(im) + 8}" y="${Y(arr[im]) - 6}" style="font:600 12px system-ui;fill:${color}">${fmt(arr[im], 0)} ${unit}</text>`;
    }
    s += `<text x="${W - padR + 8}" y="${Y(0) + 4}" style="font:11px system-ui;fill:#8a8a92">${unit}</text>`;
    return s;
  };
  let g = '';
  // подписи оконечностей
  g += `<text x="${padL}" y="18" style="font:11px system-ui;fill:#6b6b74">корма</text>`;
  g += `<text x="${W - padR - 26}" y="18" style="font:11px system-ui;fill:#6b6b74">нос</text>`;
  // нагрузка: вес и поддержание отдельными кривыми + разность
  const nq = q.length - 1;
  const mxq = Math.max(...w, ...sup);
  const Xq = i => padL + i / nq * (W - padL - padR);
  const Yq = v => 24 + H - v / mxq * (H - 16);
  g += `<polyline points="${w.map((v, i) => `${Xq(i).toFixed(1)},${Yq(v).toFixed(1)}`).join(' ')}"
        fill="none" stroke="#b3382e" stroke-width="2"/>`;
  g += `<polyline points="${sup.map((v, i) => `${Xq(i).toFixed(1)},${Yq(v).toFixed(1)}`).join(' ')}"
        fill="none" stroke="#155e75" stroke-width="2"/>`;
  g += `<text x="${W - padR + 8}" y="40" style="font:11px system-ui;fill:#b3382e">вес p(x)</text>`;
  g += `<text x="${W - padR + 8}" y="58" style="font:11px system-ui;fill:#155e75">поддержание</text>`;
  g += `<text x="${padL}" y="36" style="font:600 12px system-ui;fill:#3a3a42">Нагрузка по длине</text>`;
  g += plot(q.map(v => v), 'Разность q(x) = p − γω', 'отн.', '#8a5b1d', 150, false);
  g += plot(Qn, 'Перерезывающая сила N(x)', 'МН', '#155e75', 272, false);
  g += plot(Mn, 'Изгибающий момент M(x)', 'МН·м', '#b3382e', 394, true);
  host.innerHTML = `<svg viewBox="0 0 900 520" class="geo-board">${g}</svg>`;
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

{
  const sel = document.getElementById('in-case');
  if (sel) sel.addEventListener('change', brusRender);
}
for (const [id, key] of [['in-L', 'L'], ['in-Bb', 'B'], ['in-Cb', 'Cb'], ['in-Msw', 'Msw']]) {
  const el = document.getElementById(id);
  el.addEventListener('input', e => { stBr[key] = +e.target.value || 1; brusRender(); });
}
brusRender();
