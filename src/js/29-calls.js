// ============================================================
//  ЗВОНКИ (WebRTC mesh + сигнализация через RTDB)
// ============================================================
// Голос идёт напрямую между браузерами (или через STUN/TURN-релей) по
// протоколу WebRTC и шифруется на уровне медиапотока (DTLS-SRTP) — сервер
// Firebase видит только служебные SDP/ICE-данные для установления связи,
// сам голос/экран через него не проходит и не может быть им перехвачен.
//
// calls/{callId}                     = {chatId, chatType, callerUid, callerName, callerAvatar, calleeUid?, status, createdAt}
// calls/{callId}/participants/{uid}  = {name, avatarUrl, joinedAt, muted, sharing}
// calls/{callId}/signals/{from}/{to} = {desc:{type,sdp}, ice:{pushId:candidate}}
// callInvites/{calleeUid}/{callId}   = {callId, chatId, fromUid, fromName, fromAvatar, createdAt}  (только для ЛС — "звонок звонит")

// ВАЖНО: одних STUN-серверов недостаточно — за многими Wi-Fi/мобильными
// роутерами (symmetric NAT) браузеры вообще не могут напрямую обменяться
// медиапотоком, и тогда звонок формально "соединяется", но микрофон и
// демонстрация экрана не идут ни в одну сторону (то самое "чёрный экран" /
// "микро не работает"). TURN-релей — обязательный fallback на этот случай.
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

let callState = null;      // текущий активный/подключаемый звонок
let outgoingCall = null;   // исходящий вызов в ЛС, пока собеседник не ответил
let incomingCall = null;   // входящий вызов в ЛС, пока не приняли/отклонили
let callInviteListenerRef = null, callInviteAddedCb = null, callInviteRemovedCb = null;
let ringtoneAudio = null;
let dialingAudio = null;
let callChatOpen = false;
let callChatMoved = null; // {messagesArea:{node,parent,next}, inputArea:{...}}

// ─── ГЛОБАЛЬНЫЙ ЛИСТЕНЕР ВХОДЯЩИХ ЗВОНКОВ (ЛС) ────────────────
function initCallsSystem() {
  if (!currentUser) return;
  teardownCallsSystem();
  const ref = db.ref('callInvites/' + currentUser.uid);
  callInviteListenerRef = ref;
  callInviteAddedCb = snap => {
    const inv = snap.val(); if (!inv) return;
    if (callState || outgoingCall || incomingCall) {
      // уже заняты другим звонком — сразу отклоняем, не заставляя звонящего ждать
      db.ref('callInvites/' + currentUser.uid + '/' + inv.callId).remove();
      db.ref('calls/' + inv.callId).update({ status: 'declined' }).catch(() => {});
      return;
    }
    incomingCall = inv;
    showIncomingCallUI(inv);
    playRingtone();
  };
  callInviteRemovedCb = snap => {
    const inv = snap.val();
    if (incomingCall && inv && incomingCall.callId === inv.callId) {
      incomingCall = null; hideIncomingCallUI(); stopRingtone();
    }
  };
  ref.on('child_added', callInviteAddedCb);
  ref.on('child_removed', callInviteRemovedCb);
}
function teardownCallsSystem() {
  if (callInviteListenerRef) {
    try { callInviteListenerRef.off('child_added', callInviteAddedCb); callInviteListenerRef.off('child_removed', callInviteRemovedCb); } catch (e) {}
  }
  callInviteListenerRef = null;
  if (callState) leaveCallRoom();
  if (outgoingCall) cancelOutgoingCall();
  incomingCall = null; hideAllCallUI(); stopRingtone();
}

