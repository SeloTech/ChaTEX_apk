// ============================================================
//  FRIENDS + PERSON CONTEXT (ПКМ)
// ============================================================
// ─── MOBILE LONG-PRESS FOR PERSON CONTEXT MENU (правый клик не работает на телефоне) ───
function bindPersonLongPress(el, targetFn) {
  // элемент может переиспользоваться (напр. chat-header-name): цель храним в свойстве,
  // а обработчики вешаем один раз
  el._plpTarget = targetFn;
  if (el._plp) return;
  el._plp = true;
  txLongPress(el, pos => showPersonCtx(pos, el._plpTarget()));
}

function loadFriends() {
  if (!currentUser) return;
  db.ref('friends/' + currentUser.uid).on('value', snap => {
    friendsMap = snap.val() || {};
    refreshFriendBadges();
  });
  db.ref('friend_requests/' + currentUser.uid).on('value', snap => {
    friendRequestsMap = {};
    snap.forEach(c => { friendRequestsMap[c.key] = c.val(); });
    const count = snap.numChildren();
    const rbtn = document.getElementById('notif-btn');
    if (rbtn && count > 0) rbtn.textContent = `🤝${count}`;
  });
}

function refreshFriendBadges() {
  document.querySelectorAll('.chat-item.dm-item').forEach(el => {
    const uid = el.dataset.uid; if (!uid) return;
    const badge = el.querySelector('.friend-badge');
    if (badge) badge.style.display = friendsMap[uid] ? '' : 'none';
  });
}

let friendRequestsMap = {};
let outgoingReqsMap = {};
async function showPersonCtx(e, target) {
  personCtxTarget = target;
  const menu = document.getElementById('person-ctx-menu');
  if (!menu) return;
  const isFriend = !!(target.uid && friendsMap[target.uid]);
  if (target.uid) {
    const reqSnap = await db.ref('friend_requests/' + target.uid + '/' + currentUser.uid).once('value');
    outgoingReqsMap[target.uid] = reqSnap.val() ? true : false;
  }
  const reqSent = !!(target.uid && outgoingReqsMap[target.uid]);
  const fl = document.getElementById('pctx-friend-label');
  if (fl) {
    if (isFriend) fl.textContent = 'Удалить из друзей';
    else if (reqSent) fl.textContent = 'Запрос отправлен';
    else fl.textContent = 'Добавить в друзья';
  }
  const hasChat = target.type === 'dm' && target.chatId;
  ['pctx-pin','pctx-delete','pctx-sep-chat'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = hasChat ? '' : 'none';
  });
  const dmBtn = document.getElementById('pctx-dm'); if (dmBtn) dmBtn.style.display = target.uid ? '' : 'none';
  if (hasChat) {
    const pinned = !!(chatPrefs[target.chatId] || {}).pinned;
    const pl = document.getElementById('pctx-pin-label');
    if (pl) pl.textContent = pinned ? 'Открепить чат' : 'Закрепить чат';
  }
  menu.classList.add('open');
  menu.style.left = Math.min(e.clientX || 20, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(e.clientY || 20, window.innerHeight - 220) + 'px';
}
function closePersonCtx() {
  document.getElementById('person-ctx-menu')?.classList.remove('open');
}

