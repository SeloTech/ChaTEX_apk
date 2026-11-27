// ============================================================
//  ChaTEX — настройки по разделам (как в Telegram)
//  Не переписывает старые поля: переносит существующие блоки (с их id и
//  обработчиками) по страницам и добавляет язык, хранилище, «О приложении».
// ============================================================
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const T = s => (window.TX ? window.TX.tr(s) : s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function build() {
    const ov = $('#settings-modal'); const box = ov && $('.settings-modal', ov);
    if (!box || box.dataset.tg) return false;
    const sec = {
      notif: $('#toggle-pushnotif')?.closest('.settings-section'),
      privacy: $('#toggle-lastseen')?.closest('.settings-section'),
      look: $('#theme-grid')?.closest('.settings-section'),
      storage: $('#cloudinary-name')?.closest('.settings-section'),
      premium: $('#settings-premium-section'),
      account: $('.logout-btn', ov)?.closest('.settings-section')
    };
    if (Object.values(sec).some(x => !x)) return false;
    box.dataset.tg = '1'; box.classList.add('tg-set');
    const logout = $('.logout-btn', sec.account);

    const mk = (html, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.innerHTML = html; return d; };
    const head = mk(`<button class="tg-back" aria-label="Назад">‹</button><div class="tg-title">Настройки</div><button class="tg-x" aria-label="Закрыть">✕</button>`, 'tg-top');
    const body = mk('', 'tg-body');
    const page = (id, ...nodes) => { const p = mk('', 'tg-page'); p.dataset.page = id; nodes.forEach(n => n && p.appendChild(n)); body.appendChild(p); return p; };

    const row = (go, ic, bg, label, extra = '') => `<div class="tg-row" data-go="${go}"><span class="tg-ic" style="background:${bg}">${ic}</span><span class="tg-lbl">${label}</span><span class="tg-val" ${extra}></span><span class="tg-chev">›</span></div>`;
    const main = mk(`
      <div class="tg-profile" data-go="@profile"><div class="tg-pav" id="tg-pav"></div><div class="tg-pname" id="tg-pname">…</div><div class="tg-puser" id="tg-puser"></div></div>
      <div class="tg-group">
        ${row('@profile', '<i class="ic ic-profile"></i>', '#3d8bff', 'Мой аккаунт')}
        ${row('notif', '<i class="ic ic-notifications"></i>', '#ff5a5a', 'Уведомления и звуки')}
        ${row('privacy', '<i class="ic ic-lock"></i>', '#34c759', 'Конфиденциальность')}
        ${row('devices', '<i class="ic ic-layers"></i>', '#0a84ff', 'Устройства')}
        ${row('us', '<i class="ic ic-group"></i>', '#ff2d55', 'О нас')}
        ${row('storage', '<i class="ic ic-database"></i>', '#ff9f0a', 'Данные и хранилище')}
        ${row('look', '<i class="ic ic-appearance"></i>', '#af52de', 'Внешний вид')}
        ${row('lang', '<i class="ic ic-language"></i>', '#32ade6', 'Язык', 'id="tg-lang-val" data-no-i18n')}
      </div>
      <div class="tg-group">
        ${row('premium', '✦', 'linear-gradient(135deg,#ffb800,#ff6a00)', 'ChaTEX Premium')}
        ${row('@help', '<i class="ic ic-chat"></i>', '#5e5ce6', 'Помощь')}
        ${row('about', '<i class="ic ic-info"></i>', '#8e8e93', 'О приложении')}
      </div>
      <div class="tg-group tg-logout"></div>
      <div class="tg-group">${row('terms', '<i class="ic ic-document"></i>', '#8e8e93', 'Пользовательское соглашение')}</div>`, 'tg-main');
    $('.tg-logout', main).appendChild(logout);
    page('main', main);

    // существующие блоки переезжают на свои страницы (id и обработчики сохраняются)
    // «Конфиденциальность»: сюда добавляются код-пароль и облачный пароль (38-security.js)
    page('notif', sec.notif); page('privacy', sec.privacy, mk('<div id="tg-sec-host"></div>')); page('look', sec.look); page('premium', sec.premium);
    // «Устройства»: список входов (38-security.js)
    page('devices', mk('<div id="tg-dev-host"></div>'));
    page('us', mk('<div id="tg-us-host"></div>'));
    page('terms', mk('<div id="tg-terms-host"></div>'));

    // Данные и хранилище: добавляем блок «Использовано» и очистку
    const usage = mk(`
      <div class="settings-row"><div class="settings-row-info"><div class="settings-row-label">Использовано на этом устройстве</div><div class="settings-row-desc" id="tg-usage" data-no-i18n>—</div></div></div>
      <button class="tg-btn" id="tg-clear">Очистить кэш и черновики</button>`, 'settings-section');
    page('storage', usage, sec.storage);

    // Язык
    const langBox = mk('<div class="tg-hint">Выберите язык интерфейса</div><div class="tg-group" id="tg-langs"></div>', 'tg-langpage');
    page('lang', langBox);

    // О приложении
    const about = mk(`<div class="tg-about"><div class="tg-logo">ChaTEX</div><div class="tg-ver" data-no-i18n>v${esc(typeof APP_VERSION !== 'undefined' ? APP_VERSION : '')}</div></div>
      <div class="tg-group"><div class="tg-row" data-go="@help"><span class="tg-ic" style="background:#5e5ce6"><i class="ic ic-security"></i></span><span class="tg-lbl">Поддержка и жалобы</span><span class="tg-chev">›</span></div></div>`, 'tg-aboutpage');
    page('about', about);

    box.textContent = '';
    box.appendChild(head); box.appendChild(body);
    // скрываем старые h4-заголовки (их заменяет заголовок страницы)
    box.querySelectorAll('.tg-page .settings-section > h4').forEach(h => h.style.display = 'none');
    wire(ov, box, head, body);
    return true;
  }

  const TITLES = { main: 'Настройки', notif: 'Уведомления и звуки', privacy: 'Конфиденциальность', devices: 'Устройства', us: 'О нас', terms: 'Пользовательское соглашение', storage: 'Данные и хранилище', look: 'Внешний вид', lang: 'Язык', premium: 'ChaTEX Premium', about: 'О приложении' };
  let cur = 'main', stack = [];

  function wire(ov, box, head, body) {
    const title = $('.tg-title', head), back = $('.tg-back', head), x = $('.tg-x', head);
    function go(p, push = true) {
      if (push && cur !== p) stack.push(cur);
      cur = p;
      body.querySelectorAll('.tg-page').forEach(el => el.classList.toggle('on', el.dataset.page === p));
      title.textContent = T(TITLES[p] || 'Настройки');
      back.style.visibility = p === 'main' ? 'hidden' : 'visible';
      body.scrollTop = 0;
      if (p === 'lang') renderLangs();
      if (p === 'storage') refreshUsage();
      if (p === 'us' && window.TXLegal) TXLegal.renderUs();
      if (p === 'terms' && window.TXLegal) TXLegal.renderTerms();
      if (p === 'devices' && window.TXSec) TXSec.renderDevices();
      if (p === 'privacy' && window.TXSec) TXSec.renderPrivacy();
    }
    window.__txSettingsGo = go;
    back.onclick = () => go(stack.pop() || 'main', false);
    x.onclick = () => closeModal('settings-modal');
    ov.addEventListener('mousedown', e => { if (e.target === ov) closeModal('settings-modal'); });
    box.addEventListener('click', e => {
      const r = e.target.closest('[data-go]'); if (!r) return;
      const g = r.dataset.go;
      if (g === '@profile') { closeModal('settings-modal'); setTimeout(() => { try { openViewProfile('self'); } catch (_) {} }, 80); }
      else if (g === '@help') { closeModal('settings-modal'); setTimeout(() => { try { openSupport(); } catch (_) {} }, 80); }
      else go(g);
    });
    $('#tg-clear', box).onclick = async () => {
      try {
        Object.keys(localStorage).filter(k => k.startsWith('tx_draft_')).forEach(k => localStorage.removeItem(k));
        if (window.caches) (await caches.keys()).forEach(k => caches.delete(k));
      } catch (_) {}
      refreshUsage(); toast('Кэш очищен');
    };
    document.addEventListener('tx:lang', () => { title.textContent = T(TITLES[cur] || 'Настройки'); renderLangs(); langVal(); });
    langVal(); go('main', false);
  }

  function langVal() { const e = $('#tg-lang-val'); if (e && window.TX) { const l = TX.LANGS.find(x => x.code === TX.getLang()); e.textContent = l ? l.flag + ' ' + l.name : ''; } }
  function renderLangs() {
    const host = $('#tg-langs'); if (!host || !window.TX) return;
    host.innerHTML = TX.LANGS.map(l => `<div class="tg-row${l.code === TX.getLang() ? ' sel' : ''}" data-lang="${l.code}" data-no-i18n><span class="tg-ic tg-flag">${l.flag}</span><span class="tg-lbl">${esc(l.name)}</span><span class="tg-check">${l.code === TX.getLang() ? '✓' : ''}</span></div>`).join('');
    host.querySelectorAll('[data-lang]').forEach(r => r.onclick = e => { e.stopPropagation(); TX.setLang(r.dataset.lang); toast('Язык изменён'); });
  }
  async function refreshUsage() {
    const el = $('#tg-usage'); if (!el) return;
    try { const e = await navigator.storage.estimate(); el.textContent = ((e.usage || 0) / 1048576).toFixed(1) + ' MB'; } catch (_) { el.textContent = '—'; }
  }
  function fillProfile() {
    const u = (typeof currentUserData !== 'undefined' && currentUserData) || {};
    const av = $('#tg-pav'), src = $('#my-avatar-el');
    if (av && src) av.innerHTML = src.innerHTML || esc((u.username || '?')[0]);
    const n = $('#tg-pname'); if (n) n.innerHTML = esc(u.username || '') + (typeof roleBadgesHtml === 'function' ? roleBadgesHtml(u) : '');
    const s = $('#tg-puser'); if (s) s.textContent = '@' + (u.username || '');
  }

  function ready(fn) { (document.readyState === 'loading') ? document.addEventListener('DOMContentLoaded', fn) : fn(); }
  ready(() => {
    build();
    const _open = window.openSettings;
    if (typeof _open === 'function') window.openSettings = function () { const r = _open.apply(this, arguments); build(); fillProfile(); stack = []; if (window.__txSettingsGo) window.__txSettingsGo('main', false); langVal(); return r; };
    // автосохранение при закрытии (в стиле Telegram — без кнопки «Сохранить»)
    const _close = window.closeModal;
    window.closeModal = function (id) {
      if (id === 'settings-modal') { try { if (currentUser && typeof userSettings !== 'undefined') { db.ref('users/' + currentUser.uid + '/settings').set(userSettings); currentUserData.settings = userSettings; } } catch (_) {} }
      return _close.apply(this, arguments);
    };
  });
})();
