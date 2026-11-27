// ============================================================
//  ФАЙЛЫ (документы) + УПОМИНАНИЯ @username
// ============================================================

// ─── Загрузка обычных файлов (pdf/zip/doc/…), до 25 МБ ───────
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 МБ

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
}

function fileIconFor(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return '📕';
  if (['zip', 'rar', '7z'].includes(ext)) return '🗜️';
  if (['doc', 'docx'].includes(ext)) return '📘';
  if (['xls', 'xlsx'].includes(ext)) return '📗';
  if (['ppt', 'pptx'].includes(ext)) return '📙';
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return '🎬';
  if (['mp3', 'wav', 'ogg'].includes(ext)) return '🎵';
  if (['txt', 'md'].includes(ext)) return '📄';
  return '📎';
}

// Общий обработчик выбора файла в поле "скрепка": картинки уходят по старому
// пути (imgbb/cloudinary + кроппер), всё остальное — в облако как документ.
async function sendAttachment(input, chatId) {
  const file = input.files[0]; if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    toast('⚠️ Файл больше 25 МБ, отправка недоступна');
    input.value = ''; return;
  }
  if (file.type && file.type.startsWith('image/')) { sendImage(input, chatId); return; }
  document.getElementById('upload-progress').classList.add('show');
  document.getElementById('upload-text').textContent = 'Отправка файла...';
  try {
    const url = await uploadGenericFile(file);
    const isChannelAdmin = currentChatType === 'channel' && currentChatData?.admins?.[currentUser.uid];
    const msgData = {
      text: '', fileUrl: url, fileName: file.name, fileSize: file.size, fileType: file.type || '',
      senderUid: currentUser.uid, senderName: currentUserData.username,
      senderAvatar: currentUserData.avatarUrl || '',
      senderIsAdmin: currentUserData.isAdmin === true,
      senderIsSuperAdmin: isSuperAdmin(currentUserData),
      senderChannelAdmin: isChannelAdmin === true,
      senderVerified: currentUserData.verified === true,
      senderPremium: isPremiumActive(currentUserData.premium, currentUserData.premiumExpiresAt),
      senderBadgePref: currentUserData.badgePref || 'title',
      timestamp: Date.now()
    };
    if (replyToMsg) { msgData.replyTo = { id: replyToMsg.id, text: replyToMsg.text, senderName: replyToMsg.senderName }; cancelReply(); }
    const base = getMsgsBasePath(chatId); if (!base) throw new Error('Неизвестный чат');
    await db.ref(base).push(msgData);
    if (currentChatType === 'dm') {
      await db.ref('dm_meta/' + chatId).update({ lastMsg: '📎 ' + file.name, lastTs: Date.now() });
      ensureRecipientHasChat(chatId, chatId.split('_').find(p => p !== currentUser.uid));
    }
  } catch (e) {
    console.error('sendAttachment error:', e);
    toast('⚠️ Не удалось отправить файл: ' + (e.message || e.code || 'ошибка'), 6000);
  }
  document.getElementById('upload-progress').classList.remove('show');
  document.getElementById('upload-text').textContent = 'Загрузка...';
  input.value = '';
}

