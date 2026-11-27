// ============================================================
//  SIDEBAR CHAT LIST
// ============================================================
// Именованные ссылки на "долгоживущие" (не привязанные к конкретному
// чату) слушатели сайдбара — нужны, чтобы полностью отписаться при
// смене аккаунта (выход/повторный логин/новая регистрация в той же
// вкладке). Без этого DOM-элементы и подписки от прошлой сессии
// оставались висеть, и в новом аккаунте были видны чужие ЛС/каналы.
let sidebarPrefsRef = null, sidebarPrefsCb = null;
let sidebarUserChatsRef = null, sidebarUserChatsCb = null;
let sidebarDmMetaRef = null, sidebarDmMetaCb = null;
let sidebarChannelsRef = null, sidebarChannelsCb = null;
let sidebarGroupsRef = null, sidebarGroupsCb = null;

// Полный сброс сайдбара и всех его подписок. Вызывается при выходе
// из аккаунта и на всякий случай — перед подпиской для нового логина.
function resetSidebarState() {
  if (sidebarPrefsRef)     { try { sidebarPrefsRef.off('value', sidebarPrefsCb); } catch (e) {} }
  if (sidebarUserChatsRef) { try { sidebarUserChatsRef.off('value', sidebarUserChatsCb); } catch (e) {} }
  if (sidebarDmMetaRef)    { try { sidebarDmMetaRef.off('value', sidebarDmMetaCb); } catch (e) {} }
  if (sidebarChannelsRef)  { try { sidebarChannelsRef.off('value', sidebarChannelsCb); } catch (e) {} }
  if (sidebarGroupsRef)    { try { sidebarGroupsRef.off('value', sidebarGroupsCb); } catch (e) {} }
  sidebarPrefsRef = sidebarUserChatsRef = sidebarDmMetaRef = sidebarChannelsRef = sidebarGroupsRef = null;

  Object.keys(dmMetaListeners).forEach(chatId => {
    try { db.ref('dm_meta/' + chatId).off('value', dmMetaListeners[chatId]); } catch (e) {}
  });
  dmMetaListeners = {};

  document.querySelectorAll('#chats-list .chat-item.dm-item, #chats-list .chat-item.channel-item, #chats-list .chat-item.group-item')
    .forEach(el => el.remove());

  chatPrefs = {}; dmChatList = {};
}

