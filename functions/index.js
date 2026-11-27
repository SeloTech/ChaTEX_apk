const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onValueWritten } = require('firebase-functions/v2/database');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.database();

/**
 * Проверяет, что вызывающий — админ (isAdmin/isSuperAdmin в users/{uid}).
 */
async function assertIsAdmin(uid) {
  if (!uid) throw new HttpsError('unauthenticated', 'Требуется авторизация');
  const snap = await db.ref('users/' + uid).once('value');
  const u = snap.val() || {};
  if (!u.isAdmin && !u.isSuperAdmin) {
    throw new HttpsError('permission-denied', 'Только для администраторов');
  }
}

/**
 * callable: adminUpdateUserEmail({ uid, email })
 * Меняет email пользователя одновременно в Firebase Authentication и в Realtime Database.
 * Вызывать так с клиента:
 *   const fn = firebase.functions().httpsCallable('adminUpdateUserEmail');
 *   await fn({ uid: targetUid, email: newEmail });
 */
exports.adminUpdateUserEmail = onCall(async (request) => {
  const callerUid = request.auth && request.auth.uid;
  await assertIsAdmin(callerUid);

  const { uid, email } = request.data || {};
  if (!uid || !email) {
    throw new HttpsError('invalid-argument', 'Нужны uid и email');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'Некорректный email');
  }

  try {
    // 1) Меняем email в Firebase Authentication (только Admin SDK может менять чужой email)
    await admin.auth().updateUser(uid, { email, emailVerified: false });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Этот email уже используется другим аккаунтом');
    }
    throw new HttpsError('internal', 'Ошибка Auth: ' + e.message);
  }

  // 2) Синхронизируем email в Realtime Database
  await db.ref('users/' + uid).update({ email });

  return { ok: true };
});

// ============================================================
//  SERVER-SIDE ЗАЩИТА: кастомные эмодзи — только для Premium
// ============================================================
// Клиентская проверка (isPremiumActive) в js/15-send-messages.js — это UX,
// а не безопасность: любой может отправить {{emoji:URL}} напрямую в базу
// (консоль браузера, altered client, curl + REST API и т.д.), минуя UI.
// Эти триггеры перепроверяют premium-статус отправителя на сервере при
// каждой записи/редактировании сообщения и вырезают токен, если premium
// неактивен — точно так же, как isPremiumActive() на клиенте.

const CUSTOM_EMOJI_RE = /\{\{emoji:[^}]+\}\}/g;

async function isSenderPremium(senderUid) {
  if (!senderUid) return false;
  const snap = await db.ref('users/' + senderUid).once('value');
  const u = snap.val() || {};
  return u.premium === true && (!u.premiumExpiresAt || u.premiumExpiresAt > Date.now());
}

// Общий обработчик: если text содержит {{emoji:...}}, а отправитель не premium —
// вырезаем токены из текста. Пустой текст после вырезания и без стикеров -
// сообщение всё равно оставляем (просто без эмодзи), чтобы не терять историю.
async function sanitizeCustomEmoji(event) {
  const after = event.data.after;
  if (!after.exists()) return; // сообщение удалено — нечего проверять
  const val = after.val();
  const text = val.text;
  if (typeof text !== 'string' || !CUSTOM_EMOJI_RE.test(text)) return;

  const premium = await isSenderPremium(val.senderUid);
  if (premium) return; // всё чисто, у отправителя есть право на кастомные эмодзи

  const cleaned = text.replace(CUSTOM_EMOJI_RE, '').replace(/ {2,}/g, ' ').trim();
  await after.ref.update({ text: cleaned });
}

exports.guardCustomEmojiDm = onValueWritten('/dms/{chatId}/{msgId}', sanitizeCustomEmoji);
exports.guardCustomEmojiGroup = onValueWritten('/groups/{chatId}/messages/{msgId}', sanitizeCustomEmoji);
exports.guardCustomEmojiChannel = onValueWritten('/channels/{chatId}/messages/{msgId}', sanitizeCustomEmoji);
exports.guardCustomEmojiOfficial = onValueWritten('/official_messages/{msgId}', sanitizeCustomEmoji);
exports.guardCustomEmojiSupport = onValueWritten('/support_messages/{msgId}', sanitizeCustomEmoji);
exports.guardCustomEmojiTicket = onValueWritten('/ticket_messages/{chatId}/{msgId}', sanitizeCustomEmoji);
exports.guardCustomEmojiFavorites = onValueWritten('/favorites_messages/{uid}/{msgId}', sanitizeCustomEmoji);
