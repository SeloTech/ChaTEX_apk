// ============================================================
//  COMPLAINT
// ============================================================
function openComplaintModal(targetUid, type) {
  closeModal('profile-modal');
  const notice = document.getElementById('complaint-cd-notice');
  const btn    = document.getElementById('complaint-submit-btn');
  if (notice) notice.textContent = ''; if (btn) btn.disabled = false;
  openModal('complaint-modal');
  document.getElementById('complaint-modal').dataset.targetUid  = targetUid || '';
  document.getElementById('complaint-modal').dataset.targetType = type || 'general';
}

async function sendComplaint() {
  const type = document.getElementById('complaint-type').value;
  const text = document.getElementById('complaint-text').value.trim();
  if (!text) { toast('Опишите проблему'); return; }

  const tUid  = document.getElementById('complaint-modal').dataset.targetUid || '';
  const tType = document.getElementById('complaint-modal').dataset.targetType || 'general';
  const btn = document.getElementById('complaint-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Отправляем...'; }

  // Раньше эта форма записывала жалобу в отдельный /complaints,
  // поэтому она не попадала в левую папку «Жалобы», которая читает /tickets.
  // Теперь ВСЕ новые жалобы используют одну систему тикетов.
  const typeLabels = {
    spam: 'Спам',
    abuse: 'Оскорбления',
    inappropriate: 'Неприемлемый контент',
    scam: 'Мошенничество',
    other: 'Другое'
  };

  try {
    const ticketRef = db.ref('tickets').push();
    const ticketId = ticketRef.key;
    const now = Date.now();
    const counterSnap = await db.ref('ticket_counter').transaction(cur => (cur || 0) + 1);
    const ticketNumber = counterSnap.snapshot.val();

    await ticketRef.set({
      creatorId: currentUser.uid,
      creatorName: currentUserData.username,
      title: typeLabels[type] || 'Жалоба на пользователя',
      category: 'user_report',
      complaintType: type,
      targetUid: tUid || null,
      targetType: tType,
      status: 'new',
      assignedAdminId: null,
      assignedAdminName: null,
      ticketNumber,
      createdAt: now,
      updatedAt: now
    });

    // Индекс пользователя нужен, чтобы тикет мгновенно появился в левой папке.
    await db.ref('user_tickets/' + currentUser.uid + '/' + ticketId).set(true);
    await db.ref('ticket_messages/' + ticketId).push({
      text,
      senderUid: currentUser.uid,
      senderName: currentUserData.username,
      senderIsAdmin: false,
      timestamp: now
    });

    // Обновляем левый список сразу, не ожидая следующего рендера Firebase.
    const ticket = {
      id: ticketId,
      creatorId: currentUser.uid,
      creatorName: currentUserData.username,
      title: typeLabels[type] || 'Жалоба на пользователя',
      category: 'user_report',
      status: 'new',
      ticketNumber,
      createdAt: now,
      updatedAt: now
    };
    ticketsCache[ticketId] = ticket;
    addTicketToSidebar(ticketId, ticket);
    updateTicketsBadge((Number(document.getElementById('tickets-count')?.textContent) || 0) + 1);

    // Уведомляем администраторов, включая SUPER ADMIN.
    db.ref('users').once('value').then(snap => {
      snap.forEach(c => {
        const u = c.val() || {};
        if (isAdmin(u)) addNotification(c.key, {
          type: 'ticket',
          text: `Новая жалоба: ${typeLabels[type] || 'Жалоба'}`,
          from: currentUserData.username,
          ticketId
        });
      });
    }).catch(() => {});

    closeModal('complaint-modal');
    document.getElementById('complaint-text').value = '';
    toast('✅ Жалоба отправлена и добавлена в раздел «Жалобы»');
  } catch (e) {
    console.error('sendComplaint:', e);
    toast('Ошибка отправки жалобы: ' + (e.message || 'проверьте Rules Firebase'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Отправить жалобу'; }
  }
}

