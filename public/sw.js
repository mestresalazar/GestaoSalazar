self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Nunca intercepta requisições de API ou WebSockets para garantir comunicação em tempo real
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
        return;
    }
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});

self.addEventListener('push', function(event) {
    let data = {
        title: '🚨 ALERTA DE AÇÃO - Gestão Salazar',
        body: 'Nova convocação urgente do Comando! Apresente-se imediatamente.',
        url: '/dashboard.html'
    };

    if (event.data) {
        try {
            const parsed = event.data.json();
            data = { ...data, ...parsed };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const tagAlerta = data.tag || data.id || 'salazar-alerta';
    const options = {
        body: data.body,
        icon: '/background.jpg',
        badge: '/background.jpg',
        vibrate: [200, 100, 200, 100, 400],
        tag: tagAlerta,
        renotify: false,
        requireInteraction: true,
        data: { url: data.url || '/dashboard.html', alertaId: tagAlerta }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/dashboard.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(targetUrl) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
