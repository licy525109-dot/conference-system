# Codex Phase 4 Extension Modules Report

## 1. 本次改造的扩展模块

用户端：

- `apps/user/src/pages/member/center.vue`：会员中心视觉统一，明确会员权益暂不参与报名定价。
- `apps/user/src/pages/cart/index.vue`：购物车区分会议报名项和商品项，会议报名结算优先，商品支付标注后续开放。
- `apps/user/src/pages/mall/index.vue`：商城列表统一商品卡片，标注商城试运行和商品仅展示。
- `apps/user/src/pages/mall/detail.vue`：商品详情统一商品图、规格、库存、数量和底部操作，弱化商品支付入口。
- `apps/user/src/pages/custom/index.vue`：自定义页在会员、购物车、商城扩展入口场景下展示状态提示，不写死后台动态导航。
- `apps/user/src/components/ui/ExtensionStatusNotice.vue`：新增用户端扩展模块状态提示组件。

后台：

- `apps/admin/src/pages/members/users.vue`
- `apps/admin/src/pages/members/levels.vue`
- `apps/admin/src/pages/mall/products.vue`
- `apps/admin/src/pages/mall/orders.vue`
- `apps/admin/src/pages/finance/index.vue`
- `apps/admin/src/pages/coupons/index.vue`
- `apps/admin/src/pages/promotions/index.vue`

## 2. 用户端扩展模块状态策略

- 会员中心：标注“后续参与定价”，说明会员权益展示中，暂不参与报名定价，报名金额仍以提交订单时系统计算结果为准。
- 购物车：会议报名项保留“去付款”主操作；商品项标注“预留能力”“商品支付后续开放”，商品操作改为“生成预留单”，避免误导为可立即支付。
- 商城列表：标注“商城试运行”“仅展示”，保留“查看详情”，不提供“立即购买”主按钮。
- 商品详情：展示商品图、名称、价格、规格、库存、说明和数量选择；保留“加入购物车”，明确商品支付、发货和履约后续开放。
- 自定义页：如果后台动态入口指向会员、购物车、商城等扩展 pageKey，只展示自然的扩展状态提示，不改变 CMS 渲染协议和动态导航逻辑。

## 3. 后台扩展模块状态策略

- 会员管理 / 会员等级：标注“扩展能力 / 后续参与报名定价”，说明授予会员和会员等级不会改变报名订单金额。
- 商城商品 / 商城订单：标注“商城能力灰度中”，说明商品支付和履约后续完善，不伪装成完整电商后台。
- 财务与对账：标注“对账辅助 / 灰度能力”，说明不等同完整财务系统，不作为正式财务结算依据。
- 优惠券 / 满减：标注“营销配置 / 灰度能力”，说明不改变 quote、下单和支付金额计算逻辑。

## 4. 哪些能力已可用

- 会议报名购物车项结算入口。
- 用户端会员等级和当前会员信息展示。
- 商城商品列表、商品详情、规格和库存展示。
- 商品加入购物车。
- 后台会员、商城、财务、优惠券、满减页面的既有展示和配置入口。

## 5. 哪些能力灰度中

- 商城商品和商城订单后台管理。
- 商城商品用户端展示与加入购物车。
- 财务与对账辅助页面。
- 优惠券、满减等营销配置页面。

## 6. 哪些能力后续开放

- 会员权益自动参与会议报名定价。
- 会员价、会员折扣自动影响 quote、下单和支付金额。
- 商品立即购买、商品支付、商品履约和发货。
- 完整电商订单闭环。
- 完整财务系统、微信官方账单下载和正式财务结算。

## 7. 未修改的后端/支付/金额/Prisma/生产配置内容

本阶段未修改：

- `services/api/**`
- `prisma/**`
- `packages/shared/**` 中金额、订单、支付、报名状态相关类型或逻辑
- `apps/user/src/services/payment.ts`
- `apps/user/src/services/registration.ts`
- `apps/user/src/services/request.ts`
- `apps/user/src/config/app.ts`
- 微信支付 prepay、notify、订单金额计算、支付回调、数据库连接
- `.env`、`.env.local`、`.env.production`、`apps/admin/.env.production`
- `uploads/**`、`services/api/uploads/**`
- `docker-compose.prod.yml`、`start-api.sh`
- 任何证书、私钥、微信商户私钥、API v3 Key、AppSecret、JWT_SECRET
- 任意构建产物

## 8. 验证命令和结果

- `pnpm --filter @conference/user typecheck`
  - 结果：通过。
- `pnpm --filter @conference/admin typecheck`
  - 结果：通过。
- `pnpm build:user:h5`
  - 结果：通过；uni-app 提示有新版本，不影响构建。
- `pnpm build:admin`
  - 结果：通过；Vite/Rollup 输出第三方 PURE 注释和 chunk size 常规警告，不影响构建。
- `pnpm build:user:mp-weixin`
  - 结果：通过；uni-app 提示有新版本，不影响构建。

## 9. Phase 5 建议

- 对用户端扩展入口做真机走查，确认后台动态 Tabbar 配置会员、商城、购物车时不会抢占会议报名主线。
- 为商品购物车和预留单增加更明确的运营说明页，避免用户咨询“为什么不能支付商品”。
- 如后续要开放商品支付，应另起任务定义商品订单支付状态、金额校验、支付回调、履约和售后边界。
- 如后续要开放会员价，应先设计后端定价规则、quote 展示口径和订单创建重新计价规则。
- 财务对账如要正式上线，应先接入微信账单下载、差异处理流程、权限和审计日志。