// ─── ЛС: ИСХОДЯЩИЙ ЗВОНОК ──────────────────────────────────────
async function startDMCall(uid) {
  if (callState) { toast('Вы уже в звонке'); return; }
  if (outgoingCall) { toast('У вас уже есть исходящий звонок'); return; }
  const dm = dmChatList[currentChatId];
  const userData = (dm && dm.userData) || {};
  const chatId = currentChatId;
  const callId = 'dm_' + [currentUser.uid, uid].sort().join('_');
  try {
    const exSnap = await db.ref('calls/' + callId).once('value'); const ex = exSnap.val();
    const hasRealParticipants = ex && ex.participants && Object.keys(ex.participants).length > 0;
    if (ex && ex.status === 'active' && hasRealParticipants) { toast('📞 Звонок уже идёт'); return; }
    await db.ref('calls/' + callId).set({
      chatId, chatType: 'dm', callerUid: currentUser.uid, callerName: currentUserData.username,
      callerAvatar: currentUserData.avatarUrl || null, calleeUid: uid, status: 'ringing', createdAt: Date.now()
    });
    await db.ref('callInvites/' + uid + '/' + callId).set({
      callId, chatId, fromUid: currentUser.uid, fromName: currentUserData.username,
      fromAvatar: currentUserData.avatarUrl || null, createdAt: Date.now()
    });
  } catch (e) { toast('⚠️ Не удалось начать звонок: ' + (e.message || e)); return; }

  outgoingCall = { callId, uid, userData, chatId };
  showOutgoingCallUI(userData);
  playDialing();
  const docRef = db.ref('calls/' + callId);
  const cb = snap => {
    const v = snap.val();
    if (!outgoingCall || outgoingCall.callId !== callId) return;
    if (!v) { finishOutgoing('Звонок завершён'); return; }
    if (v.status === 'declined') { finishOutgoing('📵 Звонок отклонён'); return; }
    if (v.status === 'active') {
      const o = outgoingCall;
      try { docRef.off('value', cb); } catch (e) {}
      clearTimeout(o.timeout);
      outgoingCall = null;
      stopDialing();
      joinCallRoom(callId, o.chatId, 'dm', { name: o.userData.username, avatarUrl: o.userData.avatarUrl || null });
    }
  };
  docRef.on('value', cb);
  outgoingCall.docRef = docRef; outgoingCall.cb = cb;
  outgoingCall.timeout = setTimeout(() => {
    if (outgoingCall && outgoingCall.callId === callId) { cancelOutgoingCall(); toast('📵 Нет ответа'); }
  }, 45000);
}
function finishOutgoing(msg) {
  if (!outgoingCall) return;
  try { outgoingCall.docRef.off('value', outgoingCall.cb); } catch (e) {}
  clearTimeout(outgoingCall.timeout);
  outgoingCall = null;
  hideAllCallUI(); stopRingtone(); stopDialing();
  if (msg) { toast(msg); playCallEndSound(); }
}
function cancelOutgoingCall() {
  if (!outgoingCall) return;
  const { callId, uid } = outgoingCall;
  db.ref('calls/' + callId).remove().catch(() => {});
  db.ref('callInvites/' + uid + '/' + callId).remove().catch(() => {});
  finishOutgoing(null);
  playCallEndSound();
}

// ─── ЛС: ВХОДЯЩИЙ ЗВОНОК ────────────────────────────────────────
function showIncomingCallUI(inv) {
  const ov = document.getElementById('call-overlay');
  document.getElementById('call-status-text').textContent = '📞 Входящий звонок';
  document.getElementById('call-peer-name').textContent = inv.fromName || '...';
  document.getElementById('call-timer').style.display = 'none';
  const av = document.getElementById('call-peer-avatar'); av.classList.add('ringing');
  av.innerHTML = inv.fromAvatar ? `<img src="${inv.fromAvatar}" alt="">` : avatarFallback(inv.fromName);
  document.getElementById('call-participants-row').innerHTML = '';
  document.getElementById('call-screen-share').style.display = 'none';
  document.getElementById('call-minimize-wrap').style.display = 'none';
  document.getElementById('call-actions-row').innerHTML =
    `<div class="call-btn-wrap"><button class="call-btn decline" onclick="declineIncomingCall()">✕</button><div class="call-btn-label">Отклонить</div></div>
     <div class="call-btn-wrap"><button class="call-btn accept" onclick="acceptIncomingCall()">📞</button><div class="call-btn-label">Принять</div></div>`;
  ov.classList.add('open');
}
function hideIncomingCallUI() {
  if (callState) return; // если уже в звонке — не гасим активный оверлей
  document.getElementById('call-overlay')?.classList.remove('open');
}
async function acceptIncomingCall() {
  if (!incomingCall) return;
  const inv = incomingCall; incomingCall = null;
  stopRingtone(); hideIncomingCallUI();
  try {
    await db.ref('callInvites/' + currentUser.uid + '/' + inv.callId).remove();
    await db.ref('calls/' + inv.callId + '/status').set('active');
  } catch (e) { toast('⚠️ Не удалось принять звонок: ' + (e.message || e)); return; }
  await joinCallRoom(inv.callId, inv.chatId, 'dm', { name: inv.fromName, avatarUrl: inv.fromAvatar || null });
}
function declineIncomingCall() {
  if (!incomingCall) return;
  const inv = incomingCall; incomingCall = null;
  stopRingtone(); hideIncomingCallUI();
  db.ref('callInvites/' + currentUser.uid + '/' + inv.callId).remove().catch(() => {});
  db.ref('calls/' + inv.callId).update({ status: 'declined' }).catch(() => {});
  playCallEndSound();
}