async function personCtxFriend() {
  const t = personCtxTarget; closePersonCtx();
  if (!t?.uid) return;
  if (t.uid === currentUser.uid) { toast('Это вы 🙂'); return; }
  try {
    if (friendsMap[t.uid]) {
      await db.ref('friends/' + currentUser.uid + '/' + t.uid).remove();
      await db.ref('friends/' + t.uid + '/' + currentUser.uid).remove();
      toast('Удалено из друзей');
    } else {
      const reqSnap = await db.ref('friend_requests/' + t.uid + '/' + currentUser.uid).once('value');
      if (reqSnap.val()) {
        await db.ref('friend_requests/' + t.uid + '/' + currentUser.uid).remove();
        toast('Запрос отменён');
        return;
      }
      const reverseReq = await db.ref('friend_requests/' + currentUser.uid + '/' + t.uid).once('value');
      if (reverseReq.val()) {
        await acceptFriendRequest(t.uid);
        return;
      }
      await db.ref('friend_requests/' + t.uid + '/' + currentUser.uid).set({
        from: currentUser.uid, fromName: currentUserData.username, timestamp: Date.now()
      });
      addNotification(t.uid, { type: 'friend_request', text: currentUserData.username + ' хочет добавить вас в друзья', from: currentUserData.username, fromUid: currentUser.uid });
      toast('🤝 Запрос отправлен');
    }
  } catch (e) {
    console.error('personCtxFriend error:', e);
    toast('⚠️ Не удалось: ' + (e.message || e.code || 'ошибка прав доступа'));
  }
}
async function acceptFriendRequest(fromUid) {
  await db.ref('friends/' + currentUser.uid + '/' + fromUid).set({ since: Date.now() });
  await db.ref('friends/' + fromUid + '/' + currentUser.uid).set({ since: Date.now() });
  await db.ref('friend_requests/' + currentUser.uid + '/' + fromUid).remove();
  const us = await db.ref('users/' + fromUid + '/username').once('value');
  addNotification(fromUid, { type: 'friend', text: currentUserData.username + ' принял(а) ваш запрос в друзья', from: currentUserData.username });
  toast('✅ Теперь вы друзья!');
  openNotifications();
}
async function declineFriendRequest(fromUid) {
  await db.ref('friend_requests/' + currentUser.uid + '/' + fromUid).remove();
  toast('Запрос отклонён');
  openNotifications();
}
async function cancelFriendRequest(toUid) {
  await db.ref('friend_requests/' + toUid + '/' + currentUser.uid).remove();
  toast('Запрос отменён');
}
async function personCtxOpenDM() {
  const t = personCtxTarget; closePersonCtx();
  if (!t?.uid) return;
  let ud = t.userData;
  if (!ud) { const s = await db.ref('users/' + t.uid).once('value'); ud = s.val(); }
  if (ud) openDM(t.uid, ud);
}
async function personCtxPinChat() {
  const t = personCtxTarget; closePersonCtx();
  if (!t?.chatId) return;
  const cur = !!(chatPrefs[t.chatId] || {}).pinned;
  await db.ref('user_chat_prefs/' + currentUser.uid + '/' + t.chatId + '/pinned').set(!cur);
  toast(cur ? 'Откреплено' : '📌 Закреплено');
  document.getElementById('dm-' + t.chatId)?.classList.toggle('pinned-chat', !cur);
  if (typeof reorderDMSidebar === 'function') reorderDMSidebar();
}
async function personCtxDeleteChat() {
  const t = personCtxTarget; closePersonCtx();
  if (!t?.chatId) return;
  if (!confirm('Убрать чат из списка?')) return;
  await db.ref('user_chat_prefs/' + currentUser.uid + '/' + t.chatId + '/hidden').set(true);
  document.getElementById('dm-' + t.chatId)?.remove();
  if (currentChatId === t.chatId) openOfficial();
  toast('🗑 Чат удалён из списка');
}

