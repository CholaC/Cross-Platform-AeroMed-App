# Verification on 27 October 2026

npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

> skymed-outreach@2.0.0 test
> node --test test/outreach.test.js

◇ injected env (0) from .env // tip: ⌘ suppress logs { quiet: true }
✔ authentication and worker authorisation (133.211125ms)
✔ idempotent requests, conflicting retry and stable queue ordering (11.665816ms)
✔ USSD authorised phone, confirmation, retry and expiration (7.006944ms)
✔ route eligibility and known-distance sanity (10.835107ms)
✔ approval, assignment conflicts, optimistic revision, changes and cancellation notices (35.532351ms)
✔ unavailable resources and too-short travel windows blocked (6.686269ms)
✔ synthetic ML comparison returns holdout metrics and six ranked factors (1669.85787ms)
✔ web assets and gateway callback use the revised outreach contract (7.854892ms)
ℹ tests 8
ℹ suites 0
ℹ pass 8
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2263.214461

Server ESLint and JavaScript syntax checks passed. Flutter, Android, browser-rendering and live-provider checks were not run; see the combined README for explicit blockers.
