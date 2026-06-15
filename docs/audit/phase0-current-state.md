# Phase 0 Current State Audit

Date: 2026-06-13

## Scope

This audit checks the current conference system before the first development round. It is focused on the protection lines requested in `codex_dev_package_20260613` and does not change payment, order, registration, or frontend user flow behavior.

## Backend Route Matrix

All routes below are mounted under `/api/admin` through `AdminManagementController`, which is decorated with `@UseGuards(AdminJwtAuthGuard)`. Current protection is admin bearer-token authentication only; granular RBAC permissions were not present before this round.

| Capability | Route | Current status | Auth status |
| --- | --- | --- | --- |
| Coupons list/create/update | `GET /coupons`, `POST /coupons`, `PATCH /coupons/:id` | Exists | Admin JWT required |
| Promotion rules list/create/update | `GET /promotion-rules`, `POST /promotion-rules`, `PATCH /promotion-rules/:id` | Exists | Admin JWT required |
| Conference check-in config | `PATCH /conferences/:id/check-in-config` | Exists | Admin JWT required |
| Attendee check-in | `POST /registration-attendees/:id/check-in` | Exists | Admin JWT required |
| Registration remark | `PATCH /registrations/:id/remark` | Exists | Admin JWT required |
| Registration attendees read | `GET /registrations/:id` includes `attendees` | Exists | Admin JWT required |

Important finding: route-level authentication exists, but role/permission-level authorization is missing in the current baseline.

## Prisma And Migration Check

The current schema and migrations already contain the phase 2/3 business data structures:

| Migration | Content verified |
| --- | --- |
| `20260609010000_add_registration_admin_remark` | `registrations.adminRemark`, `remarkUpdatedAt`, `remarkUpdatedBy` |
| `20260609020000_add_check_in_and_attendees` | `CheckInStatus`, `conferences.checkInEnabled`, `registration_attendees` with check-in fields and admin remark |
| `20260609030000_add_group_registration_config` | `conferences.groupRegistrationEnabled`, `maxTicketsPerOrder` |
| `20260609040000_add_coupons_promotions_discounts` | `coupons`, `promotion_rules`, `order_discounts`, `coupon_redemptions`, `orders.discountAmountCent` |

Current schema models confirmed: `Coupon`, `CouponRedemption`, `PromotionRule`, `OrderDiscount`, `RegistrationAttendee`, and the conference multi-ticket/check-in fields.

## Admin Frontend Integration Check

Current `apps/admin/src/App.vue` includes menu entries and inline views for:

- Dashboard placeholder
- Conferences
- Registration SKUs
- Registration fields
- Coupons
- Promotion rules
- Orders
- Registrations with remark and attendee check-in

Gaps found:

- The admin frontend is still a single large `App.vue` with string-based `activeView` switching.
- There is no formal Vue Router setup, no separated layout, and no reusable sidebar/layout structure.
- The dashboard is a placeholder and does not use real order/payment/registration data.
- Source code contains coupon and promotion UI, but `apps/admin/dist.zip` did not contain searchable `coupons`, `promotion-rules`, `优惠券`, or `满减` strings, so the packaged build artifact appears stale.

## Pricing And Attendee Protection Lines

Current backend pricing flow is protected:

- `POST /api/registration/quote` and `POST /api/registration/orders` both enter `RegistrationService`.
- Both quote and create order use the shared private `calculatePricing()` logic.
- `createOrder()` re-reads SKU price from the database through `getPricedItems()` and does not trust frontend amount fields.
- `parseBaseRegistrationRequest()` rejects client-supplied `originAmountCent`, `discountAmountCent`, `payableAmountCent`, `totalAmountCent`, and `paidAmountCent`.
- Multi-ticket attendee count is enforced by `ensureAttendeesMatchItems()`, which requires attendee counts per SKU to match `items.quantity`.

## Payment Protection Lines

Do not modify these verified payment-chain files in the first round unless a later task explicitly targets payment:

- `services/api/src/payments/payment-success.service.ts`
- `services/api/src/payments/wechat-pay.service.ts`
- `services/api/src/payments/wechat-pay.signer.ts`
- `services/api/src/payments/wechat-pay.notify-verifier.ts`
- `services/api/src/payments/payments.controller.ts`
- `services/api/src/payments/wechat-pay.config.ts`

Current verified behavior:

- `PaymentSuccessService` handles only successful payment confirmation, payment upsert, order status update, coupon redemption marking, registration creation, attendee creation, and SKU sold count increment.
- It does not recalculate coupons/promotions or create orders.
- WeChat prepay uses local `order.payableAmountCent`, ignores any frontend amount, and creates/upserts a pending WeChat payment.
- WeChat notify verifies signature, decrypts the resource, validates `trade_state`, checks local payment by `out_trade_no`, validates amount against local `order.payableAmountCent`, then calls `PaymentSuccessService`.
- `WechatPaySigner.createAuthorization()` still emits the correct API v3 header prefix and format: `WECHATPAY2-SHA256-RSA2048 mchid="...",nonce_str="...",timestamp="...",serial_no="...",signature="..."`.

## Verification Result

Command run:

```bash
pnpm test
```

Result:

- Passed.
- API tests: 95 passed, 0 failed.
- Expected negative WeChat notify tests print sanitized error logs during the run.

## First-Round Development Boundary

Proceed with:

- Admin layout/router/sidebar/dashboard.
- Real dashboard overview API.
- Basic admin accounts, roles, and permissions.
- Basic material category and material asset management.
- Conference config detail page that integrates existing basic info, SKUs, form fields, check-in/group config, coupons, and promotion rules.

Do not implement in this round:

- Full mall.
- Full membership.
- Page builder.
- Financial reconciliation.
- Refund, invoice, or destructive order/payment changes.

## Added In This Round After Audit

The implementation following this audit adds only additive tables for the first round:

- RBAC: `roles`, `permissions`, `admin_user_roles`, `role_permissions`.
- Materials: `material_categories`, `material_assets`.

No existing payment, order, registration, coupon, or promotion columns are removed or renamed.
