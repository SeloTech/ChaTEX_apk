// ============================================================
//  TICKETS (папка «Жалобы» — баг-репорты / жалобы на юзеров / вопросы)
//
//  Firebase Realtime Database не имеет REST/SQL-таблиц, поэтому схема
//  из ТЗ реализована как RTDB-узлы (эквивалент таблиц):
//    tickets/{ticketId}          ~ таблица `tickets`
//      creatorId, creatorName, title, category, status,
//      assignedAdminId, assignedAdminName, createdAt, updatedAt
//    ticket_messages/{ticketId}/{msgId}  ~ таблица `ticket_messages`
//      senderUid (sender_id), text (message), timestamp (created_at), isSystem
//    user_tickets/{uid}/{ticketId}: true — индекс «мои жалобы» для папки
//      обычного пользователя (админы видят все тикеты из `tickets` напрямую)
//
//  Функции ниже — клиентский эквивалент REST/WS эндпоинтов из ТЗ:
//    createTicket()               ≈ POST /api/tickets/create
//    loadTicketsFolder()          ≈ GET  /api/tickets/my | /api/tickets/admin
//    sendMsg('t_'+id) (см. ниже)  ≈ POST /api/tickets/:id/message
//    takeTicket/closeTicket/...   ≈ PATCH /api/tickets/:id/status
// ============================================================
const TICKET_CATEGORY_LABELS = { bug: '🐞 Баг', user_report: '🚫 Жалоба на пользователя', question: '❓ Вопрос' };
const TICKET_STATUS_LABELS   = { new: 'Новая', in_progress: 'В работе', closed: 'Закрыта' };
let ticketsCache = {}; // ticketId -> ticket data (live)
let ticketMsgsListener = null;

function openCreateTicketModal() {
  document.getElementById('ticket-category').value = 'bug';
  document.getElementById('ticket-title').value = '';
  document.getElementById('ticket-desc').value = '';
  openModal('ticket-create-modal');
}

async function createTicket() {
  const category = document.getElementById('ticket-category').value;
  const title    = document.getElementById('ticket-title').value.trim();
  const desc     = document.getElementById('ticket-desc').value.trim();
  if (!title)  { toast('Укажите тему'); return; }
  if (!desc)   { toast('Опишите проблему'); return; }
  const btn = document.getElementById('ticket-create-btn');
  btn.disabled = true; btn.textContent = 'Отправляем...';
  try {
    const ticketRef = db.ref('tickets').push();
    const ticketId  = ticketRef.key;
    const now = Date.now();
    // атомарный счётчик номера жалобы (Жалоба №1, №2, ...)
    const counterSnap = await db.ref('ticket_counter').transaction(cur => (cur || 0) + 1);
    const ticketNumber = counterSnap.snapshot.val();
    await ticketRef.set({
      creatorId: currentUser.uid,
      creatorName: currentUserData.username,
      title,
      category,
      status: 'new',
      assignedAdminId: null,
      assignedAdminName: null,
      ticketNumber,
      createdAt: now,
      updatedAt: now
    });
    await db.ref('user_tickets/' + currentUser.uid + '/' + ticketId).set(true);
    await db.ref('ticket_messages/' + ticketId).push({
      text: desc, senderUid: currentUser.uid, senderName: currentUserData.username,
      senderIsAdmin: false, timestamp: now
    });
    // Добавляем сразу в левую папку, чтобы не ждать callback listener.
    const createdTicket = { id: ticketId, creatorId: currentUser.uid, creatorName: currentUserData.username, title, category, status: 'new', assignedAdminId: null, assignedAdminName: null, ticketNumber, createdAt: now, updatedAt: now };
    ticketsCache[ticketId] = createdTicket;
    addTicketToSidebar(ticketId, createdTicket);
    updateTicketsBadge((Number(document.getElementById('tickets-count')?.textContent) || 0) + 1);
    // уведомляем всех админов
    db.ref('users').orderByChild('isAdmin').equalTo(true).once('value').then(snap => {
      snap.forEach(c => addNotification(c.key, { type: 'ticket', text: `Новая жалоба: ${title}`, from: currentUserData.username, ticketId }));
    });
    closeModal('ticket-create-modal');
    toast('✅ Жалоба отправлена');
    openTicket(ticketId);
  } catch (e) {
    toast('⚠️ Ошибка: ' + (e.message || e.code));
  } finally {
    btn.disabled = false; btn.textContent = 'Отправить жалобу';
  }
}

