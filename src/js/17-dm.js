// ============================================================
//  DM
// ============================================================
// Сбрасывает клики/лонгпресс на шапке чата, оставшиеся от ранее
// открытого ЛС (иначе клик по аватарке группы/канала/офиц. чата
// продолжает открывать профиль последнего собеседника).
function resetChatHeaderPersonHandlers() {
  const ha  = document.getElementById('chat-header-avatar');
  const hdr = document.getElementById('chat-header-name');
  [ha, hdr].forEach(el => {
    if (!el) return;
    el.onclick = null;
    el.oncontextmenu = null;
    el.style.cursor = '';
    if (el._plpHandlers) {
      el.removeEventListener('touchstart', el._plpHandlers.start);
      el.removeEventListener('touchmove',  el._plpHandlers.move);
      el.removeEventListener('touchend',   el._plpHandlers.end);
      el._plpHandlers = null;
    }
  });
  stopDMStatusListener();
  if (typeof stopGroupCallStatusListener === 'function') stopGroupCallStatusListener();
}

// ─── ЖИВОЙ СТАТУС СОБЕСЕДНИКА В ШАПКЕ ЛС ─────────────────────
let dmStatusRef = null, dmStatusCb = null, dmStatusUid = null;
function stopDMStatusListener() {
  if (dmStatusRef && dmStatusCb) { try { dmStatusRef.off('value', dmStatusCb); } catch (e) {} }
  dmStatusRef = dmStatusCb = dmStatusUid = null;
}
function listenDMStatus(chatId, uid) {
  stopDMStatusListener();
  dmStatusUid = uid;
  dmStatusRef = db.ref('users/' + uid);
  dmStatusCb = snap => {
    const ud = snap.val(); if (!ud) return;
    if (chatId !== currentChatId || uid !== dmStatusUid) return; // чат уже сменился
    if (dmChatList[chatId]) dmChatList[chatId].userData = { ...dmChatList[chatId].userData, ...ud };
    restoreHeaderSub();
  };
  dmStatusRef.on('value', dmStatusCb);
}

function openDM(uid, userData) {
  resetChatHeaderPersonHandlers();
  const chatId = [currentUser.uid, uid].sort().join('_');
  currentChatId = chatId; currentChatType = 'dm'; currentChatData = null;
  setActiveChat('dm-' + chatId);
  const ha = document.getElementById('chat-header-avatar'); ha.className = 'avatar';
  if (userData.avatarUrl) ha.innerHTML = `<img src="${userData.avatarUrl}" alt="">`;
  else ha.textContent = avatarFallback(userData.username);
  ha.style.cursor = 'pointer';
  ha.onclick = () => openViewProfile({ uid, userData, chatId });
  let nameHtml = escHtml(userData.username) + roleBadgesHtml(userData);
  if (userData.blocked) nameHtml += ` <span class="blocked-badge">BLOCKED</span>`;
  document.getElementById('chat-header-name').innerHTML = nameHtml;
  const hdr = document.getElementById('chat-header-name');
  hdr.style.cursor = 'pointer';
  hdr.oncontextmenu = e => {
    e.preventDefault();
    showPersonCtx(e, { uid, username: userData.username, chatId, type: 'dm', userData });
  };
  hdr.onclick = () => openViewProfile({ uid, userData, chatId });
  bindPersonLongPress(hdr, () => ({ uid, username: userData.username, chatId, type: 'dm', userData }));
  document.getElementById('header-actions').innerHTML   = `<button class="h-btn" onclick="startDMCall('${uid}')" title="Позвонить">📞</button><button class="h-btn" onclick="openComplaintModal('${uid}','dm')" title="Жалоба">⚠️</button>`;
  clearEditReply(); buildDMInput(chatId);
  if (!document.getElementById('dm-' + chatId)) addDMToSidebar(chatId, userData);
  dmChatList[chatId] = { uid, userData };
  restoreHeaderSub();
  listenDMStatus(chatId, uid);
  // Пишем на сервер сразу и явно показываем ошибку, если не сохранилось —
  // иначе чат пропадает после перезагрузки страницы.
  saveDMMeta(chatId, uid).catch(e => {
    console.warn('saveDMMeta error:', e);
    toast('⚠️ Не удалось сохранить чат: ' + (e.message || e));
  });
  loadDMMessages(chatId); listenTyping(chatId); showChat();
}

