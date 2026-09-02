# 生产配置核查清单

更新时间：2026-08-31

## 原则

- 生产配置只放在服务器或 GitHub Secrets，不写入 Git。
- 核查时只确认 `configured / missing / disabled`，不打印真实值。
- 未配置的外部能力必须在后台或用户端显示未启用、跳过、处理中或配置缺口，不能显示成功。

## 自动核查

服务器执行：

```bash
cd /www/wwwroot/conference-system
bash scripts/smoke/check-production-config.sh
```

脚本会读取：

```bash
PROJECT_DIR="${PROJECT_DIR:-/www/wwwroot/conference-system}"
${PROJECT_DIR}/.env.production
```

## 核心必需项

| 配置 | 必须 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 是 | API、Prisma migrate、smoke 数据库检查使用。 |
| `JWT_SECRET` | 是 | 用户 JWT、后台 JWT、部分本地加密 fallback 使用。 |
| `WECHAT_APP_ID` | 是 | 小程序登录。 |
| `WECHAT_APP_SECRET` | 是 | 小程序登录，不得返回前端或日志。 |

## 报名微信支付

| 配置 | 必须条件 | 说明 |
| --- | --- | --- |
| `WECHAT_PAY_MODE` | 建议显式配置 | `mock` 或 `real`。旧值 `wechat` 仅作兼容，不再用于新环境。 |
| `WECHAT_PAY_ENABLED` | 建议显式配置 | 真实微信支付开启时为 `true`。 |
| `WECHAT_PAY_APP_ID` | 开启微信支付时必须 | 支付所用小程序 AppID；未配置时兼容读取 `WECHAT_APP_ID`。 |
| `WECHAT_PAY_MCH_ID` | 开启微信支付时必须 | 商户号。 |
| `WECHAT_PAY_MCH_SERIAL_NO` | 开启微信支付时必须 | 与商户私钥匹配的商户证书序列号。旧变量 `WECHAT_PAY_SERIAL_NO`、`WECHAT_PAY_CERT_SERIAL_NO` 仅作兼容。 |
| `WECHAT_PAY_PRIVATE_KEY_PATH` | 开启微信支付时必须 | 私钥文件路径，文件不进 Git。 |
| `WECHAT_PAY_API_V3_KEY` | 开启微信支付时必须 | API v3 Key，不打印。 |
| `WECHAT_PAY_NOTIFY_URL` | 开启微信支付时必须 | 必须是以 `/api/payments/wechat/notify` 结尾的 HTTPS 生产回调。 |

验收：

- prepay 能创建微信预支付。
- API 日志记录微信响应 `Request-ID` 与脱敏错误码，便于商户平台定位，不记录 OpenID、私钥或 API v3 Key。
- notify 走验签、解密、金额校验、事务和幂等。
- 金额不一致、订单不存在、验签失败不能更新订单。

## 企微客户群

| 配置 | 必须条件 | 说明 |
| --- | --- | --- |
| `WECOM_CONFIG_ENCRYPTION_KEY` | 强烈建议 | 用于企微 Secret、Token、EncodingAESKey 加密；缺失时使用 `JWT_SECRET` fallback。 |

后台接入配置保存：

- CorpID
- 自建应用 AgentID
- 自建应用 Secret
- 旧客户联系 Secret
- 回调 Token
- EncodingAESKey
- 客户联系回调 URL
- 应用回调 URL

验收：

- 后台只返回 masked/configured。
- 小程序端不展示后台 Secret。
- 新版企业没有客户联系 Secret 时可用自建应用 Secret 模式。

## 商城支付与退款

生产未准备商城真实支付时建议：

```bash
MALL_PAYMENT_MODE=disabled
MALL_MOCK_PAYMENT_ENABLED=false
MALL_REFUND_MODE=disabled
MALL_MOCK_REFUND_ENABLED=false
MALL_WECHAT_REFUND_ENABLED=false
```

| 配置 | 说明 |
| --- | --- |
| `MALL_PAYMENT_MODE` | `disabled`、`mock` 或 `wechat`。默认应视为 disabled。 |
| `MALL_MOCK_PAYMENT_ENABLED` | 仅测试环境可为 `true`。 |
| `WECHAT_PAY_MALL_NOTIFY_URL` | `MALL_PAYMENT_MODE=wechat` 时必须。 |
| `MALL_REFUND_MODE` | `disabled`、`mock` 或 `wechat`。 |
| `MALL_MOCK_REFUND_ENABLED` | 仅测试环境可为 `true`。 |
| `MALL_WECHAT_REFUND_ENABLED` | 真实微信退款开关。 |