function setActiveChat(id) {
  document.querySelectorAll('.chat-item').forEach(c => c.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function loadAllChats() {
  resetSidebarState();
  loadDMChats(); loadMyChannels(); loadMyGroups(); loadTicketsFolder();
}

function loadDMChats() {
  // prefs (pin / hide)
  sidebarPrefsCb = snap => {
    chatPrefs = snap.val() || {};
    reorderDMSidebar();
  };
  sidebarPrefsRef = db.ref('user_chat_prefs/' + currentUser.uid);
  sidebarPrefsRef.on('value', sidebarPrefsCb);
  // Load from user_chats (personal list — реальный список именно этого аккаунта)
  sidebarUserChatsCb = snap => {
    const myChats = snap.val() || {};
    Object.entries(myChats).forEach(([chatId, info]) => {
      const pref = chatPrefs[chatId] || {};
      if (pref.hidden) {
        document.getElementById('dm-' + chatId)?.remove();
        return;
      }
      const otherUid = info.otherUid;
      if (!otherUid) return;
      db.ref('dm_meta/' + chatId).once('value').then(metaSnap => {
        const meta = metaSnap.val() || {};
        db.ref('users/' + otherUid).once('value').then(us => {
          const ud = us.val(); if (!ud) return;
          addDMToSidebar(chatId, ud, meta.lastMsg || '', meta.lastTs || info.since || 0);
        });
      });
    });
  };
  sidebarUserChatsRef = db.ref('user_chats/' + currentUser.uid);
  sidebarUserChatsRef.on('value', sidebarUserChatsCb);
  // Also listen to dm_meta for chats from other users (backward compat)
  sidebarDmMetaCb = snap => {
    snap.forEach(child => {
      const meta = child.val();
      if (!meta || !meta.participants || !meta.participants[currentUser.uid]) return;
      const chatId = child.key;
      if (document.getElementById('dm-' + chatId)) return;
      const pref = chatPrefs[chatId] || {};
      if (pref.hidden) return;
      const otherUid = Object.keys(meta.participants).find(u => u !== currentUser.uid);
      if (!otherUid) return;
      db.ref('users/' + otherUid).once('value').then(us => {
        const ud = us.val(); if (!ud) return;
        addDMToSidebar(chatId, ud, meta.lastMsg || '', meta.lastTs || 0);
      });
    });
  };
  sidebarDmMetaRef = db.ref('dm_meta');
  sidebarDmMetaRef.on('value', sidebarDmMetaCb);
}
function reorderDMSidebar() {
  const list = document.getElementById('chats-list');
  const dms = [...list.querySelectorAll('.chat-item.dm-item')];
  dms.sort((a, b) => {
    const pa = !!(chatPrefs[a.id.replace('dm-','')] || {}).pinned;
    const pb = !!(chatPrefs[b.id.replace('dm-','')] || {}).pinned;
    return (pb - pa);
  });
  const anchor = document.getElementById('support-chat-item');
  dms.forEach(el => {
    if (anchor && anchor.nextSibling) list.insertBefore(el, anchor.nextSibling);
    else list.appendChild(el);
  });
  // pinned first: insert after support in reverse
  const pinned = dms.filter(el => el.classList.contains('pinned-chat'));
  pinned.reverse().forEach(el => {
    if (anchor) list.insertBefore(el, anchor.nextSibling);
  });
}

function loadMyChannels() {
  sidebarChannelsCb = snap => {
    document.querySelectorAll('.chat-item.channel-item').forEach(el => el.remove());
    snap.forEach(child => {
      const data = child.val(); if (!data) return;
      if (!data.members || !data.members[currentUser.uid]) return;
      if (!document.getElementById('ch-' + child.key)) addChannelToSidebar(child.key, data);
    });
  };
  sidebarChannelsRef = db.ref('channels');
  sidebarChannelsRef.on('value', sidebarChannelsCb);
}

function loadMyGroups() {
  sidebarGroupsCb = snap => {
    document.querySelectorAll('.chat-item.group-item').forEach(el => el.remove());
    snap.forEach(child => {
      const data = child.val(); if (!data) return;
      if (!data.members || !data.members[currentUser.uid]) return;
      if (!document.getElementById('gr-' + child.key)) addGroupToSidebar(child.key, data);
    });
  };
  sidebarGroupsRef = db.ref('groups');
  sidebarGroupsRef.on('value', sidebarGroupsCb);
}

function addDMToSidebar(chatId, userData, lastMsg = '', lastTs = 0) {
  if (document.getElementById('dm-' + chatId)) return;
  const pref = chatPrefs[chatId] || {};
  if (pref.hidden) return;
  const list = document.getElementById('chats-list'); const item = document.createElement('div');
  item.className = 'chat-item dm-item' + (pref.pinned ? ' pinned-chat' : '');
  item.id = 'dm-' + chatId; item.dataset.type = 'dm';
  const uid = chatId.split('_').find(p => p !== currentUser.uid);
  const avHtml = userData.avatarUrl ? `<img src="${userData.avatarUrl}" alt="">` : avatarFallback(userData.username);
  item.dataset.uid = uid;
  item.dataset.chatId = chatId;
  item.innerHTML = `<div class="avatar">${avHtml}</div>
    <div class="chat-item-info">
      <div class="chat-item-name">${escHtml(userData.username)}${roleBadgesHtml(userData)} <span class="friend-badge" style="display:${friendsMap[uid] ? '' : 'none'}">друг</span></div>
      <div class="chat-item-preview">${escHtml(stripInlineEmojiTokens(lastMsg) || '')}</div>
    </div>
    ${lastTs ? `<div class="chat-item-time">${formatTime(lastTs)}</div>` : ''}`;
  item.onclick = () => openDM(uid, userData);
  item.oncontextmenu = e => {
    e.preventDefault(); e.stopPropagation();
    showPersonCtx(e, { uid, username: userData.username, chatId, type: 'dm', userData });
  };
  bindPersonLongPress(item, () => ({ uid, username: userData.username, chatId, type: 'dm', userData }));
  // insert after support; pinned near top
  const support = document.getElementById('support-chat-item');
  if (pref.pinned && support) list.insertBefore(item, support.nextSibling);
  else list.appendChild(item);
  listenDMMetaLive(chatId);
}

// ─── REALTIME DM PREVIEW (last message + time in sidebar) ───
let dmMetaListeners = {};
function listenDMMetaLive(chatId) {
  if (dmMetaListeners[chatId]) return; // уже слушаем
  dmMetaListeners[chatId] = db.ref('dm_meta/' + chatId).on('value', snap => {
    const meta = snap.val(); if (!meta) return;
    const item = document.getElementById('dm-' + chatId); if (!item) return;
    const prev = item.querySelector('.chat-item-preview');
    if (prev && meta.lastMsg !== undefined) prev.textContent = stripInlineEmojiTokens(meta.lastMsg) || '';
    let timeEl = item.querySelector('.chat-item-time');
    if (meta.lastTs) {
      if (!timeEl) {
        timeEl = document.createElement('div'); timeEl.className = 'chat-item-time';
        item.appendChild(timeEl);
      }
      timeEl.textContent = formatTime(meta.lastTs);
    }
    // Поднимаем чат наверх списка при новом сообщении (кроме закреплённых — их не трогаем)
    const list = document.getElementById('chats-list');
    const support = document.getElementById('support-chat-item');
    if (list && support && !item.classList.contains('pinned-chat')) {
      list.insertBefore(item, support.nextSibling);
    }
  });
}

function addChannelToSidebar(chatId, data) {
  if (document.getElementById('ch-' + chatId)) return;
  const list = document.getElementById('chats-list'); const item = document.createElement('div');
  const pref = chatPrefs[chatId] || {};
  item.className = 'chat-item channel-item' + (pref.pinned ? ' pinned-chat' : ''); item.id = 'ch-' + chatId; item.dataset.type = 'channel';
  const avHtml = data.avatarUrl ? `<img src="${data.avatarUrl}" alt="">` : '📡';
  item.innerHTML = `<div class="avatar channel">${avHtml}</div>
    <div class="chat-item-info">
      <div class="chat-item-name">${escHtml(data.name)}${data.verified ? ` <span class="badge-verify">✓</span>` : ''}</div>
      <div class="chat-item-preview">${data.description || data.memberCount + ' подписчиков'}</div>
    </div>`;
  item.onclick = () => db.ref('channels/' + chatId).once('value').then(s => openChannel(chatId, s.val()));
  const ctxTarget = () => ({ chatId, type: 'channel', ownerUid: data.ownerUid, handle: data.handle, name: data.name });
  item.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); showChanCtx(e, ctxTarget()); };
  bindPersonLongPress(item, ctxTarget);
  if (pref.pinned) { const support = document.getElementById('support-chat-item'); if (support) list.insertBefore(item, support.nextSibling); else list.appendChild(item); }
  else list.appendChild(item);
}

