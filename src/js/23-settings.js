// ============================================================
//  SETTINGS
// ============================================================
const PREMIUM_THEMES = ['aero', 'neon', 'ocean', 'sunset', 'lavender', 'forest'];

function openSettings() {
  const s = currentUserData.settings || {};
  const map = { lastSeen: 'toggle-lastseen', readReceipts: 'toggle-readreceipts', pushNotif: 'toggle-pushnotif', soundNotif: 'toggle-soundnotif' };
  Object.entries(map).forEach(([k, id]) => {
    const el = document.getElementById(id); if (!el) return;
    el.className = 'toggle' + ((s[k] === true || (s[k] === undefined && ['lastSeen', 'readReceipts', 'soundNotif'].includes(k))) ? ' on' : '');
  });
  document.getElementById('cloudinary-name').value   = cloudinaryName;
  document.getElementById('cloudinary-preset').value = cloudinaryPreset;
  const theme = s.theme || 'dark';
  document.querySelectorAll('.theme-card').forEach(c => c.classList.toggle('active', c.dataset.theme === theme));
  const fs = document.getElementById('font-size-select'); if (fs) fs.value = String(s.fontSize || 14);
  const bs = document.getElementById('bubble-size-select'); if (bs) bs.value = s.bubbleSize || 'm';
  refreshPremiumUI();
  openModal('settings-modal');
}

function refreshPremiumUI() {
  const isPremium = isPremiumActive(currentUserData.premium, currentUserData.premiumExpiresAt);
  document.querySelectorAll('.theme-card.premium-locked').forEach(c => c.classList.toggle('locked', !isPremium));
  const buyBtn = document.getElementById('buy-premium-btn');
  const note = document.getElementById('premium-active-note');
  if (buyBtn) {
    buyBtn.style.display = isPremium ? 'none' : '';
    if (!buyBtn.disabled) buyBtn.textContent = `✦ Купить Premium — ${PREMIUM_PRICE_UAH} ₴`;
  }
  if (note) {
    note.style.display = isPremium ? '' : 'none';
    if (isPremium) note.textContent = '✦ Premium активен до ' + formatPremiumExpiry(currentUserData.premiumExpiresAt);
  }
  const badgeRow = document.getElementById('settings-badgepref-row');
  const canPickBadge = isPremium && (currentUserData.isAdmin === true || isSuperAdmin(currentUserData));
  if (badgeRow) badgeRow.style.display = canPickBadge ? 'flex' : 'none';
  const bp = document.getElementById('badge-pref-select');
  if (bp) bp.value = currentUserData.badgePref || 'title';
}

function toggleSetting(key, el) {
  el.classList.toggle('on'); userSettings[key] = el.classList.contains('on');
  if (key === 'pushNotif' && userSettings[key]) Notification.requestPermission();
}

function changeTheme(t) {
  const b = document.body;
  const ALL_THEMES = ['darker','blue','aero','neon','ocean','sunset','lavender','forest'];
  if (t && PREMIUM_THEMES.includes(t) && !isPremiumActive(currentUserData.premium, currentUserData.premiumExpiresAt)) {
    toast('✦ Эта тема доступна только с Premium');
    return;
  }
  b.classList.remove(...ALL_THEMES.map(x => 'theme-' + x));
  if (t && t !== 'dark') b.classList.add('theme-' + t);
  document.querySelectorAll('.theme-card').forEach(c => c.classList.toggle('active', c.dataset.theme === (t || 'dark')));
  userSettings.theme = t;
  // применяем сразу и сохраняем в фоне, чтобы тема не сбрасывалась без нажатия "Сохранить"
  if (currentUser) db.ref('users/' + currentUser.uid + '/settings/theme').set(t || 'dark').catch(() => {});
}

