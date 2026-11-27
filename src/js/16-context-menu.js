// ============================================================
//  CONTEXT MENU
// ============================================================
// ─── ДОЛГОЕ НАЖАТИЕ (телефон) ───
// Таймер срабатывает, пока палец неподвижен (а не по touchend, как раньше).
// Браузер после касания шлёт синтетический click в точку нажатия — глобальный
// обработчик тогда сразу закрывал только что открытое меню. Поэтому:
// 1) запоминаем момент срабатывания в window.__lpAt (глобальный click его игнорирует);
// 2) на touchend отменяем синтетический click через preventDefault.
window.__lpAt = 0;
function txLongPress(el, onLong) {
  let timer = null, sx = 0, sy = 0, fired = false;
  el.addEventListener('touchstart', e => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; fired = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      fired = true; window.__lpAt = Date.now();
      try { navigator.vibrate && navigator.vibrate(12); } catch (_) {}
      onLong({ clientX: sx, clientY: sy });
    }, 450);
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (Math.hypot(t.clientX - sx, t.clientY - sy) > 10) clearTimeout(timer);
  }, { passive: true });
  el.addEventListener('touchend', e => { clearTimeout(timer); if (fired) e.preventDefault(); });
  el.addEventListener('touchcancel', () => clearTimeout(timer));
}

function showCtxMenu(e, msgId, chatId, msg, canEdit, canDelete, canPin) {
  closeCtxMenu(); closeReactionPicker();
  ctxMsgId = msgId; ctxChatId = chatId; ctxMsgData = msg;
  document.getElementById('ctx-edit').style.display   = canEdit   ? 'flex' : 'none';
  document.getElementById('ctx-delete').style.display = canDelete ? 'flex' : 'none';
  document.getElementById('ctx-pin').style.display    = canPin    ? 'flex' : 'none';
  document.getElementById('ctx-pin').innerHTML =
    `<span class="ctx-item-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v5"/><path d="M5 3h14l-2 7 3 4H4l3-4z"/></svg></span>${msg?.pinned ? 'Открепить' : 'Закрепить'}`;
  const imgUrl = ctxGetMsgImageUrl(msg);
  ctxImageUrl = imgUrl;
  document.getElementById('ctx-copy-image').style.display = imgUrl ? 'flex' : 'none';
  document.getElementById('ctx-save-image').style.display = imgUrl ? 'flex' : 'none';
  const menu = document.getElementById('ctx-menu'); menu.classList.add('open');
  let x = e.clientX, y = e.clientY;
  if (x + 200 > window.innerWidth) x = window.innerWidth - 205;
  if (y + 260 > window.innerHeight) y = y - 260;
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
}
function closeCtxMenu() { document.getElementById('ctx-menu').classList.remove('open'); }

// ───── Определяем, есть ли у сообщения картинка (обычное фото, стикер-картинка, кастомное эмодзи) ─────
let ctxImageUrl = null;
function ctxGetMsgImageUrl(msg) {
  if (!msg) return null;
  if (msg.imageUrl) return msg.imageUrl;
  if (Array.isArray(msg.stickers)) {
    const imgSticker = msg.stickers.find(s => s.type === 'image');
    if (imgSticker) return imgSticker.value;
  }
  if (msg.text) {
    const m = /\{\{emoji:([^}]+)\}\}/.exec(msg.text);
    if (m) { try { return decodeURIComponent(m[1]); } catch (e) {} }
  }
  return null;
}

