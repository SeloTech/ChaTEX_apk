// ============================================================
//  TYPING INDICATORS
// ============================================================
function getTypingPath(chatId) {
  if (chatId === 'official' || chatId === 'support') return null;
  if (currentChatType === 'dm')      return `typing_dm/${chatId}`;
  if (currentChatType === 'channel') return `typing_channel/${chatId}`;
  if (currentChatType === 'group')   return `typing_group/${chatId}`;
  return null;
}

function startTyping() {
  const path = getTypingPath(currentChatId); if (!path) return;
  db.ref(path + '/' + currentUser.uid).set({ name: currentUserData.username, ts: Date.now() });
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => stopTyping(), 4000);
}

function stopTyping() {
  clearTimeout(typingTimer); typingTimer = null;
  if (!currentChatId || currentChatId === 'official' || currentChatId === 'support') return;
  const path = getTypingPath(currentChatId); if (!path) return;
  db.ref(path + '/' + currentUser.uid).remove();
}

function listenTyping(chatId) {
  if (typingListener) { typingListener(); typingListener = null; }
  const path = getTypingPath(chatId); if (!path) return;
  typingListener = db.ref(path).on('value', snap => {
    if (chatId !== currentChatId) return;
    const typingUsers = []; const now = Date.now();
    snap.forEach(child => {
      const d = child.val();
      if (child.key !== currentUser.uid && d && (now - d.ts) < 6000) typingUsers.push(d.name);
    });
    const sub = document.getElementById('chat-header-sub'); if (!sub) return;
    if (typingUsers.length > 0) {
      sub.innerHTML = `<span class="typing-indicator">✍️ ${escHtml(typingUsers.join(', '))} печатает</span>
        <span class="typing-dots"><span></span><span></span><span></span></span>`;
    } else {
      restoreHeaderSub();
    }
  });
}

function restoreHeaderSub() {
  const sub = document.getElementById('chat-header-sub'); if (!sub) return;
  if (currentChatType === 'dm') {
    if (dmChatList[currentChatId]) {
      const ud = dmChatList[currentChatId].userData;
      const st = presenceStatusText(ud);
      const dotStyle = st.online ? '' : ' style="background:var(--text3);box-shadow:none"';
      sub.innerHTML = `<span class="online-dot"${dotStyle}></span> ${escHtml(st.text)}`;
    }
  } else if (currentChatType === 'channel' && currentChatData) {
    sub.innerHTML = `<span class="channel-members">${currentChatData.memberCount || 1} подписчик(ов)</span>`;
  } else if (currentChatType === 'group' && currentChatData) {
    sub.innerHTML = `<span class="channel-members">${currentChatData.memberCount || 1} участник(ов)</span>`;
  }
}

