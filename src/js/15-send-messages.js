// ============================================================
//  SEND MESSAGES
// ============================================================
const STICKER_PACK = ['😂','😍','🔥','👍','🎉','😢','😱','🤔','💯','🙌','😴','🤝','❤️','🎂','🐱','🚀','👋','😎','🥳','🤡','💀','🙈','🍕','⚡'];

// Обычные unicode-эмодзи для вкладки "Эмодзи" — вставляются прямо в текст, как в Telegram
const EMOJI_LIST = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','🥰','😗','😙','😚','🙂','🤗',
  '🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜',
  '🤪','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','☹️','🙁','😖','😞','😟','😤','😢','😭','😦','😧',
  '😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','😡','😠','🤬','😷','🤒','🤕','🤢','🤮','🥴',
  '🥳','🥺','🤠','🤡','🤥','🤫','🤭','🧐','🤓','😈','👿','👹','👺','💀','👻','👽','🤖','😺','😸','😹',
  '😻','😼','😽','🙀','😿','😾','👋','🤚','🖐️','✋','🖖','👌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉',
  '👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🙏','✍️','💅','🤳','💪','🦾',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️',
  '✝️','🔥','⭐','🌟','✨','⚡','💥','💫','💦','💨','🎉','🎊','🎈','🎁','🏆','🥇','🎯','💯','✅','❌',
  '❓','❗','💤','🍕','🍔','🍟','🍗','🍩','🍰','🎂','🍺','🍻','☕','🍎','🍉','🍓','🍇','🚀','🚗','✈️'
];

function stickerButtonHtml() { return `<button type="button" class="attach-btn sticker-btn" onclick="toggleStickerPicker(event)" title="Эмодзи и стикеры">😊</button>`; }
function stickerPickerHtml() { return `<div class="sticker-picker" id="sticker-picker" onclick="event.stopPropagation()"></div>`; }
function pendingStickersHtml() { return `<div class="pending-stickers" id="pending-stickers"></div>`; }

// ─── Выбранные, но ещё не отправленные стикеры ───────────────
// Клик по стикеру больше не отправляет сообщение мгновенно — стикер
// падает в эту очередь, показывается плашкой над полем ввода, и
// уходит вместе с текстом только по нажатию "отправить".
let pendingStickers = [];
function renderPendingStickers() {
  const el = document.getElementById('pending-stickers'); if (!el) return;
  if (!pendingStickers.length) { el.classList.remove('show'); el.innerHTML = ''; return; }
  el.classList.add('show');
  el.innerHTML = pendingStickers.map((s, i) => `<div class="ps-item">
      ${s.type === 'image' ? `<img src="${s.value}" alt="">` : escHtml(s.value)}
      <span class="ps-rm" onclick="removePendingSticker(${i})">×</span></div>`).join('');
}
function addPendingSticker(type, value) {
  if (pendingStickers.length >= 10) { toast('Максимум 10 стикеров за раз'); return; }
  pendingStickers.push({ type, value });
  renderPendingStickers();
}
function removePendingSticker(i) { pendingStickers.splice(i, 1); renderPendingStickers(); }
function clearPendingStickers() { pendingStickers = []; renderPendingStickers(); }

