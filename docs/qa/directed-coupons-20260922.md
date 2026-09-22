# Directed Coupon Delivery

Date: 2026-09-22
Status: local implementation and verification complete; NOT DEPLOYED.

## Operator Flow

1. Create a separate coupon with its meeting/scope, amount, usage conditions,
   validity dates and per-user limit set to 1. Its total limit can be unlimited.
   Do not attach this coupon to a public coupon campaign.
2. For an existing account, use Users -> issue coupon, or Coupons -> directed
   delivery -> existing user. Confirm the account ID and masked phone. Delivery
   creates the wallet claim and an in-app notification in one transaction.
3. For a guest without an account, choose phone invitation. Enter their mainland
   China mobile number and an invitation deadline (1-168 hours; default 24).
   The deadline cannot exceed the coupon's expiry and does not change its use
   validity. Generate the WeChat link and send it privately to that guest.
4. The guest previews the coupon conditions, explicitly requests claiming,
   logs in and completes the existing profile/verified-phone flow. Returning
   from profile verification does not automatically claim the coupon.
5. The backend reads the verified phone from the current user database row.
   Only the invited phone can claim; the receiving account then owns the coupon.
6. Delivery records show pending, claimed, expired and revoked invitations.
   An unclaimed invitation can be revoked. A claimed grant cannot be recalled
   using this operation. Retry a failed link from the existing record.

This change does not automatically send an SMS, WeChat chat message or WeChat
subscription message. Direct delivery produces an in-app notification only.
No new public coupon entry is added to registration for guests without coupons.

## Business and Security Boundaries

- A directed coupon and a public campaign cannot share the same coupon template.
  Both admin campaign creation and private delivery coordinate through a
  serializable transaction on the coupon row. Public claiming also fails closed
  for a directed coupon, including an imported/legacy campaign association.
- Once directed delivery is used, coupon ownership is required even before the
  first invitation is claimed. Raw coupon-code guessing cannot bypass claiming
  in either conference registration or mall pricing.
- Directed templates must remain limited to one use per user. Delivery counts
  unique ownership, pending invitations and all historical active redemptions;
  multiple old uses by one owner are not silently discarded.
- Existing owned/used coupons are checked for account delivery and for accounts
  that have verified the target phone. Duplicate pending invitations return an
  explicit conflict rather than acknowledging a new idempotency key.
- Identical successful requests preserve their original record after revocation;
  conflicting reuse of an idempotency key is rejected. Link retries never issue
  another coupon. Concurrent claim/revoke and final-slot races are transactional.
- Tokens use 32 random bytes, SHA-256 lookup and existing AES-GCM secret storage.
  Public preview accepts a POST body, not an API URL query. Preview/list/audit
  responses do not include raw tokens or unmasked target phones. Private preview
  also omits coupon codes and account identifiers.
- Admin reads require coupon:view; create/link/revoke require coupon:write.
  Claiming requires the user JWT. Preview and claim endpoints are rate limited.
- Pricing remains authoritative on the server in integer cents. Payment/refund
  formulas and callback behavior were not rewritten.
- Claim preview and wallet now label percentage coupons as the percentage
  reduction, not the payable fraction or an incorrect Chinese discount rate.
  This display correction does not change server pricing.

## Changed Files

- prisma/schema.prisma
- prisma/migrations/20260922150000_directed_coupon_distribution/migration.sql
- services/api/src/admin/coupon-distribution.controller.ts
- services/api/src/admin/coupon-distribution.service.ts
- services/api/src/admin/coupon-distribution.service.spec.ts
- services/api/src/admin/admin.module.ts
- services/api/src/admin/admin-management.service.ts
- services/api/src/admin/admin-operations.service.ts
- services/api/src/admin/public-operations.service.ts
- services/api/src/auth/wechat-auth.service.ts and its spec
- services/api/src/registration/registration.service.ts
- services/api/src/mall/mall-coupon-pricing.ts
- services/api/src/security/request-rate-limit.ts and its spec
- apps/admin/src/components/CouponDistributionDialog.vue
- apps/admin/src/services/coupon-distributions.ts
- apps/admin/src/pages/coupons/index.vue
- apps/admin/src/pages/members/users.vue
- apps/user/src/pages/coupon/claim.vue
- apps/user/src/pages/coupon/my.vue
- apps/user/src/services/coupon-distributions.ts
- apps/user/src/services/operations.ts
- tests/frontend/coupon-distributions.test.mjs
- tests/frontend/coupon-distribution-claim.test.mjs
- tests/frontend/coupon-distribution-claim.browser.test.mjs

