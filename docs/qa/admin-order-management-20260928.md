# 后台订单核对、统计与回收站验收

日期：2026-09-28。范围：后台管理端、API、数据库增量迁移。小程序端未修改。

## 交付内容

- 订单列表和详情展示全部下单票种快照、数量、单价。历史订单不随当前票种名称或价格变化。
- 会议与票种组合筛选，兼容没有 OrderItem 的旧单票订单。票种选项包含停用但仍有历史订单的规格。
- 金额统计覆盖全部筛选结果，而非当前分页；实付总额、成功退款、净收款、应付及优惠均按整数分计算。
- 一个订单包含多票种时，筛选其中一种仍以整单计款，页面明确标注；不会按票种数量或支付尝试次数重复计款。
- 列表、统计、导出、批量关闭使用同一筛选规则。异常筛选改为跨页，导出超过 5000 单明确拒绝而非静默截断。
- 订单列表直接编辑下单账号；用户详情也提供编辑入口。只提交实际更改的字段，只改姓名不会清空手机号或手机号验证状态。
- 单笔、勾选批量删除进入后台回收站，可恢复，必须填写原因并记录管理员审计。

## 删除边界

- 回收站仅从默认后台订单列表、该列表金额合计及导出排除订单。
- 不改变订单支付状态，不触发退款，不删除支付、退款、报名或签到记录，不修改库存或优惠券，不改变嘉宾端历史凭证及独立财务账本。
- 待支付订单不能移入回收站，需先按现有规则关闭；存在申请中、已批准或处理中的退款时拒绝删除。
- 一次只处理明确选中的 1 至 100 个订单；任何缺失订单或不符合条件的订单使整批操作失败。
- 重复删除、恢复幂等，修改和审计在 Serializable 事务中执行。
- 用户已说明还有其他测试订单，将另行补充范围。本次未清理任何生产数据，不以 0.01 元作为测试数据判断条件。

## 权限与身份

- 票种读取和订单统计使用 `order:view`；回收和恢复使用 `order:delete`。
- 账号查看需要 `member:view`，编辑需要 `member:write`，完整手机号读取仍需要 `member:phone:view` 并审计。
- 下单账号与实际参会人保持独立。编辑账号资料不更改订单归属、参会人或历史报名表单。

## 验证结果

| 验证 | 状态 | 证据与边界 |
| --- | --- | --- |
| 全工作区单元测试 | PASS | 581 项：API 502、shared 13、user 66；本次新增 15 项 |
| 全工作区 typecheck、lint | PASS | `.tmp/order-workspace-typecheck.log`、`.tmp/order-lint.log` |
| API 与后台生产构建 | PASS | `.tmp/order-api-build.log`、`.tmp/order-admin-build.log`；后台仍有既有的大包体积提示 |
| Prisma generate / validate | PASS | 新增可空字段及索引，schema 校验通过 |
| 管理员权限静态检查 | PASS | `scripts/smoke/check-admin-permissions.ts` |
| Playwright 页面交互 | PASS | 21 项，使用合成数据与本地 API，覆盖跨页总额、混合票种、导出、编辑、错误状态、单笔及批量删除恢复、只读权限 |
| 直接修改姓名请求 | PASS | 浏览器确认 PATCH 仅包含 realName，未提交 phone，保存后保持订单页面 |
| 桌面 / 手机渲染 | PASS | 1600px 订单列表、390px 编辑弹窗；无 JavaScript pageerror |
| PostgreSQL 迁移及真实数据库集成 | PASS | 在独立临时 PostgreSQL 数据库执行全部 Prisma 迁移及真实服务调用；覆盖混合/旧票种、跨页金额、部分退款、导出、保护性拒绝、回收/恢复、幂等审计及关联记录不变；临时数据库已移除，正式库未写入测试数据 |
| 生产部署 / 生产订单清理 | NOT_RUN | 用户已授权生产发布，进入发布流程；订单清理仍等待明确测试范围 |

浏览器证据：`output/playwright/order-admin-desktop.png`、`output/playwright/order-account-mobile.png`。
交互记录：`.tmp/order-browser-check.log`、`.tmp/order-browser-permissions.log`。
数据库验证：`.tmp/order-release-db-check.mjs`、`.tmp/order-db-fixture.cjs`、`.tmp/order-db-migrate-release.log`。本机 Docker 无法启动的限制通过独立临时数据库解决；连接凭据仅在验证进程内存中使用，未落日志或提交。

## 发布前检查

1. 先在可用的隔离 PostgreSQL 中执行全部迁移，并实测混合票种筛选、部分退款汇总及回收/恢复后关联记录保持不变。
2. 备份生产数据库，再执行 `20260928120000_admin_order_recycle_bin` 增量迁移，随后发布 API 与后台。新 API 查询依赖新增字段，不能跳过迁移直接发布。
3. 生产只读核对真实会议的订单数、实付、退款和净收款；不得以合成浏览器数据代替真实数据库验收。
4. 收到具体测试订单范围后先列出匹配订单和金额，确认后移入回收站，不物理抹除真实支付流水。

## 回滚边界

- 自动部署会先备份生产数据库、环境配置、Admin 和 H5 静态文件，记录备份目录。
- 本次迁移仅增加三个可空字段及索引，旧版 API 可继续使用。回滚代码和静态文件时保留新增字段及审计，不删除回收信息、不自动恢复旧数据库覆盖上线后的新订单。
- 未修改小程序代码，无需重新上传或提交小程序审核；现有企微同步和回写开关保持原配置。

## 主要文件

- `apps/admin/src/pages/orders/index.vue`、`apps/admin/src/pages/members/detail.vue`
- `apps/admin/src/components/UserAccountEditor.vue`、`apps/admin/src/services/admin.ts`、`apps/admin/src/services/types.ts`
- `services/api/src/admin/admin-order-query.ts`、`admin-management.service.ts`、`admin-management.controller.ts`、`admin-exports.service.ts`
- `services/api/src/admin/admin-order-query.spec.ts`、`admin-members.service.spec.ts`
- `prisma/schema.prisma`、`prisma/migrations/20260928120000_admin_order_recycle_bin/migration.sql`
