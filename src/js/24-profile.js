// ============================================================
//  PROFILE
// ============================================================
function renderProfileAvatar() {
  const el = document.getElementById('profile-big-av');
  if (currentUserData.avatarUrl) el.innerHTML = `<img src="${currentUserData.avatarUrl}" style="width:100%;height:100%;object-fit:cover">`;
  else el.textContent = avatarFallback(currentUserData.username);
}
function openProfileModal() {
  renderProfileAvatar();
  document.getElementById('profile-name-el').childNodes[0] &&
    (document.getElementById('profile-name-el').childNodes[0].nodeValue = (currentUserData.nickname || currentUserData.username) + ' ');
  document.getElementById('profile-verify-badge').style.display = currentUserData.verified ? '' : 'none';
  document.getElementById('profile-handle-el').textContent = '@' + currentUserData.username;
  document.getElementById('profile-bio-inp').value = currentUserData.bio || '';
  document.getElementById('profile-nick-inp').value = currentUserData.nickname || '';
  document.getElementById('profile-uname-inp').value = currentUserData.username || '';
  if (window.TXLegal) TXLegal.loadProfileSocials(currentUser.uid).catch(() => {});
  document.getElementById('profile-birthday-inp').value = currentUserData.birthday || '';
  openModal('profile-modal');
}
async function saveProfile() {
  const bio = document.getElementById('profile-bio-inp').value.trim().slice(0, 60);
  const birthday = document.getElementById('profile-birthday-inp').value || null;
  const nickname = (document.getElementById('profile-nick-inp')?.value || '').trim().slice(0, 24);
  const uname = (document.getElementById('profile-uname-inp')?.value || '').trim();
  const patch = { bio, birthday, nickname: nickname || null };
  if (uname && uname !== currentUserData.username) {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(uname)) { toast('⚠️ Имя пользователя: 3–20 символов, латиница, цифры и _'); return; }
    const clash = await db.ref('users').orderByChild('username').equalTo(uname).once('value');
    let taken = false; clash.forEach(c => { if (c.key !== currentUser.uid) taken = true; });
    if (taken) { toast('⚠️ Это имя пользователя уже занято'); return; }
    patch.username = uname;
  }
  if (window.TXLegal) {
    const so = TXLegal.readProfileSocials();
    if (so.error) { toast('⚠️ ' + so.error); return; }
    patch.socials = so.data;
  }
  await db.ref('users/' + currentUser.uid).update(patch);
  currentUserData.bio = bio; currentUserData.birthday = birthday;
  currentUserData.nickname = patch.nickname || undefined;
  if (patch.username) currentUserData.username = patch.username;
  closeModal('profile-modal'); toast('✅ Профиль сохранён');
}
function doLogout() {
  stopTyping(); if (typeof teardownCallsSystem === 'function') teardownCallsSystem(); markOffline();
  // сначала убираем это устройство из списка «Устройства», потом выходим (38-security.js)
  const pre = window.TXSec ? TXSec.onLogout() : Promise.resolve();
  pre.finally(() => auth.signOut());
  closeModal('profile-modal');
}


// ============================================================
//  VIEW PROFILE (read-only, Telegram-style) — открывается по
//  клику на свой аватар (сайдбар) и по клику на шапку DM-чата
// ============================================================
const vpIcons = {
  bio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12H7l-3 3V4z"/></svg>`,
  at:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5"/></svg>`,
  cake:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6"/><path d="M4 21h16"/><path d="M4 16.5c1 .8 2 .8 3 0s2-.8 3 0 2 .8 3 0 2-.8 3 0 2 .8 3 0"/><path d="M12 9V6"/><path d="M8 9V7.5"/><path d="M16 9V7.5"/><circle cx="12" cy="4" r="1.2"/></svg>`
};

let vpTarget = null; // { uid, username, verified, bio, avatarUrl, birthday, isSelf, chatId }

