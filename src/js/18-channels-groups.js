// ============================================================
//  CHANNELS & GROUPS — CREATE & OPEN
// ============================================================
function selectCreateType(type) {
  createType = type;
  ['dm', 'channel', 'group'].forEach(t => {
    document.getElementById('type-' + t + '-btn').classList.toggle('selected', t === type);
    const el = document.getElementById('create-' + t + '-fields'); if (el) el.style.display = t === type ? '' : 'none';
  });
}
function openCreateModal() { openModal('create-modal'); }

async function doCreate() {
  if (createType === 'dm') {
    const nick = document.getElementById('dm-target-nick').value.trim(); if (!nick) return;
    const snap = await db.ref('usernames/' + nick.toLowerCase()).once('value'); const uid = snap.val();
    if (!uid) { toast('Пользователь не найден'); return; }
    const usnap = await db.ref('users/' + uid).once('value'); closeModal('create-modal'); openDM(uid, usnap.val()); return;
  }
  if (createType === 'channel') {
    const name   = document.getElementById('channel-name-input').value.trim();
    const handle = document.getElementById('channel-handle-input').value.trim().replace('@', '');
    const desc   = document.getElementById('channel-desc-input').value.trim();
    if (!name) { toast('Введите название'); return; }
    if (handle && !/^[a-zA-Z0-9_]{2,20}$/.test(handle)) { toast('Никнейм: только латиница, цифры, _'); return; }
    const existing = await db.ref('channels').orderByChild('ownerUid').equalTo(currentUser.uid).once('value');
    if (handle && existing.numChildren() >= 10) { toast('Максимум 10 публичных каналов'); return; }
    const chData = { name, handle: handle || null, isPublic: !!handle, description: desc, ownerUid: currentUser.uid, ownerName: currentUserData.username, verified: false, blocked: false, members: { [currentUser.uid]: 'owner' }, admins: { [currentUser.uid]: true }, createdAt: Date.now(), type: 'channel', memberCount: 1 };
    const ref = await db.ref('channels').push(chData);
    if (handle) await db.ref('channel_handles/' + handle.toLowerCase()).set(ref.key);
    closeModal('create-modal'); openChannel(ref.key, chData); toast('📡 Канал создан!'); return;
  }
  if (createType === 'group') {
    const name = document.getElementById('group-name-input').value.trim(); const desc = document.getElementById('group-desc-input').value.trim();
    if (!name) { toast('Введите название'); return; }
    const grData = { name, description: desc, ownerUid: currentUser.uid, ownerName: currentUserData.username, verified: false, blocked: false, members: { [currentUser.uid]: 'owner' }, createdAt: Date.now(), type: 'group', memberCount: 1 };
    const ref = await db.ref('groups').push(grData); closeModal('create-modal'); openGroup(ref.key, grData); toast('👥 Группа создана!');
  }
}

function openChannel(chatId, chData) {
  if (chData.blocked && !currentUserData.isAdmin) { toast('📵 Этот канал заблокирован администрацией ChaTEX'); return; }
  resetChatHeaderPersonHandlers();
  currentChatId = chatId; currentChatType = 'channel'; currentChatData = chData;
  setActiveChat('ch-' + chatId);
  const ha = document.getElementById('chat-header-avatar'); ha.className = 'avatar channel';
  if (chData.avatarUrl) ha.innerHTML = `<img src="${chData.avatarUrl}" alt="">`; else ha.innerHTML = '📡';
  ha.style.cursor = 'pointer';
  ha.onclick = () => openChannelOrGroupInfo('channel', chatId, chData);
  let nameHtml = escHtml(chData.name);
  if (chData.verified) nameHtml += ` <span class="badge-verify">✓</span>`;
  if (chData.handle)   nameHtml += ` <span class="channel-tag">@${chData.handle}</span>`;
  if (chData.blocked)  nameHtml += ` <span style="background:rgba(255,61,107,.2);color:var(--red);font-size:10px;padding:2px 6px;border-radius:10px;font-family:var(--mono)">BLOCKED</span>`;
  document.getElementById('chat-header-name').innerHTML = nameHtml;
  const chHdr = document.getElementById('chat-header-name');
  chHdr.style.cursor = 'pointer';
  chHdr.onclick = () => openChannelOrGroupInfo('channel', chatId, chData);
  document.getElementById('chat-header-sub').innerHTML  = `<span class="channel-members">${chData.memberCount || 1} подписчик(ов)</span>`;
  const isOwnerOrAdmin = chData.ownerUid === currentUser.uid || currentUserData.isAdmin;
  const isChannelAdmin = chData.admins?.[currentUser.uid];
  const canManage = isOwnerOrAdmin || chData.memberPerms?.[currentUser.uid]?.manage === true;
  const canWrite = currentUserCanWrite();
  document.getElementById('header-actions').innerHTML = canManage
    ? `<button class="h-btn" onclick="openChannelSettings('${chatId}')">⚙️</button>`
    : `<button class="h-btn" onclick="leaveChannel('${chatId}')">🚪</button>`;
  clearEditReply(); buildChannelInput(chatId, canWrite); loadChannelMessages(chatId);
  loadChatMembersForMentions(chData.members);
  if (canWrite) listenTyping(chatId);
  showChat();
  if (!document.getElementById('ch-' + chatId)) addChannelToSidebar(chatId, chData);
}

