// ============================================================
//  GLOBAL EVENT LISTENERS
// ============================================================
document.addEventListener('click', e => {
  if (Date.now() - (window.__lpAt || 0) < 700) return;   // синтетический click после долгого нажатия
  if (!document.getElementById('ctx-menu').contains(e.target))      closeCtxMenu();
  if (!document.getElementById('reaction-picker').contains(e.target)) closeReactionPicker();
  const pcm = document.getElementById('person-ctx-menu');
  if (pcm && !pcm.contains(e.target)) closePersonCtx();
  const ccm = document.getElementById('chan-ctx-menu');
  if (ccm && !ccm.contains(e.target)) closeChanCtx();
  const tcm = document.getElementById('ticket-ctx-menu');
  if (tcm && !tcm.contains(e.target)) closeTicketCtx();
  const sp = document.getElementById('sticker-picker');
  if (sp && sp.classList.contains('open') && !sp.contains(e.target) && !e.target.closest('.sticker-btn')) hideStickerPicker();
});

document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeCtxMenu(); closeReactionPicker(); closePersonCtx(); closeChanCtx(); closeTicketCtx(); cancelEdit(); cancelReply(); }
  if (e.key === 'Enter') {
    const screen = document.getElementById('auth-screen');
    if (screen.style.display !== 'none') {
      const ap = document.querySelector('.auth-panel.active');
      if (ap?.id === 'panel-login')    doLogin();
      else if (ap?.id === 'panel-register') doRegister();
    }
  }
});

window.addEventListener('beforeunload', () => stopTyping());