function vpField(iconKey, value, label, opts = {}) {
  const empty = !value;
  return `<div class="vp-field${opts.copyable ? ' copyable' : ''}${empty ? ' empty' : ''}"${opts.copyable ? ` onclick="${opts.onclick}"` : ''}>
    <div class="vp-field-icon">${vpIcons[iconKey]}</div>
    <div class="vp-field-main">
      <div class="vp-field-value${opts.cls ? ' ' + opts.cls : ''}">${empty ? (opts.emptyText || 'Не указано') : escHtml(String(value))}</div>
      <div class="vp-field-label">${label}</div>
    </div>
  </div>`;
}

function vpFormatBirthday(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const now = new Date();
  let age = now.getFullYear() - y;
  const hadBirthdayThisYear = (now.getMonth() + 1 > m) || (now.getMonth() + 1 === m && now.getDate() >= d);
  if (!hadBirthdayThisYear) age--;
  return `${d} ${months[m - 1]} ${y} (${age} лет)`;
}

function renderVpFields(ud, showBirthday) {
  const parts = [];
  parts.push(vpField('bio', ud.bio, 'О себе', { emptyText: 'Нет описания' }));
  parts.push('<div class="vp-sep"></div>');
  parts.push(vpField('at', ud.username ? '@' + ud.username : '', 'Имя пользователя', {
    cls: 'username', copyable: !!ud.username, onclick: 'vpCopyUsername()'
  }));
  if (showBirthday) {
    parts.push('<div class="vp-sep"></div>');
    parts.push(vpField('cake', vpFormatBirthday(ud.birthday), 'День рождения'));
  }
  document.getElementById('vp-fields').innerHTML = parts.join('');
}

function vpCopyUsername() {
  if (!vpTarget?.username) return;
  const text = '@' + vpTarget.username;
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
  toast('📋 Юзернейм скопирован');
}

function vpEditClick() {
  closeModal('view-profile-modal');
  openProfileModal();
}

function renderVpPresence(ud) {
  const st = presenceStatusText(ud);
  const el = document.getElementById('vp-status');
  el.classList.toggle('offline', !st.online);
  document.getElementById('vp-status-text').textContent = st.text;
}

// Открыть просмотр СВОЕГО профиля (клик по аватару в сайдбаре)
// source может быть:
//  'self' / undefined              — свой профиль
//  { uid, userData, chatId }       — из ЛС (личный контакт, birthday показываем)
//  { uid, userData, chatId: null, fromGroupChat: true } — из сообщения в группе/канале (birthday скрываем)
function openViewProfile(source) {
  let ud, uid, isSelf, showBirthday;
  if (source === 'self' || !source) {
    ud = currentUserData || {}; uid = currentUser?.uid; isSelf = true; showBirthday = true;
  } else {
    ud = source.userData || {}; uid = source.uid; isSelf = uid === currentUser?.uid;
    showBirthday = isSelf || !source.fromGroupChat;
  }
  vpTarget = { uid, username: ud.username, bio: ud.bio, birthday: ud.birthday, avatarUrl: ud.avatarUrl, verified: ud.verified, isSelf };

  const av = document.getElementById('vp-avatar');
  av.innerHTML = ud.avatarUrl ? `<img src="${ud.avatarUrl}" alt="">` : '';
  if (!ud.avatarUrl) av.textContent = avatarFallback(ud.username);

  document.getElementById('vp-name').innerHTML = escHtml(ud.nickname || ud.username || '...') +
    (ud.verified ? ' <span class="badge-verify">✓</span>' : '') +
    (window.TXBadges && uid ? ' ' + TXBadges.slot(uid) : '');
  if (window.TXBadges && uid) {
    const nameEl = document.getElementById('vp-name');
    let host = document.getElementById('vp-badges');
    if (!host) { host = document.createElement('div'); host.id = 'vp-badges'; nameEl.parentElement.insertBefore(host, nameEl.nextSibling); }
    TXBadges.renderProfileBadges(uid, host);
  }
  if (window.TXLegal && uid) TXLegal.renderSocials(uid, document.getElementById('vp-name').parentElement);

  // Публичный статус — реальный, на основе users/{uid}/online и lastSeen
  const vpStatusEl = document.getElementById('vp-status');
  if (isSelf) {
    vpStatusEl.classList.remove('offline');
    document.getElementById('vp-status-text').textContent = 'это вы';
  } else {
    renderVpPresence(ud);
    if (uid) {
      // ud мог прийти из закэшированного места (сайдбар/поиск) — подтягиваем
      // свежие online/lastSeen прямо сейчас, чтобы не показать устаревший статус
      db.ref('users/' + uid).once('value').then(s => {
        const fresh = s.val();
        if (fresh && vpTarget && vpTarget.uid === uid) renderVpPresence(fresh);
      }).catch(() => {});
    }
  }

  renderVpFields(ud, showBirthday);

  const editBtn = document.getElementById('vp-edit-btn');
  editBtn.style.display = isSelf ? '' : 'none';

  const actions = document.getElementById('vp-actions');
  if (!isSelf && uid) {
    actions.innerHTML = `<button class="btn-primary" style="width:100%;justify-content:center" onclick="closeModal('view-profile-modal');personCtxOpenDMFor('${uid}')">✉️ Написать</button>`;
  } else {
    actions.innerHTML = '';
  }

  openModal('view-profile-modal');
}

