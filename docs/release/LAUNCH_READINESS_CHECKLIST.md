# 生产上线前总验收清单

更新时间：2026-06-18

## 目标

本清单用于正式上线前最后一轮验收。原则是先确认系统边界，再验证核心链路，再检查外部 provider 配置；不通过后台或脚本伪造支付、退款、通知、企微、AI、账单等第三方成功状态。

## 上线前硬性条件

- `main` 已包含 P0、P1A、P1B、P2A、P2B、P3A、P4A、P5A。
- 自动部署 GitHub Actions 可拉取 main、执行 Prisma migrate deploy、构建 API/Admin、发布后台静态包并重启 PM2。
- 生产服务器存在 `/www/wwwroot/conference-system/.env.production`，且不在 Git 仓库内。
- API 健康检查通过：`curl https://guanchaohuiji.com/api/health`。
- 后台生产构建产物不包含 `ReservedPage`、`功能建设中`、`预留页面`。
- 数据库已备份，能执行回滚方案。

## 1. 报名支付链路

验收项：

- 会议列表、会议详情、报名表单、票种价格正常。
- quote 展示会员价、优惠券、满减后的结果，但不作为支付依据。
- create order 后端重新读取票种、会员、优惠券、满减并重算金额。
- 前端篡改最终金额不会影响订单应付金额。
- mock 支付只在开发或显式配置时可用。
- 微信 prepay 只在微信支付生产配置完整时可用。
- 微信 notify 必须验签、解密、金额校验、事务处理、幂等处理。
- 支付成功后生成报名记录和报名凭证。
- 重复支付回调不重复生成报名。
- 退款不会误改已报名成功状态。
- 签到配置为“不核销”时凭证展示无需核销；“需核销”时扫码/手动核销并拒绝重复核销。

重点风险：

- 金额字段必须是整数分。
- 支付成功主事务不可绕过。
- 不允许后台人工改订单为已支付。

## 2. 商城链路

验收项：

- 商品列表、商品详情、分类、SKU 库存、库存流水正常。
- 创建商城订单时后端重算价格，锁定库存。
- 商城支付默认关闭；仅 `MALL_PAYMENT_MODE=mock/wechat` 且对应配置完整时展示支付能力。
- 商城 mock 支付受 `MALL_MOCK_PAYMENT_ENABLED` 控制。
- 商城微信支付使用商城独立 notify 和 `MallPayment`，不写报名 `Payment`。
- 商城支付成功不调用报名 `PaymentSuccessService`，不创建 `Registration`。
- 商城支付成功后锁定库存转为已售。
- 重复商城支付回调不重复转库存。
- 我的商城订单、发货、核销、售后、商城退款状态正常。

生产默认建议：

```bash
MALL_PAYMENT_MODE=disabled
MALL_MOCK_PAYMENT_ENABLED=false
MALL_REFUND_MODE=disabled
MALL_MOCK_REFUND_ENABLED=false
MALL_WECHAT_REFUND_ENABLED=false
```

## 3. 财务链路

验收项：

- 支付流水能区分报名 `Payment` 和商城 `MallPayment`。
- 退款管理能区分报名 `Refund` 和商城 `MallRefund`。
- 发票申请金额由后端按已支付订单计算。
- 微信账单导入只生成账单和对账结果。
- 对账差异只写 `ReconciliationResult` / `FinanceReconciliationItem`，不自动改订单支付状态。
- 微信退款未配置时进入处理中或跳过说明，不显示已到账。

重点风险：

- 财务对账不能替代支付回调。
- 发票和退款不能信任前端金额。

## 4. 会员链路

验收项：

- 会员等级可启停、设置默认有效期和是否参与会员价。
- 后台可授予、续期、停用、调级会员。
- 自动发放权益具有幂等保护。
- 用户端会员中心只展示当前用户会员和权益。
- EXPIRED、DISABLED、等级停用、`pricingEnabled=false` 不命中会员价。
- 会员购买真实支付未开放，用户端明确提示。

