// ============================================================
//  BUILD MESSAGE
// ============================================================
function buildMessage(msg, key, chatId) {
  if (msg.isSystem) {
    const d = document.createElement('div'); d.id = 'msg-' + key;
    d.className = 'sys-plate'; d.textContent = msg.text || '';
    return d;
  }
  const isOwn         = msg.senderUid === currentUser.uid;
  const isOfficialChat = chatId === 'official';
  const div = document.createElement('div');
  div.className = 'msg' + (isOwn && !isOfficialChat ? ' own' : '');
  div.id = 'msg-' + key;

  let bubbleClass = 'other';
  if (isOwn && !isOfficialChat) bubbleClass = 'own';
  if (isOfficialChat)            bubbleClass = 'official';

  let nickHtml = escHtml(msg.senderName || 'Unknown');
  const hasAdminTitle = (msg.senderIsSuperAdmin === true || isSuperAdmin({ username: msg.senderName })) || msg.senderIsAdmin === true;
  const showPremiumInstead = msg.senderPremium === true && hasAdminTitle && msg.senderBadgePref === 'premium';
  if (hasAdminTitle && !showPremiumInstead) {
    if (msg.senderIsSuperAdmin === true || isSuperAdmin({ username: msg.senderName }))
      nickHtml += ` <span class="super-admin-tag">SUPER ADMIN</span>`;
    else nickHtml += ` <span class="admin-tag">ADMIN</span>`;
  }
  if (msg.senderChannelAdmin === true)  nickHtml += ` <span class="channel-admin-tag">ADMIN КАНАЛА</span>`;
  if (msg.senderPremium === true && (!hasAdminTitle || showPremiumInstead)) nickHtml += ` <span class="badge-premium" title="Premium">✦</span>`;
  if (msg.senderVerified === true)      nickHtml += ` <span class="badge-verify">✓</span>`;
  if (!isOfficialChat && window.TXBadges && msg.senderUid) nickHtml += ' ' + TXBadges.slot(msg.senderUid);
  if (isOfficialChat) nickHtml =
    `<span class="badge-official" style="width:14px;height:14px"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>ChaTEX Official`;

  const nickClickable = (currentChatType === 'channel' || currentChatType === 'group') && !isOfficialChat && msg.senderUid;

  let content = '';
  if (msg.replyTo)
    content += `<div class="reply-quote" onclick="scrollToMsg('${msg.replyTo.id}')">
      <div class="rq-name">${escHtml(msg.replyTo.senderName)}</div>
      <div class="rq-text">${escHtml(stripInlineEmojiTokens(msg.replyTo.text) || '📷 Медиа')}</div></div>`;

  if (msg.imageUrl) {
    const age = Date.now() - (msg.timestamp || 0);
    content += age > MEDIA_TTL_MS
      ? `<div style="color:var(--text3);font-size:12px;font-family:var(--mono);padding:4px 0">📵 Медиафайл устарел (7 дней)</div>`
      : `<img src="${msg.imageUrl}" class="msg-img" onclick="window.open('${msg.imageUrl}','_blank')" alt="" loading="lazy">`;
  }
  if (msg.isSticker && msg.stickerEmoji) {
    bubbleClass += ' msg-sticker';
    content += `<div class="msg-sticker-clickable" onclick="openStickerPreview('emoji','${escAttr(msg.stickerEmoji)}')">${escHtml(msg.stickerEmoji)}</div>`;
  }
  if (Array.isArray(msg.stickers) && msg.stickers.length) {
    if (!msg.text) bubbleClass += ' msg-sticker';
    content += `<div style="display:flex;flex-wrap:wrap;gap:6px">` + msg.stickers.map(s =>
      s.type === 'image'
        ? `<img src="${s.value}" class="msg-sticker-img msg-sticker-clickable" alt="" loading="lazy" onclick="openStickerPreview('image','${escAttr(s.value)}')">`
        : `<div class="msg-sticker-clickable" style="font-size:90px;line-height:1" onclick="openStickerPreview('emoji','${escAttr(s.value)}')">${escHtml(s.value)}</div>`
    ).join('') + `</div>`;
  }
  if (msg.voiceUrl) {
    const age = Date.now() - (msg.timestamp || 0);
    content += age > MEDIA_TTL_MS
      ? `<div style="color:var(--text3);font-size:12px;font-family:var(--mono)">🎵 Голосовое устарело</div>`
      : buildVoicePlayer(msg.voiceUrl, msg.voiceDuration || 0, key);
  }
  if (msg.fileUrl) content += buildFileHtml(msg);
  if (msg.text) content += (content ? '<div style="margin-top:4px">' : '') + renderMentionsHtml(renderInlineEmojiHtml(escHtml(msg.text)), msg.mentions) + (content ? '</div>' : '');
  // ─── Статус "отправлено/прочитано" ─────────────────────────
  // Раньше здесь всегда рисовалось "✓✓" на любом своём сообщении — это
  // означало, что мессенджер ВСЕГДА показывал "прочитано", даже если
  // собеседник сообщение не открывал. Теперь для ЛС используется реальный
  // флаг msg.read (его выставляет получатель себе в БД, когда открывает
  // этот чат и видит сообщение — см. markDMMessagesRead в 10-message-loading.js).
  // Одна галочка ✓ — отправлено. Две синие галочки ✓✓ — собеседник прочитал.
  // Для групп/каналов честного статуса "прочитано всеми" нет, поэтому там
  // показываем только "отправлено", чтобы не врать.
  if (isOwn && !isOfficialChat && userSettings.readReceipts !== false) {
    if (currentChatType === 'dm') {
      content += `<div class="msg-status${msg.read ? ' read' : ''}">${msg.read ? '✓✓' : '✓'}</div>`;
    } else {
      content += `<div class="msg-status">✓</div>`;
    }
  }

  if (typeof maybeShowCallMsgToast === 'function') maybeShowCallMsgToast(msg, chatId);

  const isChannelAdmin  = currentChatType === 'channel' && currentChatData?.admins?.[currentUser.uid];
  const isChannelOwner  = currentChatType === 'channel' && currentChatData?.ownerUid === currentUser.uid;
  const isGroupOwner    = currentChatType === 'group'   && currentChatData?.ownerUid === currentUser.uid;
  const canEdit   = isOwn && chatId !== 'official' && chatId !== 'support';
  const canDelete = isOwn || currentUserData.isAdmin || (currentChatType === 'channel' && (isChannelAdmin || isChannelOwner)) || (currentChatType === 'group' && isGroupOwner);
  const canPin    = (chatId === 'official' && currentUserData.isAdmin) ||
                    (currentChatType === 'channel' && (isChannelOwner || isChannelAdmin || currentUserData.isAdmin)) ||
                    (currentChatType === 'group'   && (isGroupOwner   || currentUserData.isAdmin)) ||
                    (currentChatType === 'dm'      && (isOwn           || currentUserData.isAdmin));

  div.innerHTML = `
    ${msg.pinned ? `<div class="pin-indicator visible">📌 Закреплено</div>` : '<div class="pin-indicator"></div>'}
    <div class="msg-meta">
      <span class="nick ${isOfficialChat ? 'official-name' : ''}"${nickClickable ? ` style="cursor:pointer" onclick="viewMsgSenderProfile('${msg.senderUid}')"` : ''}>${nickHtml}</span>
      <span class="ts">${formatTime(msg.timestamp)}</span>
      ${msg.edited ? `<span class="msg-edited">(ред.)</span>` : ''}
    </div>
    <div class="msg-bubble-wrap">
      <div class="msg-bubble ${bubbleClass}">${content}</div>
      <div class="msg-reactions">${renderReactionsInner(msg.reactions, key, chatId)}</div>
    </div>`;

  div.addEventListener('contextmenu', e => { e.preventDefault(); showCtxMenu(e, key, chatId, msg, canEdit, canDelete, canPin); });
  txLongPress(div, pos => showCtxMenu(pos, key, chatId, msg, canEdit, canDelete, canPin));
  return div;
}

