/* geo.js — движок интерактивных эпюров (проекционных чертежей).
 *
 * Идея: вся геометрия хранится в 3D; каждое «поле проекций» (π1, π2, π3…) —
 * это ортогональная проекция на плоскость с базисом (a, b) плюс размещение
 * на экране (точка оси, направление оси, сторона). Если дочернее поле
 * размещено на той же экранной оси, что и родительское, линии связи
 * между проекциями автоматически перпендикулярны оси — как на настоящем
 * чертеже при замене плоскостей проекций.
 */
'use strict';

/* ---------- 3D вектор ---------- */
const V = {
  add: (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]],
  sub: (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]],
  scale: (p, k) => [p[0] * k, p[1] * k, p[2] * k],
  dot: (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2],
  cross: (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]],
  len: p => Math.hypot(p[0], p[1], p[2]),
  unit: p => { const l = V.len(p) || 1; return [p[0] / l, p[1] / l, p[2] / l]; },
  lerp: (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t],
  dist: (p, q) => V.len(V.sub(p, q)),
  neg: p => [-p[0], -p[1], -p[2]],
  // произвольный единичный вектор, перпендикулярный n
  anyPerp(n) {
    const t = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return V.unit(V.cross(n, t));
  },
  // поворот точки p вокруг оси (o, dir) на угол ang (формула Родрига)
  rotAbout(p, o, dir, ang) {
    const k = V.unit(dir), v = V.sub(p, o);
    const c = Math.cos(ang), s = Math.sin(ang);
    const r = V.add(V.add(V.scale(v, c), V.scale(V.cross(k, v), s)),
      V.scale(k, V.dot(k, v) * (1 - c)));
    return V.add(o, r);
  },
  // отражение точки p относительно плоскости (точка q, нормаль n)
  mirror(p, q, n) {
    const nn = V.unit(n);
    return V.sub(p, V.scale(nn, 2 * V.dot(V.sub(p, q), nn)));
  },
};

/* ---------- 2D утилиты ---------- */
const U2 = {
  add: (p, q) => [p[0] + q[0], p[1] + q[1]],
  sub: (p, q) => [p[0] - q[0], p[1] - q[1]],
  scale: (p, k) => [p[0] * k, p[1] * k],
  dot: (p, q) => p[0] * q[0] + p[1] * q[1],
  len: p => Math.hypot(p[0], p[1]),
  unit: p => { const l = Math.hypot(p[0], p[1]) || 1; return [p[0] / l, p[1] / l]; },
  perp: p => [-p[1], p[0]],
  dist: (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]),
};

/* ---------- Поле проекций ---------- */
/* a — 3D-направление вдоль оси поля; b — 3D-направление «от оси» в плоскости
 * поля; axisO — экранная точка (привязка), axisDir — экранное направление
 * оси (единичный 2D), side = +1|-1 — в какую сторону от оси откладывается b.
 * s0 — сдвиг вдоль оси (экранный), чтобы двигать поле по оси. */
class Field {
  constructor(o) {
    this.name = o.name || '';
    this.a = V.unit(o.a); this.b = V.unit(o.b);
    this.axisO = o.axisO; this.axisDir = U2.unit(o.axisDir);
    this.side = o.side || 1;
    this.s0 = o.s0 || 0; this.t0 = o.t0 || 0;
  }
  project(P) {
    const s = V.dot(P, this.a) + this.s0;
    const t = (V.dot(P, this.b) + this.t0) * this.side;
    const n = U2.perp(this.axisDir);
    return [this.axisO[0] + this.axisDir[0] * s + n[0] * t,
            this.axisO[1] + this.axisDir[1] * s + n[1] * t];
  }
  // обратно: по экранной точке вернуть (s,t) в координатах поля
  unproject(pt) {
    const d = U2.sub(pt, this.axisO);
    const n = U2.perp(this.axisDir);
    return [U2.dot(d, this.axisDir) - this.s0,
            U2.dot(d, n) / this.side - this.t0];
  }
  // 3D-точка из экранной, с фиксированной третьей координатой:
  // P = s*a + t*b + фикс. компонента вдоль c (c ⊥ a,b)
  lift(pt, fixedC) {
    const [s, t] = this.unproject(pt);
    const c = V.cross(this.a, this.b);
    return V.add(V.add(V.scale(this.a, s), V.scale(this.b, t)), V.scale(c, fixedC));
  }
  axisPoint(s) {
    return [this.axisO[0] + this.axisDir[0] * s, this.axisO[1] + this.axisDir[1] * s];
  }
}

