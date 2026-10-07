importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// This is the "compat" version which is simpler for a standalone script
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
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/pwa-192x192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