// ─── CHANNEL / GROUP SIDEBAR CONTEXT MENU (ПКМ / long-press) ───
let chanCtxTarget = null;
function showChanCtx(e, target) {
  // target: { chatId, type: 'channel'|'group', ownerUid, name }
  chanCtxTarget = target;
  const menu = document.getElementById('chan-ctx-menu');
  if (!menu) return;
  const pinned = !!(chatPrefs[target.chatId] || {}).pinned;
  const pl = document.getElementById('cctx-pin-label');
  if (pl) pl.textContent = pinned ? 'Открепить чат' : 'Закрепить чат';
  const ll = document.getElementById('cctx-leave-label');
  if (ll) ll.textContent = target.type === 'channel' ? 'Выйти из канала' : 'Выйти из группы';
  const isOwner = target.ownerUid === currentUser.uid;
  const delEl = document.getElementById('cctx-delete');
  if (delEl) delEl.style.display = isOwner ? '' : 'none';
  menu.classList.add('open');
  menu.style.left = Math.min(e.clientX || 20, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(e.clientY || 20, window.innerHeight - 220) + 'px';
}
function closeChanCtx() { document.getElementById('chan-ctx-menu')?.classList.remove('open'); }

async function chanCtxPin() {
  const t = chanCtxTarget; closeChanCtx(); if (!t) return;
  const cur = !!(chatPrefs[t.chatId] || {}).pinned;
  await db.ref('user_chat_prefs/' + currentUser.uid + '/' + t.chatId + '/pinned').set(!cur);
  chatPrefs[t.chatId] = { ...(chatPrefs[t.chatId] || {}), pinned: !cur };
  toast(cur ? 'Откреплено' : '📌 Закреплено');
  const prefix = t.type === 'channel' ? 'ch-' : 'gr-';
  const item = document.getElementById(prefix + t.chatId);
  if (item) {
    item.classList.toggle('pinned-chat', !cur);
    const list = document.getElementById('chats-list');
    const support = document.getElementById('support-chat-item');
    if (!cur && list && support) list.insertBefore(item, support.nextSibling);
  }
}
async function chanCtxLeave() {
  const t = chanCtxTarget; closeChanCtx(); if (!t) return;
  if (t.type === 'channel') await leaveChannel(t.chatId);
  else await leaveGroup(t.chatId);
}
async function chanCtxDelete() {
  const t = chanCtxTarget; closeChanCtx(); if (!t) return;
  const label = t.type === 'channel' ? 'канал' : 'группу';
  if (!confirm('Удалить ' + label + ' навсегда?')) return;
  try {
    await db.ref((t.type === 'channel' ? 'channels/' : 'groups/') + t.chatId).remove();
    if (t.type === 'channel' && t.handle) await db.ref('channel_handles/' + t.handle.toLowerCase()).remove();
    document.getElementById((t.type === 'channel' ? 'ch-' : 'gr-') + t.chatId)?.remove();
    if (currentChatId === t.chatId) openOfficial();
    toast('🗑️ Удалено навсегда');
  } catch (e) {
    toast('⚠️ Не удалось удалить: ' + (e.message || e.code || 'ошибка прав Firebase'));
  }
}

async function openComplaintReply(id) {
  complaintReplyId = id;
  const snap = await db.ref('complaints/' + id).once('value');
  const c = snap.val() || {};
  document.getElementById('complaint-reply-meta').textContent =
    'Кому: @' + (c.fromName || '?') + ' · «' + String(c.text || '').slice(0, 80) + '»';
  document.getElementById('complaint-reply-modal').dataset.toNick = c.fromName || '';
  document.getElementById('complaint-reply-modal').dataset.toUid = c.fromUid || '';
  document.getElementById('complaint-reply-text').value = '';
  openModal('complaint-reply-modal');
}
async function sendComplaintReply() {
  const text = document.getElementById('complaint-reply-text').value.trim();
  if (!text) { toast('Напишите ответ'); return; }
  const toNick = document.getElementById('complaint-reply-modal').dataset.toNick || '';
  const toUid = document.getElementById('complaint-reply-modal').dataset.toUid || '';
  if (!toNick && !toUid) { toast('Нет получателя'); return; }
  try {
    await db.ref('support_messages').push({
      text: text,
      timestamp: Date.now(),
      senderName: 'ChaTEX! Support',
      senderUid: currentUser.uid,
      senderIsAdmin: true,
      forNick: toNick || null,
      isComplaintReply: true,
      complaintId: complaintReplyId || null
    });
    if (complaintReplyId) {
      await db.ref('complaints/' + complaintReplyId).update({
        status: 'answered', reply: text, repliedAt: Date.now()
      });
    }
    let uid = toUid;
    if (!uid && toNick) {
      const us = await db.ref('usernames/' + toNick.toLowerCase()).once('value');
      uid = us.val();
    }
    if (uid) addNotification(uid, { type: 'support', text: 'Ответ Support: ' + text.slice(0, 80), from: 'ChaTEX Support' });
    closeModal('complaint-reply-modal');
    toast('✅ Ответ в ChaTEX Support');
    loadComplaints();
  } catch (e) { toast('Ошибка: ' + (e.message || e)); }
}

