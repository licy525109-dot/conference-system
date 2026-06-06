---
name: wechat-pay-idempotency
description: Use this skill when implementing or reviewing WeChat Pay API v3 prepay, notify, amount verification, signing, decrypting, transaction locking, and repeated callback handling.
---

# WeChat Pay Idempotency

## Mandatory rules

1. Keep mock payment mode for development.
2. Real WeChat Pay credentials must come from environment variables.
3. Do not log API v3 Key, private key, AppSecret, or raw decrypted sensitive data.
4. Notify must verify signature.
5. Notify must decrypt payload.
6. Notify must find local order by outTradeNo.
7. Notify must verify amount.
8. Order update and registration creation must happen in a transaction.
9. Repeated callback for paid order returns success without side effects.
10. Failed verification must not update order.

## Required tests

- normal success callback
- duplicate success callback
- amount mismatch
- order not found
- invalid signature