// ─── ГРУППОВОЙ ЗВОНОК ───────────────────────────────────────────
async function startGroupCall(chatId) {
  if (callState) { toast('Вы уже в звонке'); return; }
  if (currentChatData && currentChatData.callsEnabled === false) { toast('⛔ Звонки выключены в этой группе'); return; }
  if (!currentUserCanCall()) { toast('⛔ У вас нет прав на звонки в этой группе'); return; }
  const callId = 'group_' + chatId;
  try {
    const snap = await db.ref('calls/' + callId).once('value'); const existing = snap.val();
    if (!existing || existing.status !== 'active') {
      await db.ref('calls/' + callId).set({ chatId, chatType: 'group', callerUid: currentUser.uid, callerName: currentUserData.username, status: 'active', createdAt: Date.now() });
    }
  } catch (e) { toast('⚠️ Не удалось начать звонок: ' + (e.message || e)); return; }
  const grSnap = await db.ref('groups/' + chatId).once('value'); const gr = grSnap.val() || {};
  await joinCallRoom(callId, chatId, 'group', { name: gr.name || 'Группа', avatarUrl: gr.avatarUrl || null });
}

// ─── ОБЩАЯ ЛОГИКА ПОДКЛЮЧЕНИЯ К КОМНАТЕ ЗВОНКА (ЛС и группы) ───
async function joinCallRoom(callId, chatId, chatType, titleInfo) {
  if (callState && callState.callId === callId) return;
  if (callState) await leaveCallRoom();
  stopRingtone(); stopDialing();
  try {
    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    callState = {
      callId, chatId, chatType, peers: {}, localStream, screenStream: null,
      muted: false, sharing: false, participantsData: {}, title: titleInfo || {}, startedAt: Date.now()
    };
  } catch (e) {
    toast('⚠️ Нет доступа к микрофону'); hideAllCallUI(); return;
  }

  const myPartRef = db.ref('calls/' + callId + '/participants/' + currentUser.uid);
  await myPartRef.set({ name: currentUserData.username, avatarUrl: currentUserData.avatarUrl || null, joinedAt: Date.now(), muted: false, sharing: false });
  myPartRef.onDisconnect().remove();
  callState.myPartRef = myPartRef;
  await db.ref('calls/' + callId + '/status').set('active').catch(() => {});

  renderCallOverlayActive();
  startCallTimer();

  const partsRef = db.ref('calls/' + callId + '/participants');
  callState.partsRef = partsRef;
  callState.partsAddedCb = snap => {
    const uid = snap.key; if (uid === currentUser.uid) return;
    callState.participantsData[uid] = snap.val();
    ensurePeer(uid);
    renderParticipantsRow();
  };
  callState.partsChangedCb = snap => {
    const uid = snap.key; if (uid === currentUser.uid) return;
    callState.participantsData[uid] = snap.val();
    renderParticipantsRow();
  };
  callState.partsRemovedCb = snap => {
    const uid = snap.key; if (uid === currentUser.uid) return;
    delete callState.participantsData[uid];
    closePeer(uid);
    renderParticipantsRow();
    if (chatType === 'dm') { toast('📵 Собеседник завершил звонок'); leaveCallRoom(); }
  };
  partsRef.on('child_added', callState.partsAddedCb);
  partsRef.on('child_changed', callState.partsChangedCb);
  partsRef.on('child_removed', callState.partsRemovedCb);

  callState.topDocRef = db.ref('calls/' + callId);
  callState.topDocCb = snap => { if (!snap.val() && callState && callState.callId === callId) leaveCallRoom(true); };
  callState.topDocRef.on('value', callState.topDocCb);
}