/* Стандартная пара полей эпюра Монжа.
 * Мировые оси: x — вправо, y — «в глубину» (от зрителя), z — вверх.
 * π1 — фронтальная плоскость (проекции НАД осью, высота z),
 * π2 — горизонтальная (проекции ПОД осью, глубина y) — нумерация как в
 * исходных работах (А1 — фронтальная проекция, А2 — горизонтальная). */
function mongePair(axisO, axisLen) {
  const p1 = new Field({ name: 'π1', a: [1, 0, 0], b: [0, 0, 1], axisO, axisDir: [1, 0], side: -1 });
  const p2 = new Field({ name: 'π2', a: [1, 0, 0], b: [0, 1, 0], axisO, axisDir: [1, 0], side: 1 });
  p1.axisLen = p2.axisLen = axisLen;
  return [p1, p2];
}

/* Дополнительное поле (замена плоскостей): родитель keep (поле, которое
 * остаётся), newAxisDir3 — 3D-направление, вдоль которого пойдёт новая ось
 * (должно лежать в плоскости поля keep), axisO/axisDir — экранное размещение
 * новой оси, side — сторона размещения нового поля. Новая плоскость проходит
 * через направление newAxisDir3 и перпендикулярна плоскости keep. */
function derivedField(keep, newAxisDir3, screen) {
  const a = V.unit(newAxisDir3);
  const b = V.unit(V.cross(V.cross(keep.a, keep.b), a)); // ⊥ a, в плоскости, ⊥ плоскости keep…
  // нормаль плоскости keep:
  const nk = V.cross(keep.a, keep.b);
  return new Field(Object.assign({ a, b: V.unit(nk) }, screen));
}

/* ---------- SVG ---------- */
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(el);
  return el;
}

/* Доска: SVG с группами-слоями и набором рисовалок.
 * Каждый кадр перерисовывается целиком (clear + draw). */