// Загрузка непосредственно файла (не картинки). Порядок попыток, по убыванию
// надёжности в ЭТОМ проекте:
//  1) Cloudinary, если пользователь указал свои cloudinaryName/Preset в
//     настройках — поддерживает resource_type=auto, то есть ЛЮБОЙ файл,
//     не только картинки, вплоть до лимита его тарифа.
//  2) Firebase Storage — работает только если в проекте включён биллинг
//     (план Blaze); на бесплатном Spark-плане storage.ref(...).put() падает
//     с ошибкой прав/квоты — именно поэтому раньше файл "молча не кидался".
//  3) Если оба недоступны — маленький файл (до ~900 КБ) отправляем как
//     base64 data-URL прямо внутри самого сообщения в Realtime DB. Это тот
//     же трюк, что уже используется для голосовых (см. sendVoiceMessage),
//     просто теперь явно и для документов — так документы до ~1 МБ уходят
//     вообще без какой-либо дополнительной настройки проекта.
async function uploadGenericFile(file) {
  if (cloudinaryName && cloudinaryPreset) {
    try {
      const fd = new FormData();
      fd.append('file', file); fd.append('upload_preset', cloudinaryPreset);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryName}/auto/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.secure_url) return data.secure_url;
      console.warn('Cloudinary raw upload вернул ошибку:', data.error?.message);
    } catch (e) { console.warn('Cloudinary raw upload не удался:', e); }
  }
  try {
    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const ref = storage.ref('files/' + Date.now() + '_' + safeName);
    await ref.put(file, { contentType: file.type || 'application/octet-stream' });
    return await ref.getDownloadURL();
  } catch (storageErr) {
    console.warn('Firebase Storage недоступен для файла, пробуем запасной вариант:', storageErr);
  }
  const FALLBACK_MAX = 900 * 1024; // ~900 КБ — больше раздувать саму базу данных нельзя
  if (file.size > FALLBACK_MAX) {
    throw new Error(`Облачное хранилище недоступно (нужен Firebase Storage на плане Blaze, либо укажите свой Cloudinary в Настройках), а файл больше ${formatFileSize(FALLBACK_MAX)} — без облака такой не отправить.`);
  }
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('Не удалось прочитать файл'));
    r.readAsDataURL(file);
  });
}

// Карточка файла в сообщении
function buildFileHtml(msg) {
  if (!msg.fileUrl) return '';
  return `<a class="msg-file" href="${escAttr(msg.fileUrl)}" target="_blank" rel="noopener" download="${escAttr(msg.fileName || 'file')}">
    <div class="msg-file-icon">${fileIconFor(msg.fileName)}</div>
    <div class="msg-file-info">
      <div class="msg-file-name">${escHtml(msg.fileName || 'Файл')}</div>
      <div class="msg-file-size">${formatFileSize(msg.fileSize)}</div>
    </div>
  </a>`;
}

// ─── УПОМИНАНИЯ @username В ГРУППАХ/КАНАЛАХ ──────────────────
// Кэш участников текущей группы/канала для автодополнения по @.
// Заполняется при открытии группы/канала (см. loadChatMembersForMentions,
// вызывается из openGroup/openChannel).
let mentionMembersCache = [];
let mentionActiveIndex = -1;

async function loadChatMembersForMentions(members) {
  mentionMembersCache = [];
  const uids = Object.keys(members || {}).filter(uid => uid !== currentUser.uid).slice(0, 200);
  const results = await Promise.all(uids.map(uid => db.ref('users/' + uid).once('value')));
  results.forEach((snap, i) => {
    const ud = snap.val(); if (!ud || !ud.username) return;
    mentionMembersCache.push({ uid: uids[i], username: ud.username, avatarUrl: ud.avatarUrl || '' });
  });
}

// Находит незакрытый токен "@..." непосредственно перед курсором, если есть
function getMentionQueryAtCursor(inp) {
  const pos = inp.selectionStart ?? inp.value.length;
  const before = inp.value.slice(0, pos);
  const m = before.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
  if (!m) return null;
  return { query: m[1], start: pos - m[1].length - 1, end: pos };
}

// Вызывается из oninput textarea (в дополнение к autoGrow/startTyping/saveDraft)
function handleMentionInput(inp) {
  if (!(currentChatType === 'group' || currentChatType === 'channel')) { hideMentionPicker(); return; }
  const q = getMentionQueryAtCursor(inp);
  if (!q) { hideMentionPicker(); return; }
  const query = q.query.toLowerCase();
  const matches = mentionMembersCache.filter(m => m.username.toLowerCase().startsWith(query)).slice(0, 6);
  if (!matches.length) { hideMentionPicker(); return; }
  renderMentionPicker(matches, q);
}