// Утилита: открыть ЛС по uid из карточки просмотра профиля
async function personCtxOpenDMFor(uid) {
  if (!uid || uid === currentUser.uid) return;
  const s = await db.ref('users/' + uid).once('value');
  const ud = s.val();
  if (ud) openDM(uid, ud);
}

// Профиль отправителя сообщения внутри канала/группы (клик по нику)
async function viewMsgSenderProfile(uid) {
  if (!uid) return;
  if (uid === currentUser.uid) { openViewProfile('self'); return; }
  const s = await db.ref('users/' + uid).once('value');
  const ud = s.val();
  if (ud) openViewProfile({ uid, userData: ud, chatId: null, fromGroupChat: true });
}

// ============================================================
//  VIEW CHANNEL / GROUP INFO — открывается кликом по шапке чата
// ============================================================
function vpCopyChannelHandle(handle) {
  const text = '@' + handle;
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {});
  toast('📋 Юзернейм скопирован');
}

function openChannelOrGroupInfo(type, chatId, data) {
  vpTarget = null;
  const av = document.getElementById('vp-avatar');
  av.innerHTML = data.avatarUrl ? `<img src="${data.avatarUrl}" alt="">` : '';
  if (!data.avatarUrl) av.textContent = type === 'channel' ? '📡' : '👥';

  document.getElementById('vp-name').innerHTML = escHtml(data.name || '') +
    (data.verified ? ' <span class="badge-verify">✓</span>' : '');

  document.getElementById('vp-status').classList.remove('offline');
  document.getElementById('vp-status-text').textContent =
    `${data.memberCount || 1} ${type === 'channel' ? 'подписчик(ов)' : 'участник(ов)'}`;

  const parts = [];
  parts.push(vpField('bio', data.description, 'Описание', { emptyText: 'Нет описания' }));
  if (type === 'channel' && data.handle) {
    parts.push('<div class="vp-sep"></div>');
    parts.push(vpField('at', '@' + data.handle, 'Юзернейм канала', {
      cls: 'username', copyable: true, onclick: `vpCopyChannelHandle('${data.handle}')`
    }));
  }
  document.getElementById('vp-fields').innerHTML = parts.join('');

  document.getElementById('vp-edit-btn').style.display = 'none';
  const actions = document.getElementById('vp-actions');
  const isOwnerOrAdmin = data.ownerUid === currentUser.uid || currentUserData.isAdmin;
  actions.innerHTML = isOwnerOrAdmin
    ? `<button class="btn-primary" style="width:100%;justify-content:center" onclick="closeModal('view-profile-modal');${type === 'channel' ? 'openChannelSettings' : 'openGroupSettings'}('${chatId}')">⚙️ Настройки</button>`
    : '';

  openModal('view-profile-modal');
}