function toggleTicketsFolder() {
  document.getElementById('tickets-folder-header').classList.toggle('collapsed');
  document.getElementById('tickets-folder-list').classList.toggle('collapsed');
}

// Домашний экран вкладки «Жалобы»: открывается кликом по вкладке, показывает
// крупную кнопку создания жалобы (аналог экрана канала без сообщений)
function openTicketsHome() {
  resetChatHeaderPersonHandlers();
  clearAllMsgListeners();
  currentChatId = 'tickets-home'; currentChatType = 'tickets-home'; currentChatData = null;
  setActiveChat('tickets-folder-header');
  document.getElementById('chat-header-avatar').innerHTML = '⚠️';
  document.getElementById('chat-header-avatar').className = 'avatar';
  document.getElementById('chat-header-name').textContent = 'Жалобы';
  document.getElementById('chat-header-sub').textContent = isAdmin(currentUserData) ? 'Все обращения пользователей' : 'Поддержка ChaTEX';
  document.getElementById('header-actions').innerHTML = '';
  const area = document.getElementById('messages-area');
  area.innerHTML = `<div class="tickets-home-empty" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
      <div style="font-size:48px">⚠️</div>
      <div style="color:var(--text2);font-size:14px;text-align:center;max-width:280px">
        ${isAdmin(currentUserData) ? 'Здесь появляются новые обращения пользователей. Можете и сами создать жалобу.' : 'Опишите проблему, и мы поможем как можно скорее'}
      </div>
      <button class="btn-primary" style="width:auto;padding:12px 28px" onclick="openCreateTicketModal()">📝 Создать жалобу</button>
    </div>`;
  hidePinnedBar();
  const ia = document.getElementById('input-area');
  ia.className = 'input-area readonly';
  ia.innerHTML = `<div class="readonly-notice">${isAdmin(currentUserData) ? 'Выберите жалобу слева или создайте свою выше' : 'Нажмите «Создать жалобу» выше'}</div>`;
  showChat();
}

function renderTicketsList() {
  // Полный перерендер из ticketsCache. Обёрнут try/catch НА КАЖДУЮ строку —
  // раньше одна жалоба с "кривыми" данными (например, неизвестная category)
  // могла бросить исключение внутри forEach и оборвать отрисовку всех
  // остальных (более новых) жалоб, из-за чего они "визуально" не появлялись
  // в левом списке, хотя реально существовали в базе.
  const rows = Object.values(ticketsCache);
  rows.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  const keepIds = new Set();
  rows.forEach(t => {
    try {
      addTicketToSidebar(t.id, t);
      keepIds.add(t.id);
    } catch (e) {
      console.error('renderTicketsList: не смогли отрисовать жалобу', t && t.id, e);
    }
  });
  // Убираем из DOM то, чего больше нет в кэше (закрыто по TTL / удалено)
  document.querySelectorAll('.chat-item.ticket-item').forEach(el => {
    const id = el.id.replace(/^tkt-/, '');
    if (!keepIds.has(id)) el.remove();
  });
  updateTicketsBadge(rows.filter(t => t.status !== 'closed').length);
}

// Удаляет из базы и списка жалобы, закрытые более TICKET_CLOSED_TTL_MS назад.
function sweepExpiredClosedTickets() {
  const now = Date.now();
  const admin = isAdmin(currentUserData);
  Object.values(ticketsCache).forEach(t => {
    if (t.status !== 'closed') return;
    const closedAt = t.closedAt || t.updatedAt || 0;
    if (now - closedAt < TICKET_CLOSED_TTL_MS) return;
    delete ticketsCache[t.id];
    document.getElementById('tkt-' + t.id)?.remove();
    // Удаляем из базы только те жалобы, что реально видим целиком (админ —
    // все; обычный юзер — только свои), чтобы не тереть чужие по правам.
    if (admin || t.creatorId === currentUser.uid) {
      db.ref('tickets/' + t.id).remove().catch(() => {});
      db.ref('ticket_messages/' + t.id).remove().catch(() => {});
      if (t.creatorId) db.ref('user_tickets/' + t.creatorId + '/' + t.id).remove().catch(() => {});
    }
  });
  updateTicketsBadge(Object.values(ticketsCache).filter(t => t.status !== 'closed').length);
}

