# Configurable CMS Component Architecture

## Product Model

The editor exposes one operator workflow. Operators work with visual components and forms, not DSL modes or JSON editors. The workspace is always:

```text
Component library and page structure | live phone preview | component and page settings
```

Templates are starting compositions only. Applying a template creates independent modules rather than a fixed page.

## Shared Composition Source

`packages/shared/src/cms-compositions.ts` owns the default composition and legacy expansion contract used by the API, Admin, H5, and MiniApp. High-frequency modules include:

- `hero-banner`
- `notice`
- `login-card`
- `quick-icon-grid`
- `promotion-bar`
- `stats-grid`
- `conference-schedule`
- `conference-list`
- `user-profile-card`
- `membership-benefits`
- `mall-product-grid`
- `dual-track-tags`

Each component retains its own id, enabled state, sort order, config, style, and action. Operators can drag, move, copy, hide, delete, and reconfigure every component.

## Runtime Path

```text
CMS visual editor
  -> P9 DSL with meta.editorComponents
  -> Render Governor schema and registry validation
  -> Runtime resolution
  -> CmsVisualRenderer platform adapter
  -> extracted component renderer
```

`PageRenderer.vue` is a thin entry point. High-frequency UI lives under `apps/user/src/components/cms-visual/component-renderers/`. A validated page without visual metadata uses the Design System render tree.

## User Context

`useCurrentUserContext.ts` loads and caches the current account, member center, registrations, mall orders, and coupons. It listens for `auth:changed`, so a successful `ensureLogin()` updates login cards and user modules without a page reload.

Guest previews use a guest context. Admin member previews use a complete sample structure. H5 and MiniApp use the real logged-in context.

## Cross-Platform Contract

Admin preview, H5, and MiniApp share component config, composition defaults, tokens, and parity rules. Platform adapters may use different DOM primitives, but they must preserve:

- module order and visibility
- image ratio and fit mode
- title and description visibility
- columns, spacing, radius, colors, and hierarchy
- user-context fields
- action meaning

Playwright snapshots in `tests/frontend` cover the Admin three-column editor, guest/member states, product cards, and schedule cards. New high-frequency modules should add a deterministic fixture and a screenshot before release.

`.github/workflows/quality.yml` runs type checks, tests, production builds, permission checks, and deployment-script syntax checks on Linux, then runs the Darwin screenshot baselines on a macOS Playwright worker for every pull request.

## Code Ownership

- Admin editor shell and orchestration: `apps/admin/src/pages/cms/pages.vue`
- Admin editor styling: `apps/admin/src/pages/cms/pages.css`
- User runtime entry: `apps/user/src/components/PageRenderer.vue`
- User visual router: `apps/user/src/components/cms-visual/CmsVisualRenderer.vue`
- Isolated renderers: `apps/user/src/components/cms-visual/component-renderers/`
- Shared compositions: `packages/shared/src/cms-compositions.ts`
- Render policy: `render-governor/`
- DSL resolution: `runtime/`

The previous fixed renderer was deleted. The Admin editor and user visual renderer were split so their core Vue files are materially smaller, while preserving all existing component configurations.