## 5. 营销通知链路

验收项：

- 优惠券、券活动、二维码领取、我的券、满减规则正常。
- 优惠券领取、重复领取、过期、库存耗尽都有明确提示。
- 通知模板、任务、发送日志正常。
- 微信订阅消息未配置时记录 `SKIPPED`，不是 `SENT`。
- 短信未配置时记录 `SKIPPED`，不是 `SENT`。
- 通知失败不影响支付、报名、退款主事务。

## 6. AI 知识库链路

验收项：

- 知识库列表、会议知识库、文档管理、推荐问题、问答日志正常。
- 用户端 AI 助手只回答当前会议资料。
- 未配置 provider 时降级到本地兜底或明确未启用。
- 未命中资料不编造答案。
- AI API Key 只显示 configured/masked，不返回明文。

## 7. 企微客户群链路

验收项：

- 支持自建应用 Secret 模式。
- 兼容旧客户联系 Secret 模式。
- Secret、Token、EncodingAESKey 加密保存。
- 后台接口只返回 masked/configured，不返回明文。
- 可测试 AccessToken、检测客户联系权限、复制回调 URL、同步客户群。
- 群绑定会议、入群欢迎语、群发任务、群发日志、回调事件正常。
- 客户群群发按企业微信规则展示待成员确认、已发送、失败等状态，不做后台强发。

## 8. CMS 页面装修链路

验收项：

- 页面装修、主题配置、底部导航、素材管理可打开。
- supported 组件可添加、发布、H5/小程序渲染。
- unsupported/planned 组件阻止发布。
- basic 组件如再次启用必须二次确认。
- 用户端不静默隐藏未知组件，显示明确占位。
- safe-html 过滤 script、事件属性、`javascript:` URL。
- 上传/URL/素材选择区域展示格式、尺寸和大小建议。

## 9. 权限核查

执行：

```bash
pnpm exec tsx scripts/smoke/check-admin-permissions.ts
```

必须满足：

- 后台菜单使用的 permission 均存在于 `ADMIN_PERMISSIONS`。
- 后端 controller 使用的 `RequireAdminPermissions` 均存在于 `ADMIN_PERMISSIONS`。
- 主要业务权限不落入角色页“其他权限”。
- 权限覆盖控制台、会议、订单、营销、通知、企微、AI、会员、商城、财务、页面装修、系统管理。

## 10. 安全核查

执行：

```bash
grep -R -E "secret|Secret|token|Token|EncodingAESKey|apiKey|API_KEY|privateKey|mchKey" -n \
  services/api/src apps/admin/src apps/user/src | head -300
```

检查结论必须为：

- 前端不展示 Secret 明文。
- Admin 接口不返回 Secret 明文。
- Token、EncodingAESKey、API Key 保存后只显示 masked/configured。
- 日志不打印 Secret。
- 自动部署和 smoke 脚本不打印 `.env.production`。

## 11. 必跑命令

```bash
pnpm --filter @conference/api typecheck
pnpm --filter @conference/api build
pnpm --filter @conference/admin lint
pnpm --filter @conference/admin build
pnpm --filter @conference/user lint
pnpm --filter @conference/user build:mp-weixin
pnpm test
pnpm lint
pnpm --filter @conference/api exec prisma generate --schema ../../prisma/schema.prisma
bash -n scripts/deploy/baota-deploy.sh
bash -n scripts/smoke/production-smoke.sh
bash -n scripts/smoke/check-production-config.sh
pnpm exec tsx scripts/smoke/check-admin-permissions.ts
```

## 是否可上线

所有自动检查通过，并完成生产 `.env.production`、微信支付、企微、AI、短信、退款、账单下载等人工配置核对后，才建议上线。未配置的外部能力必须在页面显示 disabled、missing、skipped 或 processing，不允许显示成功。
