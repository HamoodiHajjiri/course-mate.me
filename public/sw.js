/* CourseMate service worker — handles Web Push delivery + click-through.
   Served from the site root so its scope covers the whole app. */

self.addEventListener('install', () => {
    // Activate this worker as soon as it's installed.
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Take control of open tabs without requiring a reload.
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch {
        payload = { title: 'CourseMate', body: event.data ? event.data.text() : '' };
    }

    const title = payload.title || 'CourseMate';
    const options = {
        body: payload.body || '',
        icon: payload.icon || '/logo.png',
        badge: '/logo.png',
        tag: payload.tag || undefined,
        renotify: !!payload.tag,
        data: { url: payload.url || '/' },
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus an already-open CourseMate tab if we can, then navigate it.
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    if ('navigate' in client) client.navigate(targetUrl).catch(() => {});
                    return;
                }
            }
            if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
        })
    );
});
