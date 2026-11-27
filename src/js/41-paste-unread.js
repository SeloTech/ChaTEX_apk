// ============================================================
//  ВСТАВКА из буфера (Ctrl+V) картинок и файлов в поле сообщения
//  Текст вставляется штатно; картинки/файлы уходят как вложение в текущий чат.
// ============================================================
document.addEventListener('paste', e => {
  const t = e.target;
  if (!t || t.id !== 'msg-input') return;
  const items = [...((e.clipboardData && e.clipboardData.files) || [])];
  if (!items.length) return;                 // обычный текст — вставка по умолчанию
  e.preventDefault();
  if (!currentChatId) return;
  items.forEach(file => {
    if (file.size > MAX_FILE_SIZE) { toast('⚠️ Файл больше 25 МБ, отправка недоступна'); return; }
    if (typeof sendAttachment === 'function') sendAttachment({ files: [file], value: '' }, currentChatId);
  });
});