class Board {
  constructor(container, opts = {}) {
    this.root = typeof container === 'string' ? document.querySelector(container) : container;
    this.w = opts.w || 900; this.h = opts.h || 560;
    this.svg = svgEl('svg', {
      viewBox: `0 0 ${this.w} ${this.h}`, class: 'geo-board',
      preserveAspectRatio: 'xMidYMid meet',
    }, this.root);
    this.layers = {};
    for (const name of ['aux', 'link', 'main', 'accent', 'anim', 'handles', 'labels']) {
      this.layers[name] = svgEl('g', { class: 'layer-' + name }, this.svg);
    }
    this.handlers = [];   // постоянные draggable-ручки
    this._labelBoxes = [];
    /* Рамка подгоняется под содержимое сама. Чертёж строится по данным, и на
       крайних положениях точек подписи и линии связи выходят за исходный
       прямоугольник; наблюдатель ждёт конца перерисовки и расширяет viewBox.
       Рамка только растёт (и не больше чем вдвое), чтобы картинка не «дышала»
       при перетаскивании ручек.
       Доскам, скомпонованным под фиксированный кадр (эскизы «Статики
       корабля»), подгонка не нужна и меняет масштаб — им autofit: false. */
    this._view = [0, 0, this.w, this.h];
    this.autofit = opts.autofit !== false;
    // шаг расталкивания подписей; на плотных эпюрах нужен крупнее
    this.labelGap = opts.labelGap || 22;
    if (this.autofit) {
      let pending = 0;
      new MutationObserver(() => {
        if (pending) return;
        pending = requestAnimationFrame(() => { pending = 0; this.fit(); });
      }).observe(this.svg, { childList: true, subtree: true });
    }
  }
  fit(pad = 6) {
    let bb;
    try { bb = this.svg.getBBox(); } catch (e) { return; }
    if (!bb || !isFinite(bb.width) || !bb.width) return;
    const v = this._view;
    const x0 = Math.max(-this.w, Math.min(v[0], bb.x - pad));
    const y0 = Math.max(-this.h, Math.min(v[1], bb.y - pad));
    const x1 = Math.min(2 * this.w, Math.max(v[0] + v[2], bb.x + bb.width + pad));
    const y1 = Math.min(2 * this.h, Math.max(v[1] + v[3], bb.y + bb.height + pad));
    if (x0 === v[0] && y0 === v[1] && x1 === v[0] + v[2] && y1 === v[1] + v[3]) return;
    this._view = [x0, y0, x1 - x0, y1 - y0];
    this.svg.setAttribute('viewBox', this._view.join(' '));
  }
  clear() {
    for (const k in this.layers) {
      if (k === 'handles') continue; // ручки живут постоянно (для plavного драга)
      while (this.layers[k].firstChild) this.layers[k].removeChild(this.layers[k].firstChild);
    }
    this._labelBoxes = [];
  }
  line(p, q, cls, layer) {
    return svgEl('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], class: cls || 'ln' },
      this.layers[layer || 'main']);
  }
  // линия связи (тонкая серая)
  link(p, q) { return this.line(p, q, 'ln-link', 'link'); }
  dashed(p, q, cls) { return this.line(p, q, (cls || 'ln') + ' ln-dash', 'main'); }
  poly(pts, cls, layer, closed) {
    return svgEl(closed ? 'polygon' : 'polyline', {
      points: pts.map(p => p[0] + ',' + p[1]).join(' '), class: cls || 'ln',
    }, this.layers[layer || 'main']);
  }
  path(d, cls, layer) { return svgEl('path', { d, class: cls || 'ln' }, this.layers[layer || 'main']); }
  dot(p, cls, r) {
    return svgEl('circle', { cx: p[0], cy: p[1], r: r || 3, class: 'pt ' + (cls || '') },
      this.layers['main']);
  }
  /* Подпись у точки с уводом от коллизий (простое расталкивание). */
  label(p, text, cls, dx, dy) {
    let x = p[0] + (dx === undefined ? 7 : dx), y = p[1] + (dy === undefined ? -7 : dy);
    /* расталкивание идёт по кругу, пока подпись не встанет свободно: за один
       проход она успевала «перепрыгнуть» на место третьей и снова наложиться
       (так слипались B₁ и B′₁ после поворота) */
    const gap = this.labelGap;
    for (let guard = 0; guard < 8; guard++) {
      const hit = this._labelBoxes.find(b => Math.abs(x - b[0]) < 26 && Math.abs(y - b[1]) < gap);
      if (!hit) break;
      y = hit[1] - gap;
    }
    this._labelBoxes.push([x, y]);
    const t = svgEl('text', { x, y, class: 'lbl ' + (cls || '') }, this.layers['labels']);
    // индексы: "A1" -> A с нижним индексом 1 ; "π3" аналогично
    const m = String(text).match(/^([^\d']+)([\d']+)$/);
    if (m) {
      t.appendChild(document.createTextNode(m[1]));
      const ts = svgEl('tspan', { 'baseline-shift': 'sub', 'font-size': '70%' }, t);
      ts.textContent = m[2];
    } else t.textContent = text;
    return t;
  }
  labeledDot(p, text, cls, dx, dy) {
    this.dot(p, cls);
    this.label(p, text, cls, dx, dy);
  }
  /* Толстая ось поля с подписью (например «X12» или «π2/π4») */
  axis(field, sFrom, sTo, text, labelAt) {
    const p = field.axisPoint(sFrom), q = field.axisPoint(sTo);
    this.line(p, q, 'ln-axis', 'main');
    if (text) {
      const at = field.axisPoint(labelAt === undefined ? sTo : labelAt);
      const n = U2.perp(field.axisDir);
      this.label([at[0] + n[0] * 10, at[1] + n[1] * 10], text, 'lbl-axis', 0, 0);
    }
  }
  /* Проекция 3D-окружности (центр c, нормаль n, радиус r) в поле f */
  circle3(f, c, n, r, cls, layer) {
    const e1 = V.anyPerp(n), e2 = V.unit(V.cross(n, e1));
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const a = i / 72 * 2 * Math.PI;
      pts.push(f.project(V.add(c, V.add(V.scale(e1, r * Math.cos(a)), V.scale(e2, r * Math.sin(a))))));
    }
    return this.poly(pts, cls, layer);
  }
  /* Дужка угла между лучами (o->p) и (o->q), радиус r, с подписью */
  angleArc(o, p, q, r, text, cls) {
    const a1 = Math.atan2(p[1] - o[1], p[0] - o[0]);
    let a2 = Math.atan2(q[1] - o[1], q[0] - o[0]);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const steps = 24, pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = a1 + d * i / steps;
      pts.push([o[0] + r * Math.cos(a), o[1] + r * Math.sin(a)]);
    }
    this.poly(pts, (cls || '') + ' ln-thin', 'accent');
    if (text) {
      const am = a1 + d / 2;
      this.label([o[0] + (r + 12) * Math.cos(am) - 8, o[1] + (r + 12) * Math.sin(am) + 4], text, cls || '', 0, 0);
    }
    return Math.abs(d);
  }
  /* Значок прямого угла в вершине o между направлениями на p и q */
  rightAngle(o, p, q, size) {
    const s = size || 8;
    const u = U2.unit(U2.sub(p, o)), v = U2.unit(U2.sub(q, o));
    const a = U2.add(o, U2.scale(u, s)), b = U2.add(o, U2.scale(v, s));
    const c = U2.add(a, U2.scale(v, s));
    this.poly([a, c, b], 'ln-thin', 'accent');
  }
  /* Размер (выноска) между экранными точками */
  dim(p, q, text, off) {
    const u = U2.unit(U2.sub(q, p)), n = U2.perp(u), o = off === undefined ? 14 : off;
    const p2 = U2.add(p, U2.scale(n, o)), q2 = U2.add(q, U2.scale(n, o));
    this.line(p, p2, 'ln-thin', 'accent'); this.line(q, q2, 'ln-thin', 'accent');
    this.line(p2, q2, 'ln-dim', 'accent');
    const mid = U2.scale(U2.add(p2, q2), 0.5);
    this.label([mid[0] + n[0] * 12 - 10, mid[1] + n[1] * 12], text, 'lbl-dim', 0, 0);
  }
  /* Засечки равенства: n коротких штрихов поперёк отрезка p–q (отмечают
   * переносимые/равные расстояния, как принято на учебных эпюрах). */
  ticks(p, q, n = 1, cls) {
    const u = U2.unit(U2.sub(q, p)), nn = U2.perp(u);
    const mid = U2.scale(U2.add(p, q), .5);
    for (let i = 0; i < n; i++) {
      const c = U2.add(mid, U2.scale(u, (i - (n - 1) / 2) * 5));
      // засечка — короткий штрих под углом к отрезку
      const a = U2.add(U2.add(c, U2.scale(nn, 5)), U2.scale(u, 2.5));
      const b = U2.add(U2.add(c, U2.scale(nn, -5)), U2.scale(u, -2.5));
      this.line(a, b, (cls || 'ln-thin') + ' tickmark', 'accent');
    }
  }
  /* Перетаскиваемая ручка. id — уникален в пределах доски; getPos() — экранная
   * позиция; onDrag(экранная точка) — обратная связь. Создаётся один раз. */
  handle(id, getPos, onDrag, opts = {}) {
    let h = this.handlers.find(x => x.id === id);
    if (!h) {
      const g = svgEl('g', { class: 'handle ' + (opts.cls || '') }, this.layers['handles']);
      svgEl('circle', { r: opts.r || 11, class: 'handle-halo' }, g);
      svgEl('circle', { r: 4.5, class: 'handle-core' }, g);
      h = { id, g, onDrag };
      this.handlers.push(h);
      const svg = this.svg;
      const toLocal = ev => {
        const pt = svg.createSVGPoint();
        pt.x = ev.clientX; pt.y = ev.clientY;
        const m = svg.getScreenCTM().inverse();
        const r = pt.matrixTransform(m);
        return [r.x, r.y];
      };
      g.addEventListener('pointerdown', ev => {
        ev.preventDefault(); g.setPointerCapture(ev.pointerId);
        g.classList.add('drag');
        const move = e => { h.onDrag(toLocal(e)); };
        const up = e => {
          g.classList.remove('drag');
          g.removeEventListener('pointermove', move);
          g.removeEventListener('pointerup', up);
        };
        g.addEventListener('pointermove', move);
        g.addEventListener('pointerup', up);
      });
    }
    h.onDrag = onDrag; // всегда свежий замыкание-колбэк
    const p = getPos();
    h.g.setAttribute('transform', `translate(${p[0]},${p[1]})`);
    h.g.style.display = opts.hidden ? 'none' : '';
    return h;
  }
}