async function ctxCopyImage() {
  closeCtxMenu();
  if (!ctxImageUrl) return;
  try {
    const resp = await fetch(ctxImageUrl);
    const blob = await resp.blob();
    // Clipboard API поддерживает надёжно только image/png — конвертируем через canvas
    const pngBlob = await blobToPng(blob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    toast('🖼️ Изображение скопировано');
  } catch (e) {
    console.error('ctxCopyImage error:', e);
    toast('⚠️ Не удалось скопировать изображение');
  }
}
function blobToPng(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx2d = canvas.getContext('2d');
      ctx2d.drawImage(img, 0, 0);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas toBlob failed')), 'image/png');
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}
async function ctxSaveImage() {
  closeCtxMenu();
  if (!ctxImageUrl) return;
  try {
    const resp = await fetch(ctxImageUrl);
    const blob = await resp.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'chatex_image_' + Date.now() + (ctxImageUrl.match(/\.(png|jpe?g|gif|webp)(\?|$)/i)?.[1] ? '.' + ctxImageUrl.match(/\.(png|jpe?g|gif|webp)(\?|$)/i)[1] : '.png');
    document.body.appendChild(a); a.click(); a.remove();
    toast('💾 Изображение сохранено');
  } catch (e) {
    console.error('ctxSaveImage error:', e);
    toast('⚠️ Не удалось сохранить изображение');
  }
}

// ───── Переслать сообщение (в избранное или в личку другу) ─────
async function ctxForward() {
  closeCtxMenu(); if (!ctxMsgData) return;
  openModal('forward-modal');
  document.getElementById('forward-search').value = '';
  await renderForwardList('');
}
async function renderForwardList(query) {
  const list = document.getElementById('forward-list'); if (!list) return;
  list.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">Загрузка...</div>';
  const q = (query || '').trim().toLowerCase();
  const rows = [];
  if (!q || 'избранное'.includes(q)) {
    rows.push({ chatId: 'favorites', chatType: 'favorites', label: '⭐ Избранное' });
  }
  const uids = Object.keys(friendsMap || {});
  const usersSnap = await Promise.all(uids.map(uid => db.ref('users/' + uid).once('value')));
  usersSnap.forEach((snap, i) => {
    const ud = snap.val(); if (!ud) return;
    const name = ud.username || uids[i];
    if (q && !name.toLowerCase().includes(q)) return;
    const chatId = [currentUser.uid, uids[i]].sort().join('_');
    rows.push({ chatId, chatType: 'dm', label: '👤 ' + name });
  });
  list.innerHTML = rows.map(r =>
    `<div class="ua-row" style="cursor:pointer" onclick='doForward(${JSON.stringify(r.chatId)}, ${JSON.stringify(r.chatType)}, ${JSON.stringify(r.label)})'>
      <div class="uinfo"><div class="uname">${escHtml(r.label)}</div></div>
    </div>`).join('') || '<div style="color:var(--text3);font-size:13px;padding:8px 0">Ничего не найдено</div>';
}
function getMsgsBasePathForForward(chatId, chatType) {
  if (chatId === 'favorites') return 'favorites_messages/' + currentUser.uid;
  if (chatType === 'group')   return 'groups/' + chatId + '/messages';
  if (chatType === 'channel') return 'channels/' + chatId + '/messages';
  return 'dms/' + chatId;
}
async function doForward(chatId, chatType, label) {
  if (!ctxMsgData) return;
  try {
    const msgData = {
      senderUid: currentUser.uid, senderName: currentUserData.username,
      senderAvatar: currentUserData.avatarUrl || '',
      senderIsAdmin: currentUserData.isAdmin === true,
      senderIsSuperAdmin: isSuperAdmin(currentUserData),
      senderVerified: currentUserData.verified === true,
      senderPremium: isPremiumActive(currentUserData.premium, currentUserData.premiumExpiresAt),
      senderBadgePref: currentUserData.badgePref || 'title',
      timestamp: Date.now(),
      forwardedFrom: ctxMsgData.senderName || '',
      text: ctxMsgData.text || ''
    };
    if (ctxMsgData.imageUrl) msgData.imageUrl = ctxMsgData.imageUrl;
    if (ctxMsgData.isSticker && ctxMsgData.stickerEmoji) { msgData.isSticker = true; msgData.stickerEmoji = ctxMsgData.stickerEmoji; }
    if (Array.isArray(ctxMsgData.stickers)) msgData.stickers = ctxMsgData.stickers;
    const base = getMsgsBasePathForForward(chatId, chatType);
    await db.ref(base).push(msgData);
    if (chatType === 'dm') {
      const otherUid = chatId.split('_').find(p => p !== currentUser.uid);
      await db.ref('dm_meta/' + chatId).update({ lastMsg: '📤 Переслано', lastTs: Date.now() });
      if (typeof ensureRecipientHasChat === 'function') ensureRecipientHasChat(chatId, otherUid);
      if (typeof addNotification === 'function') addNotification(otherUid, { type: 'dm', text: `${currentUserData.username} переслал(а) сообщение`, from: currentUserData.username, chatId });
    }
    closeModal('forward-modal');
    toast('📤 Переслано: ' + label);
  } catch (e) {
    console.error('doForward error:', e);
    toast('⚠️ Не удалось переслать сообщение');
  }
}

function showReactionPicker() {
  closeCtxMenu();
  // Открываем после текущего клика: иначе глобальный обработчик click в этом же событии сразу закрывал пикер
  setTimeout(() => openReactionPickerNow(), 0);
}
function openReactionPickerNow() {
  const picker = document.getElementById('reaction-picker'); picker.classList.add('open');
  const msgEl = document.getElementById('msg-' + ctxMsgId);
  if (msgEl) {
    const rect = msgEl.getBoundingClientRect();
    let x = rect.left, y = rect.top - 60;
    if (x + 310 > window.innerWidth) x = window.innerWidth - 315;
    if (y < 0) y = rect.bottom + 8;
    picker.style.left = x + 'px'; picker.style.top = y + 'px';
  }
}
function closeReactionPicker() { document.getElementById('reaction-picker').classList.remove('open'); }

function ctxReply() {
  closeCtxMenu(); if (!ctxMsgData) return;
  replyToMsg = { id: ctxMsgId, text: ctxMsgData.text, senderName: ctxMsgData.senderName };
  document.getElementById('reply-bar').className    = 'reply-bar visible';
  document.getElementById('reply-bar-name').textContent = ctxMsgData.senderName || 'Unknown';
  document.getElementById('reply-bar-text').textContent = stripInlineEmojiTokens(ctxMsgData.text) || '📷 Медиа';
  document.getElementById('msg-input')?.focus();
}
function cancelReply() { replyToMsg = null; document.getElementById('reply-bar').className = 'reply-bar'; }

async function ctxPin() {
  closeCtxMenu(); if (!ctxMsgId) return;
  const pinned = !ctxMsgData.pinned;
  await db.ref(getMsgPath(ctxChatId, ctxMsgId) + '/pinned').set(pinned || null);
  // pinned/{chatId} — это КАРТА нескольких сообщений {msgId: {text, ts}}, а не одна запись,
  // так что закрепить можно сколько угодно сообщений одновременно (как в Telegram).
  if (pinned) await db.ref('pinned/' + ctxChatId + '/' + ctxMsgId).set({ text: stripInlineEmojiTokens(ctxMsgData.text) || '📷', ts: Date.now() });
  else        await db.ref('pinned/' + ctxChatId + '/' + ctxMsgId).remove();
  ctxMsgData.pinned = pinned;
  toast(pinned ? '📌 Закреплено' : 'Откреплено');
}

function ctxEdit() {
  closeCtxMenu(); if (!ctxMsgId || !ctxMsgData) return;
  editingMsgId = ctxMsgId; editingChatId = ctxChatId;
  const inp = document.getElementById('msg-input');
  if (inp) { inp.value = ctxMsgData.text || ''; inp.focus(); autoGrow(inp); }
  document.getElementById('edit-bar').className = 'edit-bar visible';
}
function cancelEdit() {
  // Раньше эта функция всегда чистила #msg-input, даже если редактирования
  // не было — это стирало восстановленный черновик, если cancelEdit()
  // (через clearEditReply()) вызывался ПОСЛЕ buildDMInput/restoreDraft при
  // переключении чата. Теперь чистим инпут, только если реально шло
  // редактирование сообщения.
  const wasEditing = !!editingMsgId;
  editingMsgId = null; editingChatId = null;
  document.getElementById('edit-bar').className = 'edit-bar';
  if (wasEditing) {
    const inp = document.getElementById('msg-input');
    if (inp) { inp.value = ''; inp.style.height = 'auto'; }
  }
}

function ctxCopy() {
  closeCtxMenu(); if (!ctxMsgData) return;
  navigator.clipboard?.writeText(ctxMsgData.text || '').then(() => toast('📋 Скопировано'));
}

async function ctxDelete() {
  closeCtxMenu(); if (!ctxMsgId) return;
  if (!confirm('Удалить сообщение для всех?')) return;
  await db.ref(getMsgPath(ctxChatId, ctxMsgId)).remove();
  await db.ref('pinned/' + ctxChatId + '/' + ctxMsgId).remove();
  toast('🗑️ Удалено');
}

function clearEditReply() { cancelEdit(); cancelReply(); }

// ─── PINNED BAR (поддерживает несколько закреплённых сообщений) ───────
function showPinnedBar(text) {
  document.getElementById('pinned-bar').className = 'pinned-bar visible';
  document.getElementById('pinned-preview').textContent = text || '...';
  const count = pinnedList.length;
  document.getElementById('pinned-count').textContent = count > 1 ? `(${pinnedIndex + 1}/${count})` : '';
  document.getElementById('pinned-next').style.display = count > 1 ? '' : 'none';
  document.getElementById('pinned-list-btn').style.display = count > 1 ? '' : 'none';
}
function hidePinnedBar()   { document.getElementById('pinned-bar').className = 'pinned-bar'; }
function dismissPinned()   { hidePinnedBar(); }
function scrollToPinned()  { if (!pinnedMsgId) return; document.getElementById('msg-' + pinnedMsgId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }

// Клик по стрелке в баре — циклически показываем следующее закреплённое сообщение,
// не открывая отдельное окно (быстрый способ пролистать 2-3 пина).
function nextPinned() {
  if (pinnedList.length < 2) return;
  pinnedIndex = (pinnedIndex + 1) % pinnedList.length;
  const p = pinnedList[pinnedIndex];
  pinnedMsgId = p.msgId;
  showPinnedBar(p.text);
}

// Полный список закреплённых сообщений в текущем чате — открыть, перейти к любому, открепить.
function openPinnedList() {
  let m = document.getElementById('pinned-list-modal');
  if (m) m.remove();
  m = document.createElement('div');
  m.id = 'pinned-list-modal';
  m.className = 'modal-overlay';
  m.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:100000';
  const itemsHtml = pinnedList.map(p => `
      <div class="pinned-list-item" onclick="scrollToMsg('${p.msgId}');document.getElementById('pinned-list-modal').remove()">
        <span class="pinned-icon">📌</span>
        <div class="pl-text">${escHtml(p.text)}</div>
        <span class="pl-unpin" title="Открепить" onclick="event.stopPropagation();unpinFromList('${p.msgId}')">×</span>
      </div>`).join('');
  m.innerHTML = `<div class="modal pinned-list-modal">
      <h3>📌 Закреплённые сообщения</h3>
      <div style="max-height:50vh;overflow-y:auto;margin:10px 0">${itemsHtml || '<div class="sp-locked">Пусто</div>'}</div>
      <div class="modal-actions" style="justify-content:center"><button class="btn-cancel" onclick="document.getElementById('pinned-list-modal').remove()">Закрыть</button></div>
    </div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
}
async function unpinFromList(msgId) {
  if (!currentChatId) return;
  await db.ref('pinned/' + currentChatId + '/' + msgId).remove();
  await db.ref(getMsgPath(currentChatId, msgId) + '/pinned').remove();
  toast('Откреплено');
  const stillOpen = document.getElementById('pinned-list-modal');
  if (stillOpen && pinnedList.length > 1) openPinnedList(); // перерисовать список после снятия pin
}
function scrollToMsg(id) {
  const el = document.getElementById('msg-' + id);
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.background = 'rgba(61,139,255,.15)'; setTimeout(() => el.style.background = '', 1200); }
}

