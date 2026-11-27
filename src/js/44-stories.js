// ============================================================
//  ChaTEX — истории (как в Telegram)
//  Фото на 24 часа. Лента над списком чатов, просмотр на весь экран,
//  переход по тапу влево/вправо, автопереход через 5 секунд.
//  Хранение: stories_feed/{id} = {uid, url, ts}. Старые записи автора удаляются.
// ============================================================
(function () {
  'use strict';

  const DAY = 24 * 60 * 60 * 1000;
  const SLIDE_MS = 5000;
  const MAX_BYTES = 10 * 1024 * 1024;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = ['#3d8bff', '#ff5a5a', '#34c759', '#ff9f0a', '#af52de', '#32ade6', '#ff2d55', '#5e5ce6'];
  const colorOf = uid => { let h = 0; for (const ch of String(uid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };

  let started = false;
  let groups = [];            // [{uid, items:[{id,url,ts}]}] — мои первыми, дальше по свежести
  const names = {};           // uid → username (кэш)
  let viewGroups = [], gi = 0, si = 0, timer = null, paused = false, elapsed = 0, lastTick = 0;

  // ---------- стили (подключаются из JS, чтобы не трогать сборку CSS) ----------
  function injectStyle() {
    if (document.getElementById('tx-st-style')) return;
    const s = document.createElement('style');
    s.id = 'tx-st-style';
    s.textContent = `
#tx-stories{display:flex;gap:12px;overflow-x:auto;padding:10px 12px 8px;border-bottom:1px solid var(--border);scrollbar-width:none}
#tx-stories::-webkit-scrollbar{display:none}
#tx-stories:empty{display:none}
.tx-st{flex:0 0 auto;width:64px;display:flex;flex-direction:column;align-items:center;gap:4px;background:none;border:0;padding:0;cursor:pointer;color:var(--text2);font:inherit;font-size:11px}
.tx-st-ring{position:relative;width:56px;height:56px;border-radius:50%;padding:2.5px;background:linear-gradient(135deg,#3d8bff,#00e676)}
.tx-st-ring.seen{background:var(--border)}
.tx-st-ring.none{background:var(--border)}
.tx-st-av{width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:20px;border:2px solid var(--surface,#14141c);box-sizing:border-box;overflow:hidden}
.tx-st-av img{width:100%;height:100%;object-fit:cover}
.tx-st-plus{position:absolute;right:-2px;bottom:-2px;width:20px;height:20px;border-radius:50%;background:#3d8bff;color:#fff;font-size:15px;line-height:19px;text-align:center;border:2px solid var(--surface,#14141c);box-sizing:border-box}
.tx-st-name{max-width:64px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#tx-story{position:fixed;inset:0;z-index:99999;background:#000;display:none;flex-direction:column;user-select:none;-webkit-user-select:none}
#tx-story.open{display:flex}
#tx-story .tx-sv-bars{position:absolute;top:calc(env(safe-area-inset-top) + 8px);left:10px;right:10px;display:flex;gap:4px;z-index:3}
#tx-story .tx-sv-bar{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.3);overflow:hidden}
#tx-story .tx-sv-bar i{display:block;height:100%;width:0;background:#fff}
#tx-story .tx-sv-head{position:absolute;top:calc(env(safe-area-inset-top) + 20px);left:10px;right:10px;display:flex;align-items:center;gap:10px;z-index:3;color:#fff}
#tx-story .tx-sv-who{flex:1;min-width:0;font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 4px rgba(0,0,0,.6)}
#tx-story .tx-sv-time{font-size:12px;opacity:.75;text-shadow:0 1px 4px rgba(0,0,0,.6)}
#tx-story .tx-sv-x,#tx-story .tx-sv-del{width:36px;height:36px;border-radius:50%;border:0;background:rgba(0,0,0,.35);color:#fff;font-size:18px;cursor:pointer;flex:0 0 auto}
#tx-story .tx-sv-img{flex:1;display:flex;align-items:center;justify-content:center;min-height:0}
#tx-story .tx-sv-img img{max-width:100%;max-height:100%;object-fit:contain}
#tx-story .tx-sv-zone{position:absolute;top:0;bottom:0;z-index:2}
#tx-story .tx-sv-zone.l{left:0;width:35%}
#tx-story .tx-sv-zone.r{right:0;width:65%}
`;
    document.head.appendChild(s);
  }

  // ---------- данные ----------
  function nameOf(uid) {
    if (names[uid] !== undefined) return names[uid];
    names[uid] = '';
    try {
      db.ref('users/' + uid + '/username').once('value').then(s => { names[uid] = s.val() || ''; render(); });
    } catch (_) {}
    return '';
  }

  function group(list) {
    const me = currentUser && currentUser.uid;
    const map = new Map();
    list.forEach(it => {
      if (!map.has(it.uid)) map.set(it.uid, { uid: it.uid, items: [] });
      map.get(it.uid).items.push(it);
    });
    const arr = Array.from(map.values());
    arr.forEach(g => g.items.sort((a, b) => a.ts - b.ts));
    arr.sort((a, b) => b.items[b.items.length - 1].ts - a.items[a.items.length - 1].ts);
    const mine = arr.find(g => g.uid === me);
    return mine ? [mine, ...arr.filter(g => g !== mine)] : arr;
  }

  function start() {
    if (started || !window.db || !window.currentUser) return;
    started = true;
    injectStyle();
    mount();
    const since = Date.now() - DAY;
    db.ref('stories_feed').orderByChild('ts').startAt(since).on('value', snap => {
      const now = Date.now();
      const items = [];
      snap.forEach(c => {
        const v = c.val();
        if (v && v.url && typeof v.ts === 'number' && v.ts > now - DAY) items.push({ id: c.key, uid: v.uid, url: v.url, ts: v.ts });
      });
      groups = group(items);
      render();
    });
    cleanupOwn();
  }

  // удаляем свои истории старше суток (остальные лежат в ленте и не мешают)
  function cleanupOwn() {
    try {
      const me = currentUser.uid;
      db.ref('stories_feed').orderByChild('ts').endAt(Date.now() - DAY).once('value').then(snap => {
        const dels = {};
        snap.forEach(c => { const v = c.val(); if (v && v.uid === me) dels[c.key] = null; });
        if (Object.keys(dels).length) return db.ref('stories_feed').update(dels);
      }).catch(() => {});
    } catch (_) {}
  }

  // ---------- лента ----------
  function mount() {
    if (document.getElementById('tx-stories')) return;
    const list = document.getElementById('chats-list');
    if (!list) return;
    const bar = document.createElement('div');
    bar.id = 'tx-stories';
    list.parentNode.insertBefore(bar, list);
  }

  function render() {
    const bar = document.getElementById('tx-stories');
    if (!bar || !currentUser) return;
    const me = currentUser.uid;
    const myGroup = groups.find(g => g.uid === me);
    let html = `<button class="tx-st" data-act="${myGroup ? 'view-mine' : 'add'}">
        <span class="tx-st-ring ${myGroup ? 'seen' : 'none'}"><span class="tx-st-av" style="background:${colorOf(me)}">${esc(avatarLetter(me))}</span>
          <span class="tx-st-plus" data-act="add">+</span></span>
        <span class="tx-st-name">Моя история</span></button>`;
    groups.filter(g => g.uid !== me).forEach(g => {
      const nm = nameOf(g.uid) || '…';
      html += `<button class="tx-st" data-uid="${esc(g.uid)}">
        <span class="tx-st-ring"><span class="tx-st-av" style="background:${colorOf(g.uid)}">${esc(String(nm)[0] || '?')}</span></span>
        <span class="tx-st-name">${esc(nm)}</span></button>`;
    });
    bar.innerHTML = html;
    bar.querySelectorAll('[data-act]').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      if (el.dataset.act === 'add') pickFile();
      else if (el.dataset.act === 'view-mine') openGroup(me);
    }));
    bar.querySelectorAll('[data-uid]').forEach(el => el.addEventListener('click', () => openGroup(el.dataset.uid)));
  }

  function avatarLetter(uid) {
    const u = (window.currentUserData && currentUserData.username) || '';
    return (u[0] || '?').toUpperCase();
  }

  // ---------- публикация ----------
  function pickFile() {
    let inp = document.getElementById('tx-st-file');
    if (!inp) {
      inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'tx-st-file'; inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', () => publish(inp.files && inp.files[0]).finally(() => { inp.value = ''; }));
    }
    inp.click();
  }

  async function publish(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Можно добавить только фото'); return; }
    if (file.size > MAX_BYTES) { toast('Фото больше 10 МБ'); return; }
    try {
      toast('Публикуем историю…');
      const url = await uploadMedia(file);
      await db.ref('stories_feed').push({ uid: currentUser.uid, url, ts: firebase.database.ServerValue.TIMESTAMP });
      toast('История опубликована');
    } catch (e) {
      toast('Не удалось опубликовать историю');
    }
  }

  // ---------- просмотр ----------
  function ensureViewer() {
    let v = document.getElementById('tx-story');
    if (v) return v;
    injectStyle();
    v = document.createElement('div');
    v.id = 'tx-story';
    v.innerHTML = `
      <div class="tx-sv-bars" id="tx-sv-bars"></div>
      <div class="tx-sv-head">
        <div class="tx-sv-who" id="tx-sv-who"></div>
        <div class="tx-sv-time" id="tx-sv-time"></div>
        <button class="tx-sv-del" id="tx-sv-del" title="Удалить" style="display:none"><i class="ic ic-delete"></i></button>
        <button class="tx-sv-x" id="tx-sv-x" aria-label="Закрыть">✕</button>
      </div>
      <div class="tx-sv-img"><img id="tx-sv-img" alt=""></div>
      <div class="tx-sv-zone l" id="tx-sv-prev"></div>
      <div class="tx-sv-zone r" id="tx-sv-next"></div>`;
    document.body.appendChild(v);
    document.getElementById('tx-sv-x').onclick = close;
    document.getElementById('tx-sv-prev').onclick = () => step(-1);
    document.getElementById('tx-sv-next').onclick = () => step(1);
    document.getElementById('tx-sv-del').onclick = deleteCurrent;
    v.addEventListener('pointerdown', () => { paused = true; });
    v.addEventListener('pointerup', () => { paused = false; });
    v.addEventListener('pointercancel', () => { paused = false; });
    return v;
  }

  function openGroup(uid) {
    const idx = groups.findIndex(g => g.uid === uid);
    if (idx < 0) return;
    viewGroups = groups.slice(idx);
    gi = 0; si = 0;
    ensureViewer().classList.add('open');
    show();
  }

  function current() { const g = viewGroups[gi]; return g && g.items[si]; }

  function show() {
    const it = current();
    if (!it) { close(); return; }
    const g = viewGroups[gi];
    const v = document.getElementById('tx-story');
    document.getElementById('tx-sv-img').src = it.url;
    document.getElementById('tx-sv-who').textContent = g.uid === currentUser.uid ? 'Моя история' : (nameOf(g.uid) || '');
    document.getElementById('tx-sv-time').textContent = fmtTime(it.ts);
    document.getElementById('tx-sv-del').style.display = g.uid === currentUser.uid ? '' : 'none';
    document.getElementById('tx-sv-bars').innerHTML = g.items.map((x, i) =>
      `<div class="tx-sv-bar"><i style="width:${i < si ? 100 : 0}%"></i></div>`).join('');
    elapsed = 0; lastTick = performance.now(); paused = false;
    clearInterval(timer);
    timer = setInterval(tick, 50);
    v.dataset.open = '1';
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
  }

  function tick() {
    const now = performance.now();
    const dt = now - lastTick; lastTick = now;
    if (paused) return;
    elapsed += dt;
    const bars = document.querySelectorAll('#tx-sv-bars .tx-sv-bar i');
    if (bars[si]) bars[si].style.width = Math.min(100, elapsed / SLIDE_MS * 100) + '%';
    if (elapsed >= SLIDE_MS) step(1);
  }

  function step(dir) {
    const g = viewGroups[gi];
    if (!g) return close();
    const n = si + dir;
    if (n >= 0 && n < g.items.length) { si = n; show(); return; }
    if (dir > 0) {
      if (gi + 1 < viewGroups.length) { gi++; si = 0; show(); return; }
      close(); return;
    }
    if (gi > 0) { gi--; si = viewGroups[gi].items.length - 1; show(); return; }
    show(); // в самом начале — перезапуск текущей
  }

  function deleteCurrent() {
    const it = current(); if (!it) return;
    if (!confirm('Удалить историю?')) return;
    db.ref('stories_feed/' + it.id).remove().then(() => {
      toast('История удалена');
      close();
    }).catch(() => toast('Не удалось удалить'));
  }

  function close() {
    clearInterval(timer); timer = null;
    const v = document.getElementById('tx-story');
    if (v) { v.classList.remove('open'); v.dataset.open = ''; }
    const img = document.getElementById('tx-sv-img'); if (img) img.removeAttribute('src');
  }

  window.TXStories = { start, close, isOpen: () => { const v = document.getElementById('tx-story'); return !!(v && v.classList.contains('open')); } };

  // запуск, когда пользователь вошёл и разметка готова
  const timerStart = setInterval(() => { if (window.currentUser && window.db) { start(); clearInterval(timerStart); } }, 500);
})();
