// ============================================================
//  ChaTEX — защита отправки: ограничение частоты и запрет исполняемых файлов
// ============================================================
(function () {
  'use strict';
  // Не больше MAX_SENDS отправок за WINDOW_MS (защита от спама и флуда)
  const MAX_SENDS = 6, WINDOW_MS = 10000;
  const stamps = [];
  function rateOk() {
    const now = Date.now();
    while (stamps.length && now - stamps[0] > WINDOW_MS) stamps.shift();
    if (stamps.length >= MAX_SENDS) return false;
    stamps.push(now);
    return true;
  }
  // Исполняемые и потенциально опасные типы — не отправляются
  const BLOCKED_EXT = ['exe','bat','cmd','com','msi','scr','ps1','vbs','js','jar','apk','dll','reg','sh','app','dmg','pif','hta','lnk','iso'];
  function blockedFile(file) {
    if (!file || !file.name) return false;
    const ext = file.name.split('.').pop().toLowerCase();
    return BLOCKED_EXT.includes(ext);
  }

  // Оборачиваем существующие функции (вызовы по имени подхватят обёртку)
  const _sendMsg = sendMsg;
  sendMsg = async function (chatId) {
    const inp = document.getElementById('msg-input');
    const isEdit = typeof editingMsgId !== 'undefined' && editingMsgId;
    if (!isEdit && inp && inp.value.trim() && !rateOk()) {
      toast('⚠️ Слишком часто. Подождите несколько секунд');
      return;
    }
    return _sendMsg(chatId);
  };

  const _sendAttachment = sendAttachment;
  sendAttachment = async function (input, chatId) {
    const f = input && input.files && input.files[0];
    if (blockedFile(f)) {
      toast('⚠️ Этот тип файла нельзя отправлять (исполняемые файлы запрещены)', 4500);
      if (input && input.value !== undefined) input.value = '';
      return;
    }
    if (!rateOk()) { toast('⚠️ Слишком часто. Подождите несколько секунд'); if (input) input.value = ''; return; }
    return _sendAttachment(input, chatId);
  };

  const _sendImage = sendImage;
  sendImage = async function (input, chatId) {
    const f = input && input.files && input.files[0];
    if (f && (blockedFile(f) || !(f.type || '').startsWith('image/'))) {
      toast('⚠️ Это не изображение');
      if (input && input.value !== undefined) input.value = '';
      return;
    }
    return _sendImage(input, chatId);
  };

  window.TXGuard = { rateOk, blockedFile };
})();
