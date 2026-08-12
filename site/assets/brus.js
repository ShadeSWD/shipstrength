/* Эквивалентный брус: общая продольная прочность корпуса.
 * Сечение задаётся элементами (площадь, отстояние от ОЛ); моменты — на тихой
 * воде (ввод) и волновые по IACS UR S11. Единицы: м, см², кН·м, МПа. */
'use strict';

const stBr = {
  L: 100, B: 16, Cb: 0.7, Msw: 180000, // кН·м (тихая вода, перегиб +)
  els: [
    { name: 'Палубный стрингер + палуба', A: 1900, z: 9.4 },
    { name: 'Ширстрек', A: 900, z: 8.6 },
    { name: 'Борт (обшивка)', A: 1500, z: 5.0 },
    { name: 'Продольные рёбра палубы', A: 600, z: 9.0 },
    { name: 'Двойное дно (настил)', A: 1700, z: 1.5 },
    { name: 'Днище (обшивка)', A: 2000, z: 0.05 },
    { name: 'Продольные рёбра днища', A: 800, z: 0.35 },
    { name: 'Скуловой пояс', A: 700, z: 0.8 },
  ],
};

function brusCompute() {
  let A = 0, Sz = 0;
  for (const e of stBr.els) { A += e.A; Sz += e.A * e.z; }
  const z0 = Sz / A; // нейтральная ось от ОЛ
  let I = 0;
  for (const e of stBr.els) I += e.A * 1e-4 * (e.z - z0) ** 2; // м²·м² = м⁴
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
  return { A, z0, I, Wd, Wb, zTop, C, Mw_hog, Mw_sag, Wmin };
}

function brusRender() {
  const r = brusCompute();
  // таблица элементов (редактируемая)
  const tb = document.getElementById('els-rows');
  tb.innerHTML = stBr.els.map((e, i) => `
    <tr>
      <td>${e.name}</td>
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
    <tr><td>Момент инерции I</td><td>${fmt(r.I, 2)} м⁴</td></tr>
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

  // эскиз сечения
  const B2 = new Board('#b-section', { w: 460, h: 330 });
  B2.clear();
  const cx = 230, base = 300, k = 26;
  const half = stBr.B / 2 * 12;
  // контур миделя условно
  B2.poly([[cx - half, base], [cx - half, base - 9.6 * k], [cx + half, base - 9.6 * k], [cx + half, base]], 'ln', 'main', true);
  for (const e of stBr.els) {
    const y = base - e.z * k;
    const w = Math.min(half * 1.7, Math.max(18, e.A / 14));
    B2.line([cx - w / 2, y], [cx + w / 2, y], 'ln blue');
  }
  const yna = base - r.z0 * k;
  B2.line([cx - half - 24, yna], [cx + half + 24, yna], 'ln red ln-dash');
  B2.label([cx + half + 4, yna - 6], 'нейтральная ось', 'red', 0, 0);
  B2.label([cx - half, base - 9.6 * k - 8], 'сечение (схема)', 'gray', 0, 0);
}

for (const [id, key] of [['in-L', 'L'], ['in-Bb', 'B'], ['in-Cb', 'Cb'], ['in-Msw', 'Msw']]) {
  const el = document.getElementById(id);
  el.addEventListener('input', e => { stBr[key] = +e.target.value || 1; brusRender(); });
}
brusRender();
