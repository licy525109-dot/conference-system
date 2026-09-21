# Gold Option 2 Visual QA

Date: 2026-09-21

final result: passed

## Scope And Source

- Source visual truth: `/Users/yangyang/.codex/generated_images/019efa8f-cb4e-70d3-b780-741f38597c9b/exec-5e832cf8-3601-4d9f-8304-3aec70fc2f09.png`.
- Selected direction: gold brand, information-first mini-program, horizontal charcoal admin navigation, full-width registration table, inline record details beneath it.
- This gate covers the shared theme/navigation and the home, conference overview, notification, schedule and registration screens changed in this UI iteration. It is not a claim that every legacy CMS composition or every back-office workflow has been redesigned or reaccepted.
- Existing dirty business changes were preserved. This iteration did not deploy, upload a mini-program, apply a database migration, or mutate production data.

## Comparison Evidence

Source image: 1774 x 887 pixels, a presentation board with two approximately 344 x 720 mobile panels and one approximately 946 x 720 admin panel. The board includes its own captions and simulated device chrome, not runtime UI. No exact CSS viewport is encoded in the source.

Implementation captures use deviceScaleFactor 1, native CSS pixels. The source and final captures were opened together in the same comparison tool result. Panels were compared by content region and hierarchy, not by treating the whole presentation board as a browser viewport. This is a responsive implementation of the approved direction, not a claim of identical raster pixels.

| State | Viewport | Screenshot |
| --- | --- | --- |
| Confirmed attendee home | 390 x 844 | `output/playwright/gold-home-final.png` |
| Visitor home | 390 x 844 | `output/playwright/gold-home-visitor.png` |
| Conference overview and fixed actions | 390 x 844 | `output/playwright/gold-conference-detail.png` |
| One schedule notification | 390 x 844 | `output/playwright/gold-messages-final.png` |
| Complete notification modal | 390 x 844 | `output/playwright/gold-message-modal.png` |
| Narrow modal | 320 x 740 | `output/playwright/gold-message-modal-320.png` |
| Full schedule route | 320 x 740 | `output/playwright/gold-schedule-320.png` |
| Swipe reveal | 320 x 740 | `output/playwright/gold-message-swipe.png` |
| No notifications | 320 x 740 | `output/playwright/gold-messages-empty-final.png` |
| Intentional HTTP 503 | 320 x 740 | `output/playwright/gold-messages-error-final.png` |
| Registration list and selected detail | 1440 x 1000 | `output/playwright/gold-admin-final.png` |
| Registration mobile layout | 390 x 844 | `output/playwright/gold-admin-mobile-final.png` |
| Registration tablet layout | 1024 x 768 | `output/playwright/gold-admin-tablet.png` |

Focused examination used the native mobile captures for date/time, table number, labels, primary actions and modal controls, and the native admin capture plus computed font/layout measurements for selected rows, account links and inline details. These regions are legible at native resolution; no lower-resolution montage was used as a substitute.

## Findings And Iterations

1. P2, home secondary actions: browser-default button outlines introduced small floating boxes. Removed their pseudo-element borders; `gold-home-final.png` shows flat secondary actions.
2. P2, schedule message hierarchy: a full conference-update title repeated the conference context, while a negative table-leader field pushed the primary action down. Single-item schedule messages now lead with the schedule name; multiple items use a concise update title. Only positive table-leader assignment is shown. Original message title remains available in details. Final message screenshot shows date, time, venue, table and action together.
3. P2, desktop navigation: 13 groups wrapped into a 96px header. Added measured overflow into a More menu with keyboard focus preservation. Final runtime height is 64px at 768, 1024, 1280, 1440 and 1920 widths. Full group access and mobile navigation were tested.
4. P2, registration typography: page-scoped 13px styling overrode the shared readable table size. Body and participant text are now 16px; secondary text and headers 14px. Final screenshot and computed style confirm 16px table text.
5. P2, narrow empty/error states: old rpx typography shrank status text too much. State headings are now 20px, descriptions 18px, with existing icon-library symbols. Both final narrow captures were inspected.

