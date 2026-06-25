# P8.5 Render Stabilization

## Decision

The user-facing CMS render path is now:

```text
CMS Editor
  -> P9 DSL
  -> Render Governor
  -> DSL Runtime
  -> Design System Registry
  -> Unified DS Renderer
```

## Render Governor

`render-governor/` owns render admission:

- accepts only P9 DSL as the normal render input
- validates schema version and registry component types
- converts historical CMS component JSON to P9 DSL only as a disabled-legacy downgrade path with warnings
- never returns legacy component UI render instructions

The runtime package no longer knows how to map CMS legacy components. Runtime only parses and resolves locked DSL documents shaped as `{ schemaVersion: "p9", page, dsl: { nodes } }`.

## PageRenderer

`apps/user/src/components/PageRenderer.vue` is now a thin runtime entry point:

- accepts `dsl`
- creates a governed runtime context
- calls `governRender(dsl, context)`
- renders the resolved tree through `DslRenderTree`

It no longer contains direct CMS component UI branches.

## CMS Public Output

`services/api/src/cms/cms.service.ts` returns `version.dsl` for published pages. User pages now pass `cmsPage.version.dsl` into `PageRenderer`.

## P9 Final CMS Editor Output

`apps/admin/src/pages/cms/pages.vue` is now a DSL editor. It edits:

- `dsl.nodes`
- `type`
- `props`
- `style`
- `action`

Admin preview uses `governRender(dsl, context)` and renders the same resolved runtime tree through admin DS components. Admin version and template responses expose `dsl`; the historical Prisma column named `components` is only used as the stored JSON column for compatibility and is normalized to locked P9 DSL at service boundaries.

Historical component arrays are accepted only as a guarded migration input from stored/default data: they are safety-checked, converted to DSL, and never rendered by a legacy UI path. CMS editor save APIs reject `components` input.

## Remaining Business UI

This stabilization only removes the CMS legacy renderer from the user-facing render path. Business pages such as registration forms, cart checkout, member profile, and credential details still contain product workflow UI because they are not CMS page renderers and are tied to order, payment, registration, or member flows. Those were intentionally left untouched by the P8.5 safety constraints.
