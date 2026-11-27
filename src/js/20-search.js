// ============================================================
//  SEARCH
// ============================================================
function searchUsers(query) {
  clearTimeout(searchTimer);
  const res = document.getElementById('search-results');
  if (!query.trim()) { res.style.display = 'none'; return; }
  searchTimer = setTimeout(async () => {
    const snap = await db.ref('users').orderByChild('username').startAt(query).endAt(query + '').limitToFirst(8).once('value');
    const results = []; snap.forEach(c => { if (c.key !== currentUser.uid) results.push({ uid: c.key, ...c.val() }); });
    const chSnap = await db.ref('channels').orderByChild('handle').startAt(query).endAt(query + '').limitToFirst(4).once('value');
    const channels = []; chSnap.forEach(c => { if (c.val().isPublic && !c.val().blocked) channels.push({ id: c.key, ...c.val() }); });
    if (!results.length && !channels.length) {
      res.style.display = 'block'; res.innerHTML = `<div style="padding:12px 14px;color:var(--text3);font-size:13px">Ничего не найдено</div>`; return;
    }
    res.style.display = 'block';
    res.innerHTML = [
      ...results.map(u => {
        const safeNick = String(u.username || '').replace(/\\/g,'\\').replace(/'/g, "\\'");
        return `<div class="search-result-item" data-uid="${u.uid}" data-username="${escHtml(u.username)}" onmousedown="if(event.button===0)startDM('${u.uid}')" oncontextmenu="event.preventDefault();showPersonCtx(event,{uid:'${u.uid}',username:'${safeNick}',type:'user'})">
        <div class="avatar" style="width:32px;height:32px;font-size:13px">${u.avatarUrl ? `<img src="${u.avatarUrl}" alt="">` : avatarFallback(u.username)}</div>
        <div><div style="font-size:13px;font-weight:600">${escHtml(u.username)}${roleBadgesHtml(u)}${friendsMap[u.uid]?' <span class="friend-badge">друг</span>':''}</div>
        <div style="font-size:11px;color:var(--text2);font-family:var(--mono)">@${escHtml(u.username)} · долгое нажатие: друзья</div></div></div>`;
      }),
      ...channels.map(ch => `<div class="search-result-item" onmousedown="joinChannel('${ch.id}')">
        <div class="avatar channel" style="width:32px;height:32px;font-size:14px">${ch.avatarUrl ? `<img src="${ch.avatarUrl}" alt="">` : '📡'}</div>
        <div><div style="font-size:13px;font-weight:600">${escHtml(ch.name)}${ch.verified ? ` <span class="badge-verify">✓</span>` : ''}</div>
        <div style="font-size:11px;color:var(--text2);font-family:var(--mono)">@${ch.handle} · ${ch.memberCount || 1} подписч.</div></div></div>`)
    ].join('');
    bindSearchResultsLongPress();
  }, 300);
}

function hideSearch() { setTimeout(() => { document.getElementById('search-results').style.display = 'none'; }, 200); }
function bindSearchResultsLongPress() {
  document.querySelectorAll('#search-results .search-result-item[data-uid]').forEach(el => {
    if (el.dataset.longpressBound) return;
    el.dataset.longpressBound = '1';
    bindPersonLongPress(el, () => ({ uid: el.dataset.uid, username: el.dataset.username, type: 'user' }));
  });
}

async function startDM(uid) {
  const snap = await db.ref('users/' + uid).once('value');
  document.getElementById('search-input').value = ''; document.getElementById('search-results').style.display = 'none';
  openDM(uid, snap.val());
}

async function joinChannel(chId) {
  document.getElementById('search-input').value = ''; document.getElementById('search-results').style.display = 'none';
  const snap = await db.ref('channels/' + chId).once('value'); const data = snap.val(); if (!data) return;
  if (!data.members?.[currentUser.uid]) {
    await db.ref('channels/' + chId + '/members/' + currentUser.uid).set('member');
    await db.ref('channels/' + chId + '/memberCount').set((data.memberCount || 1) + 1);
  }
  openChannel(chId, { ...data, members: { ...(data.members || {}), [currentUser.uid]: 'member' } });
}

