// ============================================================
//  NOTIFICATIONS
// ============================================================
// ─── УВЕДОМЛЕНИЯ ───
// Звук и системное уведомление — только когда вы НЕ на сайте (вкладка свернута / окно не в фокусе).
let notifListenStart = 0;
const unreadByChat = {};          // chatId -> число новых непрочитанных личных сообщений
function isAway() { return document.hidden || !document.hasFocus(); }
function playNotifSound() {
  if (userSettings && userSettings.soundNotif === false) return;
  try { const a = new Audio('sounds/notify.mp3'); a.volume = 0.7; a.play().catch(() => {}); } catch (_) {}
}
function showSystemNotif(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!(userSettings && userSettings.pushNotif)) return;
  const opts = { body: body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: tag || 'chatex', renotify: true };
  if (navigator.serviceWorker && navigator.serviceWorker.ready) {
    navigator.serviceWorker.ready.then(reg => reg.showNotification(title, opts)).catch(() => { try { new Notification(title, opts); } catch (_) {} });
  } else {
    try { new Notification(title, opts); } catch (_) {}
  }
}
// Счётчик на чатах в списке
function refreshUnreadBadges() {
  document.querySelectorAll('[data-chat-id]').forEach(el => {
    const n = unreadByChat[el.dataset.chatId] || 0;
    let b = el.querySelector(':scope > .tx-unread');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'tx-unread'; el.appendChild(b); }
    b.textContent = n > 99 ? '99+' : String(n);
  });
}
function unreadInc(chatId) { unreadByChat[chatId] = (unreadByChat[chatId] || 0) + 1; refreshUnreadBadges(); }
function unreadClear(chatId) { if (unreadByChat[chatId]) { delete unreadByChat[chatId]; refreshUnreadBadges(); } }
// Открытый чат не считаем непрочитанным; список счётчиков освежаем раз в секунду (новые элементы списка)
setInterval(() => {
  if (currentChatId && unreadByChat[currentChatId] && !isAway()) unreadClear(currentChatId);
  refreshUnreadBadges();
}, 1000);
function listenNotifications() {
  notifListenStart = Date.now();
  db.ref('notifications/' + currentUser.uid).on('child_added', snap => {
    const n = snap.val(); if (!n) return;
    updateNotifBadge();
    // старые записи при входе не учитываем и не озвучиваем
    if ((n.timestamp || 0) < notifListenStart - 2000) return;
    if (n.type === 'dm' && n.chatId && n.chatId !== currentChatId) unreadInc(n.chatId);
    if (isAway()) {
      playNotifSound();
      showSystemNotif(n.from || 'ChaTEX', n.text, 'n-' + snap.key);
    }
  });
}
function updateNotifBadge() {
  db.ref('notifications/' + currentUser.uid).orderByChild('read').equalTo(false).once('value').then(snap => {
    const count = snap.numChildren();
    document.getElementById('notif-btn').textContent = count > 0 ? `🔔${count}` : '🔔';
  });
}
async function openNotifications() {
  const snap = await db.ref('notifications/' + currentUser.uid).orderByChild('timestamp').limitToLast(20).once('value');
  const notifs = []; snap.forEach(c => notifs.unshift({ id: c.key, ...c.val() }));

  const reqSnap = await db.ref('friend_requests/' + currentUser.uid).once('value');
  const requests = []; reqSnap.forEach(c => requests.push({ uid: c.key, ...c.val() }));

  const list = document.getElementById('notif-list');
  let html = '';

  if (requests.length) {
    html += requests.map(r => `<div class="notif-item unread" style="border-color:rgba(0,230,118,.3)">
        <div style="font-size:20px">🤝</div>
        <div class="notif-content">
          <div class="notif-title">${escHtml(r.fromName)}</div>
          <div class="notif-body">Хочет добавить вас в друзья</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn-primary" style="padding:6px 14px;font-size:12px" onclick="acceptFriendRequest('${r.uid}')">Принять</button>
            <button class="btn-cancel" style="padding:6px 14px;font-size:12px" onclick="declineFriendRequest('${r.uid}')">Отмена</button>
          </div>
          <div class="notif-time">${formatTime(r.timestamp)}</div>
        </div></div>`).join('');
  }

  if (notifs.length) {
    html += notifs.map(n => {
      let icon = '🔔';
      if (n.type === 'dm') icon = '💬';
      else if (n.type === 'friend') icon = '🤝';
      else if (n.type === 'friend_request') icon = '👋';
      else if (n.type === 'support') icon = '🛡️';
      else if (n.type === 'system') icon = '⚙️';
      return `<div class="notif-item ${n.read ? '' : 'unread'}">
        <div style="font-size:20px">${icon}</div>
        <div class="notif-content"><div class="notif-title">${escHtml(n.from || 'ChaTEX')}</div>
        <div class="notif-body">${escHtml(n.text)}</div>
        <div class="notif-time">${formatTime(n.timestamp)}</div></div></div>`;
    }).join('');
  }

  list.innerHTML = html || `<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px">Нет уведомлений</div>`;
  openModal('notifications-modal');
}
async function markAllNotifsRead() {
  const snap = await db.ref('notifications/' + currentUser.uid).once('value');
  const updates = {}; snap.forEach(c => { updates[c.key + '/read'] = true; });
  await db.ref('notifications/' + currentUser.uid).update(updates);
  document.getElementById('notif-btn').textContent = '🔔'; closeModal('notifications-modal');
}
function addNotification(uid, data) { if (!uid) return; db.ref('notifications/' + uid).push({ ...data, read: false, timestamp: Date.now() }); }