async function leaveCallRoom(silentAlreadyGone) {
  if (!callState) return;
  const cs = callState;
  clearInterval(cs.timerInterval);
  try { cs.partsRef.off('child_added', cs.partsAddedCb); cs.partsRef.off('child_changed', cs.partsChangedCb); cs.partsRef.off('child_removed', cs.partsRemovedCb); } catch (e) {}
  try { cs.topDocRef.off('value', cs.topDocCb); } catch (e) {}
  Object.keys(cs.peers).forEach(uid => closePeer(uid));
  if (cs.localStream) cs.localStream.getTracks().forEach(t => t.stop());
  if (cs.screenStream) cs.screenStream.getTracks().forEach(t => t.stop());
  callState = null;
  if (!silentAlreadyGone) {
    try {
      await cs.myPartRef.remove();
      const remaining = (await db.ref('calls/' + cs.callId + '/participants').once('value')).val();
      if (!remaining || Object.keys(remaining).length === 0) db.ref('calls/' + cs.callId).remove().catch(() => {});
    } catch (e) {}
  }
  hideAllCallUI();
  playCallEndSound();
}
function hangupCall() {
  if (callState) leaveCallRoom();
  else if (outgoingCall) cancelOutgoingCall();
}

// ─── WEBRTC MESH (perfect negotiation, работает и для ЛС, и для групп) ─
function ensurePeer(otherUid) {
  if (!callState || callState.peers[otherUid]) return callState && callState.peers[otherUid];
  const polite = currentUser.uid < otherUid;
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const peer = { pc, polite, makingOffer: false, ignoreOffer: false, remoteVideoStream: null };
  callState.peers[otherUid] = peer;

  if (callState.localStream) callState.localStream.getTracks().forEach(t => pc.addTrack(t, callState.localStream));
  if (callState.screenStream) callState.screenStream.getTracks().forEach(t => pc.addTrack(t, callState.screenStream));

  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      db.ref(`calls/${callState.callId}/signals/${currentUser.uid}/${otherUid}/desc`).set({ type: pc.localDescription.type, sdp: pc.localDescription.sdp });
    } catch (e) { console.warn('negotiation error', e); } finally { peer.makingOffer = false; }
  };
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) db.ref(`calls/${callState.callId}/signals/${currentUser.uid}/${otherUid}/ice`).push(candidate.toJSON());
  };
  pc.ontrack = e => handleRemoteTrack(otherUid, e);
  // Если соединение разорвалось (сменилась сеть, NAT перестал пускать через
  // TURN и т.п.) — пробуем восстановить его через ICE restart, а не молча
  // остаёмся с мёртвым звонком без звука/картинки.
  pc.oniceconnectionstatechange = () => {
    if (!callState || !callState.peers[otherUid]) return;
    if (pc.iceConnectionState === 'failed') {
      pc.restartIce?.();
    }
  };

  const descRef = db.ref(`calls/${callState.callId}/signals/${otherUid}/${currentUser.uid}/desc`);
  const descCb = async snap => {
    const desc = snap.val(); if (!desc || !callState || !callState.peers[otherUid]) return;
    try {
      const offerCollision = desc.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
      peer.ignoreOffer = !peer.polite && offerCollision;
      if (peer.ignoreOffer) return;
      await pc.setRemoteDescription(desc);
      if (desc.type === 'offer') {
        await pc.setLocalDescription();
        db.ref(`calls/${callState.callId}/signals/${currentUser.uid}/${otherUid}/desc`).set({ type: pc.localDescription.type, sdp: pc.localDescription.sdp });
      }
    } catch (e) { console.warn('desc handling error', e); }
  };
  descRef.on('value', descCb);
  const iceRef = db.ref(`calls/${callState.callId}/signals/${otherUid}/${currentUser.uid}/ice`);
  const iceCb = async snap => {
    const cand = snap.val(); if (!cand || !callState || !callState.peers[otherUid]) return;
    try { await pc.addIceCandidate(cand); } catch (e) { if (!peer.ignoreOffer) console.warn('ice error', e); }
  };
  iceRef.on('child_added', iceCb);
  peer._descRef = descRef; peer._descCb = descCb; peer._iceRef = iceRef; peer._iceCb = iceCb;
  return peer;
}
function closePeer(otherUid) {
  if (!callState) return;
  const peer = callState.peers[otherUid]; if (!peer) return;
  try { peer._descRef.off('value', peer._descCb); peer._iceRef.off('child_added', peer._iceCb); } catch (e) {}
  try { peer.pc.close(); } catch (e) {}
  document.getElementById('call-audio-' + otherUid)?.remove();
  delete callState.peers[otherUid];
  updateRemoteShareVisibility();
}
function handleRemoteTrack(otherUid, e) {
  if (!callState) return;
  if (e.track.kind === 'audio') {
    let audioEl = document.getElementById('call-audio-' + otherUid);
    if (!audioEl) {
      audioEl = document.createElement('audio'); audioEl.id = 'call-audio-' + otherUid; audioEl.autoplay = true;
      document.getElementById('call-remote-audio-container')?.appendChild(audioEl);
    }
    audioEl.srcObject = e.streams[0];
    // На некоторых мобильных браузерах простого autoplay-атрибута не хватает,
    // поэтому явно запускаем воспроизведение — иначе собеседника не слышно,
    // хотя дорожка формально пришла.
    audioEl.play().catch(err => console.warn('remote audio play() blocked:', err));
  } else if (e.track.kind === 'video') {
    const peer = callState.peers[otherUid]; if (!peer) return;
    peer.remoteVideoStream = e.streams[0];
    e.track.onended = () => { if (callState && callState.peers[otherUid]) { callState.peers[otherUid].remoteVideoStream = null; updateRemoteShareVisibility(); } };
    updateRemoteShareVisibility();
  }
}

