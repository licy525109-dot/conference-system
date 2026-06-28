# P9-OPS Business Module Layer

P9-OPS keeps the existing P9 DSL runtime as the only rendering path, but adds an operator-facing layer above it. Business modules are a shortcut for ordinary operators; they do not replace the full page decoration editor.

## Rendering Flow

```text
CMS Editor
  -> Quick Mode: Business Module Layer
  -> Advanced Mode: Visual Component Editor
  -> Developer Mode: Raw P9 DSL
  -> Business Module Parity Contract
  -> Render Governor
  -> DSL Runtime
  -> CmsVisualRenderer when dsl.meta.editorComponents exists
  -> Design System UI fallback
```

## Cross-End Module Parity

Business modules now define a shared cross-end contract in `@conference/business-modules`:

- `configSchema`: the limited operator-facing fields such as title, image, style preset, action, and items.
- `designTokens`: constrained visual tokens such as `radiusPreset`, `spacingPreset`, `imageMode`, `columns`, `iconSize`, `cardStyle`, and `buttonStyle`.
- `adminPreviewAdapter`: the admin preview renderer contract.
- `h5Adapter`: the H5 renderer contract.
- `miniappAdapter`: the MiniApp renderer contract.
- `parityRules`: invariants that all three adapters must obey.

The first aligned modules are:

- `home-hero`
- `quick-icon-grid`
- `image-banner`
- `rich-text`
- `event-card-carousel`
- `conference-card`
- `product-card`
- `cart-item`
- `member-profile-card`
- `member-benefit-card`
- `order-card`
- `invoice-form`
- `aftersale-form`

Admin Preview, H5, and MiniApp may have platform-specific renderers, but they must consume the same module contract. For example, `quick-icon-grid` shares the same column count, icon size, radius, spacing, card style, title/subtitle sizing, and action configuration. `hero-banner` shares the same image display mode, copy visibility, overlay visibility, height strategy, and action configuration.

## Operator Model

The CMS page editor has three modes:

- 运营快捷模式: adds business modules as shortcuts and converts them to editable visual components.
- 高级装修模式: keeps the complete component library, phone preview, click-to-select, drag sorting, component copy/delete/move, material picking, page templates, page copy/delete, publish and rollback.
- 开发者模式: shows raw P9 DSL for administrator troubleshooting only.

Quick mode shows business modules such as:

- 首页主视觉
- 快捷入口
- 会议推荐
- 首页商品推荐
- 会员卡片
- 会议信息
- 报名引导
- 商品宫格

Each module exposes simplified fields and maps to the visual component editor. The default operating surface does not expose DSL AST fields such as nodes, props, style, action, or JSON.

## Persistence Model

The advanced visual editor stores the compiled P9 DSL and writes the full editor component source into `dsl.meta.editorComponents`. This keeps published pages renderable by the runtime while preserving the full editor source for future editing.

`dsl.meta.editorComponents` is a visual compatibility source for advanced page decoration, not a replacement public page model. User pages still receive a P9 DSL document, validate it through Render Governor, and only then route advanced decoration pages to `CmsVisualRenderer`. Pages without `editorComponents` render through the shared Design System render tree.

The module compiler still supports module-to-DSL rendering and is used by the Render Governor when module input is supplied directly.

The database schema is unchanged. The existing page version JSON column continues to store the normalized P9 DSL document.

## Runtime Rules

- Admin preview uses the restored phone preview and saves compiled P9 DSL.
- User H5 and MiniApp continue to receive published P9 DSL through `PageRenderer` and Render Governor.
- `PageRenderer` stays a thin entry point: it validates DSL, resolves the runtime tree, routes advanced decoration pages to `cms-visual`, and falls back to `DslRenderTree`.
- `CmsVisualRenderer` owns the high-fidelity advanced decoration component UI, including hero banners, login cards, icon grids, rich content, schedules, and product/member modules.
- `CmsVisualRenderer` reads `miniappAdapter` or `h5Adapter` contracts from `@conference/business-modules` before applying module tokens.
- Admin phone preview reads the same module contract through `adminPreviewAdapter` before applying preview tokens.
- Render Governor also accepts module input and compiles it to DSL before rendering.
- Legacy component input is not an operator-facing CMS edit model.
- User runtime can receive `userContext` so login/profile-style CMS cards can show the current user's avatar, nickname, phone, member level, registration count, order count, and coupon count.

## Protected Areas

P9-OPS does not modify payment, refunds, order core logic, check-in core logic, member pricing, AI, WeCom, notifications, or Prisma schema.
