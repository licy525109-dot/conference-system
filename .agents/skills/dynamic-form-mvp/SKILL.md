---
name: dynamic-form-mvp
description: Use this skill when implementing or reviewing admin-configured registration fields, required rules, validation JSON, frontend rendering, and backend validation.
---

# Dynamic Form MVP

## Supported field types

- text
- phone
- email
- select
- radio
- date
- textarea

## Rules

1. Form fields are configured per conference.
2. Backend validation is authoritative.
3. Frontend validation is only user experience.
4. Required fields must be enforced on backend.
5. Store submitted form data as JSON, but common query fields such as attendeeName and phone can be copied to Registration columns.
6. Do not allow arbitrary script/html injection in field labels or options.

## Required tests

- required field missing
- invalid phone
- invalid email
- valid form submission
- unknown field ignored or rejected according to API spec
