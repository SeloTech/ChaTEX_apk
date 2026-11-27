// ============================================================
//  MESSAGE LOADING
// ============================================================
function loadMessages(path, chatId) {
  const area = document.getElementById('messages-area'); area.innerHTML = ''; hidePinnedBar();
  let lastDate = null;
  attachChatMessages(path, chatId, snap => {
    const msg = snap.val(); if (!msg) return; msg._id = snap.key;
    const dateStr = formatDate(msg.timestamp);
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      const d = document.createElement('div'); d.className = 'date-divider';
      d.innerHTML = `<span>${dateStr}</span>`; area.appendChild(d);
    }
    const el = buildMessage(msg, snap.key, chatId); if (el) area.appendChild(el);
    area.scrollTop = area.scrollHeight;
  });
  loadPinnedForChat(chatId);
}

// Собеседник реально открыл этот ЛС и видит сообщение — помечаем как
// прочитанное в БД. Пишем ТОЛЬКО в чужие сообщения (не в свои) и только
// если ещё не read=true, чтобы не спамить лишними записями. У отправителя,
// если его чат сейчас открыт, сработает child_changed → rebuildMessage,
// и галочки перекрасятся в реальном времени; если чат не открыт — новый
// статус подтянется, когда он в него зайдёт (loadDMMessages вызывается заново).
function markDMMessagesRead(chatId, msg, msgKey) {
  if (!msg || msg.senderUid === currentUser.uid || msg.read) return;
  db.ref('dms/' + chatId + '/' + msgKey + '/read').set(true).catch(() => {});
}

function loadDMMessages(chatId) {
  const area = document.getElementById('messages-area'); area.innerHTML = ''; hidePinnedBar();
  let lastDate = null;
  attachChatMessages('dms/' + chatId, chatId, snap => {
    const msg = snap.val(); if (!msg) return; msg._id = snap.key;
    const dateStr = formatDate(msg.timestamp);
    if (dateStr !== lastDate) { lastDate = dateStr; const d = document.createElement('div'); d.className = 'date-divider'; d.innerHTML = `<span>${dateStr}</span>`; area.appendChild(d); }
    const el = buildMessage(msg, snap.key, chatId); if (el) area.appendChild(el);
    area.scrollTop = area.scrollHeight;
    markDMMessagesRead(chatId, msg, snap.key);
  });
  loadPinnedForChat(chatId);
}

function loadChannelMessages(chatId) {
  const area = document.getElementById('messages-area'); area.innerHTML = ''; hidePinnedBar();
  const path = 'channels/' + chatId + '/messages';
  let lastDate = null;
  attachChatMessages(path, chatId, snap => {
    const msg = snap.val(); if (!msg) return; msg._id = snap.key;
    const dateStr = formatDate(msg.timestamp);
    if (dateStr !== lastDate) { lastDate = dateStr; const d = document.createElement('div'); d.className = 'date-divider'; d.innerHTML = `<span>${dateStr}</span>`; area.appendChild(d); }
    const el = buildMessage(msg, snap.key, chatId); if (el) area.appendChild(el);
    area.scrollTop = area.scrollHeight;
  });
  loadPinnedForChat(chatId);
}

function loadGroupMessages(chatId) {
  const area = document.getElementById('messages-area'); area.innerHTML = ''; hidePinnedBar();
  const path = 'groups/' + chatId + '/messages';
  let lastDate = null;
  attachChatMessages(path, chatId, snap => {
    const msg = snap.val(); if (!msg) return; msg._id = snap.key;
    const dateStr = formatDate(msg.timestamp);
    if (dateStr !== lastDate) { lastDate = dateStr; const d = document.createElement('div'); d.className = 'date-divider'; d.innerHTML = `<span>${dateStr}</span>`; area.appendChild(d); }
    const el = buildMessage(msg, snap.key, chatId); if (el) area.appendChild(el);
    area.scrollTop = area.scrollHeight;
  });
  loadPinnedForChat(chatId);
}

// Закреплённых сообщений в чате может быть несколько: pinned/{chatId}/{msgId} = {text, ts}.
// Бар вверху всегда показывает самое новое закреплённое; счётчик "1/3" позволяет
// пролистать остальные, не открывая отдельный список.
function loadPinnedForChat(chatId) {
  db.ref('pinned/' + chatId).on('value', snap => {
    if (chatId !== currentChatId) return;
    const data = snap.val() || {};
    pinnedList = Object.entries(data)
      .map(([msgId, v]) => ({ msgId, text: v.text || '', ts: v.ts || 0 }))
      .sort((a, b) => b.ts - a.ts);
    if (!pinnedList.length) { pinnedMsgId = null; hidePinnedBar(); return; }
    pinnedIndex = 0;
    pinnedMsgId = pinnedList[0].msgId;
    showPinnedBar(pinnedList[0].text);
  });
}

