// ============================================================
//  ADMIN PANEL
// ============================================================
async function openAdminPanel() {
  if (!isAdmin(currentUserData)) return;
  openModal('admin-modal');
  switchAdminTab('main');
  loadAdminStats(); loadAdminUsers(''); loadAdminChans(''); loadComplaints();
  if (isRubick(currentUserData)) document.getElementById('admin-verify-section').style.display = '';
}
function closeAdminPanel() {
  if (adminUsersLive && adminUsersLiveRef) { try { adminUsersLiveRef.off('value', adminUsersLive); } catch (e) {} adminUsersLive = null; adminUsersLiveRef = null; }
  adminStatsRefs.forEach(({ ref, fn }) => { try { ref.off('value', fn); } catch (e) {} });
  adminStatsRefs = [];
  closeModal('admin-modal');
}

// ─── Статистика — раньше здесь "Сообщений" считались ТОЛЬКО из ЛС (dms),
// а сообщения в группах и каналах вообще не попадали в счёт — то есть
// цифра была не "с воздуха", а честно занижена (учитывала меньше
// половины реальных сообщений). Плюс это был once('value') — снимок на
// момент открытия панели, который никогда не обновлялся, пока панель
// открыта, из-за чего казался "статичным и ненастоящим".
// Теперь: считаем dms + groups + channels, слушаем изменения в реальном
// времени (on('value')), и группы получили отдельную карточку — раньше
// их количество вообще нигде не показывалось.
let adminStatsRefs = [];
function animateStatNumber(el, from, to) {
  if (!el) return;
  const card = el.closest('.admin-stat-card');
  if (card) { card.classList.remove('pulse'); void card.offsetWidth; card.classList.add('pulse'); }
  if (from === to || from == null) { el.textContent = to.toLocaleString('ru'); return; }
  const dur = 500, start = performance.now();
  function step(t) {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3); // ease-out
    el.textContent = Math.round(from + (to - from) * eased).toLocaleString('ru');
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function loadAdminStats() {
  // На случай повторного открытия панели — отключаем старые слушатели,
  // чтобы не плодить дубликаты и не считать статистику по два раза
  adminStatsRefs.forEach(({ ref, fn }) => { try { ref.off('value', fn); } catch (e) {} });
  adminStatsRefs = [];
  let lastUsers = null, lastMsgs = null, lastGroups = null, lastChannels = null;

  function attach(path, onVal) {
    const ref = db.ref(path);
    const fn = snap => onVal(snap);
    ref.on('value', fn);
    adminStatsRefs.push({ ref, fn });
  }

  attach('users', snap => {
    const n = snap.numChildren();
    animateStatNumber(document.getElementById('stat-users'), lastUsers, n);
    lastUsers = n;
  });
  attach('groups', snap => {
    const n = snap.numChildren();
    animateStatNumber(document.getElementById('stat-groups'), lastGroups, n);
    lastGroups = n;
  });
  attach('channels', snap => {
    const n = snap.numChildren();
    animateStatNumber(document.getElementById('stat-channels'), lastChannels, n);
    lastChannels = n;
  });
  // Сообщения считаем отдельно по всем трём деревьям и суммируем —
  // именно этого раньше не хватало (учитывались только dms)
  let msgCounts = { dms: 0, groups: 0, channels: 0, official: 0 };
  function recomputeMsgs() {
    const total = msgCounts.dms + msgCounts.groups + msgCounts.channels + msgCounts.official;
    animateStatNumber(document.getElementById('stat-msgs'), lastMsgs, total);
    lastMsgs = total;
  }
  attach('dms', snap => { let c = 0; snap.forEach(ch => { c += ch.numChildren(); }); msgCounts.dms = c; recomputeMsgs(); });
  attach('groups', snap => { let c = 0; snap.forEach(g => { c += (g.child('messages').numChildren()); }); msgCounts.groups = c; recomputeMsgs(); });
  attach('channels', snap => { let c = 0; snap.forEach(ch => { c += (ch.child('messages').numChildren()); }); msgCounts.channels = c; recomputeMsgs(); });
  attach('official_messages', snap => { msgCounts.official = snap.numChildren(); recomputeMsgs(); });
}

let adminUsersLive = null, adminUsersLiveRef = null;
function renderAdminUsersSnap(snap) {
  const list = document.getElementById('admin-users-list'); if (!list) return; list.innerHTML = '';
  snap.forEach(child => {
    const uid = child.key, ud = child.val(); if (!ud) return;
    const div = document.createElement('div'); div.className = 'user-list-item';
    div.innerHTML = `<div class="avatar" style="width:36px;height:36px;font-size:13px">${ud.avatarUrl ? `<img src="${ud.avatarUrl}" alt="">` : avatarFallback(ud.username)}</div>
      <div class="info">
        <div class="uname">${escHtml(ud.username)}${roleBadgesHtml(ud)}</div>
        <div class="uemail">${escHtml(ud.email || '')} · ${uid.slice(0, 8)}</div>
      </div>
      <div class="user-actions">
        <button class="ua-btn verify" onclick="openAdminEditUser('${uid}')">✏️ Ред.</button>
        ${isRubick(currentUserData) ? `<button class="ua-btn verify" onclick="adminVerifyUser('${uid}',${!!ud.verified})">${ud.verified ? 'Снять ✓' : 'Верифиц.'}</button>` : ''}
        ${isRubick(currentUserData) && !nameInList(ud.username, RUBICK_NAMES) ? `<button class="ua-btn icon-only ${ud.isAdmin ? 'active' : ''}" title="${ud.isAdmin ? 'Снять админку' : 'Сделать админом'}" onclick="adminToggleAdminRole('${uid}',${!!ud.isAdmin})">👑</button>` : ''}
        <button class="ua-btn ${ud.blocked ? 'unblock' : 'block'}" onclick="adminToggleBlock('${uid}',${!!ud.blocked})">${ud.blocked ? 'Разблок.' : 'Блок.'}</button>
        <button class="ua-btn delete" onclick="adminDeleteUser('${uid}')">Удалить</button>
      </div>`;
    list.appendChild(div);
  });
}
async function loadAdminUsers(query) {
  // Отключаем предыдущий live-listener (если был) — избегаем дублей
  if (adminUsersLive && adminUsersLiveRef) { try { adminUsersLiveRef.off('value', adminUsersLive); } catch (e) {} adminUsersLive = null; adminUsersLiveRef = null; }
  if (query) {
    const ref = db.ref('users').orderByChild('username').startAt(query).endAt(query + '\uf8ff').limitToFirst(10);
    const snap = await ref.once('value');
    renderAdminUsersSnap(snap);
  } else {
    // Без поиска — список пользователей обновляется в реальном времени
    adminUsersLiveRef = db.ref('users').limitToFirst(30);
    adminUsersLive = snap => renderAdminUsersSnap(snap);
    adminUsersLiveRef.on('value', adminUsersLive);
  }
}
function adminSearchUser(q) { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadAdminUsers(q), 400); }
async function adminToggleBlock(uid, isBlocked) {
  if (uid === currentUser.uid) { toast('Нельзя'); return; }
  await db.ref('users/' + uid + '/blocked').set(!isBlocked);
  toast(isBlocked ? '✅ Разблокировано' : '🚫 Заблокировано');
  loadAdminUsers(document.getElementById('admin-search-user').value);
}
async function adminDeleteUser(uid) {
  if (uid === currentUser.uid) { toast('Нельзя'); return; }
  if (!confirm('Удалить навсегда?')) return;
  const s = await db.ref('users/' + uid).once('value'); const ud = s.val();
  if (ud) await db.ref('usernames/' + ud.username.toLowerCase()).remove();
  await db.ref('users/' + uid).remove(); toast('🗑️ Удалён'); loadAdminUsers('');
}
async function adminVerifyUser(uid, isV) {
  await db.ref('users/' + uid + '/verified').set(!isV);
  toast(!isV ? '✅ Верифицирован' : 'Снято');
  loadAdminUsers(document.getElementById('admin-search-user').value);
}
async function adminToggleAdminRole(uid, isAdm) {
  if (!isRubick(currentUserData)) return;
  if (uid === currentUser.uid) { toast('Нельзя снять админку с себя'); return; }
  const updates = { isAdmin: !isAdm };
  if (isAdm) updates.isSuperAdmin = false; // снятие обычной админки снимает и супер-права
  await db.ref('users/' + uid).update(updates);
  toast(isAdm ? '✅ Админка снята' : '👑 Права админа выданы');
  loadAdminUsers(document.getElementById('admin-search-user').value);
}

