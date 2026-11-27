// ============================================================
//  AUTH
// ============================================================
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) =>
    t.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'))
  );
  ['panel-login', 'panel-register', 'panel-verify'].forEach(p =>
    document.getElementById(p).classList.remove('active')
  );
  document.getElementById('panel-' + tab).classList.add('active');
  setAuthError('');
}

function previewAvatar(input) {
  if (!input.files[0]) return;
  const r = new FileReader();
  r.onload = e => {
    const p = document.getElementById('reg-avatar-preview');
    p.src = e.target.result; p.style.display = 'block';
    document.getElementById('reg-avatar-text').textContent = '✓ Фото выбрано';
  };
  r.readAsDataURL(input.files[0]);
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) { setAuthError('Заполните все поля'); return; }
  setAuthError('');
  const btn = document.getElementById('login-btn');
  btn.textContent = 'Входим...'; btn.disabled = true;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (e) {
    const m = {
      'auth/user-not-found':       'Пользователь не найден',
      'auth/wrong-password':       'Неверный пароль',
      'auth/invalid-credential':   'Неверный email или пароль',
      'auth/invalid-email':        'Некорректный email',
      'auth/too-many-requests':    'Слишком много попыток. Подождите.',
      'auth/network-request-failed': 'Ошибка сети.'
    };
    setAuthError(m[e.code] || ('Ошибка: ' + e.message));
    btn.textContent = 'Войти в ChaTEX'; btn.disabled = false;
  }
}

async function doRegister() {
  const nick       = document.getElementById('reg-nick').value.trim();
  const email      = document.getElementById('reg-email').value.trim();
  const pass       = document.getElementById('reg-pass').value;
  const avatarFile = document.getElementById('reg-avatar-file').files[0];
  if (!nick || !email || !pass) { setAuthError('Заполните все поля'); return; }
  if (!/^[a-zA-Z0-9_]{2,20}$/.test(nick)) { setAuthError('Ник: только латиница, цифры, _ (2-20)'); return; }
  if (pass.length < 6) { setAuthError('Пароль минимум 6 символов'); return; }
  if (!document.getElementById('reg-terms')?.checked) { setAuthError('Примите пользовательское соглашение'); return; }
  setAuthError('');
  const btn = document.getElementById('reg-btn');
  btn.textContent = 'Проверяем...'; btn.disabled = true;
  try {
    const ex = await db.ref('usernames/' + nick.toLowerCase()).once('value');
    if (ex.val()) { setAuthError('Ник уже занят'); btn.textContent = 'Создать аккаунт →'; btn.disabled = false; return; }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verifyCode_store = code; verifyPendingData = { nick, email, pass, avatarFile };
    await db.ref('pending_verify/' + nick.toLowerCase()).set({ code, ts: Date.now() });
    document.getElementById('verify-hint-text').innerHTML =
      `Ваш код:<br><strong style="font-size:30px;letter-spacing:5px;color:var(--accent);font-family:var(--mono)">${code}</strong><br>
       <span style="font-size:11px;color:var(--text3)">Он уже вписан в поля ниже</span>`;
    document.querySelectorAll('.code-digit').forEach((d, i) => { d.value = code[i] || ''; });
    switchTabToVerify();
    btn.textContent = 'Создать аккаунт →'; btn.disabled = false;
  } catch (e) {
    setAuthError('Ошибка: ' + e.message);
    btn.textContent = 'Создать аккаунт →'; btn.disabled = false;
  }
}

function switchTabToVerify() {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  ['panel-login', 'panel-register', 'panel-verify'].forEach(p =>
    document.getElementById(p).classList.remove('active')
  );
  document.getElementById('panel-verify').classList.add('active');
}

function codeInput(el, idx) {
  const digits = document.querySelectorAll('.code-digit');
  el.value = el.value.replace(/\D/g, '');
  if (el.value && idx < 5) digits[idx + 1].focus();
  if (idx === 5 && el.value) verifyCode();
}

