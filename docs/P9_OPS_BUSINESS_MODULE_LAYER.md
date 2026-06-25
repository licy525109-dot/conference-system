# P9-OPS Business Module Layer

P9-OPS keeps the existing P9 DSL runtime as the only rendering path, but adds an operator-facing layer above it. Business modules are a shortcut for ordinary operators; they do not replace the full page decoration editor.

## Rendering Flow

```text
CMS Editor
  -> Quick Mode: Business Module Layer
  -> Advanced Mode: Visual Component Editor
  -> Developer Mode: Raw P9 DSL
  -> Render Governor
  -> DSL Runtime
  -> Design System UI
```

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

The module compiler still supports module-to-DSL rendering and is used by the Render Governor when module input is supplied directly.

The database schema is unchanged. The existing page version JSON column continues to store the normalized P9 DSL document.

## Runtime Rules

- Admin preview uses the restored phone preview and saves compiled P9 DSL.
- User H5 and MiniApp continue to render published P9 DSL through `PageRenderer` and Render Governor.
- Render Governor also accepts module input and compiles it to DSL before rendering.
- Legacy component input is not an operator-facing CMS edit model.
- User runtime can receive `userContext` so login/profile-style CMS cards can show the current user's avatar, nickname, phone, member level, registration count, order count, and coupon count.

## Protected Areas

P9-OPS does not modify payment, refunds, order core logic, check-in core logic, member pricing, AI, WeCom, notifications, or Prisma schema.