async function loadAdminChans(query) {
  const list = document.getElementById('admin-chans-list'); list.innerHTML = '';
  const [chSnap, grSnap] = await Promise.all([
    query ? db.ref('channels').orderByChild('name').startAt(query).endAt(query + '\uf8ff').limitToFirst(10).once('value') : db.ref('channels').limitToFirst(15).once('value'),
    query ? db.ref('groups').orderByChild('name').startAt(query).endAt(query + '\uf8ff').limitToFirst(5).once('value')   : db.ref('groups').limitToFirst(8).once('value')
  ]);
  const render = (snap, type) => {
    snap.forEach(child => {
      const data = child.val(); if (!data) return;
      const id = child.key; const div = document.createElement('div'); div.className = 'user-list-item';
      div.innerHTML = `<div class="avatar ${type}" style="width:36px;height:36px;font-size:14px">${data.avatarUrl ? `<img src="${data.avatarUrl}" alt="">` : (type === 'channel' ? '📡' : '👥')}</div>
        <div class="info">
          <div class="uname">${escHtml(data.name)}${data.verified ? ` <span class="badge-verify">✓</span>` : ''} ${data.blocked ? `<span style="color:var(--red);font-size:10px">[BLOCKED]</span>` : ''}</div>
          <div class="uemail">Владелец: ${escHtml(data.ownerName || '?')} · ${id.slice(0, 8)}</div>
        </div>
        <div class="user-actions">
          <button class="ua-btn ${data.blocked ? 'unblock' : 'block'}" onclick="adminToggleChanBlock('${type}','${id}',${!!data.blocked})">${data.blocked ? 'Разблок.' : 'Блок.'}</button>
          ${isAdmin(currentUserData) ? `<button class="ua-btn verify" onclick="adminToggleChanVerify('${type}','${id}',${!!data.verified})">${data.verified ? 'Снять ✓' : 'Верифиц.'}</button>` : ''}
          <button class="ua-btn delete" onclick="adminDeleteChan('${type}','${id}')">Удалить</button>
        </div>`;
      list.appendChild(div);
    });
  };
  render(chSnap, 'channel'); render(grSnap, 'group');
}
function adminSearchChan(q) { clearTimeout(adminSearchTimer); adminSearchTimer = setTimeout(() => loadAdminChans(q), 400); }