function openGroup(chatId, grData) {
  if (grData.blocked && !currentUserData.isAdmin) { toast('📵 Эта группа заблокирована администрацией'); return; }
  resetChatHeaderPersonHandlers();
  currentChatId = chatId; currentChatType = 'group'; currentChatData = grData;
  setActiveChat('gr-' + chatId);
  const ha = document.getElementById('chat-header-avatar'); ha.className = 'avatar group';
  if (grData.avatarUrl) ha.innerHTML = `<img src="${grData.avatarUrl}" alt="">`; else ha.innerHTML = '👥';
  ha.style.cursor = 'pointer';
  ha.onclick = () => openChannelOrGroupInfo('group', chatId, grData);
  let nameHtml = escHtml(grData.name);
  if (grData.verified) nameHtml += ` <span class="badge-verify">✓</span>`;
  if (grData.blocked)  nameHtml += ` <span style="background:rgba(255,61,107,.2);color:var(--red);font-size:10px;padding:2px 6px;border-radius:10px;font-family:var(--mono)">BLOCKED</span>`;
  document.getElementById('chat-header-name').innerHTML = nameHtml;
  const grHdr = document.getElementById('chat-header-name');
  grHdr.style.cursor = 'pointer';
  grHdr.onclick = () => openChannelOrGroupInfo('group', chatId, grData);
  document.getElementById('chat-header-sub').innerHTML  = `<span class="channel-members">${grData.memberCount || 1} участник(ов)</span>`;
  const isOwner = grData.ownerUid === currentUser.uid || currentUserData.isAdmin;
  const canManage = isOwner || grData.memberPerms?.[currentUser.uid]?.manage === true;
  const canWrite = currentUserCanWrite();
  document.getElementById('header-actions').innerHTML = (canManage
    ? `<button class="h-btn" onclick="openGroupSettings('${chatId}')">⚙️</button>`
    : `<button class="h-btn" onclick="leaveGroup('${chatId}')">🚪</button>`);
  clearEditReply(); buildGroupInput(chatId, canWrite); loadGroupMessages(chatId); if (canWrite) listenTyping(chatId); showChat();
  loadChatMembersForMentions(grData.members);
  if (!document.getElementById('gr-' + chatId)) addGroupToSidebar(chatId, grData);
  renderGroupCallHeaderBtn(chatId, grData);
}

// ─── Кнопка звонка в шапке группы (звонки доступны только в группах, не в каналах) ─
let grCallStatusRef = null, grCallStatusCb = null;
function stopGroupCallStatusListener() {
  if (grCallStatusRef && grCallStatusCb) { try { grCallStatusRef.off('value', grCallStatusCb); } catch (e) {} }
  grCallStatusRef = grCallStatusCb = null;
}
function renderGroupCallHeaderBtn(chatId, grData) {
  stopGroupCallStatusListener();
  const ha = document.getElementById('header-actions');
  if (!ha) return;
  document.getElementById('gr-call-btn')?.remove(); // убираем старую кнопку, иначе при повторном вызове (например после сохранения настроек группы) кнопки звонка накапливаются
  if (currentChatId !== chatId || currentChatType !== 'group') return;
  if (!currentUserCanCall()) return;
  const btn = document.createElement('button');
  btn.className = 'h-btn'; btn.id = 'gr-call-btn'; btn.title = 'Звонок';
  btn.textContent = '📞'; btn.onclick = () => startGroupCall(chatId);
  ha.prepend(btn);
  grCallStatusRef = db.ref('calls/group_' + chatId);
  grCallStatusCb = snap => {
    const v = snap.val(); const b = document.getElementById('gr-call-btn'); if (!b) return;
    const n = v && v.status === 'active' ? Object.keys(v.participants || {}).length : 0;
    b.classList.toggle('call-active-btn', n > 0);
    b.textContent = n > 0 ? `📞 ${n}` : '📞';
  };
  grCallStatusRef.on('value', grCallStatusCb);
}

