# SaaS Platform Control Plane

## Delivered Foundation

The platform control plane adds:

- tenants, organizations, workspaces, and tenant admin membership
- plans and subscriptions with integer-cent pricing
- API keys with one-time plaintext display and SHA-256 storage
- webhooks with one-time signing secret display
- idempotent usage events
- tenant/workspace feature flags
- plugin registry and installation records
- provider production-readiness reporting
- dedicated `platform:view` and `platform:write` permissions

The Admin route is `/platform`; the API prefix is `/api/admin/platform`.

## Explicit Boundary

This is a control-plane foundation. Existing conference, registration, order, payment, refund, check-in, and member-pricing tables are not tenantized in this migration. The UI and API report data-plane isolation as `FOUNDATION_ONLY` so configuration cannot be mistaken for production multi-tenancy.

Do not enable external tenant access until the following are completed:

1. Add tenant context propagation and row-level authorization.
2. Design a staged `tenant_id` migration for every business aggregate.
3. Backfill and verify ownership before enforcing non-null constraints.
4. Add tenant-bound API-key authentication and rate limiting.
5. Add webhook delivery workers, signatures, retries, and dead-letter handling.
6. Add a real plugin sandbox before allowing executable plugins.
7. Add metered billing reconciliation and invoice issuance.

## Provider Readiness

The control plane separates these states:

- `NOT_CONFIGURED`: required account or environment data is absent.
- `PARTIAL`: a channel is enabled but required fields are incomplete.
- `CONFIGURED`: required configuration exists but production verification is incomplete.
- `READY`: an integration has an explicit verified signal.
- `FOUNDATION_ONLY`: data structures exist but the production runtime is intentionally absent.

微信订阅消息、短信、企微、AI、真实退款和微信账单必须分别灰度。A completed settings screen is never treated as production readiness.

## Security Rules

- All platform endpoints require Admin JWT plus platform permission checks.
- API key and webhook secret plaintext is returned only once.
- Money remains integer cents.
- Webhook URLs require HTTPS in production.
- The migration does not modify payment callbacks or order amount calculation.
