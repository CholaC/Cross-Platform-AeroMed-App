// Replace values with the same public Firebase web configuration used at build time.
// Register this worker only after configuring Firebase; no private credentials belong here.
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js');
firebase.initializeApp({apiKey: 'CONFIGURE_ME', projectId: 'CONFIGURE_ME', messagingSenderId: 'CONFIGURE_ME', appId: 'CONFIGURE_ME'});
firebase.messaging();
