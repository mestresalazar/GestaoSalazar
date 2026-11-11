self.addEventListener('push', function(event) {
    let data = { title: 'Notificação Salazar', body: 'Nova mensagem do Comando.' };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: '/favicon.ico', // Podes colocar o ícone que preferires
        badge: '/favicon.ico',
        vibrate: [200, 100, 200]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/dashboard.html')
    );
});