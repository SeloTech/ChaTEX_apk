// ============================================================
//  ChaTEX — значки пользователей
//  Список значков задаётся здесь (BADGES). Выдаёт их только админ:
//  user_badges/{uid}/{badgeId} = { grantedAt, by } (писать может только админ — правила БД).
// ============================================================
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- каталог значков ----
  const BADGES = [
    { id: 'beta-vet', name: 'Выдержка лет', description: 'Выдан за регистрацию в бета-тесте и наблюдение за стеной дизайна', image: 'icons/badges/vet.jpg' }
  ];
  const byId = id => BADGES.find(b => b.id === id);

  // ---- кэш значков пользователей ----
  const cache = {};            // uid -> [badgeId]
  const pending = {};          // uid -> Promise
  function load(uid) {
    if (!uid) return Promise.resolve([]);
    if (cache[uid]) return Promise.resolve(cache[uid]);
    if (!pending[uid]) {
      pending[uid] = db.ref('user_badges/' + uid).once('value')
        .then(s => { const v = s.val() || {}; cache[uid] = Object.keys(v).filter(k => byId(k)); return cache[uid]; })
        .catch(() => { cache[uid] = []; return []; })
        .finally(() => { delete pending[uid]; });
    }
    return pending[uid];
  }
  function chipsHtml(ids) {
    return ids.map(id => {
      const b = byId(id); if (!b) return '';
      return `<img class="tx-badge" src="${b.image}" alt="" title="${esc(b.name)}: ${esc(b.description)}" data-badge="${esc(b.id)}">`;
    }).join('');
  }
  // Слот в сообщении/профиле: заполняется, когда значки загружены
  function slot(uid) {
    if (!uid) return '';
    setTimeout(() => refresh(uid), 0);
    return `<span class="tx-badges" data-bu="${esc(uid)}"></span>`;
  }
  function refresh(uid) {
    load(uid).then(ids => {
      document.querySelectorAll(`.tx-badges[data-bu="${uid}"]`).forEach(el => { el.innerHTML = chipsHtml(ids); });
    });
  }
  // Подробный список (для профиля): картинка + название + описание
  function detailsHtml(ids) {
    if (!ids.length) return '';
    return `<div class="tx-badge-list">${ids.map(id => {
      const b = byId(id);
      return `<div class="tx-badge-row"><img src="${b.image}" alt=""><div><div class="tx-badge-name">${esc(b.name)}</div><div class="tx-badge-desc">${esc(b.description)}</div></div></div>`;
    }).join('')}</div>`;
  }
  function renderProfileBadges(uid, host) {
    if (!host) return;
    host.innerHTML = '';
    load(uid).then(ids => { host.innerHTML = detailsHtml(ids); });
  }
  function invalidate(uid) { delete cache[uid]; }

  // ---- админка: вкладка «Значки» ----
  let searchTimer = null;
  function adminSearch(q) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const list = $('#admin-badges-list'); if (!list) return;
      const query = (q || '').trim();
      if (!query) { list.innerHTML = '<div style="color:var(--text3);font-size:13px">Введите ник, чтобы найти пользователя</div>'; return; }
      list.innerHTML = '<div style="color:var(--text3);font-size:13px">Загрузка...</div>';
      const snap = await db.ref('users').orderByChild('username').startAt(query).endAt(query + '').limitToFirst(15).once('value');
      const rows = []; snap.forEach(c => rows.push({ uid: c.key, ...c.val() }));
      if (!rows.length) { list.innerHTML = '<div style="color:var(--text3);font-size:13px">Никого не найдено</div>'; return; }
      list.innerHTML = '';
      for (const u of rows) {
        invalidate(u.uid);
        const ids = await load(u.uid);
        const row = document.createElement('div');
        row.className = 'user-list-item tx-admin-badge-row';
        const avatar = u.avatarUrl ? `<img src="${u.avatarUrl}" alt="">` : (typeof avatarFallback === 'function' ? avatarFallback(u.username) : esc((u.username || '?')[0]));
        const free = BADGES.filter(b => !ids.includes(b.id));
        row.innerHTML = `<div class="avatar" style="width:36px;height:36px;font-size:13px">${avatar}</div>
          <div class="info" style="min-width:0;flex:1">
            <div class="uname">${esc(u.username)}</div>
            <div class="tx-admin-have">${ids.length ? ids.map(id => `<span class="tx-admin-chip">${chipsHtml([id])}${esc(byId(id).name)}<button title="Забрать" onclick="TXBadges.remove('${u.uid}','${id}')">×</button></span>`).join('') : '<span style="color:var(--text3);font-size:12px">значков нет</span>'}</div>
            ${free.length ? `<div class="tx-admin-give">
              <select class="tx-select" id="tx-give-${u.uid}">${free.map(b => `<option value="${esc(b.id)}">${esc(b.name)}</option>`).join('')}</select>
              <button class="ua-btn verify" onclick="TXBadges.give('${u.uid}', document.getElementById('tx-give-${u.uid}').value)">Выдать</button></div>` : ''}
          </div>`;
        list.appendChild(row);
      }
    }, 350);
  }
  async function give(uid, id) {
    if (!byId(id)) return;
    try {
      await db.ref('user_badges/' + uid + '/' + id).set({ grantedAt: Date.now(), by: currentUserData.username });
      invalidate(uid); toast('🏅 Значок выдан: ' + byId(id).name);
    } catch (e) { toast('⚠️ Не удалось выдать: ' + (e.message || e), 5000); }
    adminSearch($('#admin-badges-search').value);
  }
  async function remove(uid, id) {
    try { await db.ref('user_badges/' + uid + '/' + id).remove(); invalidate(uid); toast('Значок забран'); }
    catch (e) { toast('⚠️ ' + (e.message || e), 5000); }
    adminSearch($('#admin-badges-search').value);
  }

  window.TXBadges = { BADGES, slot, refresh, load, renderProfileBadges, adminSearch, give, remove };
})();