// ─── МИКРОФОН / ДЕМОНСТРАЦИЯ ЭКРАНА ─────────────────────────────
function toggleMic() {
  if (!callState || !callState.localStream) return;
  callState.muted = !callState.muted;
  callState.localStream.getAudioTracks().forEach(t => t.enabled = !callState.muted);
  const b1 = document.getElementById('call-mute-btn'); if (b1) { b1.classList.toggle('on', callState.muted); b1.textContent = callState.muted ? '🔇' : '🎙️'; }
  document.getElementById('cib-mute-btn')?.classList.toggle('on', callState.muted);
  callState.myPartRef.update({ muted: callState.muted }).catch(() => {});
}
async function toggleScreenShare() {
  if (!callState) return;
  if (!callState.sharing) {
    let stream;
    try { stream = await navigator.mediaDevices.getDisplayMedia({ video: true }); }
    catch (e) { return; } // пользователь отменил выбор окна/экрана
    callState.screenStream = stream; callState.sharing = true;
    const track = stream.getVideoTracks()[0];
    track.onended = () => { if (callState && callState.sharing) toggleScreenShare(); };
    Object.values(callState.peers).forEach(peer => peer.pc.addTrack(track, stream));
    const cont = document.getElementById('call-screen-share'), vid = document.getElementById('call-screen-video');
    vid.srcObject = stream; cont.style.display = 'flex';
    vid.play().catch(err => console.warn('local screen preview play() blocked:', err));
  } else {
    const track = callState.screenStream && callState.screenStream.getVideoTracks()[0];
    if (track) {
      Object.values(callState.peers).forEach(peer => {
        const sender = peer.pc.getSenders().find(s => s.track === track);
        if (sender) peer.pc.removeTrack(sender);
      });
      track.stop();
    }
    if (callState.screenStream) callState.screenStream.getTracks().forEach(t => t.stop());
    callState.screenStream = null; callState.sharing = false;
    updateRemoteShareVisibility();
  }
  document.getElementById('call-share-btn')?.classList.toggle('on', callState.sharing);
  document.getElementById('cib-share-btn')?.classList.toggle('on', callState.sharing);
  callState.myPartRef.update({ sharing: callState.sharing }).catch(() => {});
}
function updateRemoteShareVisibility() {
  if (!callState) return;
  const cont = document.getElementById('call-screen-share'), vid = document.getElementById('call-screen-video');
  if (callState.sharing) return; // собственная демонстрация уже показана
  const sharer = Object.values(callState.peers).find(p => p.remoteVideoStream);
  if (sharer) {
    vid.srcObject = sharer.remoteVideoStream; cont.style.display = 'flex';
    vid.play().catch(err => console.warn('remote screen play() blocked:', err));
  } else { cont.style.display = 'none'; vid.srcObject = null; }
}