async function adminToggleChanVerify(type, id, isV) {
  if (!isAdmin(currentUserData)) return;
  const ref = type === 'channel' ? 'channels' : 'groups';
  try {
    await db.ref(`${ref}/${id}/verified`).set(!isV);
    toast(!isV ? '✅ Верифицирован' : 'Галочка снята');
    loadAdminChans(document.getElementById('admin-search-chan').value);
  } catch (e) { toast('⚠️ Не удалось: ' + (e.message || e.code)); }
}

async function adminToggleChanBlock(type, id, isBlocked) {
  if (!isBlocked) { blockChanTarget = { type, id }; openModal('block-chan-modal'); }
  else {
    await db.ref(`${type === 'channel' ? 'channels' : 'groups'}/${id}/blocked`).set(false);
    await db.ref(`${type === 'channel' ? 'channels' : 'groups'}/${id}/blockReason`).remove();
    toast('✅ Разблокировано'); loadAdminChans(document.getElementById('admin-search-chan').value);
  }
}
async function confirmBlockChan() {
  const reason = document.getElementById('block-chan-reason').value.trim(); if (!blockChanTarget) return;
  const { type, id } = blockChanTarget; const ref = type === 'channel' ? 'channels' : 'groups';
  await db.ref(`${ref}/${id}/blocked`).set(true);
  await db.ref(`${ref}/${id}/blockReason`).set(reason || 'Нарушение правил ChaTEX');
  const ownerSnap = await db.ref(`${ref}/${id}/ownerUid`).once('value'); const ownerUid = ownerSnap.val();
  if (ownerUid) await db.ref('notifications/' + ownerUid).push({ type: 'system', text: `Ваш ${type === 'channel' ? 'канал' : 'группа'} заблокирован(а). Причина: ${reason || 'Нарушение правил'}`, from: 'ChaTEX Support', read: false, timestamp: Date.now() });
  closeModal('block-chan-modal'); document.getElementById('block-chan-reason').value = ''; blockChanTarget = null;
  toast('🚫 Заблокировано с причиной'); loadAdminChans(document.getElementById('admin-search-chan').value);
}
async function adminDeleteChan(type, id) {
  if (!confirm(`Удалить ${type === 'channel' ? 'канал' : 'группу'} навсегда?`)) return;
  await db.ref((type === 'channel' ? 'channels' : 'groups') + '/' + id).remove();
  toast('🗑️ Удалено'); loadAdminChans(document.getElementById('admin-search-chan').value);
}

