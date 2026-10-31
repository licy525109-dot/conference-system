# Conference payment merchants and scoped administration

## Scope

Add direct WeChat Pay merchant routing for conference registrations and explicitly
assigned conference administration. Preserve the environment-backed default
merchant (北京壹昂智创科技有限公司), existing orders, and unrelated Mini Program work.
No production migration, payment, refund, account creation, or release is part of
local implementation acceptance.

## Invariants

- A conference without a merchant override uses the existing environment config.
- An explicit unavailable override fails closed; it never falls back to default.
- An order pins its recipient and creation-time revision snapshot. Changing the
  conference cannot reroute an existing order. Outbound operations use the active,
  validated credentials of that same merchant/AppID after credential rotation;
  callback URLs retain the original order revision.
- Managed credentials are encrypted using the existing server-side configuration
  encryption mechanism. Plaintext secrets are write-only and never audited.
- Merchant identity and AppID must match the transaction, in addition to signature,
  decryption, amount, order number, transaction, and idempotency checks.
- Old callback routes and old orders remain assigned to the default merchant.
- Disabled merchants cannot accept new orders/prepay, but historical callbacks,
  queries, closes, and refunds remain processable with their original merchant.
  Callback verification supports validated old/new signing and API v3 keys during
  rotation overlap; drafts and other merchant/AppID credentials are excluded.
- Scoped administrators have explicit conference grants and functional permissions.
  Global endpoints deny scoped accounts unless explicitly reviewed for isolation.
- List counts, details, exports, and writes enforce the same scope on the server.
- No automatic transfer of historical orders, registration owner, or real payments.

## Configuration lifecycle

Save a merchant draft, validate credential structure and signed provider access,
confirm JSAPI/AppID association externally, then explicitly activate. Local key
validation is not proof of WeChat approval. Only activated profiles can be selected
for new conference payments. Private keys and API v3 keys cannot be read back.

## Acceptance

Cover default/override selection, invalid overrides, immutable order routing,
credential rotation, callback merchant mismatch, duplicate callbacks, refund
routing, scoped list/detail/write/export denial, empty grants, revoked grants,
secrets absent from responses/audits, migration compatibility, and admin UI.
Real WeChat association and end-to-end charge/refund remain separate manual gates.

## 后台配置步骤

### 1. 新增收款单位

系统管理 → 收款单位 → 新增收款单位，填写单位全称、商户号和备注。
默认单位仍为北京壹昂智创科技有限公司，继续读取服务器原有微信支付配置。
单位全称和商户号创建后不能覆盖修改，以保留历史订单的收款身份。

在该单位的配置版本中新增凭据，填写：

- 当前观潮会集小程序的 AppID，不能使用其他小程序或公众号的 AppID。
- 商户 API 证书序列号及对应的商户私钥 PEM。
- API v3 密钥。
- 微信支付公钥 ID 及公钥 PEM，或匹配的平台证书序列号及证书 PEM。

首个版本必须填写全部凭据。后续版本的密钥项留空时沿用上一个版本；
完整更换所有凭据时不依赖旧密文能够解密。密钥只写入加密存储，不回显。
不要将密钥放入文档、聊天、截图或公开发布记录。