// ─── UI: активный звонок ────────────────────────────────────────
function renderCallOverlayActive() {
  const ov = document.getElementById('call-overlay');
  const t = callState.title || {};
  document.getElementById('call-status-text').textContent = callState.chatType === 'group' ? '📞 Групповой звонок' : '📞 В звонке';
  document.getElementById('call-peer-name').textContent = t.name || (callState.chatType === 'group' ? 'Группа' : '...');
  document.getElementById('call-timer').style.display = '';
  const av = document.getElementById('call-peer-avatar'); av.classList.remove('ringing');
  av.innerHTML = t.avatarUrl ? `<img src="${t.avatarUrl}" alt="">` : avatarFallback(t.name);
  document.getElementById('call-screen-share').style.display = 'none';
  document.getElementById('call-minimize-wrap').style.display = '';
  document.getElementById('call-actions-row').innerHTML =
    `<div class="call-btn-wrap"><button class="call-btn mute" id="call-mute-btn" onclick="toggleMic()">🎙️</button><div class="call-btn-label">Микро</div></div>
     <div class="call-btn-wrap"><button class="call-btn hangup" onclick="hangupCall()">📵</button><div class="call-btn-label">Завершить</div></div>
     <div class="call-btn-wrap"><button class="call-btn share" id="call-share-btn" onclick="toggleScreenShare()">🖥️</button><div class="call-btn-label">Экран</div></div>
     <div class="call-btn-wrap"><button class="call-btn mute" id="call-chat-btn" onclick="toggleCallChat()">💬</button><div class="call-btn-label">Чат</div></div>`;
  ov.classList.add('open');
  document.getElementById('call-inline-bar')?.classList.remove('open');
  renderParticipantsRow();
}

// ─── ЧАТ ВО ВРЕМЯ ЗВОНКА (как в Discord) ────────────────────────
async function toggleCallChat() {
  const panel = document.getElementById('call-chat-panel');
  const wrap = document.getElementById('call-body-wrap');
  if (!panel || !wrap || !callState) return;
  hideCallMsgToast();
  if (!callChatOpen) {
    // запоминаем, какой чат был открыт, чтобы вернуть его после закрытия панели
    const prevChat = { id: currentChatId, type: currentChatType, data: currentChatData };

    // принудительно переключаемся на чат именно этого звонка (а не на то, что
    // было открыто в фоне до его начала) — иначе сообщения улетают не туда
    if (currentChatId !== callState.chatId || currentChatType !== callState.chatType) {
      try {
        if (callState.chatType === 'dm') {
          const otherUid = callState.chatId.split('_').find(p => p !== currentUser.uid);
          let userData = dmChatList[callState.chatId]?.userData;
          if (!userData) {
            const snap = await db.ref('users/' + otherUid).once('value');
            userData = snap.val() || { username: callState.title.name || '...', avatarUrl: callState.title.avatarUrl || null };
          }
          openDM(otherUid, userData);
        } else if (callState.chatType === 'group') {
          const snap = await db.ref('groups/' + callState.chatId).once('value');
          const grData = snap.val();
          if (grData) openGroup(callState.chatId, grData);
        }
      } catch (e) { console.warn('call chat switch error:', e); }
    }

    const messagesArea = document.getElementById('messages-area');
    const inputArea = document.getElementById('input-area');
    if (!messagesArea || !inputArea) { toast('Нет открытого чата'); return; }
    callChatMoved = {
      prevChat,
      messagesArea: { node: messagesArea, parent: messagesArea.parentNode, next: messagesArea.nextSibling },
      inputArea: { node: inputArea, parent: inputArea.parentNode, next: inputArea.nextSibling }
    };
    panel.appendChild(messagesArea);
    panel.appendChild(inputArea);
    panel.classList.add('open');
    wrap.classList.add('with-chat');
    callChatOpen = true;
    setTimeout(() => { messagesArea.scrollTop = messagesArea.scrollHeight; }, 0);
  } else {
    closeCallChat();
  }
  document.getElementById('call-chat-btn')?.classList.toggle('on', callChatOpen);
  document.getElementById('cib-chat-btn')?.classList.toggle('on', callChatOpen);
}
function closeCallChat() {
  if (!callChatOpen || !callChatMoved) return;
  const { messagesArea, inputArea, prevChat } = callChatMoved;
  if (messagesArea.next) messagesArea.parent.insertBefore(messagesArea.node, messagesArea.next);
  else messagesArea.parent.appendChild(messagesArea.node);
  if (inputArea.next) inputArea.parent.insertBefore(inputArea.node, inputArea.next);
  else inputArea.parent.appendChild(inputArea.node);
  callChatMoved = null; callChatOpen = false;
  document.getElementById('call-chat-panel')?.classList.remove('open');
  document.getElementById('call-body-wrap')?.classList.remove('with-chat');
  document.getElementById('call-chat-btn')?.classList.remove('on');
  document.getElementById('cib-chat-btn')?.classList.remove('on');

  // возвращаем тот чат, что был открыт до звонка/панели чата
  if (prevChat && prevChat.id !== currentChatId) {
    try {
      if (prevChat.type === 'dm') {
        const uid = prevChat.id.split('_').find(p => p !== currentUser.uid);
        const userData = dmChatList[prevChat.id]?.userData;
        if (uid && userData) openDM(uid, userData);
      } else if (prevChat.type === 'group' && prevChat.data) openGroup(prevChat.id, prevChat.data);
      else if (prevChat.type === 'channel' && prevChat.data) openChannel(prevChat.id, prevChat.data);
      else if (prevChat.type === 'official') openOfficial();
      else if (prevChat.type === 'support') openSupport();
      else if (prevChat.type === 'favorites') openFavorites();
      else if (prevChat.type === 'tickets-home') openTicketsHome();
      else if (prevChat.type === 'ticket' && prevChat.data) openTicket(prevChat.id);
    } catch (e) { console.warn('restore chat error:', e); }
  }
}

