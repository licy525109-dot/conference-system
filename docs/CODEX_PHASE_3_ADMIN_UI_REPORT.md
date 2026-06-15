# Codex Phase 3 Admin UI Report

## 1. 本次改造的后台页面

- 整体后台框架：`apps/admin/src/layouts/AdminLayout.vue`、`apps/admin/src/router/index.ts`
- 数据看板：`apps/admin/src/pages/dashboard/index.vue`
- 会议业务：`apps/admin/src/pages/conferences/index.vue`、`apps/admin/src/pages/conferences/config.vue`、`apps/admin/src/pages/registrations/index.vue`、`apps/admin/src/pages/orders/index.vue`
- 营销配置：`apps/admin/src/pages/coupons/index.vue`、`apps/admin/src/pages/promotions/index.vue`
- 页面装修：`apps/admin/src/pages/cms/pages.vue`、`apps/admin/src/pages/cms/themes.vue`、`apps/admin/src/pages/cms/tabbar.vue`、`apps/admin/src/pages/materials/index.vue`
- 扩展能力：`apps/admin/src/pages/members/users.vue`、`apps/admin/src/pages/members/levels.vue`、`apps/admin/src/pages/mall/products.vue`、`apps/admin/src/pages/mall/orders.vue`、`apps/admin/src/pages/finance/index.vue`
- 系统管理：`apps/admin/src/pages/system/accounts.vue`、`apps/admin/src/pages/system/roles.vue`

## 2. 菜单分组调整说明

后台菜单调整为更接近运营工作流的信息架构：

- 工作台：数据看板
- 会议业务：会议管理、报名名单、订单支付
- 营销配置：优惠券、满减规则
- 页面装修：页面装修、主题配置、底部导航、素材管理
- 扩展能力：会员管理、会员等级、商城商品、商城订单、财务对账
- 系统管理：账号管理、角色权限

会议报名主链路优先展示；会员、商城、财务、高级权限等模块在菜单和页面头部用“后续”“辅助”“高级”等标签弱化，避免与第一版会议报名缴费主线同权重。

## 3. 新增/复用的通用组件

本阶段新增轻量后台 UI 组件，继续基于 Vue 3 和 Element Plus，不引入新的大型 UI 库：

- `AdminPageHeader`：统一页面标题、说明、操作区和能力标签。
- `AdminStatCard`：统一看板指标卡。
- `AdminFilterBar`：统一筛选栏和右侧操作区。
- `AdminStatusBadge`：统一会议、订单、支付、核销、启停等状态标签。
- `AdminEmptyState`：统一表格空状态。
- `AdminSectionCard`：统一页面内信息区块。
- `AdminFeatureBadge`：统一灰度、后续、辅助、高级能力提示。

## 4. 主线模块和扩展模块区分策略

第一版会议报名缴费主线：

- 数据看板
- 会议管理
- 会议配置详情
- 报名名单
- 订单支付
- 页面装修
- 主题配置
- 底部导航
- 素材管理

扩展/灰度/后续模块：

- 优惠券、满减规则：标注为灰度营销能力，页面提示订单金额仍以后端重新计算为准。
- 会员管理、会员等级：标注为后续开放，不参与会议报名定价。
- 商城商品、商城订单：标注为后续开放，不接会议报名支付和履约。
- 财务对账：标注为对账辅助，不等同完整财务系统。
- 角色权限：标注为高级权限，提示谨慎调整。

## 5. 未修改的后端/支付/金额/Prisma/生产配置内容

本阶段未修改以下内容：

- `services/api/**`
- `prisma/**`
- `packages/shared/**` 中金额、订单、支付、报名状态相关类型或逻辑
- 用户端支付、报名、请求和生产 API 配置
- 微信支付 prepay、notify、订单金额计算、支付回调、数据库连接
- `.env`、`.env.local`、`.env.production`、`apps/admin/.env.production`
- `uploads/**`、`services/api/uploads/**`
- `docker-compose.prod.yml`、`start-api.sh`
- 任何证书、私钥、微信商户私钥、API v3 Key、AppSecret、JWT_SECRET
- 任意构建产物

## 6. 验证命令和结果

- `pnpm --filter @conference/admin typecheck`
  - 结果：通过。
- `pnpm build:admin`
  - 结果：通过。
  - 备注：Vite 输出第三方依赖 pure annotation 提示和 chunk size 提示，未阻塞构建。

## 7. 风险和 Phase 4 建议

风险点：

- 当前看板和部分运营页仍依赖已有列表接口聚合数据，数据量增大后可能需要后端分页、聚合或专用统计接口。
- 页面装修的发布前提示只在后台前端展示，不改变后端 CMS 数据结构；运营仍需按提示处理不支持组件。
- 财务对账仅基于系统内订单和支付记录，不等同微信官方账单对账。
- 优惠券、满减、会员、商城仍属于扩展能力，虽然页面视觉统一，但不应作为第一版核心验收范围。

Phase 4 建议：

- 做后台真实运营数据的空态、异常态和权限态验收。
- 增加会议配置详情页的分步骤保存体验和字段校验提示。
- 评估 Dashboard 是否需要后端聚合接口，减少前端聚合列表数据。
- 对页面装修发布流程增加发布前检查清单，包括不支持组件、缺失图片、跳转路径、底部导航灰度入口。
- 对订单支付页增加只读支付异常排查说明，但仍不提供手工改支付状态能力。