/* ---------- Пошаговый плеер ---------- */
/* steps: [{title, text}] ; onStep(i) вызывается при каждой смене шага.
 * Рендерится панель с кнопками и описанием текущего шага. */
class Stepper {
  constructor(container, steps, onStep, opts = {}) {
    this.el = typeof container === 'string' ? document.querySelector(container) : container;
    this.steps = steps; this.onStep = onStep;
    this.i = opts.start || 0;
    this.el.classList.add('stepper');
    this.el.innerHTML = `
      <div class="stepper-bar">
        <button class="btn st-prev" title="Предыдущий шаг">←</button>
        <div class="st-dots"></div>
        <button class="btn st-next" title="Следующий шаг">→</button>
        <button class="btn st-all" title="Показать всё построение">всё</button>
      </div>
      <div class="st-body"><div class="st-title"></div><div class="st-text"></div></div>`;
    this.dots = this.el.querySelector('.st-dots');
    steps.forEach((s, k) => {
      const d = document.createElement('button');
      d.className = 'st-dot'; d.title = s.title; d.textContent = k + 1;
      d.addEventListener('click', () => this.go(k));
      this.dots.appendChild(d);
    });
    this.el.querySelector('.st-prev').addEventListener('click', () => this.go(this.i - 1));
    this.el.querySelector('.st-next').addEventListener('click', () => this.go(this.i + 1));
    this.el.querySelector('.st-all').addEventListener('click', () => this.go(this.steps.length - 1));
    this.go(this.i);
  }
  go(i) {
    this.i = Math.max(0, Math.min(this.steps.length - 1, i));
    const s = this.steps[this.i];
    this.el.querySelector('.st-title').innerHTML =
      `<span class="st-num">Шаг ${this.i + 1}/${this.steps.length}.</span> ${s.title}`;
    this.el.querySelector('.st-text').innerHTML = s.text || '';
    [...this.dots.children].forEach((d, k) => {
      d.classList.toggle('on', k === this.i);
      d.classList.toggle('done', k < this.i);
    });
    this.onStep(this.i);
  }
}