async function leaveChannel(chatId) { await db.ref('channels/' + chatId + '/members/' + currentUser.uid).remove(); toast('Вы покинули канал'); document.getElementById('ch-' + chatId)?.remove(); openOfficial(); }
async function leaveGroup(chatId)   { await db.ref('groups/' + chatId + '/members/' + currentUser.uid).remove(); toast('Вы покинули группу'); document.getElementById('gr-' + chatId)?.remove(); openOfficial(); }

// ─── CHANNEL SETTINGS ────────────────────────────────────────
async function openChannelSettings(chatId) {
  editingChannelId = chatId;
  const snap = await db.ref('channels/' + chatId).once('value'); const data = snap.val(); if (!data) return;
  document.getElementById('ch-name').value = data.name || '';
  document.getElementById('ch-bio').value  = data.description || '';
  renderChAvPreview(data.avatarUrl || '');
  await renderChMemberList(chatId, data);
  openModal('channel-settings-modal');
}

async function renderChMemberList(chatId, data) {
  const list = document.getElementById('ch-members-list');
  list.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:6px">Загрузка...</div>';
  const members = data.members || {}, admins = data.admins || {}; const titles = data.memberTitles || {};
  const rows = [];
  for (const uid of Object.keys(members)) {
    const snap = await db.ref('users/' + uid).once('value'); const ud = snap.val(); if (!ud) continue;
    const role = members[uid]; const isAdm = admins[uid] && role !== 'owner';
    const title = titles[uid] || '';
    rows.push(`<div class="member-row">
      <div style="width:32px;height:32px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;overflow:hidden">
        ${ud.avatarUrl ? `<img src="${ud.avatarUrl}" style="width:100%;height:100%;object-fit:cover">` : avatarFallback(ud.username)}</div>
      <div class="m-info"><div class="m-name">${escHtml(ud.username)}</div></div>
      ${title ? `<span class="role-badge title">${escHtml(title)}</span>` : ''}
      ${role !== 'owner' ? `<button class="ua-btn icon-only" title="Задать роль" onclick="editChMemberTitle('${chatId}','${uid}','${escHtml(title).replace(/'/g,"\\'")}')">✏️</button>` : ''}
      ${role !== 'owner' ? `<button class="ua-btn icon-only" title="Права участника" onclick="openMemberPerms('${chatId}','${uid}','channel','${escHtml(ud.username).replace(/'/g,"\\'")}')">⚙️</button>` : ''}
      <span class="role-badge ${role === 'owner' ? 'owner' : isAdm ? 'admin' : 'member'}">${role === 'owner' ? 'Владелец' : isAdm ? 'Администратор' : 'Читатель'}</span>
      ${role !== 'owner' ? `<div class="member-actions">
        <button class="ua-btn ${isAdm ? 'block' : 'verify'}" onclick="toggleChAdmin('${chatId}','${uid}',${isAdm})">${isAdm ? 'Снять' : '+ Адм.'}</button>
        <button class="ua-btn delete" onclick="removeChMember('${chatId}','${uid}')">✕</button>
      </div>` : ''}
    </div>`);
  }
  list.innerHTML = rows.join('') || '<div style="color:var(--text3);font-size:12px;padding:6px">Нет участников</div>';
}
async function editChMemberTitle(chatId, uid, currentTitle) {
  const input = prompt('Роль участника (до 16 символов, оставьте пустым чтобы убрать):', currentTitle || '');
  if (input === null) return;
  const title = input.trim().slice(0, 16);
  try {
    if (title) await db.ref('channels/' + chatId + '/memberTitles/' + uid).set(title);
    else await db.ref('channels/' + chatId + '/memberTitles/' + uid).remove();
    const snap = await db.ref('channels/' + chatId).once('value'); await renderChMemberList(chatId, snap.val());
  } catch (e) { toast('⚠️ Не удалось сохранить роль: ' + (e.message || e)); }
}

async function toggleChAdmin(chatId, uid, isAdm) {
  if (isAdm) await db.ref('channels/' + chatId + '/admins/' + uid).remove();
  else        await db.ref('channels/' + chatId + '/admins/' + uid).set(true);
  const snap = await db.ref('channels/' + chatId).once('value'); await renderChMemberList(chatId, snap.val());
  toast(isAdm ? 'Права администратора сняты' : '✅ Теперь администратор канала');
}
async function removeChMember(chatId, uid) {
  if (!confirm('Удалить участника?')) return;
  await db.ref('channels/' + chatId + '/members/' + uid).remove();
  await db.ref('channels/' + chatId + '/admins/' + uid).remove();
  const snap = await db.ref('channels/' + chatId).once('value'); await renderChMemberList(chatId, snap.val());
}
async function addChAdmin() {
  const nick = document.getElementById('ch-add-admin-nick').value.trim(); if (!nick || !editingChannelId) return;
  const snap = await db.ref('usernames/' + nick.toLowerCase()).once('value'); const uid = snap.val();
  if (!uid) { toast('Пользователь не найден'); return; }
  await db.ref('channels/' + editingChannelId + '/members/' + uid).set('member');
  await db.ref('channels/' + editingChannelId + '/admins/' + uid).set(true);
  const cnt = (await db.ref('channels/' + editingChannelId + '/memberCount').once('value')).val() || 0;
  await db.ref('channels/' + editingChannelId + '/memberCount').set(cnt + 1);
  document.getElementById('ch-add-admin-nick').value = '';
  const chSnap = await db.ref('channels/' + editingChannelId).once('value'); await renderChMemberList(editingChannelId, chSnap.val());
  toast('✅ Администратор добавлен');
}
async function saveChannelSettings() {
  if (!editingChannelId) return;
  const name = document.getElementById('ch-name').value.trim(); const desc = document.getElementById('ch-bio').value.trim();
  if (!name) { toast('Введите название'); return; }
  await db.ref('channels/' + editingChannelId).update({ name, description: desc });
  closeModal('channel-settings-modal'); document.getElementById('chat-header-name').textContent = name; toast('✅ Сохранено');
}
async function deleteChannelAsSelf() {
  if (!editingChannelId || !confirm('Удалить канал навсегда?')) return;
  await db.ref('channels/' + editingChannelId).remove();
  closeModal('channel-settings-modal'); document.getElementById('ch-' + editingChannelId)?.remove(); openOfficial(); toast('🗑️ Канал удалён');
}

// ─── GROUP SETTINGS ──────────────────────────────────────────
async function openGroupSettings(chatId) {
  editingGroupId = chatId;
  const snap = await db.ref('groups/' + chatId).once('value'); const data = snap.val(); if (!data) return;
  document.getElementById('gr-name').value = data.name || '';
  document.getElementById('gr-bio').value  = data.description || '';
  document.getElementById('gr-calls-enabled').classList.toggle('on', data.callsEnabled !== false);
  renderGrAvPreview(data.avatarUrl || '');
  await renderGrMemberList(chatId, data);
  openModal('group-settings-modal');
}
async function renderGrMemberList(chatId, data) {
  const list = document.getElementById('gr-members-list');
  list.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:6px">Загрузка...</div>';
  const members = data.members || {}, admins = data.admins || {}; const titles = data.memberTitles || {}; const rows = [];
  for (const uid of Object.keys(members)) {
    const snap = await db.ref('users/' + uid).once('value'); const ud = snap.val(); if (!ud) continue;
    const role = members[uid]; const isAdm = admins[uid] && role !== 'owner';
    const title = titles[uid] || '';
    rows.push(`<div class="member-row">
      <div style="width:32px;height:32px;border-radius:50%;background:var(--surface3);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;overflow:hidden">
        ${ud.avatarUrl ? `<img src="${ud.avatarUrl}" style="width:100%;height:100%;object-fit:cover">` : avatarFallback(ud.username)}</div>
      <div class="m-info"><div class="m-name">${escHtml(ud.username)}</div></div>
      ${title ? `<span class="role-badge title">${escHtml(title)}</span>` : ''}
      ${role !== 'owner' ? `<button class="ua-btn icon-only" title="Задать роль" onclick="editGrMemberTitle('${chatId}','${uid}','${escHtml(title).replace(/'/g,"\\'")}')">✏️</button>` : ''}
      ${role !== 'owner' ? `<button class="ua-btn icon-only" title="Права участника" onclick="openMemberPerms('${chatId}','${uid}','group','${escHtml(ud.username).replace(/'/g,"\\'")}')">⚙️</button>` : ''}
      <span class="role-badge ${role === 'owner' ? 'owner' : isAdm ? 'admin' : 'member'}">${role === 'owner' ? 'Владелец' : isAdm ? 'Администратор' : 'Участник'}</span>
      ${role !== 'owner' ? `<div class="member-actions">
        <button class="ua-btn ${isAdm ? 'block' : 'verify'}" onclick="toggleGrAdmin('${chatId}','${uid}',${isAdm})">${isAdm ? 'Снять' : '+ Адм.'}</button>
        <button class="ua-btn delete" onclick="removeGrMember('${chatId}','${uid}')">✕</button>
      </div>` : ''}
    </div>`);
  }
  list.innerHTML = rows.join('') || '<div style="color:var(--text3);font-size:12px;padding:6px">Нет участников</div>';
}
async function toggleGrAdmin(chatId, uid, isAdm) {
  if (isAdm) await db.ref('groups/' + chatId + '/admins/' + uid).remove();
  else        await db.ref('groups/' + chatId + '/admins/' + uid).set(true);
  const snap = await db.ref('groups/' + chatId).once('value'); await renderGrMemberList(chatId, snap.val());
  toast(isAdm ? 'Права администратора сняты' : '✅ Теперь администратор группы');
}
async function editGrMemberTitle(chatId, uid, currentTitle) {
  const input = prompt('Роль участника (до 16 символов, оставьте пустым чтобы убрать):', currentTitle || '');
  if (input === null) return; // отмена
  const title = input.trim().slice(0, 16);
  try {
    if (title) await db.ref('groups/' + chatId + '/memberTitles/' + uid).set(title);
    else await db.ref('groups/' + chatId + '/memberTitles/' + uid).remove();
    const s = await db.ref('groups/' + chatId).once('value'); await renderGrMemberList(chatId, s.val());
  } catch (e) { toast('⚠️ Не удалось сохранить роль: ' + (e.message || e)); }
}
async function addGrMember() {
  const nick = document.getElementById('gr-add-member-nick').value.trim(); if (!nick || !editingGroupId) return;
  const snap = await db.ref('usernames/' + nick.toLowerCase()).once('value'); const uid = snap.val();
  if (!uid) { toast('Пользователь не найден'); return; }
  await db.ref('groups/' + editingGroupId + '/members/' + uid).set('member');
  const cnt = (await db.ref('groups/' + editingGroupId + '/memberCount').once('value')).val() || 0;
  await db.ref('groups/' + editingGroupId + '/memberCount').set(cnt + 1);
  document.getElementById('gr-add-member-nick').value = '';
  const grSnap = await db.ref('groups/' + editingGroupId).once('value'); await renderGrMemberList(editingGroupId, grSnap.val());
  toast('✅ Участник добавлен');
}
async function removeGrMember(chatId, uid) {
  if (!confirm('Удалить?')) return;
  await db.ref('groups/' + chatId + '/members/' + uid).remove();
  const s = await db.ref('groups/' + chatId).once('value'); await renderGrMemberList(chatId, s.val());
}
async function saveGroupSettings() {
  if (!editingGroupId) return;
  const name = document.getElementById('gr-name').value.trim(); const desc = document.getElementById('gr-bio').value.trim();
  if (!name) { toast('Введите название'); return; }
  const callsEnabled = document.getElementById('gr-calls-enabled').classList.contains('on');
  await db.ref('groups/' + editingGroupId).update({ name, description: desc, callsEnabled });
  closeModal('group-settings-modal'); document.getElementById('chat-header-name').textContent = name; toast('✅ Сохранено');
  if (currentChatId === editingGroupId && currentChatType === 'group') {
    currentChatData.callsEnabled = callsEnabled;
    renderGroupCallHeaderBtn(editingGroupId, currentChatData);
  }
}
async function deleteGroupAsSelf() {
  if (!editingGroupId || !confirm('Удалить группу навсегда?')) return;
  await db.ref('groups/' + editingGroupId).remove();
  closeModal('group-settings-modal'); document.getElementById('gr-' + editingGroupId)?.remove(); openOfficial(); toast('🗑️ Группа удалена');
}

// ─── ПРАВА УЧАСТНИКА (галочки: писать / реакции / настройки) ─
// Хранится в {groups|channels}/{chatId}/memberPerms/{uid} = {write, react, manage}.
// Поле пишется только если отличается от дефолта (write:true, react:true, manage:false),
// чтобы не раздувать базу пустыми объектами для обычных участников.
let mpChatId = null, mpUid = null, mpType = null;
function memberPermsPath(chatId, uid, type) {
  return (type === 'channel' ? 'channels/' : 'groups/') + chatId + '/memberPerms/' + uid;
}
async function openMemberPerms(chatId, uid, type, username) {
  mpChatId = chatId; mpUid = uid; mpType = type;
  document.getElementById('mp-username').textContent = username ? '· ' + username : '';
  const snap = await db.ref(memberPermsPath(chatId, uid, type)).once('value');
  const perms = snap.val() || {};
  document.getElementById('mp-write').classList.toggle('on', perms.write !== false);
  document.getElementById('mp-react').classList.toggle('on', perms.react !== false);
  document.getElementById('mp-manage').classList.toggle('on', perms.manage === true);
  document.getElementById('mp-call').classList.toggle('on', perms.call !== false);
  document.getElementById('mp-call-row').style.display = type === 'channel' ? 'none' : '';
  openModal('member-perms-modal');
}
async function saveMemberPerms() {
  if (!mpChatId || !mpUid || !mpType) return;
  const write  = document.getElementById('mp-write').classList.contains('on');
  const react  = document.getElementById('mp-react').classList.contains('on');
  const manage = document.getElementById('mp-manage').classList.contains('on');
  const call   = document.getElementById('mp-call').classList.contains('on');
  try {
    await db.ref(memberPermsPath(mpChatId, mpUid, mpType)).set({ write, react, manage, call });
    closeModal('member-perms-modal'); toast('✅ Права сохранены');
    // если сейчас открыт именно этот чат — сразу применяем изменения без перезахода
    if (currentChatId === mpChatId && mpUid === currentUser.uid) {
      const snap = await db.ref((mpType === 'channel' ? 'channels/' : 'groups/') + mpChatId).once('value');
      if (mpType === 'channel') openChannel(mpChatId, snap.val()); else openGroup(mpChatId, snap.val());
    }
  } catch (e) { toast('⚠️ Не удалось сохранить права: ' + (e.message || e)); }
}

// Может ли ТЕКУЩИЙ пользователь писать/реагировать в открытом сейчас чате
// (для group/channel — с учётом персональных прав из memberPerms)
function currentUserCanWrite() {
  if (!currentChatData) return true;
  if (currentChatData.ownerUid === currentUser.uid) return true;
  const perms = currentChatData.memberPerms?.[currentUser.uid];
  if (perms && perms.write === false) return false;
  if (currentChatType === 'channel') {
    const isAdm = currentChatData.admins?.[currentUser.uid];
    return !!(isAdm || currentUserData.isAdmin);
  }
  return true;
}
function currentUserCanReact() {
  if (!currentChatData) return true;
  if (currentChatData.ownerUid === currentUser.uid) return true;
  const perms = currentChatData.memberPerms?.[currentUser.uid];
  return !(perms && perms.react === false);
}
// Может ли текущий пользователь звонить/подключаться к звонку в открытой сейчас группе
function currentUserCanCall() {
  if (!currentChatData) return true;
  if (currentChatData.callsEnabled === false) return false;
  if (currentChatData.ownerUid === currentUser.uid || currentUserData.isAdmin) return true;
  const perms = currentChatData.memberPerms?.[currentUser.uid];
  return !(perms && perms.call === false);
}

