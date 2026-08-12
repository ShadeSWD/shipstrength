/* Решатель неразрезной многопролётной балки методом трёх моментов.
 * Нагрузки: равномерная q по пролёту + сосредоточенная P в точке a.
 * Эпюры Q, M и прогиб (двойное интегрирование M/EI). Единицы: м, кН. */
'use strict';

const stB = {
  spans: [
    { L: 4, q: 20, P: 0, a: 2 },
    { L: 5, q: 12, P: 60, a: 2.5 },
    { L: 4, q: 20, P: 0, a: 2 },
  ],
  E: 206e6,      // кПа (=206 ГПа)
  I: 8000e-8,    // м⁴ (=8000 см⁴)
};

/* прогонка трёхдиагональной системы */
function thomas(a, b, c, d) {
  const n = d.length, cp = new Array(n), dp = new Array(n), x = new Array(n);
  cp[0] = c[0] / b[0]; dp[0] = d[0] / b[0];
  for (let i = 1; i < n; i++) {
    const m = b[i] - a[i] * cp[i - 1];
    cp[i] = c[i] / m;
    dp[i] = (d[i] - a[i] * dp[i - 1]) / m;
  }
  x[n - 1] = dp[n - 1];
  for (let i = n - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1];
  return x;
}

/* грузовые члены 6Aa/L и 6Bb/L пролёта */
function loadTerms(sp) {
  let left = 0, right = 0; // 6Aa/L (для опоры слева) и 6Bb/L (справа)
  if (sp.q) { left += sp.q * sp.L ** 3 / 4; right += sp.q * sp.L ** 3 / 4; }
  if (sp.P) {
    const a = clamp(sp.a, 0, sp.L), b = sp.L - a;
    left += sp.P * a * (sp.L * sp.L - a * a) / sp.L;
    right += sp.P * b * (sp.L * sp.L - b * b) / sp.L;
  }
  return { left, right };
}

/* опорные моменты (Mi на промежуточных опорах; крайние = 0) */
function supportMoments() {
  const sp = stB.spans, n = sp.length;
  if (n === 1) return [0, 0];
  const N = n - 1; // неизвестных
  const A = new Array(N).fill(0), B = new Array(N).fill(0),
        C = new Array(N).fill(0), D = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    const Ll = sp[i].L, Lr = sp[i + 1].L;
    A[i] = Ll; B[i] = 2 * (Ll + Lr); C[i] = Lr;
    const tl = loadTerms(sp[i]), tr = loadTerms(sp[i + 1]);
    D[i] = -(tl.right + tr.left);
  }
  const M = thomas(A, B, C, D);
  return [0, ...M, 0];
}

/* эпюры: массивы точек по всей балке */
function diagrams() {
  const sp = stB.spans, Ms = supportMoments();
  const NP = 60;
  const Q = [], M = [], X = [];
  let x0 = 0;
  const reactions = [];
  for (let i = 0; i < sp.length; i++) {
    const { L, q, P } = sp[i], a = clamp(sp[i].a, 0, L);
    const Ml = Ms[i], Mr = Ms[i + 1];
    // балочная (простая) часть + линейная от опорных моментов
    const Qcorr = (Mr - Ml) / L;
    // реакция простой балки слева
    const R0 = (q * L) / 2 + (P ? P * (L - a) / L : 0);
    for (let k = 0; k <= NP; k++) {
      const x = k / NP * L;
      let Qs = R0 - q * x - (P && x > a ? P : 0);
      let Msmp = R0 * x - q * x * x / 2 - (P && x > a ? P * (x - a) : 0);
      X.push(x0 + x);
      Q.push(Qs + Qcorr);
      M.push(Msmp + Ml + (Mr - Ml) * x / L);
    }
    x0 += L;
  }
  // реакции опор = скачки Q
  const Ltot = x0;
  const sup = [0]; let acc = 0;
  for (const s of sp) { acc += s.L; sup.push(acc); }
  for (let s = 0; s < sup.length; s++) {
    // Q справа минус Q слева на опоре
    let qr = 0, ql = 0;
    for (let j = 0; j < X.length; j++) {
      if (Math.abs(X[j] - sup[s]) < 1e-9) {
        if (j > 0 && Math.abs(X[j - 1] - sup[s]) < 1e-9) { } // граница пролётов
      }
    }
    // проще: считаем аналитически
  }
  // аналитические реакции: R_i = скачок Q на опоре
  const R = [];
  for (let i = 0; i <= sp.length; i++) {
    let right = 0, left = 0;
    if (i < sp.length) {
      const s = sp[i], a = clamp(s.a, 0, s.L);
      right = (s.q * s.L) / 2 + (s.P ? s.P * (s.L - a) / s.L : 0) + (Ms[i + 1] - Ms[i]) / s.L;
    }
    if (i > 0) {
      const s = sp[i - 1], a = clamp(s.a, 0, s.L);
      // Q в конце пролёта
      left = (s.q * s.L) / 2 + (s.P ? s.P * (s.L - a) / s.L : 0) + (Ms[i] - Ms[i - 1]) / s.L
        - s.q * s.L - (s.P ? s.P : 0);
    }
    R.push(right - left);
  }
  // прогиб: v'' = M/EI, двойное интегрирование; v(0)=0, θ0 из v(последняя опора)=0
  const EI = stB.E * stB.I;
  const n = X.length;
  const th = new Array(n).fill(0), v0 = new Array(n).fill(0);
  for (let j = 1; j < n; j++) {
    const dx = X[j] - X[j - 1];
    th[j] = th[j - 1] + (M[j] + M[j - 1]) / 2 / EI * dx;
    v0[j] = v0[j - 1] + (th[j] + th[j - 1]) / 2 * dx;
  }
  const theta0 = -v0[n - 1] / Ltot;
  const V = v0.map((v, j) => v + theta0 * X[j]);
  return { X, Q, M, V, R, Ms, sup, Ltot };
}
