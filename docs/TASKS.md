# 会议报名缴费 MVP 任务拆分

## 1. 阶段原则

- 每个阶段保持小步可验收。
- 文档确认后再写业务代码。
- 优先实现后端闭环，再补用户端和后台端。
- 金额、支付、订单状态、后台鉴权优先测试。
- 不扩展优惠券、会员、商城、AI 知识库、房间座位酒店、抖音 / 小红书 / B 站原生小程序。

## 2. 阶段 0：文档确认

目标：确认 MVP 范围、架构、数据模型、API、任务和测试计划。

任务：

- 生成 PRD.md。
- 生成 ARCHITECTURE.md。
- 生成 DATABASE.md。
- 生成 API.md。
- 生成 TASKS.md。
- 生成 TEST_PLAN.md。
- 等待人工 review。

验收：

- 文档明确 MVP 范围。
- 文档明确暂不实现范围。
- 文档明确金额、支付、幂等、后台鉴权规则。

## 3. 阶段 1：初始化工程

目标：建立可运行的 pnpm monorepo 骨架。

任务：

- 创建 apps/user。
- 创建 apps/admin。
- 创建 services/api。
- 创建 packages/shared。
- 创建 prisma 目录。
- 配置 pnpm workspace。
- 配置 TypeScript、lint、test 基础脚本。
- API 实现 `/api/health`。

验收：

- `pnpm typecheck` 可运行。
- `pnpm lint` 可运行。
- `pnpm test` 可运行。
- `pnpm dev:api` 启动后 `/api/health` 返回 ok。

## 4. 阶段 2：数据库和种子数据

目标：建立 MVP 数据模型。

任务：

- 实现 Prisma schema。
- 定义枚举。
- 定义 User、AdminUser、Conference、ConferencePage、RegistrationSku、FormDefinition、FormField、Order、OrderItem、Payment、Registration。
- 添加唯一约束和索引。
- 编写 seed：管理员、示例会议、两个报名规格、基础表单字段。

验收：

- `pnpm prisma:migrate` 成功。
- seed 后数据库有示例会议。
- 规格价格使用整数分，例如 100000 和 70000。
- `.env`、私钥、AppSecret、API v3 Key 未提交。

## 5. 阶段 3：后端公开 API

目标：完成会议、表单、quote、订单的后端能力。

任务：

- GET /api/conferences。
- GET /api/conferences/:id。
- GET /api/conferences/:id/form。
- POST /api/orders/quote。
- POST /api/orders。
- GET /api/orders/:id。
- 实现动态表单后端校验。
- 创建订单时重新读取 SKU 并计价。

验收：

- 只返回已发布会议。
- 会议详情返回启用规格。
- 必填字段缺失返回校验错误。
- 手机号和邮箱格式校验生效。
- 前端提交伪造金额不影响订单金额。
- OrderItem 保存 SKU 价格快照。

## 6. 阶段 4：支付闭环

目标：完成 mock 支付和微信支付预留闭环。

任务：

- POST /api/payments/mock/pay。
- POST /api/payments/wechat/prepay。
- POST /api/payments/wechat/notify。
- 实现统一的支付成功处理服务。
- 支付成功时更新 Order 和 Payment。
- 支付成功时创建 Registration。
- 处理重复回调幂等。
- 支付 notify 日志脱敏。

验收：

- mock 支付成功后订单变 paid。
- mock 支付成功后生成 Registration。
- 重复 mock 支付不重复生成 Registration。
- 微信 notify 金额不一致时不更新订单。
- 微信 notify 订单不存在时不更新订单。
- 微信 notify 重复成功回调返回成功且无副作用。

## 7. 阶段 5：我的报名

目标：用户可查看支付成功报名记录。

任务：

- GET /api/my/registrations。
- 用户端我的报名页面。
- 支持按当前用户查询。

验收：

- 仅展示当前用户报名。
- 未支付订单不出现在我的报名。
- 展示会议、规格、报名人、手机号、金额、状态。

## 8. 阶段 6：用户端 H5 和微信小程序

目标：完成用户端 MVP 页面。

任务：

- 首页。
- 会议详情。
- 报名页。
- 订单确认页。
- 支付结果页。
- 我的报名页。
- API client。
- H5 与 mp-weixin 差异封装。
- 支付封装。

验收：

- H5 首页可打开。
- 微信小程序首页可打开。
- 会议详情可打开。
- 不同规格价格展示正确。
- 表单必填校验可用。
- 下单成功。
- 支付成功页正常。
- 我的报名可查询。

## 9. 阶段 7：后台管理

目标：完成最小后台。

任务：

- 登录页。
- 登录 API 对接。
- 会议列表和编辑。
- 规格管理。
- 表单字段管理。
- 订单列表。
- 报名名单。
- 后台路由守卫。

验收：

- 管理员可登录。
- 未登录不能访问后台页面和后台接口。
- 可创建和编辑会议。
- 可配置报名规格。
- 可配置表单字段。
- 可查看订单。
- 可查看报名名单。

## 10. 阶段 8：上线前检查

目标：准备真实微信支付和生产环境。

任务：

- 配置生产环境变量。
- 配置域名和 HTTPS。
- 配置微信支付 notify URL。
- 检查日志脱敏。
- 检查数据库迁移流程。
- 检查数据库备份方案。
- 执行完整验收清单。

验收：

- `/api/health` 正常。
- 真实密钥均来自环境变量。
- 支付回调地址 HTTPS 可访问。
- 回调验签、解密、金额校验、事务、幂等通过测试。
- 数据库已备份。

## 11. 暂不进入任务池

- 优惠券
- 会员
- 商城
- AI 知识库
- 房间座位酒店
- 抖音 / 小红书 / B 站原生小程序
- 退款
- 发票
- 签到核销

