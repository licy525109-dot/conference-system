# 团体票规则

## 功能范围

在会议配置的票种中选择普通票或团体票。普通票保持原有行为；团体票支持人均计价（可选人数阶梯价）和固定人数套餐总价两种模式，并设置订单最低实付金额。所有持久化金额均为整数分。

- 人数按同一订单的同一票种计算，其他票种不能凑该票种的起购人数。
- 例如 3 人起购、基础价 3000 元/人、满 5 人 2800 元/人：3 人共 9000 元，5 人共 14000 元；不是只有第 5 人享受优惠。
- 阶梯人数严格递增，人均价格不得高于基础价或上一档。最多 20 档。
- 整团套餐按明确人数配置，例如 5 人整团 14000 元、10 人整团 25000 元。只允许购买已配置人数，不支持未配置的 6 人或自动拼套餐；最多 20 档。最低人数等于首档人数。
- 套餐总价精确到分，不要求被人数整除。OrderItem.unitPriceCent 是向下取整的人均分摊参考值，实际金额以 totalAmountCent 为准，余数写入规则快照；后台及导出展示套餐总价。已有会员优惠按每人分摊的整数分计算，余数分配给相应数量的人员，最后汇总，不丢分。
- 最低实付金额为订单最终金额下限，0 表示不限制；低于下限时不能下单，不自动补收差额。混合多个团体票时，订单须满足所有下限，即取最高门槛。
- 保持现有会员价、优惠券和满减规则；优惠计算后再次校验最低实付金额，避免优惠后低于配置下限。
- quote 只展示；创建订单重新读取数据库票种及规则，计算金额并固化价格、规则快照。历史订单不会随改价变化。
- 库存仍按人数扣减，每人填写一份参会资料；订单、支付回调及退款状态机不改变。
- 会议须允许团体报名，单笔人数上限不能小于团体起购人数；不足库存、停用、销售期和最大票数仍由后端校验。

## 使用

后台 → 会议管理 → 会议配置 → 票种配置 → 新增/编辑票种 → 团体票。

“基础人均价”设置起购人数后的每人价格，阶梯按人数由小到大添加。保存后，报名页展示人数与价格规则；增加团体票时从起购人数开始。

选择整团套餐时，填写每档人数与整团总价，不另外填写人均基础价。套餐人数须不超过会议单笔最大票数；库存按人数校验。本次不是跨订单拼团，不统计多个用户凑团。

## 发布与验收边界

新增 nullable JSONB 列，现有票种为普通票。需要部署 API、后台并完成迁移；小程序规则展示和人数步进需上传新的小程序版本。旧小程序仍受后端人数和金额限制，但不具备新增规则界面。

不自动改动任何生产票种，不执行真实支付或退款。正式启用团体票前，须先发布兼容的新小程序，避免旧端仍按普通票展示。

## 核心验证（2026-10-17）

- 共享计价测试：22 项通过，包含人均阶梯、套餐非整除金额、非法人数、金额精度及溢出。
- 后端回归：579 项通过；包含管理员并发局部改价保护，订单查询/导出确认套餐显示整团总价。
- API 类型检查及构建通过。
- 后台既有测试 42 项、团体票组件测试 23 项及类型检查/构建通过。浏览器综合场景通过，覆盖普通票/人均/套餐、失败重试、防重复提交，以及 1440/390/320px 布局。
- 用户端测试 92 项、类型检查、H5 构建、小程序构建及包体检查通过，主包 1632.34 KiB。已检查套餐报名页与待参会列表在 320/390/1280px 的模拟数据截图；未视作微信真机验收。
- PostgreSQL 隔离集成：全部 55 个迁移成功，包含新增 JSONB 字段。普通票 SQL NULL/团体规则 JSONB 更新兼容、管理员交错修改基础价和阶梯价时只允许一方成功、下单价格重算、最低人数、前端金额篡改拒绝、15002 分套餐金额快照、重复模拟支付只生成 1 笔报名/5 位参会人、规则变更事务回滚、最后一团并发库存竞争均通过。测试容器已清理。
- 生产部署、真实微信支付/退款、微信真机验收均未执行。本地模拟支付结果不能视为真实支付验收。

本地后台预览：`http://127.0.0.1:5293/#/conferences/config?id=local-group-pricing-preview`，只用内存模拟数据。预览脚本位于工作树 `.tmp/group-ticket-admin-preview.mjs`，不进入生产构建；重启恢复示例。

主要修改文件：`packages/shared/src/group-ticket-pricing.ts`、`prisma/schema.prisma` 及新增迁移、`services/api/src/registration/registration.service.ts`、`services/api/src/admin/admin-management.service.ts`、`services/api/src/admin/admin-order-query.ts`、`services/api/src/admin/admin-exports.service.ts`、`services/api/src/cart/cart.service.ts`、`services/api/src/conferences/conferences.service.ts`、`apps/admin/src/components/conference/GroupTicketPricingEditor.vue`、`apps/admin/src/pages/conferences/config.vue`、`apps/admin/src/pages/orders/index.vue`、`apps/user/src/pages/registration/form.vue`、`apps/user/src/pages/conference/detail.vue`、`apps/user/src/pages/cart/index.vue`，以及对应服务类型、共享导出、UI helper 和测试文件。

复验入口：

```sh
pnpm --filter @conference/shared test
pnpm --filter @conference/api test
pnpm --filter @conference/api typecheck
pnpm --filter @conference/api build
pnpm --filter @conference/admin test
node --test apps/admin/src/components/conference/GroupTicketPricingEditor.test.mjs
node --test apps/admin/src/components/conference/GroupTicketPricingEditor.browser.test.mjs
pnpm --filter @conference/user test
```

数据库集成脚本 `tests/e2e/group-ticket-pricing.integration.ts` 仅接受回环地址、数据库名 `group_ticket_pricing_qa`，需要先执行迁移。通过 `GROUP_TICKET_TEST_DATABASE_URL` 提供一次性测试库地址，设置 `PAYMENT_MODE=mock REGISTRATION_PROFILE_REQUIRED=true NODE_ENV=test`，使用 `pnpm exec tsx --tsconfig services/api/tsconfig.json --test tests/e2e/group-ticket-pricing.integration.ts` 运行。

## 人工验收

1. 会议基础信息开启团体报名，单单最大票数设为至少 10（或不限）。
2. 新建按人团体票：3 人起购、3000 元/人、满 5 人 2800 元/人、满 10 人 2500 元/人；核对 3/5/10 人对应 9000/14000/25000 元。
3. 新建整团套餐：5 人 14000 元、10 人 25000 元；确认人数只能从 0 切到 5、10，不能买未配置的 6 人套餐。
4. 填写每位参会资料；分别检查库存不足、会议人数上限、优惠后最低实付、报价失败和快速切换人数时提交按钮与金额状态。
5. 套餐加入待参会列表后显示服务端精确总价；规则失效条目显示原因且不能付款。改变团体人数需返回报名重新填写资料。
6. 后台订单列表、详情、导出核对套餐人数和整团总价。编辑当前票种后，已有订单仍保留原下单快照。