/* ---------- мелочи ---------- */
function fmt(x, d = 1) { return (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('ru-RU'); }
function deg(rad) { return rad * 180 / Math.PI; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

/* Пересечение луча (o, d) с треугольником (p0,p1,p2). Возвращает t или null. */
function rayTriangle(o, d, p0, p1, p2) {
  const e1 = V.sub(p1, p0), e2 = V.sub(p2, p0);
  const h = V.cross(d, e2), a = V.dot(e1, h);
  if (Math.abs(a) < 1e-9) return null;
  const f = 1 / a, s = V.sub(o, p0);
  const u = f * V.dot(s, h);
  if (u < -1e-7 || u > 1 + 1e-7) return null;
  const q = V.cross(s, e1), v = f * V.dot(d, q);
  if (v < -1e-7 || u + v > 1 + 1e-7) return null;
  const t = f * V.dot(e2, q);
  return t > 1e-6 ? t : null;
}

/* Изометрическое «поле» для наглядного 3D-вида (не эпюр, а аксонометрия). */
function isoField(axisO, scale = 1) {
  // стандартная изометрия: x влево-вниз, y вправо-вниз, z вверх
  const f = {
    scale,
    project(P) {
      const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
      return [axisO[0] + (P[1] - P[0]) * c * scale,
              axisO[1] + ((P[0] + P[1]) * s - P[2]) * scale];
    },
  };
  return f;
}

/* Выравнивание дополнительного поля: подбирает s0 так, чтобы линия связи от
 * refScr (проекция опорной точки в родительском поле) была перпендикулярна
 * новой оси — как на настоящем чертеже. */
function alignField(f, P3, refScr) {
  f.s0 = 0;
  const d = U2.sub(refScr, f.axisO);
  f.s0 = U2.dot(d, f.axisDir) - V.dot(P3, f.a);
}

/* Сдвиг поля вдоль нормали к его оси, чтобы все точки попали в рамку доски
 * (двигать поле можно только поперёк оси — линии связи остаются
 * перпендикулярными оси). Решаем интервалом допустимых сдвигов s. */
function fitField(f, projFn, w, h, pad = 22) {
  const n = U2.perp(f.axisDir);
  let lo = -1e9, hi = 1e9;
  for (const p of projFn()) {
    for (const [val, nc, mn, mx] of [[p[0], n[0], pad, w - pad], [p[1], n[1], pad, h - pad]]) {
      if (Math.abs(nc) < 1e-9) continue;
      const a = (mn - val) / nc, b = (mx - val) / nc;
      lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
    }
  }
  const s = lo > hi ? (lo + hi) / 2 : clamp(0, lo, hi);
  f.axisO = U2.add(f.axisO, U2.scale(n, s));
}

/* Как fitField, но сначала пытается пододвинуть центр поля к целевой точке
 * target (в свободную зону чертежа), насколько позволяет рамка. */
function fitFieldToward(f, projFn, target, w, h, pad = 22) {
  const n = U2.perp(f.axisDir);
  const pts = projFn();
  if (!pts.length) return;
  const cen = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
  let lo = -1e9, hi = 1e9;
  for (const p of pts) {
    for (const [val, nc, mn, mx] of [[p[0], n[0], pad, w - pad], [p[1], n[1], pad, h - pad]]) {
      if (Math.abs(nc) < 1e-9) continue;
      const a = (mn - val) / nc, b = (mx - val) / nc;
      lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
    }
  }
  const wish = U2.dot(U2.sub(target, cen), n);
  const s = lo > hi ? (lo + hi) / 2 : clamp(wish, lo, hi);
  f.axisO = U2.add(f.axisO, U2.scale(n, s));
}

/* Изометрия, автоматически вписанная в доску: по набору 3D-точек подбирает
 * масштаб и сдвиг так, чтобы всё поместилось с полями pad. */
/* Все восемь углов габарита набора точек. Изометрия «разворачивает» габарит,
   и если в подгонку отдать только две противоположные вершины, ширина картинки
   выходит заниженной в разы — рисунок вылезает за рамку. */
function boxCorners3(pts3) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of pts3)
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
  const out = [];
  for (const x of [lo[0], hi[0]])
    for (const y of [lo[1], hi[1]])
      for (const z of [lo[2], hi[2]]) out.push([x, y, z]);
  return out;
}