No actionable P0/P1/P2 findings remain in the tested scope.

## Required Fidelity Surfaces

- Typography: existing system Chinese sans-serif stack retained; gold brand heading retained in admin. Mobile 25-30px subject headings, 18px labels, 42px time and 36px table number establish priority. No negative tracking or viewport-scaled display type added. Long text wraps instead of hiding critical facts.
- Layout rhythm: flat white sections and restrained dividers replace floating nested cards. Admin uses a single-row top navigation, wrapping secondary navigation, list then details. Mobile facts precede the complete poster; large actions have stable dimensions.
- Colors: gold `#987627`, strong gold `#866A23`, accent `#A3842B`, white and charcoal. Green/red remain semantic status colors, not competing primary themes. Explicit existing CMS color settings remain configurable.
- Images and icons: existing conference poster is rendered with `widthFix`, not cropped as a background. Local fixture uses the existing 750 x 520 legacy-safe cover asset including its original padding. No invented logo, avatar or decorative replacement was introduced. Navigation/state icons use existing Wot/Element Plus libraries.
- Copy: event, account, payment, registration and schedule facts come from existing contracts. No self-registration/proxy label is inferred from a nickname or payment account. The mock's paid-count tabs were not fabricated: the API-backed registration statuses are used, and actual payment status is shown from the selected order.

## Runtime Checks

- Independent local browser; in-app browser initialization failed twice before the isolated browser fallback. Test API bound only to `127.0.0.1:3999`; no production forwarding or credentials.
- Navigation to actual schedule content, modal open/close, read state, simulated touch swipe, clear confirmation, empty state, injected failure and recovery passed.
- Registration row selection fetched the proper detail; account/order links and permission gates remain present. Destructive production actions were not exercised.
- Narrow document width equals viewport width at 320px and 390px; admin tables retain their own horizontal scroll area. At 1024px and 1440px the document has no horizontal overflow. Conference fixed action bar sits above the 68px tab bar.
- Early fixture-schema mistakes produced render errors during setup and were corrected before final captures. A fresh final notification page had zero console errors/warnings. Intentional 503 errors were separately injected and are not counted as unhandled runtime regressions. Existing automated smoke test asserts no page errors.
- Current automated tests: user 61/61; registration state/contracts 16/16; navigation 5/5 including browser runtime.
- Existing guest-experience browser regression passed: visitor skeleton/cache fallback, profile gate and retained form draft, self/delegate identity payloads, owned coupon selection, cart preservation, claim and personal attendance credential at mobile/desktop sizes.
- User/admin type checks and admin/H5/WeChat production builds passed. Final WeChat main package: 1603.88 KiB; below the repository 2048 KiB limit.

## Intentional Differences And Remaining Boundaries

- Existing CMS content stays below the new home overview, rather than being deleted to imitate a static mock. Longer production titles, optional fields and multiple schedules may increase page height.
- Native WeChat navigation/chrome, actual template delivery, payment/refund behavior and iOS/Android rendering were not validated in this H5 visual pass. Real-device acceptance remains required before upload/release.
- No current production CMS setting was changed. Screens configured with another preset or explicit colors may retain those values.
- P3 follow-up: original conference poster text is inherently small at phone width; the key facts are now repeated as accessible UI text above it. Replacing the artwork would be a separate approved asset task.

## Implementation Checklist

- [x] Apply selected gold visual system and readable shared controls.
- [x] Make home attendee overview use owned attendance, not payer identity.
- [x] Make schedule facts prominent and labels explicit.
- [x] Preserve complete covers and fixed mobile navigation/actions.
- [x] Integrate horizontal admin navigation with overflow and permissions.
- [x] Place selected registration detail below the table.
- [x] Run type checks, focused tests, builds and browser regressions.
- [x] Inspect final screenshots against the selected source.
- [ ] Real WeChat device acceptance and production release, intentionally not part of this local handoff.
