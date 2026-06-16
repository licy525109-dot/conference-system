# Codex Phase 8 Production Stability Report

## 1. 本次新增功能

- 后台报名名单支持按当前筛选条件导出 CSV。
- 后台订单列表支持按当前筛选条件导出 CSV，并可只导出异常订单。
- 后台订单列表和详情展示支付异常识别结果。
- 后台订单详情支持记录支付异常人工处理备注，备注写入操作日志，不修改订单或支付状态。
- 新增系统管理 / 操作日志页面，用于查看登录、编辑、导出、核销和异常处理记录。
- 新增上线运营 runbook：`docs/operations/PRODUCTION_RUNBOOK.md`。

## 2. 报名导出说明

入口：后台 `报名名单` 页面右上角 `导出 CSV`。

筛选条件：

- 关键词：报名号、姓名、手机号、订单号。
- 会议。
- 报名状态。
- 支付状态：当前报名记录都来自已支付链路，导出保留该筛选参数用于操作一致性。
- 核销状态。

导出字段：

- 会议名称、报名 ID、报名号、订单号、参会人姓名、手机号、单位、票种、支付状态、报名状态、实付金额(元)、优惠金额(元)、报名时间、核销状态、后台备注。

导出说明：

- 后端仍以整数分查询和计算，CSV 中金额列明确标注为元。
- 导出上限为 5000 行，避免一次性导出拖垮后台。
- 导出动作写入 `audit_logs`，记录筛选参数和导出行数。

## 3. 订单导出说明

入口：后台 `订单支付` 页面右上角 `导出 CSV`。

筛选条件：

- 关键词：订单号、姓名、手机号、商户单号、微信交易号。
- 会议。
- 订单状态。
- 支付状态。
- 只看异常。

导出字段：

- 订单号、会议名称、用户昵称、手机号、订单状态、支付状态、支付方式、原价(元)、优惠金额(元)、实付金额(元)、微信支付单号、创建时间、支付时间、退款状态、后台备注。

导出说明：

- 后台备注列用于输出当前识别到的异常原因，不承载支付状态修改。
- 导出动作写入 `audit_logs`，记录筛选参数和导出行数。

## 4. 支付异常订单识别策略

第一版只做识别、展示和人工处理备注，不做自动退款，不做重新处理支付成功。

当前识别项：

- `ORDER_PENDING_OVERDUE`：订单待支付超过 30 分钟，或已超过 `expiredAt`。
- `PAYMENT_PENDING_OVERDUE`：最近支付记录处理中超过 30 分钟。
- `PAYMENT_SUCCESS_ORDER_NOT_PAID`：存在成功支付流水，但本地订单不是已支付。
- `ORDER_PAID_WITHOUT_SUCCESS_PAYMENT`：订单已支付但缺少成功支付流水。
- `PAID_ORDER_MISSING_REGISTRATION`：订单已支付但报名记录缺失。
- `REGISTRATION_WITH_UNPAID_ORDER`：报名记录存在但订单不是已支付。
- `PAYMENT_AMOUNT_MISMATCH`：成功支付流水金额与订单应付金额不一致。
- `ORDER_PAID_AMOUNT_MISMATCH`：订单实付金额与订单应付金额不一致。
- `LATEST_PAYMENT_FAILED`：最近一次支付失败。

处理入口：

- 订单详情中展示异常原因。
- 运营可填写人工核对备注。
- 备注写入 `audit_logs`，`entityType=PaymentException`，不更新 `orders`、`payments`、`registrations`。

## 5. 操作日志记录范围

复用已有 `audit_logs` 表，本阶段未新增 Prisma migration。

已覆盖：

- 登录。
- 创建会议、编辑会议、上下架会议。
- 修改票种。
- 修改报名字段。
- 修改报名备注。
- 手动核销。
- 优惠券 / 满减规则编辑。
- 报名名单导出。
- 订单导出。
- 支付异常人工处理备注。

本次新增页面：

- `系统管理 / 操作日志`
- 支持按关键词、动作、对象类型查询。

## 6. 未修改的高风险逻辑

本阶段未修改：

- 微信支付 prepay。
- 微信支付 notify。
- 微信支付验签 / 解密。
- 微信支付金额校验。
- 支付成功事务和幂等逻辑。
- 订单金额计算。
- registration quote 协议。
- 创建订单协议。
- 支付成功后生成报名记录逻辑。
- Prisma schema / migrations。
- 生产环境变量、证书、私钥、微信密钥、JWT_SECRET。

## 7. 验证命令和结果

已运行：

```bash
pnpm --filter @conference/api typecheck
pnpm --filter @conference/admin typecheck
pnpm --filter @conference/api test
pnpm build:api
pnpm build:admin
git diff --check
```

当前结果：

- API typecheck：通过。
- Admin typecheck：通过。
- API test：通过，105 个测试全部通过。
- `pnpm --filter @conference/api test` 中出现的 `WECHAT_PAY_NOTIFY_ERROR` 日志来自既有微信回调失败场景测试，断言通过，未表示真实运行错误。
- API build：通过。
- Admin build：通过；Vite 输出 Rollup 纯注释和 chunk size 警告，构建成功。
- `git diff --check`：通过，无输出。

## 8. 宝塔部署说明

本阶段包含 `services/api/**` 和 `apps/admin/**` 变更，因此需要走后端部署流程，不属于纯前端部署。

建议生产步骤：

```bash
cd /www/wwwroot/conference-system
git fetch origin
git pull --ff-only origin main
pnpm install --frozen-lockfile
source /www/wwwroot/conference-system/.env.production
pnpm exec prisma generate --schema prisma/schema.prisma
pnpm build:api
pnpm build:admin
pm2 restart conference-api
curl http://127.0.0.1:3001/api/health
```

说明：

- 本阶段没有 Prisma migration，不需要执行 `prisma migrate deploy`。
- 如发布前发现 Prisma migration 变更，必须先备份数据库，再人工确认后执行迁移。
- 不要覆盖服务器资产：`.env.production`、`.env.local`、`apps/admin/.env.production`、`uploads`、`docker-compose.prod.yml`、`start-api.sh`。

## 9. 回滚说明

代码回滚建议：

1. 记录当前生产 HEAD。
2. 选择上一个稳定 commit。
3. 在服务器执行 `git fetch origin` 并回退到目标 commit。
4. 重新执行 `pnpm install --frozen-lockfile`。
5. 重新构建 API 和后台。
6. `pm2 restart conference-api`。
7. 验证 `curl http://127.0.0.1:3001/api/health`。

数据库说明：

- 本阶段没有新增 migration，回滚不需要数据库回滚。
- 如果未来 Phase 变更引入 migration，数据库回滚必须单独评审。

## 10. Phase 9 建议

Phase 9 建议进入报名凭证与签到核销：

- 报名成功凭证页。
- 报名码 / 二维码。
- 后台扫码核销。
- 手动核销强化。
- 核销记录。
- 签到名单导出。

继续保持边界：

- 不在 Phase 9 混入自动退款。
- 不扩展完整会员价体系。
- 不提前做 AI 问答。