/* Точка выхода луча (p, направление d) за прямоугольник доски: лучи,
   уходящие «в бесконечность», обрезаются по рамке, а не рисуются мимо неё. */
function rayExit(p, d, w, h, pad = 4) {
  let t = Infinity;
  const lim = (num, den) => {
    if (Math.abs(den) < 1e-9) return;
    const s = num / den;
    if (s > 1e-6) t = Math.min(t, s);
  };
  lim(pad - p[0], d[0]); lim(w - pad - p[0], d[0]);
  lim(pad - p[1], d[1]); lim(h - pad - p[1], d[1]);
  if (!isFinite(t)) t = 0;
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}

function fittedIso(pts3, w, h, pad = 30, maxScale = 1.6) {
  const base = isoField([0, 0], 1);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of boxCorners3(pts3)) {
    const q = base.project(p);
    x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]);
    y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
  }
  const bw = Math.max(x1 - x0, 1), bh = Math.max(y1 - y0, 1);
  const k = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh, maxScale);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const anchor = [w / 2 - cx * k, h / 2 - cy * k];
  return isoField(anchor, k);
}

/* Рамки плоскостей проекций π1 (фронтальная, y=0) и π2 (горизонтальная, z=0)
 * в изометрическом виде + ось X12. ex/ey/ez — размеры рамок в мировых единицах. */
