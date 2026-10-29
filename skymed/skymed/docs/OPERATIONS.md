# Configuration, messaging and verification

## Configuration

Copy `server/.env.example` to `.env`. The repository contains no live credentials. `DELIVERY_MODE=simulation` is the default; it changes SMS/push records to `simulated` without network calls. In-app notices are immediately `available`.

For real providers, set `DELIVERY_MODE=live` plus the following adapters. Outbox retries occur every 15 seconds, up to five attempts; permanent failure remains visible. The prototype does not implement delivery receipts or exponential backoff. FCM batch delivery may retry already-accepted devices if a later device fails; use `noticeId` for downstream deduplication if needed.

### SMS relay

`SMS_RELAY_URL`, `SMS_RELAY_TOKEN`: an organisation-controlled HTTPS relay which accepts:

```json
{"to":"registered-phone","message":"minimal schedule update","reference":"notification-uuid"}
```

Headers include bearer token and `Idempotency-Key` equal to notification UUID. A 2xx response is recorded as `provider_accepted`, never `delivered` or `read`. Integrate the relay with the chosen SMS provider and validate its contract before live use. No provider-specific SMS account is assumed.

### Firebase push

Server requires `FCM_PROJECT_ID` and `FCM_ACCESS_TOKEN` (Google OAuth bearer access token with messaging permissions). The prototype reads the token from the environment; it expires and is **not refreshed automatically**. Managed credential refresh is required for unattended deployment.

Flutter build defines:

- FIREBASE_API_KEY
- FIREBASE_APP_ID (platform-specific Android or web app ID)
- FIREBASE_SENDER_ID
- FIREBASE_PROJECT_ID
- FIREBASE_VAPID_KEY (web only)

Set these to your Firebase project's public client configuration. Configure the Android app/package in Firebase. Set matching public web configuration in `flutter_app/web/firebase-messaging-sw.js`. FlutterFire can generate the corresponding platform configuration using its official setup workflow. Request notification permission through the Notifications screen. Tokens are registered only for the signed-in account; token refresh is handled while signed in. Signing out unregisters all push tokens for that user in this prototype.

The lightweight Node web portal supports notifications while the page is open, via permission + in-app polling. **Background web push is implemented through the Flutter web Firebase client**, and requires the worker and Firebase configuration above. Test foreground, background, closed-tab and permission-denied cases on supported devices. Client and provider connectivity are required; no delivery guarantee is made.

Official setup references:
- https://firebase.google.com/docs/cloud-messaging/flutter/get-started
- https://firebase.google.com/docs/cloud-messaging/flutter/receive
- https://firebase.google.com/docs/cloud-messaging/auth-server

### USSD

Use the simulator without a telecom account in development. For `NODE_ENV=production`, a configured `USSD_GATEWAY_SECRET` is required on every callback as `X-Gateway-Secret`. The gateway must authenticate the phone number and supply stable session/step IDs; do not expose its secret in a browser or mobile client. The local browser simulator deliberately cannot authenticate to a production webhook. Sessions expire after five minutes. Expired sessions do not silently submit requests.

## Tests

```bash
cd server
npm ci
PYTHON=.venv/bin/python npm test
node node_modules/eslint/bin/eslint.js .
```

For the browser scenario, install Playwright and Chromium in the verification environment, start the server against a fresh demo database, then run `node test/browser.test.js`. That script expects port 3000. It creates synthetic requests/schedules and writes screenshots under a temporary OS directory. These screenshots are for local QA only.

```bash
cd flutter_app
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
flutter build web
```

The supplied CI runs server tests and Flutter checks/builds on a suitable runner. CI has been written but not executed in this workspace. Browser and Flutter checks remain required gates, not completed evidence.

## Container

`server/Dockerfile` installs Node, Python and ML dependencies and runs as the non-root node user. Default mode is the local demo. For production use, set `NODE_ENV=production`, create users explicitly, set the gateway secret, use a fresh protected database volume and place TLS termination in front. Container build was not run here.

## Persistence and updates

SQLite database defaults to `server/data/skymed.db` and uses WAL. Back up using SQLite backup facilities or stop the server and copy database plus any WAL files coherently. Do not copy the main file alone while writes are active. This delivery excludes existing database records, downloaded dependencies, credentials, Git history, and cache files.
