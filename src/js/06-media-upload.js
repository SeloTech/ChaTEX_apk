// ============================================================
//  MEDIA UPLOAD
// ============================================================
async function uploadMedia(file) {
  if (cloudinaryName && cloudinaryPreset) {
    try { return await uploadToCloudinary(file); } catch (_) {}
  }
  return await uploadToImgbb(file);
}

async function uploadToCloudinary(file) {
  const fd = new FormData();
  fd.append('file', file); fd.append('upload_preset', cloudinaryPreset);
  const res  = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryName}/image/upload`, { method: 'POST', body: fd });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.secure_url;
}

async function uploadToImgbb(file) {
  const fd = new FormData(); fd.append('image', file);
  const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.success) throw new Error('ImgBB failed');
  return data.data.url;
}

// ─── AVATAR HELPERS ─────────────────────────────────────────
function selectMyAvt(src) {
  ['file', 'url', 'cloud'].forEach(s => document.getElementById('my-avt-' + s)?.classList.toggle('active', s === src));
  document.getElementById('my-avt-url-area').style.display   = src === 'url'   ? '' : 'none';
  document.getElementById('my-avt-cloud-area').style.display = src === 'cloud' ? '' : 'none';
  if (src === 'file') document.getElementById('profile-av-file').click();
}

async function uploadMyAvatar(input) {
  const file = input.files[0]; if (!file) return;
  openImageCropper(file, async (blob) => {
    document.getElementById('upload-progress').classList.add('show');
    try { const url = await uploadMedia(blob); await applyMyAvatarUrlTo(url); }
    catch (e) { toast('Ошибка загрузки: ' + e.message); }
    document.getElementById('upload-progress').classList.remove('show');
  });
}

async function applyMyAvatarUrl()   { const url = document.getElementById('my-av-url-val').value.trim();   if (url) await applyMyAvatarUrlTo(url); }
async function applyMyCloudAvatar() { const url = document.getElementById('my-av-cloud-val').value.trim(); if (url) await applyMyAvatarUrlTo(url); }

async function applyMyAvatarUrlTo(url) {
  await db.ref('users/' + currentUser.uid + '/avatarUrl').set(url);
  currentUserData.avatarUrl = url;
  renderMyAvatar(); renderProfileAvatar();
  toast('✅ Аватарка обновлена');
}

function selectChAvt(src) {
  ['file', 'url'].forEach(s => document.getElementById('ch-avt-' + s)?.classList.toggle('active', s === src));
  document.getElementById('ch-avt-url-area').style.display = src === 'url' ? '' : 'none';
  if (src === 'file') document.getElementById('ch-av-file').click();
}
async function uploadChAvatar(input) {
  const file = input.files[0]; if (!file || !editingChannelId) return;
  document.getElementById('upload-progress').classList.add('show');
  try { const url = await uploadMedia(file); await db.ref('channels/' + editingChannelId + '/avatarUrl').set(url); renderChAvPreview(url); }
  catch (e) { toast('Ошибка: ' + e.message); }
  document.getElementById('upload-progress').classList.remove('show');
}
async function applyChAvatarUrl() {
  const url = document.getElementById('ch-av-url-val').value.trim();
  if (!url || !editingChannelId) return;
  await db.ref('channels/' + editingChannelId + '/avatarUrl').set(url); renderChAvPreview(url);
}
function renderChAvPreview(url) {
  const el = document.getElementById('ch-av-preview');
  el.innerHTML = url ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover">` : '📡';
}

function selectGrAvt(src) {
  ['file', 'url'].forEach(s => document.getElementById('gr-avt-' + s)?.classList.toggle('active', s === src));
  document.getElementById('gr-avt-url-area').style.display = src === 'url' ? '' : 'none';
  if (src === 'file') document.getElementById('gr-av-file').click();
}
async function uploadGrAvatar(input) {
  const file = input.files[0]; if (!file || !editingGroupId) return;
  document.getElementById('upload-progress').classList.add('show');
  try { const url = await uploadMedia(file); await db.ref('groups/' + editingGroupId + '/avatarUrl').set(url); renderGrAvPreview(url); }
  catch (e) { toast('Ошибка: ' + e.message); }
  document.getElementById('upload-progress').classList.remove('show');
}
async function applyGrAvatarUrl() {
  const url = document.getElementById('gr-av-url-val').value.trim();
  if (!url || !editingGroupId) return;
  await db.ref('groups/' + editingGroupId + '/avatarUrl').set(url); renderGrAvPreview(url);
}
function renderGrAvPreview(url) {
  const el = document.getElementById('gr-av-preview');
  el.innerHTML = url ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover">` : '👥';
}

