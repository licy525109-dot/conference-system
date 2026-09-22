# Admin Table Row Numbers

Date: 2026-09-22
Status: implemented and verified locally; NOT DEPLOYED.

## Behavior

- All 89 Element Plus data tables in the current admin source now have a single
  leftmost serial-number column. The column is 72px wide and stays visible on
  horizontal scroll. Business IDs, order numbers and selection/expand columns
  remain unchanged.
- Unpaged lists and nested detail tables start at 1. Paginated tables use
  `(page - 1) * pageSize + rowIndex + 1`, with their own paging state.
- User activity, mobile registration cards and attendee identity rows also
  display a sequence number. Sequence numbers are presentation positions, not
  stable record identifiers and are never persisted to business data.
- Conference orders now use the existing server pagination/count response
  instead of always requesting only the first 100 records. Page size is
  selectable as 20, 50 or 100. Search starts at page 1. Out-of-range pages after
  data changes return to the last valid page; stale responses cannot overwrite
  the latest request. Failures show an error instead of a false zero count.
- Order anomaly filtering remains client-side and is labelled as current-page
  filtering. The total is the server query total, before that local filter.
  Bulk close still uses the existing server filter, across all matching pages;
  its confirmation now states that scope rather than presenting the page count
  as an exact total. No close/payment/refund backend behavior was changed.
- Other unpaged lists retain their current loading limits. Their sequence is
  the position in the displayed result, not a claim about the database total.
- No Mini Program code, backend code, database, permissions or export schema
  was changed by this task. Earlier coupon and UI worktree changes are preserved.

## Changed Files

Shared:
- apps/admin/src/components/AdminTableIndex.vue
- apps/admin/src/utils/table-index.ts
- apps/admin/src/styles/admin-theme.css

Table consumers under apps/admin/src:
- components/CouponDistributionDialog.vue
- pages/ai/index.vue
- pages/cms/page-manager.vue
- pages/cms/tabbar.vue
- pages/common/OperationalWorkflowsPage.vue
- pages/conferences/config.vue
- pages/conferences/index.vue
- pages/coupon-campaigns/index.vue
- pages/coupons/index.vue
- pages/dashboard/index.vue
- pages/finance/index.vue
- pages/guest-schedules/index.vue
- pages/mall/orders.vue
- pages/mall/products.vue
- pages/mall/workflows.vue
- pages/materials/index.vue
- pages/members/benefits.vue
- pages/members/levels.vue
- pages/members/pricing-rules.vue
- pages/members/users.vue
- pages/notifications/index.vue
- pages/notifications/paid-alerts.vue
- pages/orders/index.vue
- pages/platform/index.vue
- pages/promotions/index.vue
- pages/registrations/detail.vue
- pages/registrations/index.vue
- pages/system/accounts.vue
- pages/system/audit-logs.vue
- pages/system/roles.vue
- pages/wecom/index.vue

Card lists under apps/admin/src:
- components/GuestIdentityPanel.vue
- pages/members/detail.vue
- pages/mobile/index.vue

Tests:
- tests/frontend/admin-table-index.test.mjs

## Verification

- PASS: `node --test tests/frontend/admin-table-index.test.mjs`, 8 tests covering
  all 89 tables, SFC template compilation, paging bindings, detail numbering,
  selection/expansion preservation, query reset, stale response rejection,
  data shrink and request failure.
- PASS: existing coupon distribution browser regressions, 14 tests with mocked
  APIs. Delivery, expansion, pagination and permission controls still work.
- PASS: Playwright CLI, synthetic API responses only. Users render 1-50 and
  51-100; orders render 1-20 and 21-40, or 51-100 with page size 50. Searches
  restart at 1, empty results render no numbered row, server total is shown,
  and the serial column remains fixed during horizontal scrolling.
- PASS: desktop 1440x1000 and mobile 390x844 screenshots visually inspected;
  the serial column remains legible. No page runtime exceptions in the flow.
- PASS: admin typecheck and production build. Existing large-chunk and upstream
  VueUse annotation warnings remain.
- PASS: `git diff --check`.
- NOT_RUN: production data acceptance or manual interaction with every module.
  Full source coverage is not a claim that all 89 tables were opened in a browser.
- No commit, production deployment, real order mutation or real coupon delivery.

Screenshots with synthetic data:
- output/playwright/admin-index-users-page2.png
- output/playwright/admin-index-orders-page2.png
- output/playwright/admin-index-orders-mobile.png

## Manual Acceptance

1. Open the user list, verify the leftmost serial column and total, then move to
   page 2. With 50 rows per page the first row is 51. Search again; numbering
   restarts from 1 within that result.
2. Open orders, switch page and page size, and verify the displayed count and
   server query total. Confirm that order numbers and amounts are unchanged.
3. Open a detail table: its own records start at 1. Check the guest schedule
   selection box and coupon history expansion remain usable.
4. Scroll a wide table horizontally and verify the serial column stays visible.
5. Local readonly preview: http://127.0.0.1:5282/#/users (synthetic data only).
   This preview does not reflect production counts or perform real operations.

Deploy only the admin build for this change. No additional database migration
or Mini Program review is required for the row-number feature itself; pending
coupon delivery work has its separate release requirements.