let ticketsSweepInterval = null;

function loadTicketsFolder() {
  const subEl = document.getElementById('tickets-folder-sub');
  if (!subEl) return; // старый index.html без папки «Жалобы» — не падаем
  bindTicketsListContextMenu();
  const admin = isAdmin(currentUserData);
  subEl.textContent = admin ? 'Все обращения пользователей' : 'Мои обращения';

  if (ticketsSweepInterval) clearInterval(ticketsSweepInterval);
  ticketsSweepInterval = setInterval(sweepExpiredClosedTickets, 60 * 1000);

  if (admin) {
    // child_* вместо одного on('value') с полным rebuild: новая жалоба
    // добавляется мгновенно сама по себе, и сбой при отрисовке одной строки
    // больше не может "похоронить" остальные.
    db.ref('tickets').on('child_added', snap => {
      ticketsCache[snap.key] = { id: snap.key, ...snap.val() };
      sweepExpiredClosedTickets();
      renderTicketsList();
    }, e => console.error('loadTicketsFolder (admin, added) error:', e));
    db.ref('tickets').on('child_changed', snap => {
      ticketsCache[snap.key] = { id: snap.key, ...snap.val() };
      sweepExpiredClosedTickets();
      renderTicketsList();
    }, e => console.error('loadTicketsFolder (admin, changed) error:', e));
    db.ref('tickets').on('child_removed', snap => {
      delete ticketsCache[snap.key];
      document.getElementById('tkt-' + snap.key)?.remove();
      renderTicketsList();
    }, e => console.error('loadTicketsFolder (admin, removed) error:', e));
  } else {
    db.ref('user_tickets/' + currentUser.uid).on('value', snap => {
      const ids = Object.keys(snap.val() || {});
      Object.keys(ticketsCache).forEach(id => { if (!ids.includes(id)) delete ticketsCache[id]; });
      if (!ids.length) { renderTicketsList(); return; }
      let done = 0;
      ids.forEach(id => {
        db.ref('tickets/' + id).once('value').then(s => {
          const t = s.val(); done++;
          if (t) ticketsCache[id] = { id, ...t };
          if (done === ids.length) { sweepExpiredClosedTickets(); renderTicketsList(); }
        }).catch(e => { done++; console.error('ticket load error:', e); if (done === ids.length) renderTicketsList(); });
      });
    }, e => console.error('loadTicketsFolder (user) error:', e));
  }
}

function updateTicketsBadge(n) {
  const el = document.getElementById('tickets-count');
  if (!el) return;
  el.style.display = n > 0 ? '' : 'none';
  el.textContent = n;
}

function addTicketToSidebar(ticketId, t) {
  const list = document.getElementById('tickets-folder-list');
  if (!list) return;
  let item = document.getElementById('tkt-' + ticketId);
  if (!item) {
    item = document.createElement('div');
    item.className = 'chat-item ticket-item';
    item.id = 'tkt-' + ticketId;
    item.dataset.ticketId = ticketId;
    list.appendChild(item);
  }
  const admin = isAdmin(currentUserData);
  const subName = admin ? `${escHtml(t.title || '')} — от @${escHtml(t.creatorName || '?')}` : (TICKET_CATEGORY_LABELS[t.category] || t.category);
  const ticketLabel = t.ticketNumber ? `Жалоба №${t.ticketNumber}` : (t.title || 'Жалоба');
  item.dataset.ticketId = ticketId;
  item.innerHTML = `<div class="avatar" style="font-size:16px">${TICKET_CATEGORY_LABELS[t.category]?.slice(0,2) || '⚠️'}</div>
    <div class="chat-item-info">
      <div class="chat-item-name">${escHtml(ticketLabel)}<span class="ticket-status-pill ${t.status}">${TICKET_STATUS_LABELS[t.status] || t.status}</span></div>
      <div class="chat-item-preview">${escHtml(subName)}</div>
    </div>`;
  item.onclick = () => openTicket(ticketId);
  // ПКМ / долгое нажатие: взять / закрыть / удалить — только у админов.
  // Обычный пользователь может открыть жалобу только кликом.
  // ВАЖНО: обработчик навешен через делегирование на #tickets-folder-list
  // (см. ниже, bindTicketsListContextMenu), а не на сам item. Раньше
  // проверка isAdmin() делалась один раз в момент рендера строки: если
  // currentUserData ещё не успел получить admin-флаги (или сама строка
  // не переотрисовывалась после этого), oncontextmenu не назначался
  // НАВСЕГДА и правый клик проваливался в системное меню браузера.
  // Делегирование проверяет isAdmin() в момент самого клика — работает
  // всегда, независимо от того, когда именно и в каком порядке
  // отрисовались/обновились строки списка.
}

