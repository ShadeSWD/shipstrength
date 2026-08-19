/* Данные каркаса страниц «Строительная механика корабля». Машинерия — assets/shell.js. */
'use strict';
(function () {
  const me = document.currentScript;
  buildSiteShell({
    root: (me && me.dataset.root) || './',
    page: (me && me.dataset.page) || '',
    brand: 'Строительная механика корабля',
    logo: `
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
    <rect x="1" y="1" width="28" height="28" rx="6" fill="#8a3d2c"/>
    <line x1="4" y1="20" x2="26" y2="20" stroke="#fff" stroke-width="2.6"/>
    <path d="M5 20 l-3 5 h6 z M25 20 l-3 5 h6 z" fill="#fff"/>
    <path d="M8 20 Q 15 9 22 20" fill="none" stroke="#e2a13b" stroke-width="2"/>
  </svg>`,
    nav: [
      { h: '', k: 'index', t: 'Обзор' },
      { t: 'Теория', h: 'theory', drop: [
        { h: 'theory', k: 'theory', t: 'Оглавление курса' },
        { h: 't-elastic', k: 'theory', t: '1. Расчётные схемы и эпюры' },
        { h: 't-bend', k: 'theory', t: '2. Напряжения при изгибе' },
        { h: 't-3m', k: 'theory', t: '3. Уравнение трёх моментов' },
        { h: 't-energy', k: 'theory', t: '4. Энергетические методы' },
        { h: 't-grillage', k: 'theory', t: '5. Судовые перекрытия' },
        { h: 't-hullgirder', k: 'theory', t: '6. Общая прочность' },
        { h: 't-plates', k: 'theory', t: '7. Пластины' },
        { h: 't-ultimate', k: 'theory', t: '8. Предельная прочность' },
      ] },
      { t: 'Задачи', h: 'solver', drop: [
        { h: 'solver', k: 'solver', t: 'Неразрезная балка' },
        { h: 'brus', k: 'brus', t: 'Эквивалентный брус' },
      ] },
      { h: 'sources', k: 'sources', t: 'Источники' },
    ],
    footer: `<div>Учебный сайт по курсу «Строительная механика корабля» · расчёты в браузере</div>`,
  });
})();
