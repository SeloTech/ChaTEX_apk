// ============================================================
//  REACTIONS
// ============================================================
function renderReactionsInner(reactions, msgId, chatId) {
  if (!reactions || typeof reactions !== 'object') return '';
  return Object.entries(reactions).map(([hexKey, data]) => {
    if (!data || typeof data !== 'object') return '';
    const emoji = data.emoji || ''; if (!emoji) return '';
    const users = Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'emoji' && k !== 'uid_mark'));
    const count = Object.values(users).filter(Boolean).length; if (!count) return '';
    const mine = users[currentUser.uid] ? 'own-reaction' : '';
    return `<span class="reaction-pill ${mine}" data-react="${escHtml(emoji)}" data-msg="${escHtml(msgId)}" data-chat="${escHtml(chatId)}">
      ${escHtml(emoji)}<span class="reaction-count">${count}</span></span>`;
  }).filter(Boolean).join('');
}

async function addReaction(emoji) {
  closeReactionPicker();
  if (!ctxMsgId || !ctxChatId) return;
  await toggleReaction(emoji, ctxMsgId, ctxChatId);
}

async function toggleReaction(emoji, msgId, chatId) {
  if ((currentChatType === 'group' || currentChatType === 'channel') && !currentUserCanReact()) {
    toast('🔒 У вас нет прав ставить реакции здесь'); return;
  }
  const safeKey = emoji.codePointAt(0).toString(16);
  const path = getMsgPath(chatId, msgId) + `/reactions/${safeKey}`;
  try {
    const snap = await db.ref(path).once('value');
    const data = snap.val() || {};
    if (data[currentUser.uid]) {
      await db.ref(path + '/' + currentUser.uid).remove();
    } else {
      await db.ref(path).update({ emoji, uid_mark: true, [currentUser.uid]: true });
    }
  } catch (e) { toast('Ошибка реакции: ' + e.message); }
}


// Клик по плашке реакции (делегирование: данные в data-атрибутах, а не в onclick с кавычками)
document.addEventListener('click', e => {
  const pill = e.target.closest && e.target.closest('[data-react]');
  if (pill) toggleReaction(pill.dataset.react, pill.dataset.msg, pill.dataset.chat);
});
