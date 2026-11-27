// ============================================================
//  ChaTEX — безопасность: «Устройства», код-пароль, облачный пароль
//  Данные:
//    user_sessions/{uid}/{sid}  — устройства (имя, IP, страна, вход, последний визит)
//    user_security/{uid}/cloud  — облачный пароль (соль + хэш + подсказка)
//  Код-пароль хранится только на этом устройстве (localStorage, хэш).
//  Правила доступа — в database.rules.json (только владелец).
// ============================================================
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = new TextEncoder();
  const ITER = 150000;
  const ONLINE_MS = 150000;      // «в сети», если был активен последние 2.5 мин
  const HEARTBEAT_MS = 60000;

  // ---------- локальное хранилище (всё в try/catch) ----------
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  };
  const SS = {
    get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { sessionStorage.removeItem(k); } catch (_) {} }
  };

  // ---------- PBKDF2-SHA256 ----------
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function derive(secret, salt, iter) {
    const key = await crypto.subtle.importKey('raw', enc.encode(String(secret)), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256);
    return b64(bits);
  }
  async function makeHash(secret) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return { salt: b64(salt), iter: ITER, hash: await derive(secret, salt, ITER) };
  }
  async function checkHash(secret, rec) {
    if (!rec || !rec.salt || !rec.hash) return false;
    return (await derive(secret, unb64(rec.salt), rec.iter || ITER)) === rec.hash;
  }

  // ---------- устройство и сессия ----------
  function deviceInfo() {
    const ua = navigator.userAgent || '';
    let br = 'Браузер';
    if (/Edg\//.test(ua)) br = 'Edge';
    else if (/OPR\/|Opera/.test(ua)) br = 'Opera';
    else if (/YaBrowser/.test(ua)) br = 'Яндекс';
    else if (/Firefox|FxiOS/.test(ua)) br = 'Firefox';
    else if (/Chrome|CriOS/.test(ua)) br = 'Chrome';
    else if (/Safari/.test(ua)) br = 'Safari';
    let os = 'Неизвестно';
    if (/iPhone/.test(ua)) os = 'iPhone';
    else if (/iPad/.test(ua)) os = 'iPad';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/Windows/.test(ua)) os = 'Windows';
    else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
    else if (/CrOS/.test(ua)) os = 'ChromeOS';
    else if (/Linux/.test(ua)) os = 'Linux';
    return { name: br + ' · ' + os, mobile: /Mobi|iPhone|iPad|Android/.test(ua) };
  }
  function getSid() {
    let s = LS.get('tx_sid');
    if (!s) {
      s = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      LS.set('tx_sid', s);
    }
    return s;
  }
  async function geo() {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch('https://ipapi.co/json/', { signal: ctl.signal, cache: 'no-store' });
      const j = await r.json();
      if (j && j.ip) return { ip: j.ip, country: [j.country_name, j.city].filter(Boolean).join(', ') || '—' };
    } catch (_) {} finally { clearTimeout(t); }
    return { ip: '—', country: '—' };
  }
  const wt = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  const sessRef = (uid, sid) => db.ref('user_sessions/' + uid + '/' + sid);
  const fmt = t => t ? new Date(t).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  let sessionAlive = false, watchRef = null, watchFn = null, hbTimer = null;

  function stopWatch() {
    if (watchRef && watchFn) { try { watchRef.off('value', watchFn); } catch (_) {} }
    watchRef = null; watchFn = null;
    clearInterval(hbTimer); hbTimer = null;
    sessionAlive = false;
  }
  function startSession(uid, sid) {
    stopWatch();
    watchRef = sessRef(uid, sid);
    watchFn = snap => {
      if (snap.exists()) { sessionAlive = true; return; }
      if (!sessionAlive) return;               // запись ещё не появилась
      // запись удалена с другого устройства → выходим здесь
      stopWatch();
      SS.del('tx_unlocked');
      alert('Сеанс завершён с другого устройства.');
      auth.signOut().catch(() => {});
    };
    watchRef.on('value', watchFn);
    hbTimer = setInterval(() => {
      if (!sessionAlive || !currentUser) return;
      watchRef.update({ lastSeen: Date.now() }).catch(() => {});
    }, HEARTBEAT_MS);
  }
  async function registerSession(user) {
    const sid = getSid(), d = deviceInfo();
    const g = await geo();
    const now = Date.now();
    await sessRef(user.uid, sid).set({ device: d.name, mobile: d.mobile, ip: g.ip, country: g.country, createdAt: now, lastSeen: now });
    startSession(user.uid, sid);
  }

  // ---------- облачный пароль: чтение ----------
  async function readCloud(uid) {
    try { return (await db.ref('user_security/' + uid + '/cloud').once('value')).val() || null; }
    catch (_) { return null; }
  }
  const trustKey = uid => 'tx_trust_' + uid;

  // ---------- диалоговое окно ----------
  function sheet({ title, text = '', fields = [], okText = 'Сохранить', danger = false, cancelText = 'Отмена', onSubmit, onCancel }) {
    return new Promise(resolve => {
      const ov = document.createElement('div'); ov.className = 'tx-sheet-ov';
      ov.innerHTML = `<div class="tx-sheet" role="dialog">
        <div class="tx-sheet-t">${esc(title)}</div>
        ${text ? `<div class="tx-sheet-d">${text}</div>` : ''}
        ${fields.map((f, i) => `<label class="tx-sheet-f"><span>${esc(f.label)}</span>
          <input id="tx-f${i}" type="${f.type || 'text'}" inputmode="${f.inputmode || 'text'}" autocomplete="off"
            placeholder="${esc(f.placeholder || '')}" maxlength="${f.max || 64}" value="${esc(f.value || '')}"></label>`).join('')}
        <div class="tx-sheet-err" id="tx-err"></div>
        <div class="tx-sheet-b"><button class="tx-b-cancel">${esc(cancelText)}</button><button class="tx-b-ok${danger ? ' danger' : ''}">${esc(okText)}</button></div>
      </div>`;
      document.body.appendChild(ov);
      const close = v => { ov.remove(); resolve(v); };
      const vals = () => fields.map((_, i) => $('#tx-f' + i, ov).value);
      const err = m => { $('#tx-err', ov).textContent = m || ''; };
      const btnOk = ov.querySelector('.tx-b-ok');
      ov.querySelector('.tx-b-cancel').onclick = () => { if (onCancel) onCancel(); close(null); };
      btnOk.onclick = async () => {
        btnOk.disabled = true;
        try {
          const r = onSubmit ? await onSubmit(vals(), err) : true;
          if (r !== undefined) close(r);
        } catch (e) { err('Ошибка: ' + (e.message || e)); }
        btnOk.disabled = false;
      };
      const first = $('#tx-f0', ov); if (first) setTimeout(() => first.focus(), 50);
    });
  }

  // ---------- код-пароль (локальный) ----------
  const pinRec = () => { try { return JSON.parse(LS.get('tx_pin') || 'null'); } catch (_) { return null; } };
  const lockMode = () => LS.get('tx_lock_mode') || 'launch';   // 'launch' или секунды бездействия
  const LOCK_OPTIONS = [['launch', 'При каждом входе'], ['60', 'Через 1 минуту'], ['300', 'Через 5 минут'], ['900', 'Через 15 минут'], ['3600', 'Через 1 час']];

  let lockEl = null, lastAct = Date.now();
  function showLock() {
    if (lockEl || !pinRec()) return;
    lockEl = document.createElement('div'); lockEl.className = 'tx-lock';
    lockEl.innerHTML = `<div class="tx-lock-box">
        <div class="tx-lock-logo">ChaTEX</div>
        <div class="tx-lock-t">Введите код-пароль</div>
        <input id="tx-lock-in" class="tx-lock-in" type="password" inputmode="numeric" autocomplete="off" maxlength="6">
        <div class="tx-lock-err" id="tx-lock-err"></div>
        <button class="tx-lock-ok" id="tx-lock-ok">Разблокировать</button>
        <button class="tx-lock-out" id="tx-lock-out">Выйти из аккаунта</button>
      </div>`;
    document.body.appendChild(lockEl);
    const inp = $('#tx-lock-in', lockEl);
    const go = async () => {
      if (!inp.value) return;
      const ok = await checkHash(inp.value, pinRec()).catch(() => false);
      if (ok) {
        SS.set('tx_unlocked', '1'); lastAct = Date.now();
        lockEl.remove(); lockEl = null;
      } else {
        $('#tx-lock-err', lockEl).textContent = 'Неверный код-пароль';
        inp.value = ''; inp.focus();
      }
    };
    $('#tx-lock-ok', lockEl).onclick = go;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    $('#tx-lock-out', lockEl).onclick = () => { try { window.doLogout && doLogout(); } catch (_) { auth.signOut(); } };
    setTimeout(() => inp.focus(), 50);
  }
  // таймер автоблокировки: проверка раз в 5 сек и при возврате во вкладку
  function checkAutoLock() {
    if (lockEl || !pinRec() || !currentUser) return;
    const m = lockMode();
    if (m === 'launch') return;
    if (Date.now() - lastAct >= Number(m) * 1000) showLock();
  }
  function bindActivity() {
    ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev =>
      document.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) lastAct = Date.now(); else checkAutoLock();
    });
    setInterval(checkAutoLock, 5000);
  }

  // ---------- вызовы из 04-auth.js / 24-profile.js ----------
  // До показа приложения: если включён облачный пароль и это устройство не доверенное — спросить
  async function beforeApp(user) {
    const rec = await readCloud(user.uid);
    if (!rec || LS.get(trustKey(user.uid)) === '1') return true;
    const hint = rec.hint ? `<b>Подсказка:</b> ${esc(rec.hint)}` : 'Подсказки нет.';
    const r = await sheet({
      title: 'Облачный пароль',
      text: 'Для входа на этом устройстве введите облачный пароль.<br>' + hint,
      fields: [{ label: 'Облачный пароль', type: 'password', max: 64 }],
      okText: 'Войти',
      cancelText: 'Отмена',
      onSubmit: async (v, err) => {
        if (await checkHash(v[0], rec)) { LS.set(trustKey(user.uid), '1'); return true; }
        err('Неверный облачный пароль');
        return undefined;
      }
    });
    if (r === true) return true;
    try { await auth.signOut(); } catch (_) {}
    return false;
  }
  // После показа приложения
  function afterApp(user) {
    registerSession(user).catch(() => {});
    if (pinRec() && (lockMode() === 'launch' || !SS.get('tx_unlocked'))) showLock();
  }
  // При выходе: убираем устройство из списка и снимаем доверие
  async function onLogout() {
    const u = currentUser; if (!u) return;
    const sid = getSid();
    stopWatch();
    LS.del(trustKey(u.uid)); SS.del('tx_unlocked');
    try { await wt(sessRef(u.uid, sid).remove(), 3000); } catch (_) {}
  }

  // ---------- раздел «Устройства» ----------
  async function renderDevices() {
    const host = $('#tg-dev-host'); if (!host || !currentUser) return;
    host.innerHTML = '<div class="tg-hint">Загрузка…</div>';
    let list;
    try {
      const v = (await db.ref('user_sessions/' + currentUser.uid).once('value')).val() || {};
      list = Object.keys(v).map(sid => ({ sid, ...v[sid] }));
    } catch (e) {
      host.innerHTML = '<div class="tg-hint">Не удалось загрузить: ' + esc(e.message) + '</div>';
      return;
    }
    const mine = getSid();
    if (!list.some(s => s.sid === mine)) {                  // текущее устройство ещё не записано
      const d = deviceInfo();
      list.push({ sid: mine, device: d.name, mobile: d.mobile, ip: '—', country: '—', createdAt: Date.now(), lastSeen: Date.now() });
    }
    list.sort((a, b) => a.sid === mine ? -1 : b.sid === mine ? 1 : (b.lastSeen || 0) - (a.lastSeen || 0));
    const card = s => {
      const cur = s.sid === mine;
      const online = cur || (Date.now() - (s.lastSeen || 0)) < ONLINE_MS;
      return `<div class="tx-dev${cur ? ' cur' : ''}">
        <div class="tx-dev-ic">${s.mobile ? '📱' : '💻'}</div>
        <div class="tx-dev-body">
          <div class="tx-dev-name">${esc(s.device || 'Устройство')}${cur ? '<span class="tx-dev-tag">Это устройство</span>' : ''}</div>
          <div class="tx-dev-line">${esc(s.ip || '—')} · ${esc(s.country || '—')}</div>
          <div class="tx-dev-line">Вход: ${fmt(s.createdAt)}</div>
          <div class="tx-dev-line${online ? ' on' : ''}">${online ? 'В сети сейчас' : 'Последний раз в сети: ' + fmt(s.lastSeen)}</div>
        </div>
        ${cur ? '' : `<button class="tx-dev-kick" data-dev-kick="${esc(s.sid)}">Завершить</button>`}
      </div>`;
    };
    const others = list.filter(s => s.sid !== mine).length;
    host.innerHTML = `<div class="tg-hint">Устройства, на которых выполнен вход в аккаунт. Завершите сеанс на том, которым не пользуетесь.</div>
      <div class="tg-group">${list.map(card).join('')}</div>
      ${others ? '<button class="tg-btn tx-danger" data-dev-all>Завершить все другие сеансы</button>' : ''}`;
  }

  // ---------- раздел «Конфиденциальность»: код-пароль и облачный пароль ----------
  async function renderPrivacy() {
    const host = $('#tg-sec-host'); if (!host || !currentUser) return;
    const pin = !!pinRec(), mode = lockMode();
    const cloud = await readCloud(currentUser.uid);
    const sel = LOCK_OPTIONS.map(([v, t]) => `<option value="${v}"${v === mode ? ' selected' : ''}>${t}</option>`).join('');
    host.innerHTML = `
      <div class="tg-hint">Код-пароль</div>
      <div class="tg-group">
        <div class="tg-row" data-sec="pin"><span class="tg-lbl">${pin ? 'Изменить код-пароль' : 'Включить код-пароль'}</span><span class="tg-chev">›</span></div>
        ${pin ? `<div class="tg-row" data-sec="pin-off"><span class="tg-lbl tx-danger">Отключить код-пароль</span></div>
        <div class="tg-row"><span class="tg-lbl">Запрашивать</span><select class="tx-select" id="tx-lock-mode">${sel}</select></div>` : ''}
      </div>
      <div class="tg-hint">${pin ? 'Код-пароль хранится только на этом устройстве. Нужен для открытия приложения.' : 'Блокирует приложение, чтобы его не открыли без вас.'}</div>

      <div class="tg-hint">Облачный пароль</div>
      <div class="tg-group">
        ${cloud ? `
          <div class="tg-row" data-sec="cloud-change"><span class="tg-lbl">Изменить облачный пароль</span><span class="tg-chev">›</span></div>
          <div class="tg-row" data-sec="cloud-off"><span class="tg-lbl tx-danger">Отключить облачный пароль</span></div>`
        : `<div class="tg-row" data-sec="cloud-set"><span class="tg-lbl">Установить облачный пароль</span><span class="tg-chev">›</span></div>`}
      </div>
      <div class="tg-hint">${cloud
        ? 'Включён. При входе на новом устройстве его нужно будет ввести' + (cloud.hint ? '. Подсказка: ' + esc(cloud.hint) : '') + '.'
        : 'Дополнительный пароль: при входе на новом устройстве запрашивается, даже если известен пароль от аккаунта.'}</div>`;
  }

  // --- код-пароль: действия
  async function setPin(oldRequired) {
    if (oldRequired) {
      const ok = await sheet({ title: 'Текущий код-пароль', fields: [{ label: 'Текущий код-пароль', type: 'password', inputmode: 'numeric', max: 6 }],
        onSubmit: async (v, err) => { if (await checkHash(v[0], pinRec())) return true; err('Неверный код-пароль'); return undefined; } });
      if (!ok) return;
    }
    const r = await sheet({
      title: 'Код-пароль',
      text: 'Только цифры, от 4 до 6 знаков.',
      fields: [
        { label: 'Новый код-пароль', type: 'password', inputmode: 'numeric', max: 6 },
        { label: 'Повторите код-пароль', type: 'password', inputmode: 'numeric', max: 6 }
      ],
      okText: 'Сохранить',
      onSubmit: async (v, err) => {
        if (!/^\d{4,6}$/.test(v[0])) { err('Нужно от 4 до 6 цифр'); return undefined; }
        if (v[0] !== v[1]) { err('Коды не совпадают'); return undefined; }
        return await makeHash(v[0]);
      }
    });
    if (r) { LS.set('tx_pin', JSON.stringify(r)); SS.set('tx_unlocked', '1'); toast('✅ Код-пароль включён'); renderPrivacy(); }
  }
  async function disablePin() {
    const ok = await sheet({ title: 'Отключить код-пароль', fields: [{ label: 'Текущий код-пароль', type: 'password', inputmode: 'numeric', max: 6 }],
      okText: 'Отключить', danger: true,
      onSubmit: async (v, err) => { if (await checkHash(v[0], pinRec())) return true; err('Неверный код-пароль'); return undefined; } });
    if (ok) { LS.del('tx_pin'); LS.del('tx_lock_mode'); toast('Код-пароль отключён'); renderPrivacy(); }
  }

  // --- облачный пароль: действия
  async function setCloud(current) {
    if (current) {
      const ok = await sheet({ title: 'Облачный пароль', text: 'Введите текущий облачный пароль.', fields: [{ label: 'Текущий облачный пароль', type: 'password', max: 64 }],
        onSubmit: async (v, err) => { if (await checkHash(v[0], current)) return true; err('Неверный облачный пароль'); return undefined; } });
      if (!ok) return;
    }
    const r = await sheet({
      title: current ? 'Новый облачный пароль' : 'Облачный пароль',
      text: 'Пароль от 4 до 64 символов: цифры, буквы, любые знаки. Подсказка видна при входе, поэтому не пишите сам пароль.',
      fields: [
        { label: 'Облачный пароль', type: 'password', max: 64 },
        { label: 'Повторите пароль', type: 'password', max: 64 },
        { label: 'Подсказка (необязательно)', max: 60, value: current && current.hint ? current.hint : '', placeholder: 'Например: кличка кота' }
      ],
      okText: 'Сохранить',
      onSubmit: async (v, err) => {
        const [p1, p2, hint] = v;
        if (p1.length < 4) { err('Минимум 4 символа'); return undefined; }
        if (p1 !== p2) { err('Пароли не совпадают'); return undefined; }
        if (hint && p1 && hint.toLowerCase().includes(p1.toLowerCase())) { err('Подсказка не должна содержать сам пароль'); return undefined; }
        return { ...(await makeHash(p1)), hint: hint.trim(), ts: Date.now() };
      }
    });
    if (!r) return;
    try {
      await db.ref('user_security/' + currentUser.uid + '/cloud').set(r);
      LS.set(trustKey(currentUser.uid), '1');
      toast('✅ Облачный пароль сохранён');
      renderPrivacy();
    } catch (e) { toast('⚠️ Не удалось сохранить: ' + (e.message || e), 5000); }
  }
  async function disableCloud(current) {
    const ok = await sheet({ title: 'Отключить облачный пароль', text: 'Введите текущий облачный пароль.', fields: [{ label: 'Облачный пароль', type: 'password', max: 64 }], okText: 'Отключить', danger: true,
      onSubmit: async (v, err) => { if (await checkHash(v[0], current)) return true; err('Неверный облачный пароль'); return undefined; } });
    if (!ok) return;
    try { await db.ref('user_security/' + currentUser.uid + '/cloud').remove(); toast('Облачный пароль отключён'); renderPrivacy(); }
    catch (e) { toast('⚠️ ' + (e.message || e), 5000); }
  }

  // ---------- обработчики (делегирование, один раз) ----------
  document.addEventListener('click', async e => {
    const kick = e.target.closest('[data-dev-kick]');
    if (kick) {
      if (!confirm('Завершить сеанс на этом устройстве? Оно выйдет из аккаунта.')) return;
      try { await db.ref('user_sessions/' + currentUser.uid + '/' + kick.dataset.devKick).remove(); } catch (err) { toast('⚠️ ' + err.message, 4000); }
      renderDevices(); return;
    }
    if (e.target.closest('[data-dev-all]')) {
      if (!confirm('Завершить все другие сеансы?')) return;
      const mine = getSid(), upd = {};
      const v = (await db.ref('user_sessions/' + currentUser.uid).once('value')).val() || {};
      Object.keys(v).forEach(sid => { if (sid !== mine) upd[sid] = null; });
      try { await db.ref('user_sessions/' + currentUser.uid).update(upd); } catch (err) { toast('⚠️ ' + err.message, 4000); }
      renderDevices(); return;
    }
    const row = e.target.closest('[data-sec]'); if (!row || !currentUser) return;
    const act = row.dataset.sec;
    if (act === 'pin') return setPin(!!pinRec());
    if (act === 'pin-off') return disablePin();
    if (act === 'cloud-set') return setCloud(null);
    const cloud = await readCloud(currentUser.uid);
    if (act === 'cloud-change') return setCloud(cloud);
    if (act === 'cloud-off') return disableCloud(cloud);
  });
  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'tx-lock-mode') {
      LS.set('tx_lock_mode', e.target.value); lastAct = Date.now();
      toast('✅ Режим запроса кода-пароля изменён');
    }
  });

  bindActivity();

  window.TXSec = { beforeApp, afterApp, onLogout, renderDevices, renderPrivacy };
})();
