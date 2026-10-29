# SkyMed Zambia — Android, web and Linux USSD implementation

Updated 27 October 2026. Research prototype built from the attached Mpepo Flutter Android template and SkyMed Linux simulator.

## What is included

| Folder | Purpose |
|---|---|
| `flutter_app/` | Flutter Android and responsive Flutter web client, API service, optional Firebase push registration |
| `server/` | Revised Linux Node server, authenticated responsive web portal, persistent SQLite database, USSD simulator, notification outbox, Python ML experiment |
| `docs/` | Requirement traceability, architecture/schema, runbook and verification status |
| `.github/workflows/checks.yml` | Server and Flutter verification/build workflow |

The **five requirements in the latest instruction** govern this implementation. The older brief's learning module and water transport are not active features. The diagram guide's component separation and train/validation/test workflow inform the implementation; generic hospital and electric-car example figures are not implemented as project requirements.

## Start the Linux server and web portal

Prerequisites: Node.js **24**, Python **3.10+**, npm; internet for initial dependency installation.

```bash
cd server
npm ci
python3 -m venv .venv
.venv/bin/pip install -r ml/requirements.txt
cp .env.example .env
# In .env, set PYTHON=.venv/bin/python
npm start
```

Open `http://localhost:3000` for the web portal and `http://localhost:3000/simulator.html` for USSD. The native responsive portal is usable without a Flutter build. Both web clients and the Android client use the same API/database.

### Development accounts

| Username | Role | Facility / phone |
|---|---|---|
| worker | Health professional | 101 / 260977000001 |
| dispatcher | Dispatcher | Cross-facility planning |
| flightops | Flight operations | Cross-facility planning |

Development password: `DemoPass123!`. Accounts are inserted only when the initial empty database is created outside production. Do not reuse a development database for production. Production users can be created with `server/scripts/create-user.js`; its password is read from stdin. All built-in facilities, distances, teams and vehicles are **synthetic demonstration data**.

### Demonstrate the full workflow

1. Sign in as `worker`; request Cardiology at facility 101 for a future date. Note assigned facility/specialty queue position and pending approved date.
2. Sign in as `dispatcher`; compare Lusaka to 101. Road is a synthetic 145 km / 174 min leg; air uses a Haversine estimate and airfield/range checks.
3. In Schedule, choose facility 101, origin Lusaka, Cardiology, aircraft `air-1`, team `team-1`, and an eight-hour future reservation. Check conflicts, choose Approved and confirm.
4. Approval links pending requests for the same facility and specialty with requested dates on or before the visit date. This rule is displayed before approval. Requests for later dates remain queued.
5. Worker sees the approved date and in-app update. SMS/push outbox entries become `simulated` on the next 15-second delivery cycle unless live adapters are configured.
6. Try an overlapping assignment: it is rejected. Revise with a reason, then cancel with a reason. Each revision produces notices and audit history; cancellation returns linked requests to the pending queue.
7. Open the USSD simulator using registered phone `260977000001`; dial the **proposed, simulated** `*2575#`, choose 1, specialist, future date, then 1 to confirm. Choose 2 in a new session to see queue/date information.
8. Run Simulation as a planner to compare model validation scores, holdout metrics and ranked factors.

2575 is a proposed simulation label. This implementation does not provision a telecom USSD code or verify that a voice toll-free number can be used as a USSD service. USSD needs mobile-network coverage, even when no mobile internet is available.

## Flutter Android and Flutter web

Prerequisites: Flutter stable with Dart >=3.9.2, Android SDK and JDK 17 for Android.

```bash
cd flutter_app
# The supplied template did not include the Gradle wrapper binary/scripts.
# Generate missing Flutter platform scaffolding, retaining the supplied source.
flutter create --platforms=android,web .
flutter pub get
flutter analyze
flutter test
# Android emulator connects to host through 10.0.2.2.
flutter run --dart-define=API_URL=http://10.0.2.2:3000/api/v1
# Flutter web dev server; server CORS default permits this origin.
flutter run -d chrome --web-port=8080 --dart-define=API_URL=http://localhost:3000/api/v1
# A debug APK is intended for local validation only.
flutter build apk --debug --dart-define=API_URL=http://10.0.2.2:3000/api/v1
flutter build web --dart-define=API_URL=https://YOUR-SERVER/api/v1
```

On a physical phone, use the server's reachable address. HTTP is allowed only by the Android debug manifest; release builds require HTTPS. Before distribution, configure application ID, release signing, approved domain and platform credentials. The inherited release signing placeholder must be replaced.

To serve the Flutter web build from the same Node server, copy `build/web/` into `server/public/flutter/`, build with `--base-href=/flutter/`, and use `API_URL=https://YOUR-SERVER/api/v1`. The lightweight web portal remains at `/`.

## Verification status

- Backend integration suite: **8 test groups passed**, covering authentication, scope restrictions, idempotency, USSD confirmation/retries/expiry, routes, scheduling conflicts/revisions, cancellation notices and ML results.
- Server lint: passed using the ESLint Node entry point (the uploaded npm shim lacked executable permissions).
- JavaScript syntax checks: passed for server and web scripts.
- Flutter analysis, widget tests, APK and Flutter web builds: **not run here**; Flutter/Android toolchains are absent, and the SDK download attempt failed.
- Browser rendering/end-to-end test: **not run here**; Chromium is absent and its download failed. `server/test/browser.test.js` provides the test for a machine with Playwright/Chromium.
- Live SMS, FCM delivery, and a telecom USSD gateway: **not tested**; provider credentials/access were not supplied. No live messages were sent.

See `docs/IMPLEMENTATION.md` and `docs/OPERATIONS.md` before using real operational data. This is a demonstrable prototype source package, not a production-certified aeromedical dispatch system.