let ticketsListCtxBound = false;
function bindTicketsListContextMenu() {
  if (ticketsListCtxBound) return;
  const list = document.getElementById('tickets-folder-list');
  if (!list) return;
  ticketsListCtxBound = true;
  list.addEventListener('contextmenu', e => {
    const item = e.target.closest('.ticket-item');
    if (!item || !list.contains(item)) return;
    if (!isAdmin(currentUserData)) return; // обычный пользователь — только клик
    e.preventDefault();
    e.stopPropagation();
    showTicketCtx(e, item.dataset.ticketId);
  });
}

// ─── TICKET SIDEBAR CONTEXT MENU (ПКМ, только админы) ──────────
let ticketCtxTargetId = null;
function showTicketCtx(e, ticketId) {
  ticketCtxTargetId = ticketId;
  const t = ticketsCache[ticketId];
  if (!t) return;
  const menu = document.getElementById('ticket-ctx-menu');
  if (!menu) return;
  // «Взять» — только для новых; «Закрыть» — пока в работе; «Удалить» — только закрытые
  document.getElementById('tctx-take').style.display   = t.status === 'new'         ? '' : 'none';
  document.getElementById('tctx-close').style.display  = t.status === 'in_progress' ? '' : 'none';
  document.getElementById('tctx-delete').style.display = t.status === 'closed'      ? '' : 'none';
  menu.classList.add('open');
  menu.style.left = Math.min(e.clientX || 20, window.innerWidth - 220) + 'px';
  menu.style.top  = Math.min(e.clientY || 20, window.innerHeight - 220) + 'px';
}
function closeTicketCtx() { document.getElementById('ticket-ctx-menu')?.classList.remove('open'); }

async function ticketCtxTake() {
  const id = ticketCtxTargetId; closeTicketCtx(); if (!id) return;
  await takeTicket(id);
}
async function ticketCtxClose() {
  const id = ticketCtxTargetId; closeTicketCtx(); if (!id) return;
  await closeTicketFn(id);
}
async function ticketCtxDelete() {
  const id = ticketCtxTargetId; closeTicketCtx(); if (!id) return;
  const t = ticketsCache[id];
  if (!confirm('Удалить жалобу навсегда?')) return;
  await db.ref('tickets/' + id).remove();
  await db.ref('ticket_messages/' + id).remove();
  if (t?.creatorId) await db.ref('user_tickets/' + t.creatorId + '/' + id).remove();
  delete ticketsCache[id];
  document.getElementById('tkt-' + id)?.remove();
  if (currentChatId === id) openTicketsHome();
  toast('🗑️ Жалоба удалена');
}