function codeBack(el, idx, e) {
  if (e.key === 'Backspace' && !el.value && idx > 0)
    document.querySelectorAll('.code-digit')[idx - 1].focus();
}

async function verifyCode() {
  const entered = Array.from(document.querySelectorAll('.code-digit')).map(d => d.value).join('');
  if (entered.length !== 6) { setAuthError('Введите 6 цифр'); return; }
  setAuthError('');
  const btn = document.getElementById('verify-btn');
  btn.textContent = 'Проверяем...'; btn.disabled = true;
  let valid = entered === verifyCode_store;
  if (!valid && verifyPendingData) {
    try {
      const snap = await db.ref('pending_verify/' + verifyPendingData.nick.toLowerCase()).once('value');
      if (snap.val()?.code === entered) valid = true;
    } catch (_) {}
  }
  if (!valid) { setAuthError('Неверный код'); btn.textContent = 'Подтвердить →'; btn.disabled = false; return; }
  const { nick, email, pass, avatarFile } = verifyPendingData;
  btn.textContent = 'Создаём аккаунт...';
  // createUserWithEmailAndPassword() ниже мгновенно триггерит отдельный
  // auth.onAuthStateChanged (см. конец файла), который сразу читает
  // users/{uid}. Запись профиля туда происходит чуть позже в этой же
  // функции — из-за этого слушатель успевал застать пустые данные и
  // разлогинивал только что созданного пользователя ("Данные аккаунта
  // не найдены"), хотя аккаунт в Firebase Auth уже был создан.
  // registrationInProgress подавляет эту преждевременную реакцию слушателя,
  // пока мы сами не запишем профиль и не вызовем finishLogin().
  registrationInProgress = true;
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    const uid  = cred.user.uid;
    // Сразу после createUserWithEmailAndPassword ID-токен, который уходит
    // с запросом на запись в RTDB, иногда ещё не успевает обновиться до
    // "залогиненного" — тогда самая первая запись после регистрации может
    // словить permission_denied, хотя аккаунт в Firebase Auth уже создан.
    // Принудительно обновляем токен перед записями, чтобы исключить эту гонку.
    try { await cred.user.getIdToken(true); } catch (_) {}
    let avatarUrl = '';
    if (avatarFile) { try { avatarUrl = await uploadMedia(avatarFile); } catch (_) {} }
    const ud = {
      username: nick, email, avatarUrl,
      bio: '',
      createdAt: Date.now(),
      settings: { lastSeen: true, readReceipts: true, pushNotif: false, soundNotif: true },
      termsVersion: (window.TXLegal ? TXLegal.TERMS_VERSION : null), termsAcceptedAt: Date.now()
    };
    // Проверяем ник ещё раз прямо перед записью (мог занять кто-то другой,
    // пока пользователь вводил код подтверждения).
    const stillFree = !(await db.ref('usernames/' + nick.toLowerCase()).once('value')).val();
    if (!stillFree) throw { code: 'nick-taken', message: 'Ник уже занят, пока вы вводили код' };
    await db.ref('users/' + uid).set(ud);
    try {
      await db.ref('usernames/' + nick.toLowerCase()).set(uid);
    } catch (nickErr) {
      // Ник не записался — откатываем всё, чтобы не оставить "осиротевший"
      // профиль users/{uid} без ника, из-за которого повторная регистрация
      // с тем же ником потом падает с permission_denied.
      await db.ref('users/' + uid).remove().catch(() => {});
      await cred.user.delete().catch(() => {});
      throw nickErr;
    }
    await db.ref('pending_verify/' + nick.toLowerCase()).remove();
    toast('✅ Добро пожаловать в ChaTEX!', 5000);
    registrationInProgress = false;
    await finishLogin(cred.user, ud);
  } catch (e) {
    registrationInProgress = false;
    const m = { 'auth/email-already-in-use': 'Email уже используется', 'nick-taken': 'Ник уже занят, попробуйте другой' };
    setAuthError(m[e.code] || ('Ошибка: ' + e.message));
    btn.textContent = 'Подтвердить →'; btn.disabled = false;
  }
}