Pre-existing homepage, compact conference list, profile and attendee-invitation
changes in the worktree were preserved; they are documented separately.

## Verification

- PASS: workspace typecheck and workspace tests (API 458, user 66, shared 13,
  plus runtime/module-compiler/render-governor checks).
- PASS: 19 targeted backend checks, including 16 real PostgreSQL integration
  tests. Used an isolated temporary cluster, not the app or production database.
  Covers ownership, verified-phone spoofing, duplicate delivery, quota races,
  claim/revoke races, public/private separation, retries, expiry, legacy coupon
  flows, server pricing and complete private preview conditions.
- PASS: all 50 migrations applied to the empty temporary database. Prisma diff
  from that database to the checked-in schema returned an empty migration.
- PASS: 44 component checks, including 27 directed-coupon checks and 17 adjacent
  homepage/private-entry/compact-list regressions.
- PASS: 14 admin browser checks and 12 user H5 browser checks. APIs intercepted
  with synthetic responses; no production requests or WeChat sends. Mobile
  320/390px and desktop 1280/1440px layouts inspected without control overflow.
- PASS: API, admin, H5 and WeChat production builds. Mini Program main package
  1619.98 KiB. Existing admin chunk-size and upstream annotation warnings remain.
- PASS: independent review of the corrected private/public and quota boundaries.
- PASS: git diff --check.
- NOT_RUN: one browser-to-real-API HTTP acceptance run; browser and database
  service layers were verified separately.
- NOT_RUN: real WeChat URL Link generation, native phone authorization and
  iOS/Android recipient opening. No production deployment, commit, upload,
  review submission or Mini Program publication was performed.

## Reproduction

The backend integration suite requires COUPON_TEST_DATABASE_URL explicitly and
refuses any host except localhost/127.0.0.1, port 55432, database name
coupon_distribution_test. Never point it at a shared development or production
database. Apply migrations to that disposable database first, then run:

```sh
pnpm --filter @conference/api exec tsx --test src/admin/coupon-distribution.service.spec.ts
node --test tests/frontend/coupon-distribution-claim.test.mjs
node --test tests/frontend/coupon-distributions.test.mjs
node --test tests/frontend/coupon-distribution-claim.browser.test.mjs
```

Browser test URLs are controlled by ADMIN_COUPON_PREVIEW_URL and
COUPON_CLAIM_H5_URL. On the managed macOS environment set TMPDIR to the workspace
.tmp directory and allow Chromium launch. API interception remains enabled.

Screenshots: output/playwright/coupon-distribution-form-{desktop,mobile}.png and
output/playwright/coupon-claim/conditions-{320,390,1280}.png. These are synthetic
QA artifacts, not guest data or production screenshots.

Local UI previews: admin http://127.0.0.1:5281/#/coupons and user
http://127.0.0.1:5193/#/pages/coupon/claim?token=ppppppppppppppppppppppppppppppppppppppppppp.
The local preview fixture is read-only for issuance and does not generate usable
WeChat links. Successful issuance/claim interactions were checked by the tests.

## Release and Rollback

1. Back up production and review the combined release diff. Generate the Prisma
   client and apply the additive migration before deploying API/admin code.
2. Existing server-side WeChat App ID/Secret and the configured encryption key
   are reused. No new plaintext secret belongs in frontend code or Git. Preserve
   the existing encryption key/rotation configuration for outstanding invitations.
3. Upload and publish the Mini Program containing token-based coupon claiming
   before sending these links to real guests. The URL Link adapter targets the
   release environment and fixed pages/coupon/claim route. An old page accepting
   only claimCode is not compatible with the new invitation token.
4. Confirm URL Link capability with a designated test coupon and recipient, then
   verify correct phone, wrong phone, retry, revoke, wallet and registration use
   on iOS/Android. Do not use an unrelated guest account as a test recipient.
5. Do not roll back to an API that assumes every CouponClaim has a campaign
   after campaign-less directed claims exist. Disable delivery operations and
   deploy a forward fix; preserve claims, audit records and coupon ownership.
   A destructive migration rollback is not part of this change.