// ─── Свои стикер-паки ─────────────────────────────────────────
// Хранятся в users/{uid}/stickerPacks/{packId} = { name, stickers: { id: url } }
let myStickerPacks = null;
let activeStickerTab = localStorage.getItem('activeStickerTab') || 'default'; // 'default' | id пака
async function loadMyStickerPacks() {
  const snap = await db.ref('users/' + currentUser.uid + '/stickerPacks').once('value');
  myStickerPacks = snap.val() || {};
}
function requirePremiumForCreation() {
  if (isPremiumActive(currentUserData.premium, currentUserData.premiumExpiresAt)) return true;
  showPremiumRequiredModal();
  return false;
}
function showPremiumRequiredModal() {
  hideStickerPicker();
  if (typeof showConfirmModal === 'function') {
    // fallback not used, custom modal below
  }
  let m = document.getElementById('premium-required-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'premium-required-modal';
    m.className = 'modal-overlay';
    m.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100000';
    m.innerHTML = `<div class="modal" style="max-width:320px;text-align:center">
        <h3>✦ Приобретите Premium</h3>
        <p style="font-size:13px;color:var(--text2);margin:8px 0 16px">Создавать и использовать свои эмодзи могут только пользователи с Premium. Стикеры доступны всем бесплатно.</p>
        <div class="modal-actions" style="justify-content:center">
          <button class="btn-cancel" onclick="document.getElementById('premium-required-modal').remove()">Отмена</button>
          <button class="ua-btn verify" onclick="document.getElementById('premium-required-modal').remove(); goToPremiumSettings()">✦ Перейти в настройки</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    m.onclick = (e) => { if (e.target === m) m.remove(); };
  }
}
function goToPremiumSettings() {
  if (typeof openSettings === 'function') openSettings();
  setTimeout(() => {
    document.getElementById('premium-buy-btn')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 200);
}
async function createStickerPack() {
  // Стикеры — полностью бесплатная функция: и использование, и создание своих паков.
  const name = prompt('Название нового стикер-пака:'); if (!name || !name.trim()) return;
  const ref = db.ref('users/' + currentUser.uid + '/stickerPacks').push();
  await ref.set({ name: name.trim(), stickers: {} });
  await loadMyStickerPacks();
  activeStickerTab = ref.key;
  renderStickerPicker();
}
async function deleteStickerPack(packId, e) {
  e?.stopPropagation();
  if (!confirm('Удалить этот стикер-пак?')) return;
  await db.ref('users/' + currentUser.uid + '/stickerPacks/' + packId).remove();
  await loadMyStickerPacks();
  activeStickerTab = 'default';
  renderStickerPicker();
}
function addStickerToPackPrompt(packId) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
  input.onchange = () => {
    const file = input.files[0]; if (!file) return;
    openImageCropper(file, async (blob) => {
      document.getElementById('upload-progress')?.classList.add('show');
      try {
        const url = await uploadMedia(blob);
        await db.ref('users/' + currentUser.uid + '/stickerPacks/' + packId + '/stickers').push({ url });
        await loadMyStickerPacks();
        renderStickerPicker();
      } catch (e) { toast('Ошибка загрузки: ' + e.message); }
      document.getElementById('upload-progress')?.classList.remove('show');
    });
  };
  document.body.appendChild(input); input.click();
  setTimeout(() => input.remove(), 5000);
}
async function deleteStickerFromPack(packId, stickerId, e) {
  e?.stopPropagation();
  await db.ref('users/' + currentUser.uid + '/stickerPacks/' + packId + '/stickers/' + stickerId).remove();
  await loadMyStickerPacks();
  renderStickerPicker();
}

// ─── Свои эмодзи-наборы (картинка/GIF вместо обычного unicode-эмодзи) ──
// Хранятся в users/{uid}/emojiPacks/{packId} = { name, items: { id: {url, gif} } }
let myEmojiPacks = null;
let activeEmojiTab = localStorage.getItem('activeEmojiTab') || 'default';
async function loadMyEmojiPacks() {
  const snap = await db.ref('users/' + currentUser.uid + '/emojiPacks').once('value');
  myEmojiPacks = snap.val() || {};
}
async function createEmojiPack() {
  if (!requirePremiumForCreation()) return;
  const name = prompt('Название набора своих эмодзи:'); if (!name || !name.trim()) return;
  const ref = db.ref('users/' + currentUser.uid + '/emojiPacks').push();
  await ref.set({ name: name.trim(), items: {} });
  await loadMyEmojiPacks();
  activeEmojiTab = ref.key;
  renderPicker();
}
async function deleteEmojiPack(packId, e) {
  e?.stopPropagation();
  if (!confirm('Удалить этот набор эмодзи?')) return;
  await db.ref('users/' + currentUser.uid + '/emojiPacks/' + packId).remove();
  await loadMyEmojiPacks();
  activeEmojiTab = 'default';
  renderPicker();
}
function addEmojiToPackPrompt(packId) {
  if (!requirePremiumForCreation()) return;
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
  input.onchange = () => {
    const file = input.files[0]; if (!file) return;
    const isGif = file.type === 'image/gif';
    const doUpload = async (blob) => {
      document.getElementById('upload-progress')?.classList.add('show');
      try {
        const url = await uploadMedia(blob);
        await db.ref('users/' + currentUser.uid + '/emojiPacks/' + packId + '/items').push({ url, gif: isGif });
        await loadMyEmojiPacks();
        renderPicker();
      } catch (e) { toast('Ошибка загрузки: ' + e.message); }
      document.getElementById('upload-progress')?.classList.remove('show');
    };
    // GIF не пропускаем через кроппер, чтобы не потерять анимацию — грузим как есть
    if (isGif) doUpload(file); else openImageCropper(file, doUpload);
  };
  document.body.appendChild(input); input.click();
  setTimeout(() => input.remove(), 5000);
}
async function deleteEmojiFromPack(packId, itemId, e) {
  e?.stopPropagation();
  await db.ref('users/' + currentUser.uid + '/emojiPacks/' + packId + '/items/' + itemId).remove();
  await loadMyEmojiPacks();
  renderPicker();
}
function switchEmojiTab(tab) { activeEmojiTab = tab; try { localStorage.setItem('activeEmojiTab', tab); } catch (e) {} renderPicker(); }

// вставляет своё эмодзи (картинку/GIF) токеном прямо в текст, между словами —
// как обычный эмодзи, а не отдельным вложением
function insertCustomEmojiAtCursor(url) {
  // Использование кастомных (не стандартных) эмодзи — тоже premium-фича,
  // не только их создание. Иначе истёкший premium не мешает пользоваться
  // уже загруженными эмодзи.
  if (!isPremiumActive(currentUserData.premium, currentUserData.premiumExpiresAt)) {
    showPremiumRequiredModal();
    return;
  }
  insertEmojiAtCursor(`{{emoji:${encodeURIComponent(url)}}}`);
}

// вставляет обычный emoji в позицию курсора в поле ввода (как в Telegram)
function insertEmojiAtCursor(emoji) {
  const inp = document.getElementById('msg-input'); if (!inp) return;
  const start = inp.selectionStart ?? inp.value.length;
  const end = inp.selectionEnd ?? inp.value.length;
  inp.value = inp.value.slice(0, start) + emoji + inp.value.slice(end);
  const pos = start + emoji.length;
  inp.focus();
  try { inp.setSelectionRange(pos, pos); } catch (e) {}
  inp.dispatchEvent(new Event('input', { bubbles: true }));
}

// ─── Главный пикер: вкладки Эмодзи / Стикеры / GIF (скоро) ────────────
let pickerMainTab = 'emoji'; // 'emoji' | 'stickers' | 'gif'
function switchPickerMainTab(tab) {
  if (tab === 'gif') { toast('🎬 GIF скоро появятся'); return; }
  pickerMainTab = tab;
  renderPicker();
}

async function toggleStickerPicker(e) {
  e?.stopPropagation();
  const p = document.getElementById('sticker-picker'); if (!p) return;
  if (p.classList.contains('open')) { hideStickerPicker(); return; }
  if (myStickerPacks === null) await loadMyStickerPacks();
  if (myEmojiPacks === null) await loadMyEmojiPacks();
  renderPicker();
  p.classList.add('open');
}
function hideStickerPicker() { document.getElementById('sticker-picker')?.classList.remove('open'); }

// ───── Клик по стикеру в чате → превью + добавить себе в стикер-пак ─────
async function openStickerPreview(type, value) {
  let m = document.getElementById('sticker-preview-modal');
  if (m) m.remove();
  m = document.createElement('div');
  m.id = 'sticker-preview-modal';
  m.className = 'modal-overlay';
  m.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100000';
  const previewHtml = type === 'image'
    ? `<img src="${escAttr(value)}" style="width:160px;height:160px;object-fit:contain;border-radius:14px;background:var(--surface3)" alt="">`
    : `<div style="font-size:110px;line-height:1">${escHtml(value)}</div>`;
  m.innerHTML = `<div class="modal" style="max-width:300px;text-align:center">
      <h3>Стикер</h3>
      <div style="margin:14px 0">${previewHtml}</div>
      <div class="modal-actions" style="justify-content:center;flex-wrap:wrap;gap:8px">
        <button class="btn-cancel" onclick="document.getElementById('sticker-preview-modal').remove()">Закрыть</button>
        <button class="ua-btn verify" onclick='addStickerToOwnPack("${type}", ${JSON.stringify(value)})'>➕ Добавить себе</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
}

// Клик по своему/чужому кастомному эмодзи (картинка/GIF из набора эмодзи, вставленному в текст) →
// такое же окно просмотра, но сохранение идёт в emojiPacks, а не в stickerPacks
function openEmojiPreview(url) {
  let m = document.getElementById('sticker-preview-modal');
  if (m) m.remove();
  m = document.createElement('div');
  m.id = 'sticker-preview-modal';
  m.className = 'modal-overlay';
  m.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100000';
  m.innerHTML = `<div class="modal" style="max-width:300px;text-align:center">
      <h3>Эмодзи</h3>
      <div style="margin:14px 0"><img src="${escAttr(url)}" style="width:140px;height:140px;object-fit:contain;border-radius:14px;background:var(--surface3)" alt=""></div>
      <div class="modal-actions" style="justify-content:center;flex-wrap:wrap;gap:8px">
        <button class="btn-cancel" onclick="document.getElementById('sticker-preview-modal').remove()">Закрыть</button>
        <button class="ua-btn verify" onclick='addEmojiToOwnPack(${JSON.stringify(url)})'>➕ Добавить себе</button>
      </div>
    </div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m) m.remove(); };
}

async function addStickerToOwnPack(type, value) {
  try {
    if (myStickerPacks === null) await loadMyStickerPacks();
    const packs = myStickerPacks || {};
    const entries = Object.entries(packs);
    let packId;
    if (!entries.length) {
      const name = prompt('У вас пока нет своих стикер-паков. Название нового пака:');
      if (!name || !name.trim()) return;
      const ref = db.ref('users/' + currentUser.uid + '/stickerPacks').push();
      await ref.set({ name: name.trim(), stickers: {} });
      packId = ref.key;
    } else if (entries.length === 1) {
      packId = entries[0][0];
    } else {
      const list = entries.map(([id, pk], i) => `${i + 1}. ${pk.name}`).join('\n');
      const choice = prompt('В какой пак добавить стикер?\n' + list + '\n\nВведите номер:');
      const idx = parseInt(choice, 10) - 1;
      if (isNaN(idx) || !entries[idx]) return;
      packId = entries[idx][0];
    }
    const payload = type === 'image' ? { url: value } : { emoji: value };
    const stickerRef = await db.ref('users/' + currentUser.uid + '/stickerPacks/' + packId + '/stickers').push(payload);
    // проверяем, что запись реально попала в базу, а не только в кэш
    const verifySnap = await db.ref('users/' + currentUser.uid + '/stickerPacks/' + packId + '/stickers/' + stickerRef.key).once('value');
    if (!verifySnap.exists()) throw new Error('Не удалось сохранить в базу данных');
    await loadMyStickerPacks();
    activeStickerTab = packId;
    try { localStorage.setItem('activeStickerTab', packId); } catch (e) {}
    document.getElementById('sticker-preview-modal')?.remove();
    toast('✅ Стикер сохранён в пак «' + (packs[packId]?.name || myStickerPacks[packId]?.name || '') + '»');
  } catch (e) {
    console.error('addStickerToOwnPack error:', e);
    toast('⚠️ Не удалось сохранить стикер: ' + (e.message || e.code || 'ошибка'));
  }
}

async function addEmojiToOwnPack(url) {
  if (!requirePremiumForCreation()) return;
  try {
    if (myEmojiPacks === null) await loadMyEmojiPacks();
    const packs = myEmojiPacks || {};
    const entries = Object.entries(packs);
    let packId;
    if (!entries.length) {
      const name = prompt('У вас пока нет своих наборов эмодзи. Название нового набора:');
      if (!name || !name.trim()) return;
      const ref = db.ref('users/' + currentUser.uid + '/emojiPacks').push();
      await ref.set({ name: name.trim(), items: {} });
      packId = ref.key;
    } else if (entries.length === 1) {
      packId = entries[0][0];
    } else {
      const list = entries.map(([id, pk], i) => `${i + 1}. ${pk.name}`).join('\n');
      const choice = prompt('В какой набор добавить эмодзи?\n' + list + '\n\nВведите номер:');
      const idx = parseInt(choice, 10) - 1;
      if (isNaN(idx) || !entries[idx]) return;
      packId = entries[idx][0];
    }
    const isGif = /\.gif(\?|$)/i.test(url);
    const itemRef = await db.ref('users/' + currentUser.uid + '/emojiPacks/' + packId + '/items').push({ url, gif: isGif });
    const verifySnap = await db.ref('users/' + currentUser.uid + '/emojiPacks/' + packId + '/items/' + itemRef.key).once('value');
    if (!verifySnap.exists()) throw new Error('Не удалось сохранить в базу данных');
    await loadMyEmojiPacks();
    activeEmojiTab = packId;
    try { localStorage.setItem('activeEmojiTab', packId); } catch (e) {}
    document.getElementById('sticker-preview-modal')?.remove();
    toast('✅ Эмодзи сохранено в набор «' + (myEmojiPacks[packId]?.name || '') + '»');
  } catch (e) {
    console.error('addEmojiToOwnPack error:', e);
    toast('⚠️ Не удалось сохранить эмодзи: ' + (e.message || e.code || 'ошибка'));
  }
}

function switchStickerTab(tab) { activeStickerTab = tab; try { localStorage.setItem('activeStickerTab', tab); } catch (e) {} renderPicker(); }

function renderPicker() {
  const p = document.getElementById('sticker-picker'); if (!p) return;
  const mainTabs = `<div class="sp-maintabs">
      <div class="sp-maintab ${pickerMainTab === 'emoji' ? 'active' : ''}" onclick="switchPickerMainTab('emoji')">😊 Эмодзи</div>
      <div class="sp-maintab ${pickerMainTab === 'stickers' ? 'active' : ''}" onclick="switchPickerMainTab('stickers')">🖼 Стикеры</div>
      <div class="sp-maintab disabled" onclick="switchPickerMainTab('gif')" title="Скоро">🎬 GIF</div>
    </div>`;
  p.innerHTML = mainTabs + (pickerMainTab === 'stickers' ? stickersTabHtml() : emojiTabHtml());
}

// Стикеры — теперь бесплатны для всех
function stickersTabHtml() {
  const packs = myStickerPacks || {};
  const tabs = [`<div class="sp-tab ${activeStickerTab === 'default' ? 'active' : ''}" onclick="switchStickerTab('default')">Обычные</div>`]
    .concat(Object.entries(packs).map(([id, pk]) =>
      `<div class="sp-tab ${activeStickerTab === id ? 'active' : ''}" onclick="switchStickerTab('${id}')">${escHtml(pk.name)}</div>`))
    .concat([`<div class="sp-tab sp-tab-add" onclick="createStickerPack()">+ Пак</div>`]).join('');

  let gridHtml = '';
  if (activeStickerTab === 'default') {
    gridHtml = STICKER_PACK.map(em => `<div class="sp-item" onclick="addPendingSticker('emoji','${em}')">${em}</div>`).join('');
  } else {
    const pack = packs[activeStickerTab];
    if (!pack) { activeStickerTab = 'default'; return stickersTabHtml(); }
    const stickers = pack.stickers || {};
    gridHtml = Object.entries(stickers).map(([sid, s]) =>
      s.url
        ? `<div class="sp-item" onclick="addPendingSticker('image','${escAttr(s.url)}')">
        <img src="${s.url}" alt="">
        <span class="sp-del" onclick="deleteStickerFromPack('${activeStickerTab}','${sid}',event)">×</span>
      </div>`
        : `<div class="sp-item" onclick="addPendingSticker('emoji','${escAttr(s.emoji)}')">
        ${escHtml(s.emoji)}
        <span class="sp-del" onclick="deleteStickerFromPack('${activeStickerTab}','${sid}',event)">×</span>
      </div>`).join('')
      + `<div class="sp-item sp-item-add" onclick="addStickerToPackPrompt('${activeStickerTab}')">+</div>`
      + `<div class="sp-item sp-item-add" title="Удалить пак" onclick="deleteStickerPack('${activeStickerTab}',event)">🗑</div>`;
  }
  return `<div class="sp-tabs">${tabs}</div><div class="sp-grid">${gridHtml || '<div class="sp-locked" style="grid-column:1/-1">Пусто. Нажмите + чтобы добавить свой стикер</div>'}</div>`;
}

// Эмодзи — обычные вставляются в текст; свои (картинка/GIF) отправляются как вложение
function emojiTabHtml() {
  const packs = myEmojiPacks || {};
  const tabs = [`<div class="sp-tab ${activeEmojiTab === 'default' ? 'active' : ''}" onclick="switchEmojiTab('default')">Обычные</div>`]
    .concat(Object.entries(packs).map(([id, pk]) =>
      `<div class="sp-tab ${activeEmojiTab === id ? 'active' : ''}" onclick="switchEmojiTab('${id}')">${escHtml(pk.name)}</div>`))
    .concat([`<div class="sp-tab sp-tab-add" onclick="createEmojiPack()">${isPremiumActive(currentUserData.premium, currentUserData.premiumExpiresAt) ? '' : '✦ '}+ Свои</div>`]).join('');

  let gridHtml = '';
  const gridClass = activeEmojiTab === 'default' ? 'sp-grid emoji-grid' : 'sp-grid';
  if (activeEmojiTab === 'default') {
    gridHtml = EMOJI_LIST.map(em => `<div class="sp-item emoji-item" onclick="insertEmojiAtCursor('${em}')">${em}</div>`).join('');
  } else {
    const pack = packs[activeEmojiTab];
    if (!pack) { activeEmojiTab = 'default'; return emojiTabHtml(); }
    const items = pack.items || {};
    const hasPremium = isPremiumActive(currentUserData.premium, currentUserData.premiumExpiresAt);
    gridHtml = Object.entries(items).map(([iid, it]) =>
      `<div class="sp-item" onclick="${hasPremium ? `insertCustomEmojiAtCursor('${escAttr(it.url)}')` : `showPremiumRequiredModal()`}">
        <img src="${it.url}" alt="" ${hasPremium ? '' : 'style="opacity:.5"'}>
        ${hasPremium ? `<span class="sp-del" onclick="deleteEmojiFromPack('${activeEmojiTab}','${iid}',event)">×</span>` : ''}
      </div>`).join('')
      + `<div class="sp-item sp-item-add" onclick="addEmojiToPackPrompt('${activeEmojiTab}')" title="Добавить картинку или GIF">+</div>`
      + `<div class="sp-item sp-item-add" title="Удалить набор" onclick="deleteEmojiPack('${activeEmojiTab}',event)">🗑</div>`;
  }
  return `<div class="sp-tabs">${tabs}</div><div class="${gridClass}">${gridHtml || '<div class="sp-locked" style="grid-column:1/-1">Пусто. Нажмите + чтобы добавить картинку или GIF</div>'}</div>`;
}


async function sendMsg(chatId) {
  const inp = document.getElementById('msg-input'); if (!inp) return;
  const text = inp.value.trim();
  try {
    if (editingMsgId) {
      await db.ref(getMsgPath(editingChatId, editingMsgId)).update({ text, edited: true });
      cancelEdit(); inp.value = ''; inp.style.height = 'auto'; stopTyping(); return;
    }
    if (!text && !pendingStickers.length) return;
    const stickers = pendingStickers.length ? [...pendingStickers] : null;
    inp.value = ''; inp.style.height = 'auto'; stopTyping(); clearPendingStickers(); hideStickerPicker(); saveDraft(chatId, '');
    const isChannelAdmin = currentChatType === 'channel' && currentChatData?.admins?.[currentUser.uid];
    const msgData = {
      text, senderUid: currentUser.uid, senderName: currentUserData.username,
      senderAvatar: currentUserData.avatarUrl || '',
      senderIsAdmin: currentUserData.isAdmin === true,
      senderIsSuperAdmin: isSuperAdmin(currentUserData),
      senderChannelAdmin: isChannelAdmin === true,
      senderVerified: currentUserData.verified === true,
      senderPremium: isPremiumActive(currentUserData.premium, currentUserData.premiumExpiresAt),
      senderBadgePref: currentUserData.badgePref || 'title',
      timestamp: Date.now()
    };
    if (stickers) msgData.stickers = stickers;
    if (replyToMsg) { msgData.replyTo = { id: replyToMsg.id, text: replyToMsg.text, senderName: replyToMsg.senderName }; cancelReply(); }
    const mentions = (currentChatType === 'group' || currentChatType === 'channel') ? extractMentions(text) : null;
    if (mentions) msgData.mentions = mentions;
    const base = getMsgsBasePath(chatId);
    if (!base) { toast('Ошибка: неизвестный чат'); return; }
    await db.ref(base).push(msgData);
    if (mentions) {
      Object.keys(mentions).forEach(uid => {
        addNotification(uid, { type: currentChatType, text: `${currentUserData.username} упомянул(а) вас: ${text.slice(0, 50)}`, from: currentUserData.username, chatId });
      });
    }
    const lastMsgLabel = stripInlineEmojiTokens(text) || (stickers ? '🌟 Стикер' : '');
    if (currentChatType === 'dm') {
      const otherUid = chatId.split('_').find(p => p !== currentUser.uid);
      await db.ref('dm_meta/' + chatId).update({ lastMsg: lastMsgLabel, lastTs: Date.now() });
      ensureRecipientHasChat(chatId, otherUid);
      addNotification(otherUid, { type: 'dm', text: `${currentUserData.username}: ${lastMsgLabel.slice(0, 50)}`, from: currentUserData.username, chatId });
    }
    if (currentChatType === 'ticket') {
      await db.ref('tickets/' + chatId + '/updatedAt').set(Date.now());
    }
  } catch (e) {
    console.error('sendMsg error:', e);
    toast('⚠️ Не отправлено: ' + (e.message || e.code || 'ошибка'));
  }
}

async function sendImage(input, chatId) {
  const file = input.files[0]; if (!file) return;
  document.getElementById('upload-progress').classList.add('show');
  try {
    const url = await uploadMedia(file);
    const isChannelAdmin = currentChatType === 'channel' && currentChatData?.admins?.[currentUser.uid];
    const msgData = {
      text: '', imageUrl: url, senderUid: currentUser.uid, senderName: currentUserData.username,
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
    await db.ref(getMsgsBasePath(chatId)).push(msgData);
    if (currentChatType === 'dm') {
      await db.ref('dm_meta/' + chatId).update({ lastMsg: '📷 Фото', lastTs: Date.now() });
      ensureRecipientHasChat(chatId, chatId.split('_').find(p => p !== currentUser.uid));
    }
  } catch (e) { toast('Ошибка загрузки: ' + e.message); }
  document.getElementById('upload-progress').classList.remove('show');
}

// ─── VOICE RECORD ────────────────────────────────────────────
async function startVoiceRecord() {
  if (isRecording) { stopVoiceRecord(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
    mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => { if (e.data && e.data.size) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      if (!audioChunks.length) { toast('Пустая запись'); return; }
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      await sendVoiceMessage(blob);
    };
    mediaRecorder.start(250); isRecording = true;
    document.getElementById('voice-record-btn')?.classList.add('recording');
    toast('🎙️ Запись... нажмите снова чтобы остановить');
    voiceStartTime = Date.now();
  } catch (e) { toast('Нет доступа к микрофону'); }
}
function stopVoiceRecord() {
  if (!isRecording || !mediaRecorder) return;
  mediaRecorder.stop(); isRecording = false;
  document.getElementById('voice-record-btn')?.classList.remove('recording');
}
async function sendVoiceMessage(blob) {
  if (!currentChatId || currentChatId === 'official' || currentChatId === 'support') {
    toast('Голосовые недоступны в этом чате'); return;
  }
  document.getElementById('upload-progress').classList.add('show');
  document.getElementById('upload-text').textContent = 'Отправка голосового...';
  try {
    const dur = Math.max(1, Math.round((Date.now() - voiceStartTime) / 1000));
    let voiceUrl = null;
    // 1) Try Firebase Storage
    try {
      const ref = storage.ref('voice/' + currentUser.uid + '_' + Date.now() + '.webm');
      await ref.put(blob, { contentType: 'audio/webm' });
      voiceUrl = await ref.getDownloadURL();
    } catch (storageErr) {
      console.warn('Storage voice failed, fallback dataURL', storageErr);
      // 2) Fallback: embed as data URL if small enough (< 450KB)
      if (blob.size > 450000) throw new Error('Файл слишком большой и Storage недоступен. Включите Firebase Storage.');
      voiceUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    }
    const msgData = {
      text: '', voiceUrl, voiceDuration: dur,
      senderUid: currentUser.uid, senderName: currentUserData.username,
      senderAvatar: currentUserData.avatarUrl || '',
      senderIsAdmin: currentUserData.isAdmin === true,
      senderIsSuperAdmin: isSuperAdmin(currentUserData),
      senderVerified: currentUserData.verified === true,
      senderPremium: isPremiumActive(currentUserData.premium, currentUserData.premiumExpiresAt),
      senderBadgePref: currentUserData.badgePref || 'title',
      timestamp: Date.now()
    };
    const base = getMsgsBasePath(currentChatId);
    if (!base) throw new Error('Неизвестный чат');
    await db.ref(base).push(msgData);
    if (currentChatType === 'dm') {
      await db.ref('dm_meta/' + currentChatId).update({ lastMsg: '🎙️ Голосовое', lastTs: Date.now() });
      ensureRecipientHasChat(currentChatId, currentChatId.split('_').find(p => p !== currentUser.uid));
    }
    toast('✅ Голосовое отправлено');
  } catch (e) {
    console.error(e);
    toast('Ошибка голосового: ' + (e.message || e.code || 'неизвестно'));
  }
  document.getElementById('upload-progress').classList.remove('show');
  document.getElementById('upload-text').textContent = 'Загрузка...';
}


