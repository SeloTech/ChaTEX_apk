// ============================================================
//  ADMIN EDIT USER (nick / avatar / email)
// ============================================================
let adminEditUid = null;
async function openAdminEditUser(uid) {
  const snap = await db.ref('users/' + uid).once('value');
  const ud = snap.val(); if (!ud) { toast('Пользователь не найден'); return; }
  adminEditUid = uid;
  document.getElementById('admin-edit-nick').value = ud.username || '';
  document.getElementById('admin-edit-email').value = ud.email || '';
  document.getElementById('admin-edit-avatar').value = ud.avatarUrl || '';
  document.getElementById('admin-edit-preview').innerHTML = ud.avatarUrl
    ? `<img src="${ud.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : avatarFallback(ud.username || '?');
  const superEl = document.getElementById('admin-edit-super');
  const verEl = document.getElementById('admin-edit-verified');
  const admEl = document.getElementById('admin-edit-admin');
  const premEl = document.getElementById('admin-edit-premium');
  if (superEl) superEl.className = 'toggle' + (ud.isSuperAdmin ? ' on' : '');
  if (verEl) verEl.className = 'toggle' + (ud.verified ? ' on' : '');
  if (admEl) admEl.className = 'toggle' + ((ud.isAdmin || ud.isSuperAdmin) ? ' on' : '');
  if (premEl) premEl.className = 'toggle' + (ud.premium ? ' on' : '');
  openModal('admin-edit-user-modal');
}
async function saveAdminEditUser() {
  if (!adminEditUid || !currentUserData.isAdmin) return;
  const nick = document.getElementById('admin-edit-nick').value.trim();
  const email = document.getElementById('admin-edit-email').value.trim();
  const avatar = document.getElementById('admin-edit-avatar').value.trim();
  if (!/^[a-zA-Z0-9_]{2,20}$/.test(nick)) { toast('Ник: 2-20 латиница/цифры/_'); return; }

  const usnap = await db.ref('users/' + adminEditUid).once('value');
  const old = usnap.val() || {};
  const oldNick = (old.username || '').toLowerCase();
  const newNick = nick.toLowerCase();

  if (newNick !== oldNick) {
    const taken = await db.ref('usernames/' + newNick).once('value');
    if (taken.val() && taken.val() !== adminEditUid) { toast('Ник уже занят'); return; }
    if (oldNick) await db.ref('usernames/' + oldNick).remove();
    await db.ref('usernames/' + newNick).set(adminEditUid);
  }

  const isSuper = document.getElementById('admin-edit-super')?.classList.contains('on');
  const isVer = document.getElementById('admin-edit-verified')?.classList.contains('on');
  const isPrem = document.getElementById('admin-edit-premium')?.classList.contains('on');
  let isAdm = document.getElementById('admin-edit-admin')?.classList.contains('on');
  if (isSuper) isAdm = true;
  const updates = {
    username: nick,
    avatarUrl: avatar || null,
    isSuperAdmin: !!isSuper,
    isAdmin: !!isAdm,
    verified: !!isVer,
    premium: !!isPrem
  };
  if (isPrem) {
    // если Premium уже был активен — не сбрасываем оставшийся срок, иначе выдаём на месяц
    updates.premiumExpiresAt = isPremiumActive(old.premium, old.premiumExpiresAt) ? old.premiumExpiresAt : (Date.now() + PREMIUM_DURATION_MS);
  } else {
    updates.premiumExpiresAt = null;
  }
  const emailChanged = email && email !== (old.email || '');
  if (email && !emailChanged) updates.email = email; // без изменений — просто пишем как было
  await db.ref('users/' + adminEditUid).update(updates);

  // Email меняем ОТДЕЛЬНО через Cloud Function (adminUpdateUserEmail), чтобы
  // он поменялся и в Realtime Database, и в самом Firebase Authentication —
  // клиентский SDK не может менять Auth-email чужого аккаунта, только Admin SDK на бэкенде.
  if (emailChanged) {
    if (adminEditUid === currentUser.uid) {
      // себе можно поменять и напрямую через клиентский SDK
      try {
        await currentUser.updateEmail(email);
        await db.ref('users/' + adminEditUid).update({ email });
        currentUserData.email = email;
        toast('✅ Профиль и email обновлены (может потребоваться повторный вход)');
      } catch (e) {
        toast('⚠️ Ник/аватар сохранены, email в Auth не обновлён: ' + (e.message || 'нужна повторная авторизация'));
      }
    } else {
      if (!EMAIL_ADMIN_API_URL) {
        toast('⚠️ Ник/аватар сохранены. Email в Auth НЕ изменён: сервер смены email не настроен (см. email-admin-server/README.md)');
      } else {
        try {
          const idToken = await currentUser.getIdToken();
          const resp = await fetch(EMAIL_ADMIN_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
            body: JSON.stringify({ uid: adminEditUid, email })
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(data.error || 'Ошибка сервера');
          toast('✅ Пользователь обновлён, email изменён в Auth и в БД');
        } catch (e) {
          toast('⚠️ Ник/аватар сохранены, email в Auth НЕ изменён: ' + (e.message || 'ошибка сети'));
        }
      }
    }
  } else if (adminEditUid === currentUser.uid) {
    currentUserData.username = nick;
    currentUserData.avatarUrl = avatar || null;
    currentUserData.premium = !!isPrem;
    currentUserData.premiumExpiresAt = updates.premiumExpiresAt;
    currentUserData.verified = !!isVer;
    currentUserData.isAdmin = !!isAdm;
    currentUserData.isSuperAdmin = !!isSuper;
    const nameEl = document.getElementById('my-name-el');
    const statusEl = document.getElementById('my-status-el');
    const avEl = document.getElementById('my-avatar-el');
    if (nameEl) nameEl.textContent = nick;
    if (statusEl) statusEl.textContent = '@' + nick;
    if (avEl) avEl.innerHTML = avatar ? `<img src="${avatar}" alt="">` : avatarFallback(nick);
    toast('✅ Профиль обновлён');
  } else {
    toast('✅ Пользователь обновлён');
  }
  closeModal('admin-edit-user-modal');
  loadAdminUsers(document.getElementById('admin-search-user')?.value || '');
}
function previewAdminEditAvatar() {
  const url = document.getElementById('admin-edit-avatar').value.trim();
  const el = document.getElementById('admin-edit-preview');
  if (url) el.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.parentNode.textContent='?'">`;
}
async function uploadAdminEditAvatar(input) {
  const file = input.files[0]; if (!file) return;
  openImageCropper(file, async (blob) => {
    document.getElementById('upload-progress')?.classList.add('show');
    try {
      const url = await uploadMedia(blob);
      document.getElementById('admin-edit-avatar').value = url;
      previewAdminEditAvatar();
    } catch (e) { toast('Ошибка загрузки: ' + e.message); }
    document.getElementById('upload-progress')?.classList.remove('show');
  });
  input.value = '';
}


