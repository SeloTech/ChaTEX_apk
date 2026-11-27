// ============================================================
//  ChaTEX — мобильная адаптация и PWA
//  Высота под клавиатуру · системная кнопка «Назад» · свайп от края ·
//  установка на главный экран (manifest + service worker)
// ============================================================
(function () {
  'use strict';
  const root = document.documentElement;
  const mobile = () => window.innerWidth <= 640;

  // 1) Реальная высота экрана (учитывает клавиатуру и панели браузера)
  function setH() {
    const h = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
    root.style.setProperty('--app-h', h + 'px');
    root.classList.toggle('is-mobile', mobile());
    root.classList.toggle('is-touch', matchMedia('(pointer:coarse)').matches);
  }
  setH();
  window.addEventListener('resize', setH);
  if (window.visualViewport) { visualViewport.addEventListener('resize', setH); visualViewport.addEventListener('scroll', () => window.scrollTo(0, 0)); }
  window.addEventListener('orientationchange', () => setTimeout(setH, 250));

  // 2) Системная кнопка «Назад» на Android / жест «назад» на iOS закрывает чат, а не приложение
  let fromPop = false;
  function install() {
    const _show = window.showChat, _back = window.goBack;
    if (typeof _show === 'function') window.showChat = function () {
      _show.apply(this, arguments);
      if (mobile() && !(history.state && history.state.tx)) { try { history.pushState({ tx: 1 }, ''); } catch (_) {} }
    };
    if (typeof _back === 'function') window.goBack = function () {
      if (mobile() && history.state && history.state.tx && !fromPop) { history.back(); return; }
      return _back.apply(this, arguments);
    };
    window.addEventListener('popstate', () => {
      const ca = document.getElementById('chat-area');
      if (mobile() && ca && ca.classList.contains('visible')) { fromPop = true; try { _back(); } finally { fromPop = false; } }
    });
  }
  install();

  // 3) Свайп вправо от левого края — назад к списку чатов
  let sx = 0, sy = 0, tracking = false;
  document.addEventListener('touchstart', e => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
    const ca = document.getElementById('chat-area');
    tracking = mobile() && sx < 28 && ca && ca.classList.contains('visible');
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!tracking) return; tracking = false;
    const t = e.changedTouches[0];
    if (t.clientX - sx > 70 && Math.abs(t.clientY - sy) < 50) { try { goBack(); } catch (_) {} }
  }, { passive: true });

  // 4) Поле ввода не должно «прятаться» за клавиатурой
  document.addEventListener('focusin', e => {
    if (e.target && e.target.id === 'msg-input' && mobile()) setTimeout(() => { const a = document.getElementById('messages-area'); if (a) a.scrollTop = a.scrollHeight; }, 280);
  });

  // 5) PWA: service worker (нужен для «Установить приложение»)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