// ─── ПОЛНОЭКРАННЫЙ ПРОСМОТР ДЕМОНСТРАЦИИ ЭКРАНА ─────────────────
function toggleCallFullscreen() {
  const el = document.getElementById('call-screen-share');
  if (!el) return;
  if (!document.fullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen)?.call(el);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen)?.call(document);
  }
}
function renderParticipantsRow() {
  const row = document.getElementById('call-participants-row'); if (!row || !callState) return;
  const me = `<div class="call-participant-chip ${callState.muted ? 'muted' : ''}"><div class="cp-av">${currentUserData.avatarUrl ? `<img src="${currentUserData.avatarUrl}">` : avatarFallback(currentUserData.username)}</div>${escHtml(currentUserData.username)} (вы)</div>`;
  const others = Object.values(callState.participantsData).map(p =>
    `<div class="call-participant-chip ${p.muted ? 'muted' : ''}"><div class="cp-av">${p.avatarUrl ? `<img src="${p.avatarUrl}">` : avatarFallback(p.name)}</div>${escHtml(p.name || '')}</div>`
  ).join('');
  row.innerHTML = me + others;
}
function startCallTimer() {
  callState.timerInterval = setInterval(() => {
    if (!callState) return;
    const s = Math.floor((Date.now() - callState.startedAt) / 1000);
    const txt = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    const t1 = document.getElementById('call-timer'); if (t1) t1.textContent = txt;
    const t2 = document.getElementById('cib-text'); if (t2) t2.textContent = '📞 звонок · ' + txt;
  }, 1000);
}
function showOutgoingCallUI(userData) {
  const ov = document.getElementById('call-overlay');
  document.getElementById('call-status-text').textContent = '📞 Звоним...';
  document.getElementById('call-peer-name').textContent = userData.username || '...';
  document.getElementById('call-timer').style.display = 'none';
  const av = document.getElementById('call-peer-avatar'); av.classList.add('ringing');
  av.innerHTML = userData.avatarUrl ? `<img src="${userData.avatarUrl}" alt="">` : avatarFallback(userData.username);
  document.getElementById('call-participants-row').innerHTML = '';
  document.getElementById('call-screen-share').style.display = 'none';
  document.getElementById('call-minimize-wrap').style.display = 'none';
  document.getElementById('call-actions-row').innerHTML =
    `<div class="call-btn-wrap"><button class="call-btn decline" onclick="cancelOutgoingCall()">✕</button><div class="call-btn-label">Отмена</div></div>`;
  ov.classList.add('open');
}
function minimizeCall() { document.getElementById('call-overlay')?.classList.remove('open'); document.getElementById('call-inline-bar')?.classList.add('open'); }
function expandCall()   { document.getElementById('call-inline-bar')?.classList.remove('open'); document.getElementById('call-overlay')?.classList.add('open'); }
function hideAllCallUI() {
  closeCallChat();
  hideCallMsgToast();
  if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
  document.getElementById('call-overlay')?.classList.remove('open');
  document.getElementById('call-inline-bar')?.classList.remove('open');
  document.getElementById('call-peer-avatar')?.classList.remove('ringing');
  const rac = document.getElementById('call-remote-audio-container'); if (rac) rac.innerHTML = '';
  const pr = document.getElementById('call-participants-row'); if (pr) pr.innerHTML = '';
  const ss = document.getElementById('call-screen-share'); if (ss) ss.style.display = 'none';
}

