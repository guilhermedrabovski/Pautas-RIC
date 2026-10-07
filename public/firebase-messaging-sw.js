importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const LOGO_URL = 'https://media.licdn.com/dms/image/v2/C4D0BAQG1MVAq9NsJmQ/company-logo_200_200/company-logo_200_200/0/1678299841092/gruporicpr_logo?e=2147483647&v=beta&t=i7G-u_n_6wi5V3PI3ZLF3LfYC_dNwzDjnkMZGMSDKyo';

// Initialize Firebase in Service Worker
firebase.initializeApp({
  apiKey: "AIzaSyCVleXttSGjn_i8Se0gwvksav1fOnjvq4A",
  authDomain: "koditube-390201.firebaseapp.com",
  projectId: "koditube-390201",
  storageBucket: "koditube-390201.firebasestorage.app",
  messagingSenderId: "939125916101",
  appId: "1:939125916101:web:6ed191257557796189cbac"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Mensagem recebida em segundo plano:', payload);
  const notificationTitle = payload.notification?.title || payload.data?.title || '🚨 Central RIC Notícias';
  const notificationBody = payload.notification?.body || payload.data?.body || 'Nova pauta urgente na redação!';
  const isUrgent = payload.data?.isUrgent === 'true' || (notificationTitle && notificationTitle.includes('URGENTE'));

  const notificationOptions = {
    body: notificationBody,
    icon: LOGO_URL,
    badge: LOGO_URL,
    vibrate: isUrgent ? [400, 150, 400, 150, 700] : [200, 100, 200],
    requireInteraction: isUrgent,
    tag: payload.data?.pautaId ? `pauta-${payload.data.pautaId}` : `ric-alert-${Date.now()}`,
    renotify: true,
    data: {
      url: payload.data?.url || '/ilhas-de-edicao',
      timestamp: Date.now()
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/ilhas-de-edicao';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client && client.url && !client.url.includes(targetUrl)) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