// ─── INPUT BUILDERS ─────────────────────────────────────────
function buildDMInput(chatId) {
  clearPendingStickers();
  const ia = document.getElementById('input-area'); ia.className = 'input-area';
  ia.innerHTML = `${pendingStickersHtml()}<label class="attach-btn" style="cursor:pointer" title="Фото или файл (до 25 МБ)">📎<input type="file" style="display:none" onchange="sendAttachment(this,'${chatId}')"></label>
    <button class="voice-record-btn" id="voice-record-btn" onclick="startVoiceRecord()">🎙️</button>
    <div class="input-wrap"><textarea id="msg-input" placeholder="Сообщение..." rows="1"
      oninput="autoGrow(this);startTyping();handleMentionInput(this);if(!editingMsgId)saveDraft('${chatId}',this.value)" onkeydown="handleKey(event,'${chatId}')"></textarea></div>
    ${stickerButtonHtml()}${stickerPickerHtml()}
    <button class="send-btn" onclick="sendMsg('${chatId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg></button>`;
  restoreDraft(chatId);
}

function buildChannelInput(chatId, canWrite) {
  clearPendingStickers();
  const ia = document.getElementById('input-area');
  if (!canWrite) { ia.className = 'input-area readonly'; ia.innerHTML = `<div class="readonly-notice">📡 Только читатели — написать нельзя</div>`; return; }
  ia.className = 'input-area';
  ia.innerHTML = `${pendingStickersHtml()}<label class="attach-btn" style="cursor:pointer" title="Фото или файл (до 25 МБ)">📎<input type="file" style="display:none" onchange="sendAttachment(this,'${chatId}')"></label>
    <div class="input-wrap"><textarea id="msg-input" placeholder="Сообщение в канал..." rows="1"
      oninput="autoGrow(this);startTyping();handleMentionInput(this);if(!editingMsgId)saveDraft('${chatId}',this.value)" onkeydown="handleKey(event,'${chatId}')"></textarea></div>
    ${stickerButtonHtml()}${stickerPickerHtml()}
    <button class="send-btn" onclick="sendMsg('${chatId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg></button>`;
  restoreDraft(chatId);
}

function buildGroupInput(chatId, canWrite = true) {
  clearPendingStickers();
  const ia = document.getElementById('input-area');
  if (!canWrite) { ia.className = 'input-area readonly'; ia.innerHTML = `<div class="readonly-notice">🔒 У вас нет прав писать в этой группе</div>`; return; }
  ia.className = 'input-area';
  ia.innerHTML = `${pendingStickersHtml()}<label class="attach-btn" style="cursor:pointer" title="Фото или файл (до 25 МБ)">📎<input type="file" style="display:none" onchange="sendAttachment(this,'${chatId}')"></label>
    <button class="voice-record-btn" id="voice-record-btn" onclick="startVoiceRecord()">🎙️</button>
    <div class="input-wrap"><textarea id="msg-input" placeholder="Сообщение..." rows="1"
      oninput="autoGrow(this);startTyping();handleMentionInput(this);if(!editingMsgId)saveDraft('${chatId}',this.value)" onkeydown="handleKey(event,'${chatId}')"></textarea></div>
    ${stickerButtonHtml()}${stickerPickerHtml()}
    <button class="send-btn" onclick="sendMsg('${chatId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg></button>`;
  restoreDraft(chatId);
}

function autoGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 100) + 'px'; }
function handleKey(e, chatId) {
  // Если открыт пикер упоминаний — сначала отдаём управление ему
  // (стрелки/Enter/Tab выбирают @упоминание, а не отправляют сообщение)
  if (typeof handleMentionKeydown === 'function' && handleMentionKeydown(e)) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (chatId === 'support-admin') sendSupportReply(); else sendMsg(chatId);
  }
}

