---
name: registration-order-pricing
description: Use this skill when implementing or reviewing registration SKU price, quote, order creation, amount calculation, order state, and registration creation.
---

# Registration Order Pricing

## Mandatory rules

1. All amounts are Int cents.
2. Frontend payable amount is not trusted.
3. Quote is display-only.
4. Order creation must recalculate price from database.
5. Order item unit price must be copied from server-side SKU price at order creation.
6. Payment amount must equal local order payableAmountCent.
7. Registration is created only after successful payment or confirmed zero-pay order.
8. Repeated success callbacks must not duplicate registration.

## Required tests

- SKU A price 100000 cents
- SKU B price 70000 cents
- frontend amount tampering ignored
- pending order created
- paid order creates registration
- repeated payment callback idempotent
