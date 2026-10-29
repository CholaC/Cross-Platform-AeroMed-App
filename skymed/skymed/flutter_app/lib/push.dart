import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'api.dart';

@pragma('vm:entry-point')
Future<void> backgroundMessage(RemoteMessage message) async {
  // Notification payloads are displayed by FCM when the app is in background.
}
class PushService {
  StreamSubscription<String>? refresh;
  StreamSubscription<RemoteMessage>? foreground;
  Future<void> enable(Api api, void Function(String) show) async {
    const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
    if (apiKey.isEmpty) throw Exception('Push is not configured. Set Firebase build defines; in-app updates remain available.');
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp(options: const FirebaseOptions(
        apiKey: apiKey,
        appId: String.fromEnvironment('FIREBASE_APP_ID'),
        messagingSenderId: String.fromEnvironment('FIREBASE_SENDER_ID'),
        projectId: String.fromEnvironment('FIREBASE_PROJECT_ID'),
      ));
    }
    FirebaseMessaging.onBackgroundMessage(backgroundMessage);
    final settings = await FirebaseMessaging.instance.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) throw Exception('Notification permission denied');
    final token = await FirebaseMessaging.instance.getToken(
      vapidKey: kIsWeb ? const String.fromEnvironment('FIREBASE_VAPID_KEY') : null,
    );
    if (token == null) throw Exception('No push token returned');
    await api.call('/devices', body: {'token': token});
    await refresh?.cancel(); await foreground?.cancel();
    refresh = FirebaseMessaging.instance.onTokenRefresh.listen((token) async {
      try { await api.call('/devices', body: {'token': token}); } catch (_) { show('Push registration needs retry'); }
    });
    foreground = FirebaseMessaging.onMessage.listen((m) => show(m.notification?.body ?? 'Outreach schedule updated'));
  }
  void dispose() { refresh?.cancel(); foreground?.cancel(); }
}