点击“验证凭据”后，系统执行不创建支付的签名查询并校验响应签名。
这不能证明 API v3 密钥能正确解密真实回调，也不能代替微信侧开通审核。
管理员须另行确认 JSAPI 支付权限及该商户与当前小程序的关联，再在验证通过的
24 小时内确认启用。微信侧要求参见
[小程序支付接入指引](https://pay.wechatpay.cn/doc/v3/merchant/4012791895)及
[AppID 关联说明](https://pay.wechatpay.cn/doc/v3/merchant/4016328613)。

### 2. 指定会议收款单位

会议管理 → 会议配置 → 支付设置。未单独指定时使用默认单位；选择并保存
其他已启用单位后，仅该会议的新建订单使用新单位。已创建的待支付订单和
历史订单仍属于原单位，退款、查询、关单也不能改用其他商户处理。
订单页面可查看收款单位并按单位筛选；财务对账按商户分开。

明确指定的收款单位若未启用、已停用或配置无效，系统拒绝新订单或新支付，
不会悄悄退回默认单位。停用不影响已发生交易的历史处理。
不要通过更换服务器默认商户来迁移历史收款；这是不同的迁移需求。

### 3. 开通合作方运营账号

系统管理 → 管理账号，创建独立账号并分配“会议运营”角色及“指定会议”范围。
选择该账号可管理的会议；未选会议时没有会议访问权，不等同于全部会议。
原有管理员在数据库迁移后保持原访问范围，新账号默认采用指定会议范围。

数据范围与功能权限共同生效。运营工作台支持已授权会议的基本信息、票种、
报名字段、报名详情和备注、签到、订单查询；按角色决定能否查看或修改。
报名名单导出需要另外授予导出权限。合作方不能访问全站账号、商户凭据、
退款审批、全站财务与系统设置；不能通过改 URL 或请求参数突破会议范围。
订单与报名中仅展示本会议所需的提交信息，不返回下单账号的全局资料。
撤销会议或功能权限后，原有登录令牌的下一次请求立即受新权限限制。

本轮不开放受限账号进入原小程序全站移动管理端，也不向其推送全站会务通知。
手机可使用响应式网页会议工作台；如需会议专属通知，应单独配置带会议范围的通知能力。

## 运维与上线前检查

1. 先备份数据库，应用 `20261031090000_conference_payment_merchants` 迁移，
   再部署兼容的新 API 和后台。此文档不代表已执行生产部署。
2. 服务器须有稳定、妥善备份且至少 32 字符的 `WECOM_CONFIG_ENCRYPTION_KEY`。
   本功能复用现有配置加密机制；不要随意更换该密钥，否则旧配置可能无法解密。
3. 保持原默认商户环境配置。管理的其他商户通知地址从原 HTTPS 支付通知地址
   派生，确认代理能转发新的 `/api/payments/wechat/merchants/:revisionId/notify`
   和 `/refund-notify` 路径。
4. 在微信商户平台完成真实关联与权限开通；经业务授权后，分别验收默认商户及
   新商户的真实下单、支付成功回调、查询和退款。未完成前不要让嘉宾使用新商户。
5. 验收合作方账号只能看到指定会议；另一个会议详情、订单、导出接口均拒绝访问。
   用管理员撤销授权后复测原登录会话，确认立即失效。

本分支只改 API、后台和数据库，不包含主工作区待发布的小程序改动。
不要从此隔离工作区构建或上传小程序，以免覆盖其他尚未合并的商城停用修复。

## 本地验证记录

- API 单元及回归测试：781/781 通过，包含支付商户路由、凭据轮换、退款竞态和权限隔离。
- 独立 PostgreSQL + HTTP：51 项检查通过，包含真实建单快照、权限撤销、
  不同签名/密钥的合成回调、金额/商户拒绝及重复回调只生成一份报名。
- 全部数据库迁移在新的测试库通过，迁移结果与 Prisma schema 无差异。
- 后台测试：46/46 通过；API 与后台构建通过。后台构建保留原有大文件分包警告。
- Playwright 连接本地真实 API：商户配置、账号会议范围、运营工作台、订单和
  报名详情通过；1440px / 390px 页面宽度检查与截图检查通过。新版相关操作
  未产生控制台错误或警告。表格内容可在表格内部横向滚动。
- 真实微信支付、真实退款、生产迁移与上线：未执行。

HTTP 验收脚本为 `scripts/verify-conference-merchants.cjs`，强制限定本机测试库
端口及数据库名称，拦截外部请求。它会创建合成测试记录，禁止用于生产数据库。
测试凭据在运行时生成，预览会话只保存至忽略提交的本地临时目录。

## 主要修改文件

- `prisma/schema.prisma` 与新迁移：收款单位、不可变配置版本、订单快照、会议授权。
- `services/api/src/payments/payment-merchant.service.ts`：凭据保存、验证、启用、路由及回调轮换。
- `services/api/src/admin/admin-conference-workspace.service.ts` 与控制器：会议范围和响应字段隔离。
- `services/api/src/admin/admin-access.service.ts`、`admin-auth.service.ts`、
  `admin-jwt-auth.guard.ts`：账号授权、实时权限读取、全局接口默认拒绝。
- 支付/退款客户端及财务服务：原商户操作、验签、商户独立对账和退款状态竞态处理。
- `apps/admin/src/pages/system/payment-merchants.vue`、`accounts.vue`、
  `components/conference/ConferencePaymentSettings.vue`：后台配置入口。
- `apps/admin/src/pages/conferences/ScopedConferenceWorkspace.vue`：合作方会议工作台。
- 上述模块的单元测试及 `scripts/verify-conference-merchants.cjs`：回归与本机集成验收。