let banListenerUid = null, banListenerRef = null, banListenerCb = null;
function listenBan() {
  if (banListenerRef && banListenerCb) { try { banListenerRef.off('value', banListenerCb); } catch (e) {} }
  banListenerUid = currentUser.uid;
  banListenerRef = db.ref('users/' + currentUser.uid + '/blocked');
  banListenerCb = snap => {
    if (snap.val() === true) {
      // Мгновенный кик — без перезагрузки страницы
      clearAllMsgListeners();
      if (banListenerRef && banListenerCb) { try { banListenerRef.off('value', banListenerCb); } catch (e) {} }
      document.getElementById('app').classList.remove('visible');
      document.getElementById('auth-screen').style.display = 'flex';
      switchTab('login');
      setAuthError('🚫 Ваш аккаунт заблокирован администрацией ChaTEX.');
      auth.signOut().catch(() => {});
    }
  };
  banListenerRef.on('value', banListenerCb);
}
function unlistenBan() {
  if (banListenerRef && banListenerCb) { try { banListenerRef.off('value', banListenerCb); } catch (e) {} }
  banListenerRef = null; banListenerCb = null; banListenerUid = null;
}

// ─── Живой Premium-статус (реагирует мгновенно, без перезагрузки) ──
// Слушаем сразу premium + premiumExpiresAt через родительский узел users/{uid},
// т.к. .on('value') на двух отдельных путях не даёт согласованной пары значений.
let premiumListenerRef = null, premiumListenerCb = null;
function listenPremiumLive() {
  if (premiumListenerRef && premiumListenerCb) { try { premiumListenerRef.off('value', premiumListenerCb); } catch (e) {} }
  premiumListenerRef = db.ref('users/' + currentUser.uid);
  premiumListenerCb = snap => {
    const ud = snap.val();
    if (!ud || !currentUserData) return;
    const wasPremium = isPremiumActive(currentUserData.premium, currentUserData.premiumExpiresAt);
    currentUserData.premium = ud.premium || false;
    currentUserData.premiumExpiresAt = ud.premiumExpiresAt || null;
    const isPremium = isPremiumActive(currentUserData.premium, currentUserData.premiumExpiresAt);

    // Если премиум только что кем-то выдан/забран (админкой) или истёк —
    // сразу обновляем весь зависящий от него UI, без F5.
    if (wasPremium !== isPremium) {
      if (!isPremium && PREMIUM_THEMES.includes(userSettings.theme)) changeTheme('dark');
      document.getElementById('my-name-el').innerHTML = escHtml(currentUserData.username) + roleBadgesHtml(currentUserData);
      if (typeof refreshPremiumUI === 'function') refreshPremiumUI();
      toast(isPremium ? '✦ Premium активирован!' : '✦ Срок Premium истёк');
    }
  };
  premiumListenerRef.on('value', premiumListenerCb);

  // Подстраховка: если вкладка открыта долго и запись expiresAt в БД почему-то
  // не пришла как push (например, админ поставил точную дату истечения без
  // отдельного write-события), досверяем локально раз в минуту.
  if (premiumExpiryInterval) clearInterval(premiumExpiryInterval);
  premiumExpiryInterval = setInterval(() => {
    if (currentUser) checkPremiumExpiry();
  }, 60 * 1000);
}
function unlistenPremiumLive() {
  if (premiumListenerRef && premiumListenerCb) { try { premiumListenerRef.off('value', premiumListenerCb); } catch (e) {} }
  premiumListenerRef = null; premiumListenerCb = null;
  if (premiumExpiryInterval) { clearInterval(premiumExpiryInterval); premiumExpiryInterval = null; }
}

