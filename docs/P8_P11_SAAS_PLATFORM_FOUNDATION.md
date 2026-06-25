# P8-P11 SaaS Platform Foundation

## Scope

This branch starts the low-code SaaS platform migration without touching the protected transaction systems:

- no changes to WeChat Pay registration payment flow
- no changes to `PaymentSuccessService`
- no changes to refund, check-in, order core, member pricing, WeCom, AI, or notification core logic
- no database migration in this foundation step

## Architecture Direction

The new UI platform is layered as:

1. CMS editor stores versioned page data.
2. DSL runtime parses `{ schemaVersion: "p9", page, dsl: { nodes } }`.
3. Runtime resolves data bindings, theme, and registered components.
4. Design System owns tokens, component schemas, and registration.
5. Platform renderers consume the resolved tree for Admin, H5, and MiniApp.

## New Packages

- `design-system/`
  - `tokens/`: spacing, radius, colors, shadow, typography, zIndex
  - `components/`: DSButton, DSCard, DSGrid, DSBanner, DSList, DSSection, DSTag, DSImage, DSCarousel definitions
  - `registry/`: `registerComponent({ type, schema, render, editor })`
  - `renderer/`: platform-neutral render tree types
  - `theme/`: `Theme = tokens + overrides + layout presets`
- `runtime/`
  - `parser.ts`: validates and normalizes P9 DSL
  - `resolver.ts`: resolves registry components and data bindings
  - `renderer.ts`: produces a unified runtime render tree
  - `context.ts`: injects platform, data, theme, and registry

## Migration Strategy

The existing CMS had many legacy components and a large uni-app renderer. This branch keeps only a guarded migration bridge:

- historical CMS component arrays are adapted into DS DSL nodes at service/governor boundaries
- CMS editor writes locked P9 DSL documents directly and save APIs reject `components` input
- Admin preview, H5, and MiniApp resolve the same DSL through Runtime and Design System renderers

The bridge never returns legacy UI instructions; it exists so old stored JSON can be normalized without restoring a second render system.

## P10/P11 Reserved Boundaries

Commercial SaaS concepts are represented as architecture contracts first:

- tenant/workspace/organization should be added with a dedicated data migration later
- template market should store DSL snapshots
- component and theme markets should publish registry entries and token overrides
- plugin sandbox, billing, API keys, rate limits, and tenant isolation require separate security reviews

Do not mix those changes into payment, refund, check-in, or order safety patches.
