// ============================================================
//  OFFICIAL & SUPPORT CHANNELS
// ============================================================
function openOfficial() {
  resetChatHeaderPersonHandlers();
  currentChatId = 'official'; currentChatType = 'official'; currentChatData = null;
  setActiveChat('official-chat-item');
  document.getElementById('chat-header-avatar').innerHTML  = '📢';
  document.getElementById('chat-header-avatar').className  = 'avatar official';
  document.getElementById('chat-header-name').innerHTML =
    `ChaTEX Official <span class="badge-official"><svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>`;
  document.getElementById('chat-header-sub').textContent = 'Официальный канал — только чтение';
  document.getElementById('header-actions').innerHTML = '';
  const ia = document.getElementById('input-area');
  if (currentUserData.isAdmin) {
    ia.className = 'input-area';
    ia.innerHTML = `<button class="official-compose-btn" onclick="openModal('official-modal')">
      <span class="badge-official" style="width:18px;height:18px"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>
      Написать официальное сообщение</button>`;
  } else {
    ia.className = 'input-area readonly';
    ia.innerHTML = `<div class="readonly-notice">🔒 Только для чтения</div>`;
  }
  stopTyping(); clearEditReply(); loadMessages('official_messages', 'official'); showChat();
}

function openSupport() {
  resetChatHeaderPersonHandlers();
  currentChatId = 'support'; currentChatType = 'support'; currentChatData = null;
  setActiveChat('support-chat-item');
  document.getElementById('chat-header-avatar').innerHTML = '🛡️';
  document.getElementById('chat-header-avatar').className = 'avatar support';
  document.getElementById('chat-header-name').innerHTML =
    `ChaTEX! Support <span class="badge-official" style="background:var(--red)"><svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>`;
  document.getElementById('chat-header-sub').textContent = 'Поддержка и жалобы';
  document.getElementById('header-actions').innerHTML = !isAdmin(currentUserData)
    ? `<button class="h-btn official-compose-btn" onclick="openCreateTicketModal()">📝 Создать жалобу</button>` : '';
  const ia = document.getElementById('input-area');
  if (isAdmin(currentUserData)) {
    ia.className = 'input-area';
    ia.innerHTML = `<div class="input-wrap"><textarea id="msg-input" placeholder="Ответить в Support..." rows="1"
      oninput="autoGrow(this);if(!editingMsgId)saveDraft('support-admin',this.value)" onkeydown="handleKey(event,'support-admin')"></textarea></div>
      <button class="send-btn" onclick="sendSupportReply()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg></button>`;
    restoreDraft('support-admin');
  } else {
    ia.className = 'input-area readonly';
    ia.innerHTML = `<div class="readonly-notice">📬 Используйте кнопку жалобы ↑</div>`;
  }
  stopTyping(); clearEditReply(); loadSupportMessages(); showChat();
}

function openFavorites() {
  resetChatHeaderPersonHandlers();
  currentChatId = 'favorites'; currentChatType = 'favorites'; currentChatData = null;
  setActiveChat('favorites-chat-item');
  document.getElementById('chat-header-avatar').className  = 'avatar favorites';
  document.getElementById('chat-header-avatar').innerHTML  = '⭐';
  document.getElementById('chat-header-name').textContent  = 'Избранное';
  document.getElementById('chat-header-sub').textContent   = 'Только вы видите эти сообщения';
  document.getElementById('header-actions').innerHTML = '';
  buildFavoritesInput('favorites'); clearEditReply();
  loadMessages('favorites_messages/' + currentUser.uid, 'favorites'); showChat();
}

function buildFavoritesInput(chatId) {
  const ia = document.getElementById('input-area'); ia.className = 'input-area';
  ia.innerHTML = `<label class="attach-btn" style="cursor:pointer">📎<input type="file" accept="image/*" style="display:none" onchange="sendImage(this,'${chatId}')"></label>
    <div class="input-wrap"><textarea id="msg-input" placeholder="Сохранить сообщение..." rows="1"
      oninput="autoGrow(this);if(!editingMsgId)saveDraft('${chatId}',this.value)" onkeydown="handleKey(event,'${chatId}')"></textarea></div>
    <button class="send-btn" onclick="sendMsg('${chatId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg></button>`;
  restoreDraft(chatId);
}

function loadSupportMessages() {
  const area = document.getElementById('messages-area'); area.innerHTML = ''; hidePinnedBar();
  const path = 'support_messages';
  let lastDate = null;
  const myNickLower = (currentUserData.username || '').toLowerCase();
  attachChatMessages(path, 'support', snap => {
    const msg = snap.val(); if (!msg) return;
    if (msg.forNick && msg.forNick.toLowerCase() !== myNickLower && !currentUserData.isAdmin) return;
    const dateStr = formatDate(msg.timestamp);
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      const d = document.createElement('div'); d.className = 'date-divider';
      d.innerHTML = `<span>${dateStr}</span>`; area.appendChild(d);
    }
    const el = buildSupportMsg(msg, snap.key); if (el) area.appendChild(el);
    area.scrollTop = area.scrollHeight;
  });
}

function buildSupportMsg(msg, key) {
  const div = document.createElement('div'); div.className = 'msg'; div.id = 'msg-' + key;
  const isAdminSender = msg.senderUid === currentUser.uid && currentUserData.isAdmin;
  if (isAdminSender) div.className += ' own';
  let nickHtml = `<span style="color:var(--red)">🛡️ ChaTEX! Support</span>`;
  if (isAdminSender) nickHtml = `<span style="color:var(--accent)">${escHtml(currentUserData.username)}</span> <span class="admin-tag">ADMIN</span>`;
  const bubbleClass = isAdminSender ? 'own' : 'support-msg';
  div.innerHTML = `
    <div class="msg-meta"><span class="nick official-name">${nickHtml}</span><span class="ts">${formatTime(msg.timestamp)}</span></div>
    <div class="msg-bubble-wrap">
      <div class="msg-bubble ${bubbleClass}">${renderInlineEmojiHtml(escHtml(msg.text))}</div>
      <div class="msg-reactions"></div>
    </div>`;
  if (currentUserData.isAdmin) {
    div.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, key, 'support', msg, false, true, false); });
    txLongPress(div, pos => showCtxMenu(pos, key, 'support', msg, false, true, false));
  }
  return div;
}

async function sendSupportReply() {
  const inp = document.getElementById('msg-input');
  const text = inp?.value.trim(); if (!text) return;
  inp.value = ''; inp.style.height = 'auto'; saveDraft('support-admin', '');
  await db.ref('support_messages').push({ text, timestamp: Date.now(), senderName: currentUserData.username, senderUid: currentUser.uid, senderIsAdmin: true });
}

async function sendOfficialMsg() {
  if (!currentUserData.isAdmin) return;
  const text = document.getElementById('official-text').value.trim(); if (!text) return;
  await db.ref('official_messages').push({ text, timestamp: Date.now(), senderName: 'ChaTEX Official', senderUid: currentUser.uid, senderIsAdmin: true });
  document.getElementById('official-text').value = ''; closeModal('official-modal'); toast('✅ Отправлено');
}

