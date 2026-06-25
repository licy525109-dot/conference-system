# P9-OPS Business Module Layer

P9-OPS keeps the existing P9 DSL runtime as the only rendering path, but adds an operator-facing layer above it. Operators edit business modules, not DSL nodes.

## Rendering Flow

```text
CMS Module Editor
  -> Business Module Layer
  -> Module Compiler
  -> Render Governor
  -> DSL Runtime
  -> Design System UI
```

## Operator Model

The CMS page editor shows business modules such as:

- 首页主视觉
- 快捷入口
- 会议推荐
- 首页商品推荐
- 会员卡片
- 会议信息
- 报名引导
- 商品宫格

Each module exposes form fields such as title, subtitle, image, layout, columns, jump type, jump target, and item lists. The editor does not expose DSL AST fields such as nodes, props, style, or action as an operating surface.

## Persistence Model

The module compiler stores the compiled P9 DSL and writes the source modules into `dsl.meta.businessModules`. This keeps published pages renderable by the existing runtime while preserving the business-module source for future editing.

The database schema is unchanged. The existing page version JSON column continues to store the normalized P9 DSL document.

## Runtime Rules

- Admin preview calls `governRender` with compiled P9 DSL.
- User H5 and MiniApp continue to render published P9 DSL through `PageRenderer` and Render Governor.
- Render Governor also accepts module input and compiles it to DSL before rendering.
- Legacy component input is not an operator-facing CMS edit model.

## Protected Areas

P9-OPS does not modify payment, refunds, order core logic, check-in core logic, member pricing, AI, WeCom, notifications, or Prisma schema.
