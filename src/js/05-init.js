// ============================================================
//  INIT
// ============================================================
function initApp() {
  document.getElementById('my-name-el').innerHTML  = escHtml(currentUserData.username) + roleBadgesHtml(currentUserData);
  document.getElementById('my-status-el').textContent = '@' + currentUserData.username;
  renderMyAvatar();
  document.getElementById('admin-btn').style.display = isAdmin(currentUserData) ? 'flex' : 'none';
  if (userSettings.theme) changeTheme(userSettings.theme);
  applyAppearanceSettings();
  checkPremiumExpiry();
  loadAllChats();
  openOfficial();
  listenNotifications();
  loadFriends();
  listenBan();
  listenPremiumLive();
  setupPresence();
  initCallsSystem();
  if (typeof maybeShowNotifBanner === 'function') maybeShowNotifBanner();
}

// ─── ЖИВОЙ ONLINE-СТАТУС ──────────────────────────────────────
// Использует спец-путь .info/connected (не требует прав в rules) +
// onDisconnect, чтобы при закрытии вкладки/обрыве связи сервер сам
// проставил online:false и lastSeen, даже если клиент не успел это сделать.
function setupPresence() {
  const onlineRef   = db.ref('users/' + currentUser.uid + '/online');
  const lastSeenRef = db.ref('users/' + currentUser.uid + '/lastSeen');
  db.ref('.info/connected').on('value', snap => {
    if (snap.val() !== true) return;
    onlineRef.onDisconnect().set(false);
    lastSeenRef.onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
    onlineRef.set(true);
  });
}

// Вызывается перед выходом из аккаунта — чтобы не ждать onDisconnect
function markOffline() {
  if (!currentUser) return;
  try {
    db.ref('users/' + currentUser.uid + '/online').set(false);
    db.ref('users/' + currentUser.uid + '/lastSeen').set(firebase.database.ServerValue.TIMESTAMP);
  } catch (e) {}
}

function renderMyAvatar() {
  const el = document.getElementById('my-avatar-el');
  if (currentUserData.avatarUrl) el.innerHTML = `<img src="${currentUserData.avatarUrl}" alt="">`;
  else el.textContent = avatarFallback(currentUserData.username);
}

// ─── Автоматическое снятие Premium по истечении 1 месяца ─────
function checkPremiumExpiry() {
  if (currentUserData.premium === true && currentUserData.premiumExpiresAt && currentUserData.premiumExpiresAt <= Date.now()) {
    currentUserData.premium = false;
    // В БД флаг снимает сервер/админ (клиенту писать premium запрещено правилами); интерфейс опирается на isPremiumActive().
    // если стояла Premium-тема — откатываем на бесплатную, чтобы интерфейс не сломался
    if (PREMIUM_THEMES.includes(userSettings.theme)) changeTheme('dark');
    document.getElementById('my-name-el').innerHTML = escHtml(currentUserData.username) + roleBadgesHtml(currentUserData);
    toast('✦ Срок Premium истёк');
  }
}

