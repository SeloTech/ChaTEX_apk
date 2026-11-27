// ============================================================
//  ChaTEX — системная кнопка «Назад» в Android-приложении
//  Закрывает верхний открытый слой (история, окно, чат),
//  и только когда открытых слоёв нет — сворачивает приложение.
//  В обычном браузере плагин недоступен, работает прежняя логика (36-mobile.js).
// ============================================================
(function () {
  'use strict';

  // Самый верхний слой закрываем первым
  function closeTop() {
    // 1) просмотр историй
    const sv = document.getElementById('tx-story');
    if (sv && sv.classList.contains('open')) {
      if (window.TXStories) TXStories.close();
      return true;
    }
    // 2) открытые модальные окна (последнее в DOM — самое верхнее)
    const modals = Array.from(document.querySelectorAll('.modal.open, .modal-overlay.open'));
    if (modals.length) {
      const top = modals[modals.length - 1];
      if (top.id && typeof window.closeModal === 'function') window.closeModal(top.id);
      else top.classList.remove('open');
      return true;
    }
    // 3) открытый чат на телефоне — назад к списку
    const ca = document.getElementById('chat-area');
    if (ca && ca.classList.contains('visible') && typeof window.goBack === 'function') {
      window.goBack();
      return true;
    }
    return false;
  }

  window.TXBack = { closeTop };

  function arm() {
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!App || !App.addListener || arm.done) return;
    arm.done = true;
    App.addListener('backButton', () => {
      if (!closeTop()) {
        try { App.exitApp(); } catch (_) {}
      }
    });
  }
  arm();
  document.addEventListener('DOMContentLoaded', arm);
})();
