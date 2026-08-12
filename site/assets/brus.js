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
  st1.push(stepLine('z₀ = ΣAᵢzᵢ / ΣAᵢ', `${fmt(SAz, 0)} / ${fmt(SA, 0)}`, `${fmt(r.z0, 2)} м`));
  st1.push(`<h4 style="margin:8px 0 2px">Шаг 2. Момент инерции</h4>`);
  st1.push(stepLine('I = ΣAᵢ(zᵢ−z₀)² + Σi_соб', `${fmt(r.I - r.Iown, 2)} + ${fmt(r.Iown, 2)}`, `${fmt(r.I, 2)} м⁴`));
  st1.push(`<h4 style="margin:8px 0 2px">Шаг 3. Моменты сопротивления</h4>`);
  st1.push(stepLine('W_палубы = I/(z_верх − z₀)', `${fmt(r.I, 2)} / (${fmt(r.zTop, 2)} − ${fmt(r.z0, 2)})`, `${fmt(r.Wd, 2)} м³`));
  st1.push(stepLine('W_днища = I/z₀', `${fmt(r.I, 2)} / ${fmt(r.z0, 2)}`, `${fmt(r.Wb, 2)} м³`));
  st1.push(`<h4 style="margin:8px 0 2px">Шаг 4. Волновые моменты (РМРС 1.4.4.1 / IACS UR S11)</h4>`);
  st1.push(stepLine('c_w = 10,75 − ((300−L)/100)^1,5', L <= 90 ? `0,0856·${L}` : `10,75 − ((300−${L})/100)^1,5`, fmt(r.C, 2)));
  st1.push(stepLine('M_w,пер = 190·c_w·B·L²·C_b·10⁻³',
    `190·${fmt(r.C, 2)}·${Bw}·${L}²·${fmt(Cb, 2)}·10⁻³`, `${fmt(r.Mw_hog / 1000, 0)} МН·м`));
  st1.push(stepLine('M_w,прог = −110·c_w·B·L²·(C_b+0,7)·10⁻³',
    `−110·${fmt(r.C, 2)}·${Bw}·${L}²·${fmt(Cb + 0.7, 2)}·10⁻³`, `${fmt(r.Mw_sag / 1000, 0)} МН·м`));
  st1.push(`<h4 style="margin:8px 0 2px">Шаг 5. Напряжения (перегиб)</h4>`);
  const Mth = stBr.Msw + r.Mw_hog;
  st1.push(stepLine('M = M_тв + M_w,пер', `${fmt(stBr.Msw / 1000, 0)} + ${fmt(r.Mw_hog / 1000, 0)}`, `${fmt(Mth / 1000, 0)} МН·м`));
  st1.push(stepLine('σ_палубы = M/W_палубы', `${fmt(Mth / 1000, 0)}·10³ / ${fmt(r.Wd, 2)} / 10³`, `${fmt(Mth / r.Wd / 1000, 0)} МПа`));
  st1.push(stepLine('σ_днища = M/W_днища', `${fmt(Mth / 1000, 0)}·10³ / ${fmt(r.Wb, 2)} / 10³`, `${fmt(Mth / r.Wb / 1000, 0)} МПа`));
  const stepsEl = document.getElementById('brus-steps');
  if (stepsEl) stepsEl.innerHTML = st1.join('');

  const B2 = new Board('#b-section', { w: 460, h: 330 });
  B2.clear();
  const cx = 230, base = 300, k = 26;
  const half = stBr.B / 2 * 12;
  B2.poly([[cx - half, base], [cx - half, base - 9.6 * k], [cx + half, base - 9.6 * k], [cx + half, base]], 'ln-thin gray', 'main', true);
  for (const e of stBr.els) {
    const wpx = clamp(e.A / 500, 1.6, 6); // «толщина листа» на эскизе
    if (e.kind === 'v') {
      const zt = base - (e.z + e.hgt / 2) * k, zb = base - (e.z - e.hgt / 2) * k;
      for (const sgn of [-1, 1]) {
        const ln = B2.line([cx + sgn * half, zt], [cx + sgn * half, zb], 'ln blue');
        ln.style.strokeWidth = wpx;
      }
    } else {
      const y = base - e.z * k;
      // палуба/днище — на всю ширину; внутренние — чуть уже
      const w = e.z > 8.5 || e.z < 0.2 ? half : half * 0.86;
      const ln = B2.line([cx - w, y], [cx + w, y], 'ln blue');
      ln.style.strokeWidth = wpx;
    }
  }
  const yna = base - r.z0 * k;
  B2.line([cx - half - 24, yna], [cx + half + 24, yna], 'ln red ln-dash');
  B2.label([cx + half - 92, yna - 8], 'нейтральная ось', 'red', 0, 0);
  B2.label([cx - half - 40, base - 9.6 * k - 12], 'мидель-сечение (толщина ∝ площади связи)', 'gray', 0, 0);
}

for (const [id, key] of [['in-L', 'L'], ['in-Bb', 'B'], ['in-Cb', 'Cb'], ['in-Msw', 'Msw']]) {
  const el = document.getElementById(id);
  el.addEventListener('input', e => { stBr[key] = +e.target.value || 1; brusRender(); });
}
brusRender();