function rebuildMessage(el, msg, key, chatId) {
  const newEl = buildMessage(msg, key, chatId);
  el.replaceWith(newEl);
}

// ─── VOICE PLAYER ────────────────────────────────────────────
function buildVoicePlayer(url, dur, id) {
  const bars = Array.from({ length: 30 }, (_, i) =>
    `<div class="voice-bar" id="vbar-${id}-${i}" style="height:${6 + Math.floor(Math.random() * 18)}px"></div>`
  ).join('');
  return `<div class="voice-msg">
    <button class="voice-play-btn" onclick="playVoice('${url}','${id}',${dur},this)" id="vplay-${id}">▶</button>
    <div class="voice-waveform" onclick="playVoice('${url}','${id}',${dur},document.getElementById('vplay-${id}'))">${bars}</div>
    <span class="voice-duration" id="vdur-${id}">${formatVoiceDur(dur)}</span></div>`;
}

function playVoice(url, id, dur, btn) {
  if (activeAudio && activeAudioId === id) {
    activeAudio.paused ? activeAudio.play() : activeAudio.pause();
    btn.textContent = activeAudio.paused ? '▶' : '⏸'; return;
  }
  if (activeAudio) { activeAudio.pause(); activeAudio = null; }
  const audio = new Audio(url); activeAudio = audio; activeAudioId = id; btn.textContent = '⏸'; audio.play();
  audio.ontimeupdate = () => {
    const pct = audio.currentTime / (dur || audio.duration || 1);
    document.querySelectorAll(`[id^="vbar-${id}-"]`).forEach((b, i) => b.classList.toggle('played', i / 30 < pct));
    const rem = Math.max(0, (dur || audio.duration) - audio.currentTime);
    const d = document.getElementById('vdur-' + id); if (d) d.textContent = formatVoiceDur(Math.round(rem));
  };
  audio.onended = () => { btn.textContent = '▶'; activeAudio = null; };
}
function formatVoiceDur(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