function isoPlanes(B, iso, ex, ey, ez, x0 = 0) {
  const O = [x0, 0, 0];
  B.poly([iso.project(O), iso.project([ex, 0, 0]), iso.project([ex, 0, ez]), iso.project([x0, 0, ez])],
    'ln-thin gray', 'aux', true);
  B.poly([iso.project(O), iso.project([ex, 0, 0]), iso.project([ex, ey, 0]), iso.project([x0, ey, 0])],
    'ln-thin gray', 'aux', true);
  B.label(iso.project([x0 + 12, 0, ez]), 'π1', 'gray', 0, 14);
  B.label(iso.project([x0 + 14, ey, 0]), 'π2', 'gray', 0, -4);
  B.line(iso.project(O), iso.project([ex, 0, 0]), 'ln-axis');
  B.label(iso.project([ex - 20, 0, 0]), 'X12', 'lbl-axis', 2, -6);
}

/* Четырёхугольник произвольной плоскости в изометрии: origin + s·u + t·v. */
function isoQuad(B, iso, origin, u, v, s0, s1, t0, t1, cls) {
  const c = (s, t) => iso.project(V.add(origin, V.add(V.scale(u, s), V.scale(v, t))));
  return B.poly([c(s0, t0), c(s1, t0), c(s1, t1), c(s0, t1)], cls || 'ln-thin gray fill-soft', 'aux', true);
}

/* Точка на изометрии с проекционной ломаной (точка, её проекции на π1/π2,
 * вспомогательные линии). Возвращает экранные точки. */
function isoPointWithProjections(B, iso, P, name, cls) {
  const Pi = iso.project(P), P1 = iso.project([P[0], 0, P[2]]), P2 = iso.project([P[0], P[1], 0]);
  const Px = iso.project([P[0], 0, 0]);
  B.line(Pi, P1, 'ln-link'); B.line(Pi, P2, 'ln-link');
  B.line(P1, Px, 'ln-link'); B.line(P2, Px, 'ln-link');
  B.dot(Pi, cls || ''); B.label(Pi, name, cls || '');
  B.labeledDot(P1, name + '1', cls || '');
  B.labeledDot(P2, name + '2', cls || '');
  return { Pi, P1, P2 };
}