// ─── Размер шрифта / пузырей: применяются через CSS-переменную и
// класс на <body>, поэтому действуют и на уже открытые, и на новые
// сообщения — и сохраняются между перезагрузками (раньше терялись,
// т.к. красились только текущие .msg-bubble инлайн-стилем).
function changeFontSize(size) {
  document.body.style.setProperty('--msg-font-size', size + 'px');
  userSettings.fontSize = parseInt(size);
  if (currentUser) db.ref('users/' + currentUser.uid + '/settings/fontSize').set(userSettings.fontSize).catch(() => {});
}
function changeBubbleSize(size) {
  document.body.classList.remove('bubble-s', 'bubble-l', 'bubble-xl');
  if (size && size !== 'm') document.body.classList.add('bubble-' + size);
  userSettings.bubbleSize = size;
  if (currentUser) db.ref('users/' + currentUser.uid + '/settings/bubbleSize').set(size).catch(() => {});
}
function applyAppearanceSettings() {
  const s = userSettings || {};
  document.body.style.setProperty('--msg-font-size', (s.fontSize || 14) + 'px');
  document.body.classList.remove('bubble-s', 'bubble-l', 'bubble-xl');
  if (s.bubbleSize && s.bubbleSize !== 'm') document.body.classList.add('bubble-' + s.bubbleSize);
}

// ─── PREMIUM ─────────────────────────────────────────────────
// Раньше эта кнопка просто мгновенно выдавала Premium бесплатно — это
// было демо-заглушкой без реальной оплаты. Теперь она отправляет
// пользователя на настоящую оплату через LiqPay (гривна, любая карта
// мира), а сам премиум включает уже сервер после подтверждения оплаты
// (см. liqpay-payment-server/README.md) — так это нельзя обойти вызовом
// функции из консоли браузера.
async function buyPremium() {
  if (!currentUser) return;
  if (!LIQPAY_SERVER_URL) {
    toast('⚠️ Оплата ещё не настроена администратором — см. liqpay-payment-server/README.md', 6000);
    return;
  }
  const btn = document.getElementById('buy-premium-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Открываем оплату...'; }
  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch(LIQPAY_SERVER_URL + '/createPayment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
      body: JSON.stringify({ returnUrl: window.location.origin + window.location.pathname })
    });
    const result = await res.json();
    if (!res.ok || !result.data) throw new Error(result.error || 'Сервер оплаты не ответил');
    // Обычная HTML-форма-редирект на checkout.liqpay.ua — так требует API LiqPay
    const form = document.createElement('form');
    form.method = 'POST'; form.action = result.checkoutUrl; form.target = '_self';
    form.innerHTML = `<input type="hidden" name="data" value="${escAttr(result.data)}">
      <input type="hidden" name="signature" value="${escAttr(result.signature)}">`;
    document.body.appendChild(form);
    form.submit();
  } catch (e) {
    toast('⚠️ Не удалось начать оплату: ' + (e.message || e.code), 5000);
    if (btn) { btn.disabled = false; btn.textContent = `✦ Купить Premium — ${PREMIUM_PRICE_UAH} ₴`; }
  }
}
function changeBadgePref(val) {
  currentUserData.badgePref = val;
  if (currentUser) db.ref('users/' + currentUser.uid + '/badgePref').set(val).catch(() => {});
  document.getElementById('my-name-el').innerHTML = escHtml(currentUserData.username) + roleBadgesHtml(currentUserData);
}

async function saveSettings() {
  await db.ref('users/' + currentUser.uid + '/settings').set(userSettings);
  currentUserData.settings = userSettings; closeModal('settings-modal'); toast('✅ Настройки сохранены');
}
function saveCloudinarySettings() {
  cloudinaryName   = document.getElementById('cloudinary-name').value.trim();
  cloudinaryPreset = document.getElementById('cloudinary-preset').value.trim();
  localStorage.setItem('cloudinary_name',   cloudinaryName);
  localStorage.setItem('cloudinary_preset', cloudinaryPreset);
  toast('✅ Настройки Cloudinary сохранены');
}
