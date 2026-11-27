// ─── SAFE MESSAGE LISTENERS (prevent cross-chat leaks) ───────
let ticketDetailListenerRef = null; // {ref, cb} — детальный listener открытого тикета (статус/шапка)
function detachTicketDetailListener() {
  if (ticketDetailListenerRef) {
    try { ticketDetailListenerRef.ref.off('value', ticketDetailListenerRef.cb); } catch (e) {}
    ticketDetailListenerRef = null;
  }
}

function clearAllMsgListeners() {
  Object.keys(msgListeners).forEach(id => {
    const info = msgListeners[id];
    if (info && info.path) {
      try { db.ref(info.path).off(); } catch (e) {}
    } else if (typeof info === 'string') {
      try { db.ref(info).off(); } catch (e) {}
    }
  });
  msgListeners = {};
  activeMsgPath = null;
  detachTicketDetailListener(); // выходим из тикета — снимаем его listener шапки/статуса, иначе он продолжит
                                 // тихо перезаписывать header-actions/input-area даже когда открыт другой чат
  // also detach any leftover pinned listeners by chat
  try { db.ref('pinned').off(); } catch (e) {}
}

function attachChatMessages(path, chatId, onAdded) {
  clearAllMsgListeners();
  activeMsgPath = path;
  const onErr = e => {
    if (chatId !== currentChatId) return;
    console.error('attachChatMessages error [' + path + ']:', e);
    toast('⚠️ Нет доступа к чату: ' + (e.message || e.code || 'ошибка прав Firebase'));
  };
  const ref = db.ref(path).orderByChild('timestamp');
  const added = ref.on('child_added', snap => {
    if (chatId !== currentChatId) return;
    onAdded(snap);
  }, onErr);
  const changed = db.ref(path).on('child_changed', snap => {
    if (chatId !== currentChatId) return;
    const ex = document.getElementById('msg-' + snap.key);
    if (ex) rebuildMessage(ex, snap.val(), snap.key, chatId);
  }, onErr);
  const removed = db.ref(path).on('child_removed', snap => {
    if (chatId !== currentChatId) return;
    document.getElementById('msg-' + snap.key)?.remove();
  }, onErr);
  msgListeners[chatId] = { path, added, changed, removed };
}

let cloudinaryName = '', cloudinaryPreset = '';
let typingTimer = null, typingListener = null;
let activeAudio = null, activeAudioId = null;
let searchTimer = null, adminSearchTimer = null;
let createType = 'dm';