async function resendCode() {
  if (!verifyPendingData) return;
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  verifyCode_store = code;
  await db.ref('pending_verify/' + verifyPendingData.nick.toLowerCase()).set({ code, ts: Date.now() });
  document.getElementById('verify-hint-text').innerHTML =
    `Новый код:<br><strong style="font-size:30px;letter-spacing:5px;color:var(--accent);font-family:var(--mono)">${code}</strong>`;
  document.querySelectorAll('.code-digit').forEach((d, i) => { d.value = code[i] || ''; });
  toast('✅ Новый код сгенерирован');
}

// ─── AUTH STATE LISTENER ────────────────────────────────────
let registrationInProgress = false;
// true после первого успешного finishLogin() в этой вкладке — нужно,
// чтобы отличить "реальный выход из аккаунта" (когда надо жёстко
// перезагрузить страницу, обнулив вообще всё) от самого первого
// запуска приложения, когда пользователь ещё не был залогинен.
let wasLoggedInThisTab = false;

// Общий "довход" в приложение: и обычный логин, и только что созданная
// регистрация проходят через один и тот же код. knownUd — необязательный
// свежезаписанный профиль (передаётся из verifyCode сразу после set(),
// чтобы не делать лишнее чтение и не попасть в те же гонки с БД).
async function finishLogin(user, knownUd) {
  currentUser = user;
  try {
    currentUserData = knownUd || (await db.ref('users/' + user.uid).once('value')).val();
    if (!currentUserData) { await auth.signOut(); setAuthError('Данные аккаунта не найдены.'); return; }
    if (currentUserData.blocked) { await auth.signOut(); setAuthError('Аккаунт заблокирован.'); return; }
    // Облачный пароль: на новом устройстве спрашиваем до показа приложения (38-security.js)
    if (window.TXLegal && !(await TXLegal.gate(user))) return;
    if (window.TXSec && !(await TXSec.beforeApp(user))) return;
    // Права (админ/Plus) выдаёт ТОЛЬКО сервер: флаги в БД защищены правилами Firebase.
    userSettings    = currentUserData.settings || {};
    cloudinaryName  = localStorage.getItem('cloudinary_name')   || '';
    cloudinaryPreset = localStorage.getItem('cloudinary_preset') || '';
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').classList.add('visible');
    wasLoggedInThisTab = true;
    initApp();
    // Устройство в список «Устройства», автоблокировка по код-паролю
    if (window.TXSec) TXSec.afterApp(user);
  } catch (e) { setAuthError('Ошибка загрузки: ' + e.message); await auth.signOut(); }
}

auth.onAuthStateChanged(async user => {
  if (user) {
    // Регистрация сама вызовет finishLogin() после того, как запишет
    // профиль в users/{uid} — не дублируем и не забегаем вперёд.
    if (registrationInProgress) return;
    await finishLogin(user);
  } else {
    currentUser = null; currentUserData = null;
    unlistenBan();
    unlistenPremiumLive();
    Object.keys(dmMetaListeners).forEach(chatId => { try { db.ref('dm_meta/' + chatId).off('value', dmMetaListeners[chatId]); } catch (e) {} });
    dmMetaListeners = {};
    if (adminUsersLive) { try { adminUsersLiveRef.off('value', adminUsersLive); } catch (e) {} adminUsersLive = null; }
    // Реальный выход из аккаунта (не первый запуск) — жёстко перезагружаем
    // страницу. По-другому гарантированно не обнулить ВСЕ слушатели и кэши
    // приложения (friends, tickets, notifications, admin-panel и т.д.),
    // из-за чего в новом/другом аккаунте были видны чужие чаты/каналы.
    if (wasLoggedInThisTab) { location.reload(); return; }
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app').classList.remove('visible');
    const btn = document.getElementById('login-btn');
    if (btn) { btn.textContent = 'Войти в ChaTEX'; btn.disabled = false; }
  }
});

