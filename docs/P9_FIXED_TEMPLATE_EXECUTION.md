# P9 Fixed Business Template Execution

## Scope

This pass applies the `codex_exact_fixed_template_package` assets and fixed-template contract to the CMS decoration stack without changing payment, order, refund, check-in, member pricing, WeCom, AI, notification, Prisma schema, or migrations.

## Asset Roots

- MiniApp/H5 assets: `apps/user/src/static/fixed-templates`
- Admin preview assets: `apps/admin/public/static/fixed-templates`

Both roots mirror the package `assets/` directory.

## Template Contract

The six fixed business templates are represented as a CMS visual component:

```json
{
  "type": "fixed-business-template",
  "config": {
    "templateKey": "home",
    "assetRoot": "/static/fixed-templates",
    "heroTitle": "潮起谋局  潮落定势",
    "heroSubtitle": "行业会议与创始人社群平台",
    "heroImageUrl": "",
    "items": [],
    "noticeBar": true,
    "loginCard": true,
    "quickGrid": true
  }
}
```

The component is saved inside P9 DSL `meta.editorComponents`; the DSL node remains a `ds-section` so Render Governor and Runtime still validate the page before the CMS visual compatibility renderer restores the fixed business visual.

## Supported Templates

- `home`: homepage fixed template
- `schedule`: annual schedule fixed template
- `registration`: conference registration list fixed template
- `mall`: mall home fixed template
- `cart`: cart fixed template
- `member-center`: member center fixed template

## Admin Behavior

The CMS toolbar now exposes `固定模板`, which applies one of the six locked templates to the current draft. Operators edit whitelisted fields only: hero title, subtitle, hero image, notice copy, quick-entry items, and module visibility toggles. Raw DSL remains developer-mode only.

## Runtime Behavior

User rendering still enters through `PageRenderer -> Render Governor -> Runtime`. If the governed DSL contains `meta.editorComponents` with `fixed-business-template`, `CmsVisualRenderer` delegates to `FixedBusinessTemplateRenderer`. Otherwise the normal DS render tree is used.

## Compatibility

Old pages keep opening through `meta.editorComponents` compatibility. The fixed template does not read `version.components` as a user runtime source and does not add any migration.
