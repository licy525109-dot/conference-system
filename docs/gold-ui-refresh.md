# Gold UI Refresh - Local Handoff

The local-only statements below describe the original design handoff. The user
authorized production deployment and Mini Program upload on September 22;
release preflight evidence and rollout gates are recorded in `release-20260922.md`.

## Local Preview

- User H5 (September 22 homepage follow-up): `http://127.0.0.1:5192/#/pages/index/index`. The earlier 5190 process still serves the previous preview.
- Admin: `http://127.0.0.1:5191/#/registrations`
- Admin preview-only credentials: `qa-only` / `preview-only`. They are accepted only by the synthetic local fixture server, not production.
- The H5 notification entry signs in through the local fixture. It contains one example schedule and no real payment service.
- Fixtures: `.tmp/gold-ui-preview.mts`, bound to loopback port 3999. They do not proxy production. Most writes are rejected. The notification read/dismiss operations only change in-memory synthetic state.
- Restarting the fixture server resets example messages; `/local-reset` also resets them locally.

## Changed UI Areas

- Shared user theme: `apps/user/src/theme/cmsTheme.ts`, `apps/user/src/services/cms.ts`, `apps/user/src/styles/tokens.css`.
- Shared user controls: `CustomTabbar.vue`, `FixedBottomActionBar.vue`, `EmptyState.vue`, `ErrorState.vue`, `LoadingState.vue`.
- Home: `pages/index/index.vue` and `components/ui/HomeMessageNotice.vue`. The platform homepage remains CMS-driven; a compact message entry precedes it for signed-in users. The full personal/conference overview was removed in the September 22 follow-up.
- Conference information: `components/conference/ConferenceDetailOverview.vue`.
- Guest information: `pages/notifications/index.vue`, `pages/registrations/schedule.vue`, `pages/account/attendance.vue`, new `components/GuestSchedulePresentation.vue`, schedule presentation helpers/tests.
- Shared admin shell: `layouts/AdminLayout.vue`, `styles.css`, `styles/tokens.css`, `styles/admin-theme.css`, page header/filter/section/stat components.
- Registration workspace: `pages/registrations/index.vue`, focused registration/navigation frontend tests.

Existing guest-account, profile, order and WeCom changes already in the dirty worktree were preserved; they are not newly claimed as delivered by this UI iteration.

## Manual Acceptance

1. Open home as a visitor, then the local signed-in state. Both must lead with the configured platform content, without an injected meeting title, cover, attendance status, or schedule/credential actions. Signed-in users retain the compact message entry above the CMS content, even when there are no conferences. Confirm that its unread badge refreshes after reading messages.
2. Open messages, inspect venue/table/time, open the modal and complete schedule, then swipe left and clear a sample message. Empty and failure states must remain distinct.
3. Open admin registration management, select different guests, and inspect the separate attendee/account information beneath the table. Confirm full form answers and links remain reachable.
4. Resize the admin page and use More/menu search/mobile navigation. Confirm all authorized groups remain available.
5. Before release, repeat in WeChat developer tools and real iOS/Android devices with an approved staging account. This handoff did not commit, deploy, upload or submit for review.

See `design-qa.md` for evidence, test outcomes and remaining boundaries.

## September 22 Homepage Follow-up

- Removed the injected personal/conference overview before the platform content.
  The CMS composition itself, brand palette, and business pages were not changed.
- Kept a compact signed-in message entry independent of attendance and conference
  availability. Public home loading no longer fetches personal attendance.
- PASS: six focused template/state tests in
  `tests/frontend/home-message-notice.test.mjs`, 66 user unit tests, six network
  recovery tests, user typecheck, H5 build, and Mini Program build.
- PASS: browser QA with synthetic data covers visitor, signed-in, no conferences,
  unread updates, message navigation, 320/390px mobile and 1280px desktop layouts.
  No JavaScript page errors or homepage attendance API requests were observed.
- Screenshots: `output/playwright/home-platform-signed-in.png`,
  `home-platform-visitor.png`, `home-platform-320.png`, `home-platform-desktop.png`.
- NOT_RUN: WeChat device acceptance. No production upload or release was performed.
