---
name: deployment-observability-mvp
description: Use this skill when preparing local or production deployment, environment variables, logging, health checks, database migration, backup, HTTPS, and Nginx reverse proxy.
---

# Deployment Observability MVP

## Rules

1. Production secrets must be environment variables or secret manager values.
2. Run migrations before starting production app.
3. Expose /api/health.
4. Payment notify logs must include orderNo/outTradeNo/status but not secrets.
5. Configure HTTPS before real WeChat Pay notify.
6. Back up database before major migrations.
7. Keep rollback notes for each deployment.

## Minimal production checklist

- domain
- HTTPS certificate
- Nginx reverse proxy
- production PostgreSQL
- production Redis
- .env.production outside Git
- process manager or Docker
- logs
- database backup