// ─── Живая проверка версии приложения (без перезагрузки страницы) ──
// В system/appVersion лежит строка версии — админ меняет её при каждом
// релизе через панель админа (см. triggerAppUpdate()). Как только клиент
// увидит, что значение в БД отличается от APP_VERSION, зашитой в этой
// вкладке — покажем ненавязчивый баннер с кнопкой "Обновить".
let appVersionListenerRef = null, appVersionListenerCb = null;
function listenAppVersion() {
  if (appVersionListenerRef && appVersionListenerCb) { try { appVersionListenerRef.off('value', appVersionListenerCb); } catch (e) {} }
  appVersionListenerRef = db.ref('system/appVersion');
  appVersionListenerCb = snap => {
    const latest = snap.val();
    if (latest && latest !== APP_VERSION && localStorage.getItem('dismissedUpdateVersion') !== latest) showUpdateBanner(latest);
  };
  appVersionListenerRef.on('value', appVersionListenerCb);
}
function unlistenAppVersion() {
  if (appVersionListenerRef && appVersionListenerCb) { try { appVersionListenerRef.off('value', appVersionListenerCb); } catch (e) {} }
  appVersionListenerRef = null; appVersionListenerCb = null;
}

function showUpdateBanner(latestVersion) {
  if (document.getElementById('app-update-banner')) return; // уже показан
  const b = document.createElement('div');
  b.id = 'app-update-banner';
  b.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;'
    + 'background:var(--accent,#2b7fff);color:#fff;padding:12px 18px;border-radius:12px;'
    + 'box-shadow:0 6px 24px rgba(0,0,0,.35);display:flex;align-items:center;gap:12px;'
    + 'font-size:14px;font-family:inherit;';
  b.innerHTML = `<span>✦ Вышло обновление ChaTEX (${escHtml(latestVersion)})</span>
    <button id="app-update-btn" style="background:#fff;color:var(--accent,#2b7fff);border:none;border-radius:8px;padding:6px 12px;font-weight:600;cursor:pointer;">Обновить</button>
    <button id="app-update-dismiss" style="background:transparent;color:#fff;border:none;font-size:18px;line-height:1;cursor:pointer;opacity:.8;">×</button>`;
  document.body.appendChild(b);
  document.getElementById('app-update-btn').onclick = () => location.reload();
  document.getElementById('app-update-dismiss').onclick = () => {
    try { localStorage.setItem('dismissedUpdateVersion', latestVersion); } catch (e) {}
    b.remove();
  };
}

// Вызывается из панели администратора, чтобы разослать всем клиентам
// сигнал о новом релизе. version — например, дата/номер сборки.
async function triggerAppUpdate(version) {
  version = (version || '').trim() || new Date().toISOString();
  await db.ref('system/appVersion').set(version);
  toast('✦ Обновление разослано всем клиентам');
}


// ─── ЗАПРОС РАЗРЕШЕНИЯ НА УВЕДОМЛЕНИЯ (при каждом запуске, пока не разрешено) ───
function notifSupported() { return 'Notification' in window; }
function maybeShowNotifBanner() {
  if (!notifSupported() || Notification.permission !== 'default') return;
  if (sessionStorage.getItem('tx_notif_later')) return;   // «Позже» — до закрытия приложения
  if (document.getElementById('tx-notif-banner')) return;
  const b = document.createElement('div');
  b.id = 'tx-notif-banner'; b.className = 'tx-notif-banner';
  b.innerHTML = `<div class="tx-nb-ic"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></div>
    <div class="tx-nb-txt"><div class="tx-nb-t">Включить уведомления?</div><div class="tx-nb-d">Узнавайте о новых сообщениях, даже когда ChaTEX свёрнут</div></div>
    <div class="tx-nb-btns"><button class="tx-nb-later">Позже</button><button class="tx-nb-ok">Включить</button></div>`;
  document.body.appendChild(b);
  requestAnimationFrame(() => b.classList.add('show'));
  const close = () => { b.classList.remove('show'); setTimeout(() => b.remove(), 300); };
  b.querySelector('.tx-nb-later').onclick = () => { sessionStorage.setItem('tx_notif_later', '1'); close(); };
  b.querySelector('.tx-nb-ok').onclick = async () => {
    try {
      const res = await Notification.requestPermission();
      if (res === 'granted') {
        if (userSettings) userSettings.pushNotif = true;
        try { if (currentUser) db.ref('users/' + currentUser.uid + '/settings/pushNotif').set(true); } catch (_) {}
        const el = document.getElementById('toggle-pushnotif'); if (el) el.className = 'toggle on';
        toast('✅ Уведомления включены');
        playNotifSound();
      } else {
        toast('Уведомления не разрешены — их можно включить в настройках браузера', 5000);
      }
    } catch (_) {}
    close();
  };
}
