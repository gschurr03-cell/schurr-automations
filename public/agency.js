(() => {
  const menus = [...document.querySelectorAll('.mobile-nav,.solutions-menu')];
  menus.forEach(menu => {
    menu.addEventListener('click', event => { if (event.target.closest('a')) menu.removeAttribute('open'); });
    menu.addEventListener('toggle', () => { if (menu.open) menus.forEach(other => {if (other !== menu) other.removeAttribute('open');}); });
  });
  document.addEventListener('click', event => menus.forEach(menu => {if (!menu.contains(event.target)) menu.removeAttribute('open');}));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') menus.forEach(menu => {if(menu.open){menu.removeAttribute('open');menu.querySelector('summary').focus();}}); });
  const aliases = {workflows:'how-it-works',services:'what-we-install'};
  if (location.hash === '#about') location.replace('/meet-gavin/');
  const target = aliases[location.hash.slice(1)];
  if (target) document.getElementById(target)?.scrollIntoView();
  if (!document.querySelector('#inquiry-form')) fetch('/api/metrics', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'page_view',route:location.pathname === '/' ? '/' : location.pathname.replace(/\/$/,'')+'/',service:'general'}),keepalive:true}).catch(() => {});
  // Count an explicit action, never infer a call, sale or confirmed meeting.
  document.addEventListener('click', event => {
    if (document.querySelector('#inquiry-form')) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link) return;
    const destination = new URL(link.href, location.href);
    let name = null;
    if (destination.protocol === 'tel:') name = destination.pathname === '+19857710552' ? 'demo_phone_clicked' : 'call_click';
    else if (destination.origin === location.origin && /^\/book\/?$/.test(destination.pathname)) name = 'fit_cta_clicked';
    else if (destination.origin === location.origin && destination.pathname === '/resources/inquiry-checklist/') name = 'worksheet_opened';
    if (!name) return;
    fetch('/api/metrics', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:name,route:location.pathname === '/' ? '/' : location.pathname.replace(/\/$/,'')+'/',service:'general'}),keepalive:true}).catch(() => {});
  });
})();
