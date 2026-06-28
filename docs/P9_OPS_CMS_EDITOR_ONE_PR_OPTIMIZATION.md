# P9-OPS CMS Editor One-PR Optimization

This pass keeps the P9 DSL Runtime and Render Governor as the underlying render path, while making the CMS editor easier to operate and easier to accept in one PR.

## Scope

- CMS page decoration workbench only.
- No payment, order amount, refund, check-in, member pricing, WeCom, AI, notification, Prisma schema, or migration changes.
- The editor still saves P9 DSL and keeps advanced visual source data in `dsl.meta.editorComponents`.

## Implemented

### Preview Shell

- Admin phone preview can switch between MiniApp and H5 shells.
- Preview route hints show the MiniApp path and H5 path for the selected page.
- The center phone preview remains fixed in the workbench and keeps click-to-select and drag-to-sort interactions.

### Component Library

- The component library has card and compact views.
- Library counters show total components, publishable components, and active category size.
- Category rail gives quick access to component groups without exposing raw DSL.

### Cross-Platform Component Contracts

The right inspector now shows a component parity panel for the selected component:

- Admin Preview adapter
- H5 adapter
- MiniApp adapter
- parity rules for image display, text visibility, entry columns, login context, fixed template keys, and other core component behavior

Covered high-frequency components:

- `fixed-business-template`
- `hero-banner`
- `quick-icon-grid`
- `login-card`
- `rich-text`
- `conference-schedule`
- `mall-product-grid`

Unlisted components use a generic P9 DSL / CMS visual renderer contract.

### Fixed Business Modules

Business fixed modules now have:

- visible / hidden counts
- show all
- hide optional modules
- normalize sort order
- reset current page defaults
- per-module up / down movement
- per-module numeric sort value

This is especially important for cart, member center, registration, credential, mall, invoice, and aftersale pages, where fixed business blocks must not be hard-coded from the operator's perspective.

### Publish Acceptance Panel

The right inspector now includes a release acceptance panel that checks:

- P9 DSL save path
- unsupported or basic components
- MiniApp and H5 routes
- phone preview component coverage
- fixed business module coverage for business pages
- login user context where relevant

The panel separates pass, warning, and blocking states so operators can understand what still needs manual verification before publishing.

### Guanchao Admin Layout Alignment

The CMS workbench has been aligned with the observed "观潮会集 - 管理后台" product surface:

- the top page header now identifies the management workbench and keeps mode switching, templates, drafts, and publishing in one action row
- an operations overview bar summarizes the current page, visible components, fixed business modules, and release acceptance state
- a renovation workflow strip makes the page flow explicit: choose page, add components, arrange the phone canvas, save and publish
- the component library now behaves more like a renovation toolbox, with current-group stats, display mode, component type hints, and publish support status
- the phone canvas includes a compact operation bar for platform, click-to-select, drag sorting, and current selected module
- the component inspector exposes content, style, and action editing modes as operator-facing configuration areas
- component cards show the operator label, support status, technical type, platform coverage, and render hint without exposing raw DSL
- the phone preview shell uses a MiniApp/H5-like status bar and keeps the preview fixed in the center work area
- the admin workbench, CMS visual renderer, and fixed business templates share the same navy / gold / warm paper visual language

## Manual Acceptance

Before marking the PR ready, verify:

- Admin preview MiniApp shell and H5 shell both render the selected page.
- `hero-banner` does not show default technical titles after title or description is deleted.
- `quick-icon-grid` preserves columns, icon size, and entry actions in Admin Preview, H5, and MiniApp.
- Login card triggers login on MiniApp and uses current user data after login.
- Cart fixed modules hidden in CMS are hidden on MiniApp.
- Fixed business templates no longer render as "component unavailable".

## Architecture Status

The intended render chain remains:

```text
CMS Editor
  -> P9 DSL
  -> Render Governor
  -> Runtime
  -> CMS Visual Renderer or DS RenderTree
  -> Admin Preview / H5 / MiniApp
```

The workbench improvements do not make `version.components` a user-facing render source and do not bypass the Render Governor.
