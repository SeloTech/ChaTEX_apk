// ============================================================
//  ChaTEX — новые функции (TELEX)
//  Ctrl+K палитра команд · поиск по чату (Ctrl+F) · черновики ·
//  кнопка «вниз» со счётчиком · ❤️ по двойному тапу · Alt+↑/↓
//  Всё живёт только в браузере и ничего не пишет в БД.
// ============================================================
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } },
               set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} },
               del: k => { try { localStorage.removeItem(k); } catch (_) {} } };

  function ready(fn) { (document.readyState === 'loading') ? document.addEventListener('DOMContentLoaded', fn) : fn(); }

  ready(() => {
    const area = $('#messages-area'), chat = $('#chat-area');
    if (!area || !chat) return;

    /* ───── 1. Кнопка «вниз» + счётчик новых ───── */
    const fab = document.createElement('div');
    fab.id = 'tx-fab'; fab.innerHTML = '⌄<b></b>'; chat.appendChild(fab);
    const badge = $('b', fab); let unread = 0;
    const nearBottom = () => area.scrollHeight - area.scrollTop - area.clientHeight < 140;
    const toBottom = () => { area.scrollTo({ top: area.scrollHeight, behavior: 'smooth' }); };
    const upd = () => {
      const far = !nearBottom();
      fab.classList.toggle('show', far);
      if (!far) unread = 0;
      badge.textContent = unread; badge.classList.toggle('on', unread > 0);
    };
    fab.addEventListener('click', toBottom);
    area.addEventListener('scroll', upd, { passive: true });
    new MutationObserver(muts => {
      for (const m of muts) m.addedNodes.forEach(n => {
        if (n.nodeType === 1 && n.classList.contains('msg') && !n.classList.contains('own') && !nearBottom()) unread++;
      });
      upd();
    }).observe(area, { childList: true });

    /* ───── 2. Поиск по текущему чату (Ctrl+F) ───── */
    const find = document.createElement('div');
    find.id = 'tx-find';
    find.innerHTML = '<input placeholder="Поиск в чате…" autocomplete="off"><span>0/0</span><button title="Предыдущее">↑</button><button title="Следующее">↓</button><button title="Закрыть">✕</button>';
    chat.appendChild(find);
    const fIn = $('input', find), fCnt = $('span', find), [bUp, bDn, bX] = find.querySelectorAll('button');
    let hits = [], cur = -1;
    function clearMarks() {
      area.querySelectorAll('mark.tx-hit').forEach(m => { const p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); });
      hits = []; cur = -1;
    }
    function runFind() {
      clearMarks();
      const q = fIn.value.trim();
      if (q.length < 2) { fCnt.textContent = '0/0'; return; }
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      area.querySelectorAll('.msg-bubble').forEach(b => {
        const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, { acceptNode: n =>
          (n.parentElement.closest('button,script,style,.msg-time,.msg-reactions') || !re.test(n.nodeValue)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
        const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
        nodes.forEach(n => {
          re.lastIndex = 0; const frag = document.createDocumentFragment(); let last = 0, m;
          while ((m = re.exec(n.nodeValue))) {
            frag.appendChild(document.createTextNode(n.nodeValue.slice(last, m.index)));
            const mk = document.createElement('mark'); mk.className = 'tx-hit'; mk.textContent = m[0]; frag.appendChild(mk); hits.push(mk);
            last = m.index + m[0].length; if (m[0].length === 0) re.lastIndex++;
          }
          frag.appendChild(document.createTextNode(n.nodeValue.slice(last))); n.parentNode.replaceChild(frag, n);
        });
      });
      if (hits.length) go(hits.length - 1); else fCnt.textContent = '0/0';
    }
    function go(i) {
      if (!hits.length) return;
      cur = (i + hits.length) % hits.length;
      hits.forEach(h => h.classList.remove('cur')); hits[cur].classList.add('cur');
      hits[cur].scrollIntoView({ block: 'center', behavior: 'smooth' });
      fCnt.textContent = (hits.length - cur) + '/' + hits.length;
    }
    const openFind = () => { find.classList.add('show'); fIn.focus(); fIn.select(); };
    const closeFind = () => { find.classList.remove('show'); clearMarks(); fIn.value = ''; };
    let ft; fIn.addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(runFind, 180); });
    fIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(cur + (e.shiftKey ? 1 : -1)); } });
    bUp.onclick = () => go(cur + 1); bDn.onclick = () => go(cur - 1); bX.onclick = closeFind;

    /* ───── 3. Палитра команд (Ctrl+K) ───── */
    const pal = document.createElement('div');
    pal.id = 'tx-pal';
    pal.innerHTML = '<div class="box"><input placeholder="Чат, человек или команда…" autocomplete="off"><div class="list"></div><div class="hint"><span>↑↓ выбор</span><span>Enter открыть</span><span>Esc закрыть</span></div></div>';
    document.body.appendChild(pal);
    const pIn = $('input', pal), pList = $('.list', pal); let items = [], sel = 0;
    const call = (fn, ...a) => () => { try { if (typeof window[fn] === 'function') window[fn](...a); } catch (e) {} };
    function allItems() {
      const out = [];
      document.querySelectorAll('#chats-list .chat-item').forEach(el => {
        if (el.classList.contains('folder-header') || el.offsetParent === null && !el.closest('#tickets-folder-list')) return;
        const nm = $('.chat-item-name', el), pv = $('.chat-item-preview', el), av = $('.avatar', el);
        if (!nm) return;
        out.push({ icon: av && av.textContent.trim().slice(0, 2) || '💬', t: nm.textContent.trim().replace(/\s+/g, ' '), s: pv ? pv.textContent.trim() : '', k: 'Чат', run: () => el.click() });
      });
      const act = [
        ['⚙️', 'Настройки', 'openSettings'], ['🔔', 'Уведомления', 'openNotifications'], ['➕', 'Создать канал / группу', 'openCreateModal'],
        ['⭐', 'Избранное', 'openFavorites'], ['🛡️', 'Поддержка', 'openSupport'], ['📢', 'ChaTEX Official', 'openOfficial'], ['⚠️', 'Жалобы', 'openTicketsHome']
      ];
      act.forEach(([i, t, f]) => out.push({ icon: i, t, s: '', k: 'Команда', run: call(f) }));
      try { if (typeof isAdmin === 'function' && isAdmin(currentUserData)) out.push({ icon: '👑', t: 'Админ-панель', s: '', k: 'Команда', run: call('openAdminPanel') }); } catch (_) {}
      [['dark', 'Тёмная'], ['neon', 'Neon'], ['ocean', 'Ocean'], ['sunset', 'Sunset'], ['lavender', 'Lavender'], ['forest', 'Forest'], ['darker', 'Deep dark'], ['aero', 'Aero']]
        .forEach(([id, n]) => out.push({ icon: '🎨', t: 'Тема: ' + n, s: '', k: 'Оформление', run: call('changeTheme', id) }));
      out.push({ icon: '🔎', t: 'Поиск по сообщениям этого чата', s: 'Ctrl+F', k: 'Команда', run: openFind });
      return out;
    }
    function renderPal() {
      const q = pIn.value.trim().toLowerCase();
      items = allItems().filter(i => !q || (i.t + ' ' + i.s).toLowerCase().includes(q)).slice(0, 40);
      sel = Math.min(sel, Math.max(0, items.length - 1));
      pList.innerHTML = items.map((i, n) => `<div class="it${n === sel ? ' sel' : ''}" data-n="${n}"><i>${esc(i.icon)}</i><div><div>${esc(i.t)}</div>${i.s ? `<small style="margin:0;display:block;opacity:.65">${esc(i.s.slice(0, 60))}</small>` : ''}</div><small>${i.k}</small></div>`).join('')
        || '<div class="it" style="opacity:.6">Ничего не найдено</div>';
      const s = $('.sel', pList); if (s) s.scrollIntoView({ block: 'nearest' });
    }
    function openPal() { pal.classList.add('show'); pIn.value = ''; sel = 0; renderPal(); pIn.focus(); }
    function closePal() { pal.classList.remove('show'); }
    function runSel() { const i = items[sel]; closePal(); if (i) setTimeout(i.run, 30); }
    pIn.addEventListener('input', () => { sel = 0; renderPal(); });
    pIn.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); renderPal(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); renderPal(); }
      else if (e.key === 'Enter') { e.preventDefault(); runSel(); }
    });
    pList.addEventListener('click', e => { const it = e.target.closest('.it[data-n]'); if (it) { sel = +it.dataset.n; runSel(); } });
    pal.addEventListener('mousedown', e => { if (e.target === pal) closePal(); });

    /* ───── 4. Черновики (хранятся только на этом устройстве) ───── */
    const dk = () => 'tx_draft_' + (typeof currentChatId !== 'undefined' ? currentChatId : '');
    document.addEventListener('input', e => {
      if (e.target && e.target.id === 'msg-input') { const v = e.target.value; v.trim() ? ls.set(dk(), v) : ls.del(dk()); }
    });
    const afterSend = () => setTimeout(() => { const i = $('#msg-input'); if (i && !i.value.trim()) ls.del(dk()); }, 80);
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.send-btn')) afterSend(); });
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'msg-input') afterSend(); });
    let lastChat = null;
    setInterval(() => {
      if (typeof currentChatId === 'undefined' || currentChatId === lastChat) return;
      lastChat = currentChatId; clearMarks && closeFind();
      setTimeout(() => {
        const i = $('#msg-input'), d = ls.get(dk());
        if (i && d && !i.value) { i.value = d; i.dispatchEvent(new Event('input', { bubbles: true })); }
        unread = 0; upd();
      }, 220);
    }, 300);

    /* ───── 5. ❤️ по двойному клику/тапу на сообщение ───── */
    area.addEventListener('dblclick', e => {
      const b = e.target.closest('.msg-bubble'); const m = e.target.closest('.msg');
      if (!b || !m || e.target.closest('a,button,img,video,audio,.msg-sticker-clickable')) return;
      if (typeof toggleReaction !== 'function' || typeof currentChatId === 'undefined') return;
      if (['official', 'support', 'favorites'].includes(currentChatId)) return;
      try { toggleReaction('❤️', m.id.replace(/^msg-/, ''), currentChatId); } catch (_) {}
      const h = document.createElement('div'); h.className = 'tx-reactpop'; h.textContent = '❤️';
      const r = b.getBoundingClientRect(), ar = area.getBoundingClientRect();
      h.style.left = (e.clientX - ar.left - 16) + 'px'; h.style.top = (e.clientY - ar.top + area.scrollTop - 24) + 'px';
      area.appendChild(h); setTimeout(() => h.remove(), 900);
    });

    /* ───── 6. Горячие клавиши ───── */
    document.addEventListener('keydown', e => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.classList.contains('show') ? closePal() : openPal(); }
      else if (mod && e.key.toLowerCase() === 'f' && document.getElementById('app')?.classList.contains('visible')) { e.preventDefault(); openFind(); }
      else if (e.key === 'Escape') { if (pal.classList.contains('show')) closePal(); else if (find.classList.contains('show')) closeFind(); }
      else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const rows = [...document.querySelectorAll('#chats-list .chat-item:not(.folder-header)')].filter(r => r.offsetParent !== null);
        const i = rows.findIndex(r => r.classList.contains('active')); const n = rows[i + (e.key === 'ArrowDown' ? 1 : -1)];
        if (n) { e.preventDefault(); n.click(); n.scrollIntoView({ block: 'nearest' }); }
      }
    });

    // Ctrl+K подсказка в поле поиска
    const si = $('#search-input'); if (si) si.setAttribute('placeholder', 'Поиск... (Ctrl+K — команды)');
  });
})();
