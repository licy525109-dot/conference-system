---
name: conference-mvp-architect
description: Use this skill when designing or implementing the conference registration payment MVP, including scope control, architecture, database, API, task breakdown, and acceptance criteria.
---

# Conference MVP Architect

## When to use

Use this skill for MVP planning, architecture, database design, API design, and task breakdown for the conference registration payment system.

## MVP scope

Implement only:
- conference list and detail
- registration SKU and price
- dynamic registration form
- registration quote and order
- mock payment
- WeChat Pay API v3 integration hooks
- registration record after payment success
- my registrations
- minimal admin management

Do not implement in MVP:
- membership
- mall
- AI Q&A
- coupons/full reductions
- Douyin/Xiaohongshu/Bilibili channels
- refund automation
- invoices
- check-in

## Rules

1. Keep MVP small and shippable.
2. Prefer clear data models and service boundaries.
3. Never hide payment or amount logic in frontend.
4. Every milestone must have acceptance tests.
5. Produce docs before code when the task changes scope.
