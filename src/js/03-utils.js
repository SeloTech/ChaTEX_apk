// ============================================================
//  UTILS
// ============================================================
function toast(msg, dur = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts) {
  const d = new Date(ts), today = new Date(), yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === yest.toDateString())  return 'Вчера';
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
}

function avatarFallback(nick) { return nick ? nick[0].toUpperCase() : '?'; }
function nameInList(name, list) {
  if (!name) return false;
  const n = String(name).toLowerCase();
  return list.some(x => x.toLowerCase() === n);
}
function isAdmin(ud)  {
  return !!(ud && (ud.isAdmin === true || ud.isSuperAdmin === true));
}
function isSuperAdmin(ud) {
  return !!(ud && ud.isSuperAdmin === true);
}
function isRubick(ud) { return isSuperAdmin(ud); }
// Premium с ограничением по времени: считается активным только пока не истёк срок
function isPremiumActive(premiumFlag, expiresAt) {
  return premiumFlag === true && (!expiresAt || expiresAt > Date.now());
}
const PREMIUM_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 1 месяц
// ─── Акция: бесплатный Premium на 1 месяц всем новым пользователям ────
// Действует до 1 октября 2026, 00:00 по Киеву (UTC+3, летнее время ещё
// действует в этот момент — переход на зимнее время в Украине в 2026
// происходит позже, в конце октября).
const NEW_USER_PROMO_DEADLINE = new Date('2026-10-01T00:00:00+03:00').getTime();
function formatPremiumExpiry(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
}
function roleBadgesHtml(ud) {
  if (!ud) return '';
  let h = '';
  const hasTitle = isSuperAdmin(ud) || ud.isAdmin === true || nameInList(ud.username, ADMIN_NAMES);
  const isPremium = isPremiumActive(ud.premium, ud.premiumExpiresAt);
  const showPremiumInstead = isPremium && hasTitle && ud.badgePref === 'premium';
  if (hasTitle && !showPremiumInstead) {
    if (isSuperAdmin(ud)) h += ' <span class="super-admin-tag">SUPER ADMIN</span>';
    else h += ' <span class="admin-tag">ADMIN</span>';
  }
  if (isPremium && (!hasTitle || showPremiumInstead)) h += ' <span class="badge-premium" title="Premium">✦</span>';
  if (ud.verified) h += ' <span class="badge-verify">✓</span>';
  return h;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}
// Для безопасной подстановки строки внутрь одинарных кавычек в onclick="...('...')"
function escAttr(str) { return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

// ─── Инлайн-эмодзи (свои картинки/GIF, вставленные внутрь текста) ─────
// Хранятся в тексте сообщения как токен {{emoji:URLENCODED_URL}} — так
// можно набирать их прямо между слов в обычном <textarea>, а при показе
// сообщения токен превращается в маленькую картинку. Для превью (сайдбар,
// ответы, уведомления, тост во время звонка), где HTML не нужен, токен
// просто заменяется на 🙂.
const INLINE_EMOJI_RE = /\{\{emoji:([^}]+)\}\}/g;
function stripInlineEmojiTokens(text) {
  if (!text) return text;
  return String(text).replace(INLINE_EMOJI_RE, '🙂');
}

// ─── Черновики сообщений ───────────────────────────────────────
// Как в Telegram: если начал печатать и переключился в другой чат, текст
// не стирается. Хранится ЛОКАЛЬНО (localStorage), а не в базе — черновик
// это личное недописанное сообщение, синхронизировать между устройствами
// его не нужно, а писать в БД на каждое нажатие клавиши было бы дорого.
const DRAFT_PREFIX = 'chatex_draft:';
function saveDraft(chatId, text) {
  if (!chatId) return;
  try {
    const key = DRAFT_PREFIX + chatId;
    if (text && text.trim()) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  } catch (e) {}
}
function loadDraft(chatId) {
  if (!chatId) return '';
  try { return localStorage.getItem(DRAFT_PREFIX + chatId) || ''; } catch (e) { return ''; }
}
// Вызывается сразу после того, как #msg-input пересоздан для нового чата —
// подставляет сохранённый черновик и растягивает textarea под его высоту.
function restoreDraft(chatId) {
  const inp = document.getElementById('msg-input'); if (!inp) return;
  const draft = loadDraft(chatId);
  if (draft) { inp.value = draft; if (typeof autoGrow === 'function') autoGrow(inp); }
}
// Принимает УЖЕ экранированный через escHtml текст и подставляет <img> вместо токенов
function renderInlineEmojiHtml(escapedText) {
  if (!escapedText) return escapedText;
  return escapedText.replace(INLINE_EMOJI_RE, (m, enc) => {
    let url = '';
    try { url = decodeURIComponent(enc); } catch (e) { return ''; }
    if (!/^https?:\/\//i.test(url)) return '';
    return `<img class="inline-emoji" src="${url}" alt="🙂" loading="lazy" style="cursor:pointer" onclick="openEmojiPreview('${escAttr(url)}')">`;
  });
}

// ─── PRESENCE / "БЫЛ(А) В СЕТИ" ──────────────────────────────
// ud — объект users/{uid}. Учитывает приватность (settings.lastSeen === false
// прячет точное время, но факт "в сети сейчас" всё равно можно показывать).
function presenceStatusText(ud) {
  if (!ud) return { online: false, text: 'не в сети' };
  if (ud.online === true) return { online: true, text: 'в сети' };
  const hideLastSeen = ud.settings && ud.settings.lastSeen === false;
  if (!ud.lastSeen || hideLastSeen) return { online: false, text: 'не в сети' };
  return { online: false, text: 'был(а) ' + formatLastSeen(ud.lastSeen) };
}

function formatLastSeen(ts) {
  const diffMs = Date.now() - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return 'только что';
  if (diffMin < 60) return diffMin + ' мин. назад';
  const d = new Date(ts), now = new Date();
  const time = d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'сегодня в ' + time;
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'вчера в ' + time;
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' }) + ' в ' + time;
}

function isMobile()     { return window.innerWidth <= 640; }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function setAuthError(msg) { document.getElementById('auth-error').textContent = msg; }

// ─── MOBILE NAV ─────────────────────────────────────────────
function showChat() {
  if (!isMobile()) return;
  document.getElementById('sidebar').classList.add('hidden');
  document.getElementById('chat-area').classList.add('visible');
}
function goBack() {
  if (!isMobile()) return;
  document.getElementById('sidebar').classList.remove('hidden');
  document.getElementById('chat-area').classList.remove('visible');
}