function addGroupToSidebar(chatId, data) {
  if (document.getElementById('gr-' + chatId)) return;
  const list = document.getElementById('chats-list'); const item = document.createElement('div');
  const pref = chatPrefs[chatId] || {};
  item.className = 'chat-item group-item' + (pref.pinned ? ' pinned-chat' : ''); item.id = 'gr-' + chatId; item.dataset.type = 'group';
  const avHtml = data.avatarUrl ? `<img src="${data.avatarUrl}" alt="">` : '👥';
  item.innerHTML = `<div class="avatar group">${avHtml}</div>
    <div class="chat-item-info">
      <div class="chat-item-name">${escHtml(data.name)}${data.verified ? ` <span class="badge-verify">✓</span>` : ''}</div>
      <div class="chat-item-preview">${data.description || data.memberCount + ' участников'}</div>
    </div>`;
  item.onclick = () => db.ref('groups/' + chatId).once('value').then(s => openGroup(chatId, s.val()));
  const ctxTarget = () => ({ chatId, type: 'group', ownerUid: data.ownerUid, name: data.name });
  item.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); showChanCtx(e, ctxTarget()); };
  bindPersonLongPress(item, ctxTarget);
  if (pref.pinned) { const support = document.getElementById('support-chat-item'); if (support) list.insertBefore(item, support.nextSibling); else list.appendChild(item); }
  else list.appendChild(item);
}

// Пишем метаданные чата ТОЛЬКО для себя (того, кто открыл переписку).
// user_chats/{otherUid} специально не трогаем здесь — иначе просто открыв
// профиль/чат человека (ничего не написав), мы создавали бы у НЕГО в
// сайдбаре чат, о котором он не просил. У собеседника чат появляется
// только когда ему реально приходит первое сообщение (см. sendMsg /
// sendImageMessage / sendVoiceMessage в 15-send-messages.js).
async function saveDMMeta(chatId, otherUid) {
  try {
    const updates = {};
    updates['dm_meta/' + chatId + '/participants'] = { [currentUser.uid]: true, [otherUid]: true };
    updates['dm_meta/' + chatId + '/lastTs'] = Date.now();
    updates['user_chats/' + currentUser.uid + '/' + chatId] = { otherUid, since: Date.now() };
    await db.ref().update(updates);
  } catch (e) { console.warn('saveDMMeta:', e); }
}

// Гарантирует, что у ПОЛУЧАТЕЛЯ (otherUid) чат появится в сайдбаре —
// вызывается только в момент реальной отправки первого сообщения.
async function ensureRecipientHasChat(chatId, otherUid) {
  try {
    const snap = await db.ref('user_chats/' + otherUid + '/' + chatId).once('value');
    if (snap.exists()) return;
    await db.ref('user_chats/' + otherUid + '/' + chatId).set({ otherUid: currentUser.uid, since: Date.now() });
  } catch (e) { console.warn('ensureRecipientHasChat:', e); }
}