// ─── ЗВУКИ ЗВОНКА (входящий/исходящий гудок и сброс) ────────────
function playRingtone() {
  try {
    if (!ringtoneAudio) { ringtoneAudio = new Audio('sounds/ringtone.mp3'); ringtoneAudio.loop = true; }
    ringtoneAudio.currentTime = 0; ringtoneAudio.play().catch(() => {});
  } catch (e) {}
}
function stopRingtone() {
  if (!ringtoneAudio) return;
  try { ringtoneAudio.pause(); ringtoneAudio.currentTime = 0; } catch (e) {}
}
function playDialing() {
  try {
    if (!dialingAudio) { dialingAudio = new Audio('sounds/dialing.mp3'); dialingAudio.loop = true; }
    dialingAudio.currentTime = 0; dialingAudio.play().catch(() => {});
  } catch (e) {}
}
function stopDialing() {
  if (!dialingAudio) return;
  try { dialingAudio.pause(); dialingAudio.currentTime = 0; } catch (e) {}
}
function playCallEndSound() {
  try { new Audio('sounds/callend.mp3').play().catch(() => {}); } catch (e) {}
}

// ─── УВЕДОМЛЕНИЕ О НОВОМ СООБЩЕНИИ ВО ВРЕМЯ ЗВОНКА ──────────────
// Показывается, если собеседник написал в чат звонка, пока сам чат
// не открыт поверх звонка (например, человек смотрит демонстрацию
// экрана или вообще свернул вкладку) — как всплывающее уведомление
// снизу справа, в духе Discord.
let callMsgToastTimer = null;
function maybeShowCallMsgToast(msg, chatId) {
  if (!callState || callChatOpen) return;
  if (chatId !== callState.chatId) return;
  if (!msg || msg.senderUid === currentUser.uid) return;
  if (!msg.timestamp || Date.now() - msg.timestamp > 4000) return; // не показываем историю при подгрузке
  showCallMsgToast(msg);
}
function showCallMsgToast(msg) {
  let el = document.getElementById('call-msg-toast');
  if (!el) return;
  const isVerified = msg.senderVerified === true;
  const nameHtml = escHtml(msg.senderName || 'Unknown') + (isVerified ? ` <span class="badge-verify">✓</span>` : '');
  let bodyText = msg.text ? escHtml(stripInlineEmojiTokens(msg.text)) : (msg.imageUrl ? '📷 Фото' : (msg.voiceUrl ? '🎵 Голосовое' : ''));
  const avatarHtml = msg.senderAvatar ? `<img src="${msg.senderAvatar}" alt="">` : '';
  el.innerHTML = `
    <div class="cmt-av">${avatarHtml}</div>
    <div class="cmt-body">
      <div class="cmt-name">${nameHtml}</div>
      <div class="cmt-text">${bodyText}</div>
    </div>`;
  el.onclick = () => { hideCallMsgToast(); if (!callChatOpen) toggleCallChat(); };
  el.classList.add('show');
  clearTimeout(callMsgToastTimer);
  callMsgToastTimer = setTimeout(hideCallMsgToast, 5000);
}
function hideCallMsgToast() {
  document.getElementById('call-msg-toast')?.classList.remove('show');
  clearTimeout(callMsgToastTimer);
}

// ─── Проверка версии приложения сразу при загрузке скрипта ────
// Не ждём логина: если пользователь висит на экране входа/регистрации
// на старой версии, баннер обновления тоже должен появиться.
listenAppVersion();
