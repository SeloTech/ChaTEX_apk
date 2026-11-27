// Минимальный service worker: делает ChaTEX устанавливаемым (PWA), ничего не кэширует,
// поэтому баннер «Вышло обновление» и обновления Firebase Hosting работают как раньше.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// Клик по системному уведомлению: фокусируем открытое окно ChaTEX или открываем его
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => 'focus' in x);
    return c ? c.focus() : self.clients.openWindow('/');
  }));
});