async function verifyEntity(type) {
  const nick = document.getElementById('verify-target-nick').value.trim(); if (!nick || !isRubick(currentUserData)) return;
  if (type === 'user') {
    const s = await db.ref('usernames/' + nick.toLowerCase()).once('value'); const uid = s.val();
    if (!uid) { toast('Пользователь не найден'); return; }
    await db.ref('users/' + uid + '/verified').set(true); toast(`✅ @${nick} верифицирован`);
  } else {
    let chId = null;
    const hs = await db.ref('channel_handles/' + nick.toLowerCase()).once('value'); chId = hs.val();
    if (!chId) { const cs = await db.ref('channels').orderByChild('name').equalTo(nick).limitToFirst(1).once('value'); cs.forEach(c => { chId = c.key; }); }
    if (!chId) { toast('Канал не найден (введите @handle или точное название)'); return; }
    await db.ref('channels/' + chId + '/verified').set(true); toast('✅ Канал верифицирован');
  }
}

async function loadComplaints() {
  const list = document.getElementById('admin-complaints-list');
  if (!list) return;
  list.innerHTML = '<div style="color:var(--text3);font-size:13px">Загрузка...</div>';
  try {
    let snap;
    try {
      snap = await db.ref('complaints').orderByChild('timestamp').limitToLast(30).once('value');
    } catch (e) {
      // Нет индекса — читаем всё
      snap = await db.ref('complaints').once('value');
    }
    const complaints = []; complaintsCache = {};
    snap.forEach(c => complaints.push({ id: c.key, ...c.val() }));
    complaints.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const open = complaints.filter(c => c.status !== 'resolved' && c.status !== 'closed');
    const show = (open.length ? open : complaints).slice(0, 30);
    if (!show.length) {
      list.innerHTML = '<div style="color:var(--text3);font-size:13px">Жалоб нет. Пользователи отправляют их через ⚠️ в Support.</div>';
      return;
    }
    list.innerHTML = show.map(c =>
      `<div class="complaint-item">
        <div class="complaint-meta"><span>⚠️ ${escHtml(c.type || 'other')}</span><span>от @${escHtml(c.fromName || '?')}</span><span>${formatTime(c.timestamp)}</span>
        <span style="color:${c.status === 'resolved' ? 'var(--green)' : 'var(--gold)'}">● ${escHtml(c.status || 'open')}</span></div>
        <div class="complaint-text">${escHtml(c.text || '')}</div>
        ${c.targetUid ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">Цель: ${escHtml(String(c.targetUid).slice(0, 16))}</div>` : ''}
        <div class="complaint-actions">
          <button class="ua-btn verify" onclick="openComplaintReply('${c.id}')">↩️ Ответить</button>
          <button class="ua-btn block" onclick="resolveComplaint('${c.id}')">✓ Принять</button>
          <button class="ua-btn delete" onclick="deleteComplaint('${c.id}')">Удалить</button>
        </div></div>`
    ).join('');
  } catch (e) {
    console.error(e);
    list.innerHTML = '<div style="color:var(--red);font-size:13px">Ошибка загрузки жалоб: ' + escHtml(e.message || '') + '</div>';
  }
}


async function resolveComplaint(id) { await db.ref('complaints/' + id + '/status').set('resolved'); toast('✅ Решено'); loadComplaints(); }
async function deleteComplaint(id)  { await db.ref('complaints/' + id).remove(); loadComplaints(); }
async function sendSysMessage() {
  const text = document.getElementById('sys-msg-text').value.trim(); if (!text) return;
  await db.ref('support_messages').push({ text, timestamp: Date.now(), isSystem: true, senderName: 'ChaTEX! Support', senderUid: currentUser.uid });
  document.getElementById('sys-msg-text').value = ''; toast('✅ Отправлено всем');
}

// ─── ВКЛАДКИ АДМИН-ПАНЕЛИ ────────────────────────────────────
function switchAdminTab(tab) {
  document.getElementById('admin-tab-main').style.display     = tab === 'main'     ? '' : 'none';
  document.getElementById('admin-tab-premium').style.display  = tab === 'premium'  ? '' : 'none';
  document.getElementById('admin-tab-stickers').style.display = tab === 'stickers' ? '' : 'none';
  document.getElementById('admin-tab-badges').style.display   = tab === 'badges'   ? '' : 'none';
  document.getElementById('admin-tab-btn-badges')?.classList.toggle('active', tab === 'badges');
  document.getElementById('admin-tab-btn-main')?.classList.toggle('active', tab === 'main');
  document.getElementById('admin-tab-btn-premium')?.classList.toggle('active', tab === 'premium');
  document.getElementById('admin-tab-btn-stickers')?.classList.toggle('active', tab === 'stickers');
}

// ─── PREMIUM: выдача админом (2-я страница панели) ──────────
function renderAdminPremiumSnap(snap) {
  const list = document.getElementById('admin-premium-list'); if (!list) return; list.innerHTML = '';
  let any = false;
  snap.forEach(child => {
    any = true;
    const uid = child.key, ud = child.val(); if (!ud) return;
    const isPrem = isPremiumActive(ud.premium, ud.premiumExpiresAt);
    const div = document.createElement('div'); div.className = 'user-list-item';
    div.innerHTML = `<div class="avatar" style="width:36px;height:36px;font-size:13px">${ud.avatarUrl ? `<img src="${ud.avatarUrl}" alt="">` : avatarFallback(ud.username)}</div>
      <div class="info">
        <div class="uname">${escHtml(ud.username)}${roleBadgesHtml(ud)}</div>
        <div class="uemail">${isPrem ? `<span style="color:#3dc8ff">✦ до ${formatPremiumExpiry(ud.premiumExpiresAt)}</span>` : 'Обычный аккаунт'}</div>
      </div>
      <div class="user-actions">
        ${isPrem ? `<button class="ua-btn verify" onclick="adminExtendPremium('${uid}')">+1 мес.</button>` : ''}
        <button class="ua-btn ${isPrem ? 'unblock' : 'verify'}" onclick="adminTogglePremium('${uid}',${isPrem})">${isPrem ? 'Забрать Premium' : '✦ Выдать на 1 мес.'}</button>
      </div>`;
    list.appendChild(div);
  });
  if (!any) list.innerHTML = '<div style="color:var(--text3);font-size:13px">Никого не найдено</div>';
}
async function adminSearchPremiumUser(q) {
  clearTimeout(adminSearchTimer);
  adminSearchTimer = setTimeout(async () => {
    const list = document.getElementById('admin-premium-list'); if (!list) return;
    const query = q.trim();
    if (!query) { list.innerHTML = '<div style="color:var(--text3);font-size:13px">Введите ник, чтобы найти пользователя</div>'; return; }
    const ref = db.ref('users').orderByChild('username').startAt(query).endAt(query + '\uf8ff').limitToFirst(15);
    const snap = await ref.once('value');
    renderAdminPremiumSnap(snap);
  }, 350);
}
async function adminTogglePremium(uid, isPrem) {
  if (isPrem) {
    await db.ref('users/' + uid).update({ premium: false, premiumExpiresAt: null });
    toast('✅ Premium снят');
  } else {
    const expiresAt = Date.now() + PREMIUM_DURATION_MS;
    await db.ref('users/' + uid).update({ premium: true, premiumExpiresAt: expiresAt });
    toast('✦ Premium выдан на 1 месяц (до ' + formatPremiumExpiry(expiresAt) + ')');
  }
  adminSearchPremiumUser(document.getElementById('admin-premium-search').value);
}
async function adminExtendPremium(uid) {
  const snap = await db.ref('users/' + uid).once('value'); const ud = snap.val(); if (!ud) return;
  const base = isPremiumActive(ud.premium, ud.premiumExpiresAt) ? ud.premiumExpiresAt : Date.now();
  const expiresAt = base + PREMIUM_DURATION_MS;
  await db.ref('users/' + uid).update({ premium: true, premiumExpiresAt: expiresAt });
  toast('✦ Продлено до ' + formatPremiumExpiry(expiresAt));
  adminSearchPremiumUser(document.getElementById('admin-premium-search').value);
}

// ───── СТИКЕРЫ: модерация стикер-паков и эмодзи-паков пользователей ─────
let adminStickerSearchTimer = null;
async function adminSearchStickerUser(q) {
  clearTimeout(adminStickerSearchTimer);
  adminStickerSearchTimer = setTimeout(async () => {
    const list = document.getElementById('admin-stickers-list'); if (!list) return;
    const query = q.trim();
    if (!query) { list.innerHTML = '<div style="color:var(--text3);font-size:13px">Введите ник, чтобы найти пользователя</div>'; return; }
    list.innerHTML = '<div style="color:var(--text3);font-size:13px">Загрузка...</div>';
    const ref = db.ref('users').orderByChild('username').startAt(query).endAt(query + '\uf8ff').limitToFirst(15);
    const snap = await ref.once('value');
    renderAdminStickersSnap(snap);
  }, 350);
}
function renderAdminStickersSnap(snap) {
  const list = document.getElementById('admin-stickers-list'); if (!list) return; list.innerHTML = '';
  if (!snap.exists()) { list.innerHTML = '<div style="color:var(--text3);font-size:13px">Никого не найдено</div>'; return; }
  snap.forEach(child => {
    const uid = child.key; const ud = child.val() || {};
    const stickerPacks = ud.stickerPacks || {};
    const emojiPacks = ud.emojiPacks || {};
    const stCount = Object.keys(stickerPacks).length;
    const emCount = Object.keys(emojiPacks).length;
    const row = document.createElement('div');
    row.className = 'ua-row';
    row.innerHTML = `<div class="uinfo">
        <div class="uname">${escHtml(ud.username || uid)}</div>
        <div class="uemail">${stCount} стикер-пак(ов), ${emCount} набор(ов) эмодзи</div>
      </div>
      <div class="ua-actions" style="flex-direction:column;align-items:stretch;gap:6px" id="admin-sticker-packs-${uid}"></div>`;
    list.appendChild(row);
    const wrap = row.querySelector(`#admin-sticker-packs-${uid}`);
    const packsHtml = [];
    // Клик по заголовку пака теперь раскрывает реальные картинки стикеров —
    // так модератор видит содержимое, а не только название и число штук,
    // и может убрать конкретный запрещённый стикер, не трогая весь пак.
    Object.entries(stickerPacks).forEach(([pid, pk]) => {
      const stickers = pk.stickers || {};
      const count = Object.keys(stickers).length;
      const gridId = `admin-pack-grid-${uid}-${pid}`;
      const thumbs = Object.entries(stickers).map(([sid, url]) => `
          <div class="admin-pack-thumb">
            <img src="${escAttr(url)}" loading="lazy" alt="" onclick="event.stopPropagation();window.open('${escAttr(url)}','_blank')">
            <button class="admin-pack-thumb-del" title="Удалить этот стикер" onclick="event.stopPropagation();adminDeleteSingleSticker('${uid}','${pid}','${sid}')">✕</button>
          </div>`).join('');
      packsHtml.push(`<div class="ua-row admin-pack-row" style="flex-direction:column;align-items:stretch;padding:6px 8px">
          <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="toggleAdminPackGrid('${gridId}')">
            <div class="uinfo"><div class="uname">🖼️ ${escHtml(pk.name || pid)}</div><div class="uemail">${count} стикер(ов) — нажмите, чтобы посмотреть</div></div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="admin-pack-chevron" id="${gridId}-chevron">▾</span>
              <button class="ua-btn delete" onclick="event.stopPropagation();adminDeleteUserStickerPack('${uid}','${pid}')">🗑️ Пак</button>
            </div>
          </div>
          <div class="admin-pack-grid" id="${gridId}">${thumbs || '<div style="color:var(--text3);font-size:12px">Пак пуст</div>'}</div>
        </div>`);
    });
    Object.entries(emojiPacks).forEach(([pid, pk]) => {
      const items = pk.items || {};
      const count = Object.keys(items).length;
      const gridId = `admin-pack-grid-${uid}-em-${pid}`;
      const thumbs = Object.entries(items).map(([iid, it]) => `
          <div class="admin-pack-thumb">
            <img src="${escAttr(it.url || it)}" loading="lazy" alt="" onclick="event.stopPropagation();window.open('${escAttr(it.url || it)}','_blank')">
            <button class="admin-pack-thumb-del" title="Удалить этот эмодзи" onclick="event.stopPropagation();adminDeleteSingleEmoji('${uid}','${pid}','${iid}')">✕</button>
          </div>`).join('');
      packsHtml.push(`<div class="ua-row admin-pack-row" style="flex-direction:column;align-items:stretch;padding:6px 8px">
          <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="toggleAdminPackGrid('${gridId}')">
            <div class="uinfo"><div class="uname">😀 ${escHtml(pk.name || pid)}</div><div class="uemail">${count} эмодзи — нажмите, чтобы посмотреть</div></div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="admin-pack-chevron" id="${gridId}-chevron">▾</span>
              <button class="ua-btn delete" onclick="event.stopPropagation();adminDeleteUserEmojiPack('${uid}','${pid}')">🗑️ Пак</button>
            </div>
          </div>
          <div class="admin-pack-grid" id="${gridId}">${thumbs || '<div style="color:var(--text3);font-size:12px">Пак пуст</div>'}</div>
        </div>`);
    });
    wrap.innerHTML = packsHtml.join('') || '<div style="color:var(--text3);font-size:12px;padding:4px 8px">Нет своих паков</div>';
  });
}
function toggleAdminPackGrid(gridId) {
  const grid = document.getElementById(gridId); const chevron = document.getElementById(gridId + '-chevron');
  if (!grid) return;
  const open = grid.classList.toggle('open');
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
}
async function adminDeleteSingleSticker(uid, packId, stickerId) {
  if (!confirm('Удалить этот стикер?')) return;
  await db.ref(`users/${uid}/stickerPacks/${packId}/stickers/${stickerId}`).remove();
  toast('🗑️ Стикер удалён');
  adminSearchStickerUser(document.getElementById('admin-stickers-search').value);
}
async function adminDeleteSingleEmoji(uid, packId, itemId) {
  if (!confirm('Удалить этот эмодзи?')) return;
  await db.ref(`users/${uid}/emojiPacks/${packId}/items/${itemId}`).remove();
  toast('🗑️ Эмодзи удалён');
  adminSearchStickerUser(document.getElementById('admin-stickers-search').value);
}
async function adminDeleteUserStickerPack(uid, packId) {
  if (!confirm('Удалить этот стикер-пак у пользователя?')) return;
  await db.ref('users/' + uid + '/stickerPacks/' + packId).remove();
  toast('🗑️ Стикер-пак удалён');
  adminSearchStickerUser(document.getElementById('admin-stickers-search').value);
}
async function adminDeleteUserEmojiPack(uid, packId) {
  if (!confirm('Удалить этот набор эмодзи у пользователя?')) return;
  await db.ref('users/' + uid + '/emojiPacks/' + packId).remove();
  toast('🗑️ Набор эмодзи удалён');
  adminSearchStickerUser(document.getElementById('admin-stickers-search').value);
}