验收：

- 会议微信支付开启不会自动开放商城支付。
- 商城支付成功不写报名 `Payment`，不创建 `Registration`。

## 财务退款、发票和账单

| 配置 | 说明 |
| --- | --- |
| `REFUND_ENABLED` | 报名退款能力开关。 |
| `INVOICE_ENABLED` | 发票申请能力开关。 |
| `WECHAT_PAY_REFUND_NOTIFY_URL` | 真实微信退款回调地址。 |
| `FINANCE_RECONCILIATION_ENABLED` | 财务对账能力开关。 |
| `WECHAT_PAY_BILL_STORAGE_PATH` | 微信账单下载文件保存路径。 |

验收：

- 未配置微信退款时不显示退款成功到账。
- 发票第一版为自有人工开票流程。
- 对账不自动改订单支付状态。

## AI 知识库

| 配置 | 说明 |
| --- | --- |
| `AI_KB_ENABLED` | AI 知识库开关。 |
| `AI_PROVIDER` | `LOCAL_FALLBACK` 或真实 provider。 |
| `AI_API_KEY` | 真实 provider 所需密钥，后台只显示 masked/configured。 |
| `AI_MODEL` | 真实 provider 模型名。 |

验收：

- 未配置 provider 时降级并提示。
- 不编造当前会议资料以外内容。
- 问答日志记录 provider、model、命中和兜底。

## 通知中心、微信订阅和短信

| 配置 | 说明 |
| --- | --- |
| `NOTIFICATION_CENTER_ENABLED` | 通知中心发送开关。 |
| `WECHAT_SUBSCRIBE_MESSAGE_ENABLED` | 微信订阅消息开关。 |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 小程序订阅消息的 AppID 和 AppSecret，只写入服务端环境变量。 |
| `WECHAT_SUBSCRIBE_TEMPLATE_ID` | 微信公众平台中选用的订阅消息模板 ID，也可在后台通知模板中配置。 |
| `WECHAT_MINIPROGRAM_STATE` | `developer`、`trial` 或 `formal`；生产必须为 `formal`。 |
| `SMS_ENABLED` | 短信发送开关。 |
| `SMS_PROVIDER` | 短信供应商标识。 |

验收：

- 微信订阅未配置时记录 `SKIPPED`，不是 `SENT`。
- 短信未配置时记录 `SKIPPED`，不是 `SENT`。
- 通知失败不阻塞支付、报名、退款事务。

## 嘉宾会务安排与企微智能表

| 配置 | 说明 |
| --- | --- |
| `GUEST_SCHEDULE_SYNC_ENABLED` | API 定时同步总开关；生产建议为 `true`。 |
| 企业微信自建应用 | 需具备目标智能表格的读取和编辑权限，并在后台“企微接入配置”保存。 |
| 微信模板代码 | 后台通知模板代码固定为 `GUEST_SCHEDULE_UPDATED`，启用后嘉宾可申请订阅。 |

验收：

- 已确认报名嘉宾自动写入“报名嘉宾”子表。
- 智能表事项同步后只显示为“待发布”或“有待发布变更”，小程序仍显示上一版。
- 后台点击“仅发布”后小程序更新；点击“发布并提醒”时仅通知已授权用户。
- 详细建表字段和操作步骤见 `docs/integrations/WECOM_SMART_SHEET_GUEST_SCHEDULE.md`。

## CMS 和素材

| 配置 | 说明 |
| --- | --- |
| `PUBLIC_ORIGIN` / `API_PUBLIC_BASE_URL` | 素材 URL 和回调 URL 生成可能使用。 |
| `uploads` 目录权限 | API 进程必须可写，Nginx/API 必须可访问。 |

验收：

- 页面装修发布保护开启。
- 后台素材上传限制和前端规格说明一致。
- 用户端 safe-html 过滤危险内容。

## 人工上线前复核

1. 服务器 `.env.production` 权限不向 Web 用户公开。
2. `.env.production` 未被复制到后台静态目录。
3. 私钥、证书、API Key 未进入 Git。
4. Nginx `/api` 指向 API 3001。
5. `pm2 status conference-api` 为 online。
6. Prisma migration 已部署。
7. 后台可登录，角色权限页面没有主要业务权限落入“其他权限”。
8. 小程序体验版 API 指向 `https://guanchaohuiji.com/api`，构建产物不含 localhost。