function renderMentionPicker(matches, q) {
  let p = document.getElementById('mention-picker');
  if (!p) {
    const ia = document.getElementById('input-area'); if (!ia) return;
    p = document.createElement('div'); p.id = 'mention-picker'; p.className = 'mention-picker';
    ia.appendChild(p);
  }
  mentionActiveIndex = 0;
  p.innerHTML = matches.map((m, i) => `<div class="mention-item${i === 0 ? ' active' : ''}" data-idx="${i}"
      onmousedown="event.preventDefault();applyMention(${i})">
      <div class="avatar" style="width:26px;height:26px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;overflow:hidden">
        ${m.avatarUrl ? `<img src="${escAttr(m.avatarUrl)}" style="width:100%;height:100%;object-fit:cover">` : avatarFallback(m.username)}
      </div>
      <span>${escHtml(m.username)}</span>
    </div>`).join('');
  p._matches = matches; p._range = q;
  p.classList.add('open');
}

function hideMentionPicker() {
  const p = document.getElementById('mention-picker'); if (!p) return;
  p.classList.remove('open'); p.innerHTML = ''; mentionActiveIndex = -1;
}

function applyMention(idx) {
  const p = document.getElementById('mention-picker'); if (!p || !p._matches) return;
  const m = p._matches[idx]; if (!m) return;
  const inp = document.getElementById('msg-input'); if (!inp) return;
  const { start, end } = p._range;
  const insert = '@' + m.username + ' ';
  inp.value = inp.value.slice(0, start) + insert + inp.value.slice(end);
  const pos = start + insert.length;
  inp.focus();
  try { inp.setSelectionRange(pos, pos); } catch (e) {}
  hideMentionPicker();
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}

// Стрелки/Enter/Esc внутри открытого пикера — вызывается из handleKey до
// обработки Enter=отправить, чтобы Enter сначала подтверждал упоминание
function handleMentionKeydown(e) {
  const p = document.getElementById('mention-picker');
  if (!p || !p.classList.contains('open') || !p._matches?.length) return false;
  const items = p._matches;
  if (e.key === 'ArrowDown') { e.preventDefault(); mentionActiveIndex = (mentionActiveIndex + 1) % items.length; updateMentionActive(p); return true; }
  if (e.key === 'ArrowUp')   { e.preventDefault(); mentionActiveIndex = (mentionActiveIndex - 1 + items.length) % items.length; updateMentionActive(p); return true; }
  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyMention(mentionActiveIndex < 0 ? 0 : mentionActiveIndex); return true; }
  if (e.key === 'Escape') { hideMentionPicker(); return true; }
  return false;
}
function updateMentionActive(p) {
  [...p.children].forEach((el, i) => el.classList.toggle('active', i === mentionActiveIndex));
}

// Разбирает готовый текст сообщения на упоминания перед отправкой —
// сравнивает @токены с известными участниками чата и возвращает карту
// {uid: username} для сохранения в msgData.mentions
function extractMentions(text) {
  if (!text || !mentionMembersCache.length) return null;
  const found = {};
  const re = /@([a-zA-Z0-9_]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const uname = m[1].toLowerCase();
    const member = mentionMembersCache.find(mm => mm.username.toLowerCase() === uname);
    if (member) found[member.uid] = member.username;
  }
  return Object.keys(found).length ? found : null;
}

// Рендер текста сообщения с кликабельными @упоминаниями (текст уже
// экранирован через escHtml). Кликабельны только реальные упоминания из
// msg.mentions — так что случайный "@" в тексте не станет ссылкой.
function renderMentionsHtml(escapedText, mentions) {
  if (!mentions || !escapedText) return escapedText;
  const byName = {};
  Object.entries(mentions).forEach(([uid, uname]) => { byName[uname.toLowerCase()] = uid; });
  return escapedText.replace(/@([a-zA-Z0-9_]+)/g, (whole, uname) => {
    const uid = byName[uname.toLowerCase()];
    if (!uid) return whole;
    return `<span class="mention" onclick="openMentionProfile('${uid}')">@${uname}</span>`;
  });
}

// Клик по упоминанию в сообщении → открыть профиль/ЛС с этим человеком
async function openMentionProfile(uid) {
  try {
    const snap = await db.ref('users/' + uid).once('value'); const ud = snap.val();
    if (!ud) { toast('Пользователь не найден'); return; }
    const chatId = [currentUser.uid, uid].sort().join('_');
    openViewProfile({ uid, userData: ud, chatId });
  } catch (e) { toast('Не удалось открыть профиль'); }
}
