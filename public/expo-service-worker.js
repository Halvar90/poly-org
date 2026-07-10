/* global self, clients */

let notificationIcon = '/icon-192.png';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  try {
    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (data && data.fromExpoWebClient && data.fromExpoWebClient.notificationIcon) {
      notificationIcon = data.fromExpoWebClient.notificationIcon;
    }
  } catch {
    // ignore messages that aren't from expo-notifications
  }
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { body: event.data.text() };
  }

  const content = payload.body && typeof payload.body === 'object' ? payload.body : payload;
  const title = content.title || 'PolyOrg';
  const body = content.body || '';
  const data = content.data || {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: notificationIcon,
      badge: notificationIcon,
      data,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
      return undefined;
    }),
  );
});