function openTicket(ticketId) {
  db.ref('tickets/' + ticketId).once('value').then(snap => {
    const t = snap.val(); if (!t) { toast('Жалоба не найдена (возможно, была удалена)'); return; }
    ticketsCache[ticketId] = { id: ticketId, ...t };
    resetChatHeaderPersonHandlers();
    currentChatId = ticketId; currentChatType = 'ticket'; currentChatData = t;
    setActiveChat('tkt-' + ticketId);
    document.getElementById('chat-header-avatar').innerHTML = '⚠️';
    document.getElementById('chat-header-avatar').className = 'avatar';
    const ticketLabel = t.ticketNumber ? `Жалоба №${t.ticketNumber}` : (t.title || 'Жалоба');
    document.getElementById('chat-header-name').innerHTML =
      `${escHtml(ticketLabel)} <span class="ticket-status-pill ${t.status}" id="ticket-status-pill">${TICKET_STATUS_LABELS[t.status] || t.status}</span>`;
    document.getElementById('chat-header-sub').textContent =
      `${escHtml(t.title || '')} · ${TICKET_CATEGORY_LABELS[t.category] || t.category} · ${isAdmin(currentUserData) ? 'от @' + t.creatorName : 'ChaTEX Support'}`;
    document.getElementById('header-actions').innerHTML = isAdmin(currentUserData) ? buildTicketAdminActions(ticketId, t) : '';
    buildTicketInput(ticketId, t);
    stopTyping(); clearEditReply();
    // loadMessages() ниже вызывает attachChatMessages -> clearAllMsgListeners(), которая снимает
    // предыдущий детальный listener тикета — поэтому подписываемся ПОСЛЕ этого вызова
    loadMessages('ticket_messages/' + ticketId, ticketId);
    // живое обновление статуса/шапки, пока открыт именно этот тикет
    const tdRef = db.ref('tickets/' + ticketId);
    const tdCb = s => {
      const nt = s.val(); if (!nt || currentChatId !== ticketId) return;
      currentChatData = nt; ticketsCache[ticketId] = { id: ticketId, ...nt };
      const pill = document.getElementById('ticket-status-pill');
      if (pill) pill.outerHTML = `<span class="ticket-status-pill ${nt.status}" id="ticket-status-pill">${TICKET_STATUS_LABELS[nt.status] || nt.status}</span>`;
      document.getElementById('header-actions').innerHTML = isAdmin(currentUserData) ? buildTicketAdminActions(ticketId, nt) : '';
      buildTicketInput(ticketId, nt);
    };
    tdRef.on('value', tdCb);
    ticketDetailListenerRef = { ref: tdRef, cb: tdCb };
    showChat();
  }).catch(e => {
    console.error('openTicket error:', e);
    toast('⚠️ Не удалось открыть жалобу: ' + (e.message || e.code || 'ошибка прав Firebase'));
  });
}

function buildTicketAdminActions(ticketId, t) {
  const btns = [];
  if (t.status === 'new')          btns.push(`<button class="take" onclick="takeTicket('${ticketId}')">✋ Взять жалобу</button>`);
  if (t.status === 'in_progress')  btns.push(`<button class="close" onclick="closeTicketFn('${ticketId}')">✔ Закрыть жалобу</button>`);
  if (t.status === 'closed')       btns.push(`<button class="reopen" onclick="reopenTicket('${ticketId}')">↺ Переоткрыть</button>`);
  return `<div class="ticket-actions">${btns.join('')}</div>`;
}

function buildTicketInput(ticketId, t) {
  const ia = document.getElementById('input-area');
  const admin = isAdmin(currentUserData);
  if (t.status === 'closed' && !admin) {
    ia.className = 'input-area readonly';
    ia.innerHTML = `<div class="readonly-notice">🔒 Жалоба закрыта</div>`;
    return;
  }
  ia.className = 'input-area';
  ia.innerHTML = `<div class="input-wrap"><textarea id="msg-input" placeholder="Написать сообщение..." rows="1"
    oninput="autoGrow(this);if(!editingMsgId)saveDraft('${ticketId}',this.value)" onkeydown="handleKey(event,'${ticketId}')"></textarea></div>
    <button class="send-btn" onclick="sendMsg('${ticketId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg></button>`;
  restoreDraft(ticketId);
}

async function pushTicketSystemMsg(ticketId, text) {
  await db.ref('ticket_messages/' + ticketId).push({ text, isSystem: true, timestamp: Date.now(), senderUid: 'system', senderName: 'ChaTEX Support' });
}

async function takeTicket(ticketId) {
  await db.ref('tickets/' + ticketId).update({ status: 'in_progress', assignedAdminId: currentUser.uid, assignedAdminName: currentUserData.username, updatedAt: Date.now() });
  await pushTicketSystemMsg(ticketId, `Администратор ${currentUserData.username} взял жалобу в работу`);
  toast('✅ Жалоба взята в работу');
}

async function closeTicketFn(ticketId) {
  const now = Date.now();
  await db.ref('tickets/' + ticketId).update({ status: 'closed', updatedAt: now, closedAt: now });
  await pushTicketSystemMsg(ticketId, 'Жалоба закрыта');
  toast('✅ Жалоба закрыта');
}

async function reopenTicket(ticketId) {
  await db.ref('tickets/' + ticketId).update({ status: 'in_progress', updatedAt: Date.now() });
  await pushTicketSystemMsg(ticketId, `Администратор ${currentUserData.username} переоткрыл жалобу`);
  toast('↺ Жалоба переоткрыта');
}

