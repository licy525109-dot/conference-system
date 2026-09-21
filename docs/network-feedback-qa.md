# Network Feedback QA

Date: 2026-09-22

## Scope

Home, conference detail, and notifications now distinguish confirmed offline
state, transport failure, timeout, HTTP failure, and other loading errors.
Confirmed offline state uses a neutral Wi-Fi icon and actionable copy instead
of the generic red failure screen.

Only the visible page can refresh after a network recovery. Recovery does not
replay registration, order, or payment requests. Notifications may perform the
existing authentication flow before reading private messages.

Already-loaded home/detail content is retained while offline. Home uses its
existing public-content cache; conference detail is retained in page memory,
not persisted as an offline registration or stock guarantee. The conference
registration button is disabled while offline, loading, or in a failed state.
Private notifications are not newly persisted by this change.

## Automated Checks

- PASS: user TypeScript check.
- PASS: user unit tests, 66 tests including five feedback classification tests.
- PASS: H5 production build.
- PASS: WeChat Mini Program build and main-package size check.
- PASS: six compiled Mini Program adapter/lifecycle tests, using stubbed native
  APIs and real Vue reactivity. Run after the Mini Program build:
  `node --test apps/user/scripts/verify-network-recovery.mjs`.
- PASS: whitespace check.

## Browser Checks

Local H5 preview uses synthetic fixture data only. No production order,
registration, payment, or guest data was changed for these checks.

- PASS: cold conference entry with API transport blocked and offline detection;
  friendly copy and Wi-Fi icon, then one GET reload after recovery.
- PASS: 320px and 390px mobile layouts, without horizontal page overflow.
- PASS: actual browser context offline/online events retain the loaded detail,
  disable registration, and trigger exactly one detail GET on reconnection.
  No mutation requests were observed in this detail recovery test.
- PASS: cold offline homepage and automatic recovery.
- PASS: home public cache survives a reload with API transport blocked.
- PASS: offline messages recover into the real empty state when the API returns
  an empty list; HTTP 503 remains a service error, not an offline or empty state.
- PASS: no JavaScript page errors in the isolated home and messages scenarios.

Screenshots are in `output/playwright/network-*.png`. Cold-entry browser tests
kept the local H5 shell available and blocked only the fixture API, analogous to
an installed Mini Program package without a working network connection.

## Remaining Acceptance

- NOT_RUN: real iOS and Android WeChat flight-mode tests.
- NOT_RUN: production upload/release. This is a client-side change and cannot
  alter the already-installed production package through backend deployment.
- NOT_CONFIRMED: the cause of the earlier intermittent guest incident. Flight
  mode reproduces the old error presentation, but does not prove that every
  reported failure had the same cause.

For device acceptance, open each affected page with Wi-Fi and mobile data both
off, then restore the connection without pressing reload. Repeat after loading
a conference first; its content must remain visible, and registration must
remain unavailable until an online refresh succeeds. Finally switch pages
before reconnecting and check that hidden pages do not issue recovery loads.
