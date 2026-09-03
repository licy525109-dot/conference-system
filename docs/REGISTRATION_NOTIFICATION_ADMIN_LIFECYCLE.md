# Registration, notification, and admin lifecycle

## Goal

Improve the post-registration experience and give operators a complete, auditable way to manage complimentary guests, published guest schedules, users, coupons, promotions, and disposable conference data.

## September 2026 scope extension

1. A mini-program login may create a user before a phone number is available. When the profile has no phone, the mini program immediately presents a one-tap WeChat phone authorization action. WeChat requires a user gesture, so the phone number is never fetched silently.
2. The phone authorization code is exchanged only by the API server through WeChat's `phonenumber.getPhoneNumber` endpoint. The client never submits a trusted phone number for this flow.
3. Notification cards must expose the useful schedule fields directly. Opening a notification shows the complete published snapshot in place, including time, location, role, table assignment, table-leader status, topic, and notes.
4. Registration refunds support a user request followed by administrator approval. The server derives the refundable amount from the paid order and successful refunds; the client cannot choose a trusted amount.
5. A real WeChat refund is marked successful only after a verified refund callback or an explicit provider status query. The create-refund response only moves the local request to processing. Repeated requests and callbacks must be idempotent, and a successful refund cannot be downgraded by a late notification.
6. Mock and complimentary test registrations may be permanently removed. Real WeChat payment history is retained; once refunded, it may be archived from operational lists instead of being hard deleted.

## Product rules

1. A normal registration is still created only after a successful payment callback.
2. An administrator may create an explicit `ADMIN_COMPLIMENTARY` registration. It uses a zero-payable internal order, never creates a fake payment, and remains distinguishable from paid registrations.
3. A registration can be deleted only when it is complimentary or backed exclusively by mock payments. Registrations with a successful WeChat payment are retained for financial audit.
4. Deleting a user removes the user identity while historical orders and registrations remain with a null user reference.
5. A conference can be deleted only when it has no orders or registrations. Dependent draft configuration is cleaned up in the same transaction.
6. Coupon deletion is a soft delete. Historical order discounts and redemptions remain readable.
7. Full-reduction rules must target one conference. Legacy global rules are ignored by pricing.
8. Every guest-schedule publication creates an in-app notification. WeChat subscription messages are an optional second channel and require both user consent and an active platform template.

## User experience

- The registration credential hides empty attendee, payment, form, check-in, and action content instead of rendering placeholder cards.
- A fixed `消息` entry is available in the user tab bar and displays an unread count.
- The notification list exposes published schedule details directly and links to a compact, timeline-first schedule page.
- The notification list and schedule page both expose the WeChat reminder consent action when configured.

## Admin experience

- Registration management can create a complimentary guest linked to an existing mini-program user when push delivery is required.
- Eligible registrations, coupons, users, and empty conferences have explicit delete actions with confirmation and server-side safety checks.
- Users can be edited without exposing or changing OpenID.
- Promotion creation and editing require a conference.

## Acceptance checks

- Publishing a schedule creates one unread in-app notification per affected user and does not require a WeChat template to succeed.
- Opening a notification marks it read and opens the correct conference schedule.
- Empty credential sections and unconfigured action buttons are absent.
- A complimentary guest appears in registration and attendee lists with a clear source label and no payment record.
- A real WeChat-paid registration cannot be deleted.
- Deleted coupons cannot be quoted or applied, while historical discounts remain intact.
- A promotion without a conference is rejected and never affects pricing.
- User deletion does not delete financial records; conference deletion is rejected while registrations or orders exist.
- API typecheck/tests and admin, H5, and mini-program builds pass; key mobile pages are checked at a real mobile viewport.
