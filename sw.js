/* ميزانك: عامل خدمة خفيف للإشعارات المحلية، بلا تخزين مؤقت للبيانات. */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(openClients => {
      const existing = openClients.find(client => 'focus' in client);
      return existing ? existing.focus() : clients.openWindow('./');
    })
  );
});
