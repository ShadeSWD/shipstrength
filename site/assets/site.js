/* Каркас страниц «Строймех корабля». */
'use strict';
(function () {
  const me = document.currentScript;
  const root = (me && me.dataset.root) || './';
  const page = (me && me.dataset.page) || '';
  const logoSvg = `
  <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
    <rect x="1" y="1" width="28" height="28" rx="6" fill="#8a3d2c"/>
    <line x1="4" y1="20" x2="26" y2="20" stroke="#fff" stroke-width="2.6"/>
    <path d="M5 20 l-3 5 h6 z M25 20 l-3 5 h6 z" fill="#fff"/>
    <path d="M8 20 Q 15 9 22 20" fill="none" stroke="#e2a13b" stroke-width="2"/>
  </svg>`;
  const nav = [
    { href: '', key: 'index', title: 'Главная' },
    { href: 'solver', key: 'solver', title: 'Балки и эпюры' },
    { href: 'brus', key: 'brus', title: 'Общая прочность' },
    { href: 'theory', key: 'theory', title: 'Теория' },
    { href: 'sources', key: 'sources', title: 'Источники' },
  ];
  const header = document.createElement('header');
  header.className = 'site';
  header.innerHTML = `<div class="wrap">
    <a class="logo" href="${root}">${logoSvg}<span>Строительная механика корабля</span></a>
    <nav class="top">${nav.map(({ href, key, title }) =>
      `<a href="${root}${href}" class="${page === key ? 'on' : ''}">${title}</a>`).join('')}</nav>
  </div>`;
  document.body.prepend(header);
  const footer = document.createElement('footer');
  footer.className = 'site';
  footer.innerHTML = `<div class="wrap">
    <div>Учебный сайт по курсу «Строительная механика корабля» · расчёты в браузере</div>
  </div>`;
  document.body.appendChild(footer);
})();
