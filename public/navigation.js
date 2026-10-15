(() => {
  const menu = document.querySelector('.menu-button');
  const nav = document.querySelector('#mobile-nav');
  if (!menu || !nav) return;
  const setMenu = open => {
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    nav.hidden = !open;
  };
  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !nav.hidden) {setMenu(false);menu.focus();} });
  const desktop = matchMedia('(min-width:1001px)');
  desktop.addEventListener('change', e => {if(e.matches)setMenu(false);});
})();
