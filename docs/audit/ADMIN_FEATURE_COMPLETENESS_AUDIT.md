# 后台功能完成度审计

审计日期：2026-06-18

## 审计口径

功能仅在同时满足以下条件时移除菜单 badge：

- 后台页面：不是空白页或纯预留页，能展示真实接口数据。
- 后端接口：接口已鉴权，列表分页或限制数量，危险操作有权限和状态校验。
- 数据表：已有持久化模型、索引或明确复用现有模型。
- 业务逻辑：状态流转可追踪，支付、退款、优惠、签到等核心链路具备幂等保护。
- 用户端：需要用户触达的能力已有入口，或页面明确说明未开放。
- 测试：至少通过类型检查、构建和现有测试；核心金额/支付能力需要专项测试。

状态 badge 保留原因：

- `灰度`：页面和接口已接入，但外部配置、测试覆盖或运营流程尚未达到正式开放标准。
- `辅助`：只用于运营查看、配置或核对，不是主业务闭环。
- `后续`：已有后台配置和展示，但尚未正式进入报名计价、支付或用户经营主链路。
- `高级`：高风险系统配置，保留弱化提示。

## 菜单与路由审计

| 业务域 | 路由 | 页面 | API | DB | 用户端 | Badge | 是否可移除 | 保留原因 / 缺口 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 控制台 | `/dashboard` | 数据看板 | `/admin/dashboard/*` | Order, Payment, Registration | 不需要 | 无 | 是 | 已接入真实汇总、趋势和排行。 |
| 会议管理 | `/conferences` | 会议管理 | `/admin/conferences*` | Conference, RegistrationSku, FormField | 会议首页/详情 | 无 | 是 | 会议主链路已上线。 |
| 会议管理 | `/registrations` | 报名名单 | `/admin/registrations*` | Registration, RegistrationAttendee | 我的报名/凭证 | 无 | 是 | 报名详情、凭证和操作日志已接入。 |
| 会议管理 | `/inventory-alerts` | OperationalWorkflowsPage | `/admin/conferences/:id/inventory-alert-rule`, `/admin/inventory-alerts/scan`, `/admin/inventory-alert-logs` | InventoryAlertRule, InventoryAlertLog | 不需要 | 无 | 是 | 有真实规则、扫描和日志；通知任务联动按通道配置决定是否跳过。 |
| 会议管理 | `/checkin/verify` | OperationalWorkflowsPage | `/admin/checkin/verify`, `/admin/checkin/manual`, `/admin/checkin/:id/revoke`, `/checkin/self`, `/checkin/scan` | CheckinLog, RegistrationAttendee | 凭证页展示签到码/状态，工作人员工具扫码 | 无 | 是 | 客户自助、工作人员扫码、后台应急补签、重复拦截和审计日志已接入。 |
| 会议管理 | `/checkin/logs` | OperationalWorkflowsPage | `/admin/checkin/logs` | CheckinLog | 凭证页 | 无 | 是 | 展示每条核销明细、方式、操作人和失败原因。 |
| 会议管理 | `/checkin/stats` | OperationalWorkflowsPage | `/admin/checkin/stats` | RegistrationAttendee, CheckinLog | 不需要 | 无 | 是 | 按票种、方式和时间段聚合，和签到记录页职责分开。 |
| 订单交易 | `/orders` | 订单支付 | `/admin/orders*` | Order, Payment | 支付/我的报名 | 无 | 是 | 单删/筛选删除受后端规则保护。 |
| 订单交易 | `/payment-exceptions` | OperationalWorkflowsPage | `/admin/payment-exceptions` | Order, Payment | 不需要 | 辅助 | 否 | 只读异常辅助，不允许后台改成功支付状态。 |
| 订单交易 | `/payment-records` | FinancePage | `/admin/payments`, `/admin/finance/payments` | Payment, MallPayment | 不需要 | 无 | 是 | 支付流水统一只读查询已接入，覆盖报名与商城。 |
| 营销活动 | `/coupons` | 优惠券 | `/admin/coupons*` | Coupon, CouponRedemption | 领券/我的券/报名下单 | 无 | 是 | 支持自动券码、启停、时效、领取限制、适用会议/票种；quote/create order 后端重算并固化用券快照。 |
| 营销活动 | `/coupon-campaigns` | 券活动 | `/admin/coupon-campaigns*`, `/coupons/claim`, `/my/coupons` | CouponCampaign, CouponClaim | 领券页/我的券/CMS 券卡入口 | 无 | 是 | 活动批次、领取码、小程序路径、重复领取和库存耗尽拦截已接入，并补单测。 |
| 营销活动 | `/promotions` | 满减规则 | `/admin/promotion-rules*` | PromotionRule | 下单 quote/create order | 无 | 是 | 满金额/满张数、适用会议/票种、启停、时效和叠加规则已进入后端计价链路。 |
| 通知中心 | `/notifications*` | 通知中心 | `/admin/notification-*`, `/notifications/subscribe` | NotificationTemplate, NotificationTask, NotificationLog, NotificationSubscription, NotificationChannelConfig | 订阅入口/小程序管理员通知入口 | 无 | 是 | 模板、任务、日志、预览、测试发送、重试、后台渠道配置和 SKIPPED 状态已接入；未配置外部 provider 不伪造成功。 |
| 通知中心 | `/notifications/config` | 通道配置 | `/admin/wechat-subscribe-config`, `/admin/sms-config` | NotificationChannelConfig | 不需要 | 无 | 是 | 总开关、微信订阅、短信供应商、模板、签名、密钥、频控和重试均可后台配置；env 只作为 fallback。 |
| 通知中心 | `/notifications/wechat-subscribe` | 通知中心配置视图 | `/admin/wechat-subscribe-config` | NotificationChannelConfig, NotificationTemplate, NotificationSubscription, AuditLog | 订阅入口 | 辅助 | 否 | 微信订阅消息模板 ID、渠道开关、频控和重试策略可在后台配置，密钥脱敏；真实发送仍依赖官方模板、用户订阅和 adapter 联调，未配置时记录 SKIPPED。 |
| 通知中心 | `/notifications/sms` | 通知中心配置视图 | `/admin/sms-config` | NotificationChannelConfig, NotificationTemplate, NotificationLog, AuditLog | 不需要 | 辅助 | 否 | 短信供应商、签名、模板、频控、重试和密钥状态可在后台配置，API key/secret 加密保存且不返回明文；未配置或 adapter 未启用时记录 SKIPPED。 |
| 企微客户群 | `/wecom/config` | WecomPage | `/admin/wecom/config*` | WecomIntegration, WecomAccessTokenCache | 加群入口 | 无 | 是 | Secret 加密存储，前端脱敏展示。 |
| 企微客户群 | `/wecom/groups` | WecomPage | `/admin/wecom/customer-groups*` | WecomCustomerGroup | 加群入口 | 无 | 是 | 只做企微客户群官方接口。 |
| 企微客户群 | `/wecom/bindings` | WecomPage | `/admin/wecom/customer-groups/:id/bind-conference` | WecomCustomerGroup | 会议客户群入口 | 无 | 是 | 绑定会议已接入。 |
| 企微客户群 | `/wecom/welcome` | WecomPage | `/admin/wecom/welcome-templates*` | GroupWelcomeTemplate / Wecom data | 用户入群欢迎 | 无 | 是 | 欢迎语配置真实。 |
| 企微客户群 | `/wecom/tasks` | WecomPage | `/admin/wecom/group-message-tasks*`, `/admin/wecom/group-message-tasks/test-send` | CustomerGroupMessageTask, CustomerGroupMessageLog, WecomCustomerGroup, MaterialAsset | 不需要 | 无 | 是 | 表单化创建文字、图片、文件、链接和小程序任务；支持全部客户群、指定客户群、指定会议关联群和指定群测试发送；保存企业微信 msgId / taskId / 原始错误码，不做后台强发。 |
| 企微客户群 | `/wecom/logs` | WecomPage | `/admin/wecom/group-message-logs` | CustomerGroupMessageLog, WecomCustomerGroup | 不需要 | 无 | 是 | 展示目标群、WAITING_CONFIRM / SENT / FAILED / SKIPPED 状态、provider messageId、失败原因和群主确认排查说明。 |
| 企微客户群 | `/wecom/callback-events` | WecomPage | `/admin/wecom/callback-events` | WecomCallbackEvent | 不需要 | 无 | 是 | 回调事件可查。 |
| AI 知识库 | `/ai/knowledge-bases` | AIKnowledgePage | `/admin/knowledge-bases` | KnowledgeBase, KnowledgeDocument, KnowledgeChunk, AiQuestionLog | AI 助手入口 | 无 | 是 | 支持按会议创建、唯一性保护、启停、会议筛选、搜索、文档数、分块数和问答数。 |
| AI 知识库 | `/ai/conference-knowledge` | AIKnowledgePage | `/admin/conferences/:id/knowledge-base` | KnowledgeBase | AI 助手入口 | 无 | 是 | 会议选择器隔离配置，支持回答范围、兜底提示、引用来源和问答日志开关。 |
| AI 知识库 | `/ai/documents` | AIKnowledgePage | `/admin/conferences/:id/knowledge-documents`, `/admin/knowledge-documents/:id/rebuild` | KnowledgeDocument, KnowledgeChunk | AI 助手 | 无 | 是 | 支持 txt/md/pdf 上传或录入、PDF 服务端解析、DRAFT/ACTIVE/DISABLED、启停、删除、重建分块、处理状态和失败原因展示；当前仍以会议内资料检索为准。 |
| AI 知识库 | `/ai/suggestions` | AIKnowledgePage | `/admin/conferences/:id/ai-suggestions`, `/conferences/:id/ai/suggestions` | AiSuggestion, KnowledgeDocument | AI 助手 | 无 | 是 | 支持运营按会议批量维护、排序、启停，用户端只展示当前会议问题。 |
| AI 知识库 | `/ai/question-logs` | AIKnowledgePage | `/admin/conferences/:id/ai-question-logs` | AiQuestionLog | AI 助手 | 无 | 是 | 记录用户、会议、知识库、命中文档/分块、引用摘要、命中/兜底、provider、model、错误原因，支持会议、关键词和兜底筛选。 |
| AI 知识库 | `/ai/config` | AIKnowledgePage | `/admin/ai-config` | AiConfig, AdminAuditLog | AI 助手降级状态 | 辅助 | 否 | provider、baseURL、model、temperature、maxTokens 和 apiKey 可后台配置，apiKey 加密保存且只显示 configured/masked；LOCAL_FALLBACK 明示为本地关键词检索，真实 LLM 调用仍需 provider 联调。 |
| 会员 | `/members/users` | 会员管理 | `/admin/memberships*`, `/admin/users`, `/admin/member-benefit-grants` | UserMembership, MemberBenefitGrant, MemberLevel | 会员中心 | 无 | 是 | 支持用户搜索、等级/状态筛选、授予、续期、停用、调级和权益发放记录；操作写审计日志。 |
| 会员 | `/members/levels` | 会员等级 | `/admin/member-levels*`, `/admin/member-levels/options` | MemberLevel | 会员中心 | 无 | 是 | 支持等级编码、说明、排序、默认有效期、是否参与会员价、启停、权益数量和会员人数。 |
| 会员 | `/members/benefits` | 会员权益 | `/admin/member-benefits*`, `/admin/member-benefits/options`, `/admin/member-benefit-grants*` | MemberBenefit, MemberBenefitGrant | CMS 会员权益/会员中心 | 无 | 是 | 权益配置、用户端展示、自动发放、发放记录和撤销均接入持久化链路。 |
| 会员 | `/members/pricing-rules` | 会员价规则 | `/admin/member-pricing-rules*` | MembershipPriceRule | quote/create order | 无 | 是 | 会员价已进入 quote/create order，支持等级/会议/票种选择器、固定价、折扣、立减、时间窗、启停和订单快照。 |
| 商城 | `/mall/products` | 商品管理 | `/admin/mall/products*` | Product, ProductSku, ProductImage, Material | 商城首页/详情 | 无 | 是 | 商品、封面、详情图、素材库选择/上传、商品类型和上架状态真实；支付成功后才进入履约与售后流程。 |
| 商城 | `/mall/categories` | MallWorkflowsPage | `/admin/mall/categories*` | ProductCategory | 商城首页 | 无 | 是 | 分类列表、新增、编辑、启停和排序真实。 |
| 商城 | `/mall/skus` | MallWorkflowsPage | `/admin/mall/skus`, `/admin/mall/inventory-logs` | ProductSku, MallInventoryLog | 商品详情 | 无 | 是 | SKU 价格、总库存、锁定库存、可售库存和库存流水真实。 |
| 商城 | `/mall/orders` | 商城订单 | `/admin/mall/orders*`, `/my/mall-orders*`, `/mall/orders`, `/mall/orders/:id/payments/wechat/prepay`, `/mall/orders/:id/payments/mock-pay`, `/mall/orders/:id/payment-status`, `/mall/payments/wechat/notify` | MallOrder, MallOrderItem, MallPayment, MallInventoryLog | 我的商城订单 | 无 | 是 | 创建订单由后端重算金额并锁库存；实物订单要求收货信息，虚拟/服务订单不要求物流地址；商城支付使用 `MALL_` 前缀 out_trade_no、独立 notify、独立 `MallPaymentCompletionService` 和商城专用开关，未启用时只显示待支付和清晰提示。 |
| 商城 | `/mall/fulfillment` | MallWorkflowsPage | `/admin/mall/shipments`, `/admin/mall/orders/:id/ship`, `/admin/mall/orders/:id/verify` | MallShipment | 我的商城订单 | 无 | 是 | 仅实物 PAID 订单可发货，SHIPPED 可完成核销；虚拟/服务商品不进入发货流程；不会由后台伪造支付成功。 |
| 商城 | `/mall/aftersales` | MallWorkflowsPage | `/admin/mall/aftersales`, `/admin/mall/aftersales/:id/process-refund`, `/my/mall-aftersales` | MallAfterSale, MallRefund | 我的商城订单 | 无 | 是 | 售后申请、后台审批、MallRefund 创建和处理真实；mock 退款可成功，微信退款未配置时只进入 PROCESSING 并记录原因，不伪造到账。 |
| 财务管理 | `/finance/payments` | FinancePage | `/admin/finance/payments`, `/admin/payments` | Payment, MallPayment, ReconciliationResult | 不需要 | 无 | 是 | 统一展示报名与商城支付流水，支持来源、状态、渠道、订单号、交易号筛选；只读，不允许人工改支付成功。 |
| 财务管理 | `/finance/refunds` | FinancePage | `/admin/finance/refunds*`, `/admin/refunds*`, `/my/refunds`, `/payments/wechat/refund-notify` | Refund, MallRefund, AuditLog | 我的退款 | 无 | 是 | 报名和商城退款统一列表、创建、审核、驳回、mock 完成、微信未配置进入 PROCESSING 并记录原因；金额不能超过可退金额，回调按 outRefundNo 分业务表处理。 |
| 财务管理 | `/finance/invoices` | FinancePage | `/admin/finance/invoices*`, `/admin/invoices*`, `/invoices`, `/my/invoices` | InvoiceApplication, AuditLog | 我的发票 | 无 | 是 | 用户可基于已支付报名/商城订单申请发票，金额由后端计算；后台支持审核、驳回、标记开票、开票号、链接和备注。 |
| 财务管理 | `/finance/reconciliation` | FinancePage | `/admin/finance/reconciliation-batches`, `/admin/finance/differences`, `/admin/finance/reconciliation-results*` | FinanceReconciliationBatch, FinanceReconciliationItem, ReconciliationResult, WechatBill | 不需要 | 无 | 是 | 支持本地批次、微信账单对账、MATCHED/差异记录和人工核查备注；对账不自动修改订单或支付状态。 |
| 财务管理 | `/finance/wechat-bills` | FinancePage | `/admin/finance/wechat-bills*` | WechatBill, WechatBillImport, ReconciliationResult | 不需要 | 无 | 是 | 支持账单批次、CSV/TXT 手动导入解析、可选下载配置检查、导入结果和对账；官方下载未配置时明确跳过，不伪造下载成功。 |
| 页面装修 | `/pages` | 页面装修 | `/admin/pages*`, `/pages/:key/published` | CmsPage, CmsPageVersion, Conference, Product | H5/小程序渲染 | 无 | 是 | CMS 页面类型区分普通页、首页、详情模板和指定详情页；指定会议/商品使用选择器绑定，用户端按 conferenceId/productId 优先加载专属页面。 |
| 页面装修 | `/themes` | 主题配置 | `/admin/theme*` | AppTheme | H5/小程序主题 | 无 | 是 | 背景模式互斥显隐已收口；动态渐变增强；视频背景校验 MP4 URL，H5 使用 muted/loop/autoplay/playsinline，小程序端展示自动播放限制提示。 |
| 页面装修 | `/tabbar` | 底部导航 | `/admin/tabbar`, `/app/tabbar` | TabBarConfig | 小程序动态导航 | 无 | 是 | 文案已改为独立业务模块。 |
| 页面装修 | `/materials` | 素材管理 | `/admin/materials*` | Material, MaterialCategory, Product, ProductImage, PageVersion, ActiveThemeConfig, TabBarItem | 页面装修/商城商品 | 无 | 是 | 素材库支持改名、改分类、URL 维护、图片/视频/文件预览、停用和彻底删除；彻底删除前检查 CMS、商品、主题、Tabbar、会议封面等引用，未引用才删除 DB 记录和 uploads 文件。 |
| 系统管理 | `/system/accounts` | 管理员账号 | `/admin/accounts*` | AdminUser, AdminRole | 不需要 | 无 | 是 | 真实 RBAC。 |
| 系统管理 | `/system/roles` | 角色权限 | `/admin/roles*`, `/admin/permissions` | AdminRole, AdminPermission | 不需要 | 高级 | 否 | 高风险权限配置保留高级提示。 |
| 系统管理 | `/system/audit-logs` | 操作日志 | `/admin/audit-logs` | AdminAuditLog | 不需要 | 无 | 是 | 真实审计日志。 |

## ReservedPage 审计

- 后台路由已不再引用 `ReservedPage`。
- 无引用文件已删除，避免后续误把预留页注册回菜单。
- 新增页面统一使用 `OperationalWorkflowsPage` 接入真实接口和状态说明。

## 会员 P5A 审计

本轮将会员模块从“后续”推进到可运营闭环，会员菜单不再保留状态 badge：

- 会员等级：`MemberLevel` 新增 `defaultDays`、`pricingEnabled`。后台支持等级编码、名称、说明、排序、默认有效期、展示价格、展示折扣、是否参与会员价和启停。等级停用后不能新授予；已存在会员记录保留，但新订单会员价不会命中停用等级或关闭会员价的等级。
- 会员管理：`UserMembership` 新增 `renewedAt`、`disabledAt`、`disabledReason`。后台支持用户选择器、等级/状态筛选、授予、续期、停用和调整等级；状态包括 `ACTIVE`、`EXPIRED`、`DISABLED`、`CANCELLED`。停用会员会撤销该会员记录下仍为 `GRANTED` 的权益。
- 会员权益：`MemberBenefit` 新增 `iconUrl`、`autoGrant`、`visible`、`grantRule`。后台支持类型、标题、说明、图片、排序、自动发放和用户端展示开关。展示型权益只在会员中心展示，不生成发放记录。
- 权益发放：新增 `MemberBenefitGrant`，记录 `GRANTED`、`USED`、`EXPIRED`、`REVOKED`、`FAILED` 状态、来源、发放时间、使用时间、过期时间、备注和元数据。授予、续期、调级会对启用且自动发放的权益幂等发放，同一会员记录下同一权益不会重复发放。
- 会员价规则：后台独立页面使用会员等级、会议、票种选择器，不再手输 ID。quote/create order 仍复用既有后端计价逻辑，顺序保持 `SKU 原价 -> 会员价 -> 优惠券 -> 满减 -> 最终应付`；过期会员、停用会员、停用等级、关闭会员价等级、停用规则和过期规则均不能命中新订单。
- 用户端：`/member/center` 返回当前会员、等级列表、权益发放记录和购买状态。非会员不展示假会员信息，只展示可用等级和权益说明；已登录用户只能查看自己的会员和权益。

仍保留的业务边界：

- 会员购买真实支付、会员订单微信支付、自动扣费和订阅续费未开放。用户端明确提示“会员购买支付暂未开放”，后台不创建会员支付订单。

## 财务管理 P4A 审计

本轮将财务管理从“灰度 / 辅助”推进到可运营闭环，财务菜单不再保留状态 badge：

- 支付流水：`FinancePage` 统一查询 `Payment` 和 `MallPayment`，输出来源类型、订单号、商户单号、微信交易号或 mock 标识、渠道、状态、金额、支付时间、用户、业务摘要、退款状态和对账状态。页面为只读，不提供人工改支付状态入口。
- 退款管理：统一展示报名 `Refund` 和商城 `MallRefund`。报名退款新增 `outRefundNo`、`failedReason`；商城复用已有 `outRefundNo`、`failedReason`。审核通过后，mock 模式可直接成功；微信退款未配置时进入 `PROCESSING` 并记录原因，不伪造 `SUCCESS`。退款成功回调按 `outRefundNo` 查找对应业务表，金额不一致拒绝，报名退款不改商城订单，商城退款不改报名订单。
- 发票申请：`InvoiceApplication` 新增 `sourceType`、`invoiceType`、`phone`、`issuedInvoiceNo`、`invoiceLink`、`remark`。用户可对已支付报名订单或商城订单申请发票，金额由后端按订单已支付金额和已有申请计算，前端传入金额无效。后台支持审核、驳回、标记已开票和人工备注。
- 微信账单：`WechatBill` 支持创建批次、手动粘贴 CSV/TXT 账单解析并写入 `summaryJson.rows`，同时记录 `WechatBillImport`。官方下载只有在 `WECHAT_PAY_BILL_DOWNLOAD_ENABLED=true` 且 `WECHAT_PAY_BILL_STORAGE_PATH` 配置时才记录下载请求；未配置时状态为 `DOWNLOAD_SKIPPED`，不伪造文件下载成功。
- 财务对账：账单对账覆盖报名支付和商城支付，按商户单号、交易号、金额、状态和来源生成 `MATCHED`、`SYSTEM_ONLY`、`WECHAT_ONLY`、`AMOUNT_MISMATCH`、`STATUS_MISMATCH`、`DUPLICATE` 等结果。对账和人工核查只写 `ReconciliationResult` / `FinanceReconciliationItem` 状态与备注，不自动修正订单或支付状态。
- 用户端：会员中心新增“我的退款”入口，发票页支持报名/商城来源选择，展示状态、驳回原因、开票号和发票链接；用户退款和发票接口均限制当前登录用户。

仍保留的外部配置边界：

- 微信真实退款出款需要生产证书、商户权限和回调联调；无配置时只进入 `PROCESSING`，不显示到账成功。
- 电子发票平台未接入，当前为自有人工开票流程，不伪造电子发票开具。
- 微信账单官方下载未接入定时任务和真实下载文件解析，当前以手动导入为主；下载配置缺失时明确跳过。

## CMS 组件审计

P3A 将后台可添加的 CMS 组件统一纳入 H5/小程序渲染支持矩阵。当前组件库可添加组件均为 `supported`，未继续保留可添加的 `basic` 组件；`basic / unsupported / planned` 状态仍作为历史页面和未来组件的发布保护状态机保留在代码中。

正式支持组件：

- 基础展示：主视觉横幅、轮播图、标题栏、分割线、留白、公告栏、满减活动提示条、数字亮点。
- 会议转化：会议卡片列表、会议分类切换、报名按钮、悬浮报名按钮、票种价格、报名流程、嘉宾卡片、日程时间轴。
- 内容与媒体：图文富文本、安全图文片段、图文介绍、图片宫格、视频组件、资料下载、直播入口、参会评价、交通指南、地图与联系信息、赞助商 Logo 墙、FAQ、客服咨询。
- 运营组件：搜索框、快捷标签、优惠券领取卡片、会员权益卡、用户资料卡、我的订单列表、商城商品宫格。

关键交互闭环：

- 搜索框：支持 `placeholder / buttonText / target / searchScope` 配置，用户端输入后跳转会议首页并携带 `keyword`，会议列表按标题、摘要、地点轻量过滤。
- 快捷标签和会议分类：支持 `tag / location / category` 参数，点击后跳转会议首页并筛选；无匹配时显示友好空状态。
- 优惠券卡片：后台通过券活动选择器关联活动批次，用户端点击后按公开活动信息领取，未登录会触发登录，过期、停用、库存不足等错误展示后端返回。
- 会员权益、用户资料、我的订单：展示真实登录状态和入口，不展示虚假会员信息；会员购买支付仍明确关闭，会员状态以后台授予、续期、停用和调级为准。
- 商城商品宫格：按公开商城商品接口读取 `PUBLISHED` 商品，支持关键词、分类、数量限制和售罄状态；商城支付主链路未在本轮改动。
- 下载、直播、赞助商链接、地图链接：H5 尝试打开链接，小程序端受外链限制时复制链接兜底。
- `safe-html`：用户端白名单渲染常用文本、链接和图片标签，移除 script、事件属性和 `javascript:` URL。

P7B-13 补齐页面装修运营化能力：

- 首页运营模块：新增顶部主视觉 Banner、图标入口宫格、会员/优惠横幅、活动/会议横滑、订单中心/快捷服务、积分/任务进度、自定义图片卡片、自定义图文模块。新增组件均同步加入后台组件库、后台手机预览、用户端 `PageRenderer` 和后端发布支持矩阵。
- 统一跳转协议：页面装修组件可配置内部页面、会议、报名页、商品、商品分类、优惠券活动、会员中心、发票申请、AI 助手、外部 H5、外部小程序、电话和复制文本。用户端由统一动作处理器校验目标参数，缺少目标时 toast 提示，不展示无效跳转。
- 固定业务模块说明：会议详情固定业务模块在后台展示“数据来源、配置入口、当前状态、用户端显示效果”，覆盖会议信息、嘉宾介绍、日程安排、会议地点、参会指南、客服、客户群、添加到日历、会议助手、报名按钮、分享按钮、报名费用和库存展示。真实会议、票种、价格和库存仍来自后端业务接口，页面装修只控制展示、文案和顺序。
- 业务页列表可读性：页面列表展示页面名称、页面类型、绑定对象、发布状态、是否可配置和最后更新时间；指定会议/商品页面继续按对象优先生效，未命中时回退通用模板。
- 背景职责：新增首页模块使用透明页面根容器和单层卡片背景，避免业务页外层背景与组件背景互相覆盖；动态背景、图片背景和渐变背景仍由统一主题渲染器负责。

发布保护：

- 后端 `CMS_COMPONENT_SUPPORT_MATRIX` 作为最终发布检查依据。
- `unsupported / planned` 组件默认不可添加；历史页面如果仍含启用状态的未知或不支持组件，发布接口会返回 `CMS_PUBLISH_BLOCKED`，并附带阻断组件和替换建议。
- `basic` 组件如果未来重新启用，发布接口会返回 `CMS_PUBLISH_NEEDS_CONFIRMATION`，后台需弹确认后带 `confirmBasic` 再发布。
- 发布前检查报告包含 supported 数量、basic 数量、阻断数量、阻断组件列表和建议；用户端也不再静默隐藏历史未知组件，会展示“组件暂不可用”占位。

素材规格说明覆盖范围：

- 页面装修：Hero、轮播图、图片宫格、图文配图、视频地址/封面、下载资料、赞助商 Logo、评价头像、分享封面、页面字体文件。
- 主题配置：后台品牌图标、浏览器 favicon、背景图片、背景视频。
- 素材管理：上传素材、图片、视频、字体、图标和外部 URL 均展示统一规格说明；上传前按后端 10MB 限制和使用位置建议格式校验。
- 底部导航：普通/选中图标显示 96x96 PNG/SVG、200KB 建议。
- 商城：商品封面和详情图显示正方形/750px 宽、2MB 建议。
- 企微、通知等二维码/图片/文件类配置沿用统一 `MaterialSpecHelp` 规格说明，不向普通小程序端展示密钥或后台配置。

## P7B-3 页面、商城素材、主题与素材管理审计

本轮只处理上线验收中的页面绑定、商城商品素材、虚拟/服务商品、主题背景视频和素材管理维护缺陷，不改支付回调、报名计价、商城支付成功事务、退款回调、签到、会员计价、AI、企微和通知 provider。

- 页面绑定：`PageTemplate` 新增 `bindingType`、`conferenceId`、`productId`。后台页面类型区分普通页面、会议首页、会议详情模板、指定会议详情页、商品详情模板和指定商品详情页；指定详情页必须通过会议/商品选择器绑定，不允许手输 ID。用户端会议详情和商品详情会先按当前对象加载专属发布页，再回退到详情模板。
- 组件跳转：Hero、报名按钮和悬浮报名按钮支持页面、会议、商品、优惠券活动等目标类型；用户端跳转前会检查目标参数，目标缺失或不可用时提示，不白屏。
- 商品素材：`Product` 新增 `productType`、`coverMaterialId`，`ProductImage` 新增 `materialId`。后台商品封面和详情图支持 URL、素材库选择和本地上传入库；上传前校验 JPG/PNG/WebP 和 2MB 限制，保存前对 URL 格式和可访问性做提示。
- 商品类型：商品区分 `PHYSICAL`、`VIRTUAL`、`SERVICE`。实物商品下单必须填写收货信息；虚拟/服务商品不要求物流地址，订单履约类型写入 `VIRTUAL`，后台不允许进入发货流程，用户端状态文案改为待使用/待核销。
- 商城支付提示：商城支付仍受 `MALL_PAYMENT_MODE`、`MALL_MOCK_PAYMENT_ENABLED` 和商城微信 notify 配置独立控制，不跟随报名支付开关。未启用时用户端显示“当前商城支付暂未开放；订单已创建，状态为待支付；请联系会务组或等待商城支付开放”，后台订单展示支付模式、可用状态和不可用原因。
- 主题背景：后台主题配置按背景模式互斥显示颜色、渐变、动态渐变、图片或视频字段；动态渐变预览和用户端效果增强。视频背景保存前校验 MP4 和 URL 可访问性，H5 使用 muted、loop、autoplay、playsinline，小程序端展示自动播放限制提示。
- 素材管理：素材列表默认只显示启用素材，支持改名、改分类、URL/备注维护、图片/视频/文件预览和软删除。删除不移除历史文件与已发布页面引用，操作写审计日志；商品封面和详情图引用会计入删除审计元数据。
- Badge 复核：页面装修、主题配置、素材管理、商城商品和商城订单均不保留灰度/辅助标签；本轮没有全局移除其他业务域 badge。

## 安全与主链路结论

- 未改支付回调验签、解密、金额校验和报名生成主事务。
- 商城支付新增独立 `MallPayment` / `MallRefund` 表、独立 `/mall/payments/wechat/notify` 和独立 `MallPaymentCompletionService`，未写入报名 `Order` / `Payment`，不会生成 Registration。
- 商城支付不复用报名支付成功服务，也不通过报名微信支付全局开关自动开放；生产未准备商城真实支付时建议配置 `MALL_PAYMENT_MODE=disabled`、`MALL_MOCK_PAYMENT_ENABLED=false`、`MALL_REFUND_MODE=disabled`、`MALL_MOCK_REFUND_ENABLED=false`、`MALL_WECHAT_REFUND_ENABLED=false`。
- 财务管理统一读取报名 `Payment/Refund/InvoiceApplication` 和商城 `MallPayment/MallRefund`，但退款成功处理按独立表和独立订单更新；报名财务不会写商城订单，商城财务不会写报名订单或报名 `Payment` 表。
- 发票申请金额始终由后端按已支付订单计算，前端传入金额不会作为可信金额。
- 微信账单对账只写差异和核查备注，不自动把订单改成已支付，不绕过支付成功回调验签/解密/金额校验。
- 新增退款、财务、商城、通知、AI、企微相关入口默认走现有鉴权和权限码。
- 企微 Secret、Token、EncodingAESKey 仍只在后台配置，前端不展示原文。
- 微信订阅、短信、AI provider、微信退款、微信账单真实下载在无配置时保持跳过或处理中，不伪造外部成功。通知中心核心任务会区分 SENT、PARTIAL_FAILED、FAILED、SKIPPED。
- 后台新增只读列表均限制分页或最多 100 条，避免默认大表全扫。

## 后续测试缺口

- 营销活动已补优惠券适用范围、领取库存、重复领取、会员价/优惠券/满减组合和金额篡改回归测试；后续主要关注真实运营数据下的人工验收。
- 签到扫码、重复核销、撤销核销需补 E2E。
- 财务 P4A 已补统一支付流水、报名退款超额拦截、未配置微信退款不伪造成功、mock 退款成功、发票金额后端计算、重复发票申请拦截、当前用户退款可见性、微信账单解析和 MATCHED/差异对账单测；真实微信退款 provider、真实微信账单官方下载和电子发票平台仍需生产配置后联调。
- 商城已补金额篡改拒绝、待支付订单锁库存、关闭释放库存、商城微信 prepay 后端金额、mock 支付成功、库存转已售、重复支付幂等、金额不一致拒绝、非本人支付拒绝、mock 退款、未配置微信退款不伪造成功、超额退款和重复退款单测；真实微信支付/退款联调和端到端发货核销仍需在有商户配置后补专项 E2E。
- AI provider 真实接入、企微客户群真实权限检测需在有企业配置后做联调；AI 知识库本轮已补 PDF 解析、PDF 失败原因、provider 未配置降级、会议隔离、兜底、日志、推荐问题隔离、文档启停/重建和密钥脱敏测试。

## P6A 上线前总验收与安全加固

本轮不新增大业务功能，目标是补齐上线前自动化核查、配置核查、权限核查和发布文档。

新增验收资产：

- `scripts/smoke/production-smoke.sh`：服务器部署后 smoke test，覆盖 API health、公开会议、已发布 CMS、Tabbar、后台登录端点、uploads 静态路径、关键数据库表、关键 enum、PM2 online、后台静态包预留文案检查。
- `scripts/smoke/check-production-config.sh`：生产配置核查，只输出 `configured / missing / disabled`，不打印 Secret 明文。
- `scripts/smoke/check-admin-permissions.ts`：源码级 RBAC 核查，确保后台菜单和后端 controller 使用的权限均在 `ADMIN_PERMISSIONS` 中，主要业务权限不落入角色页“其他权限”。
- `docs/release/LAUNCH_READINESS_CHECKLIST.md`：上线前全链路验收清单。
- `docs/release/POST_DEPLOY_SMOKE_TEST.md`：部署后 smoke test 操作说明和失败处理。
- `docs/release/PRODUCTION_CONFIG_CHECKLIST.md`：生产环境变量和第三方 provider 配置清单。

权限核查收口：

- 权限分组统一为后台信息架构：控制台、会议管理、订单交易、营销活动、通知中心、企微客户群、AI 知识库、会员、商城、财务管理、页面装修、系统管理。
- 新增 `checkin:view/write`、`inventory:view/write`、`payment:view` 源码权限定义；签到、库存、支付记录菜单和对应 controller 使用独立业务权限。
- 保留 `inventory-alert:*`、`customer-group:*` 为旧权限兼容项，但分组改到对应业务域，避免生产库历史权限落入“其他权限”。

安全核查结论：

- 企微 Secret、Token、EncodingAESKey 仍通过服务端加密保存，后台只返回 `configured / masked`。
- AI API Key 支持后台加密保存或服务器环境变量，后台只返回 `configured / masked`。
- 通知、短信、微信订阅配置页不返回供应商 Secret；后台保存的 API key/secret 加密存储，任务页展示 DB / ENV / disabled 来源和不可发送原因。
- `check-production-config.sh` 不打印 `.env.production` 内容，只检查变量存在性和开关状态。
- `production-smoke.sh` 不使用后台账号密码，不触发真实支付、退款、短信、企微群发或 AI provider。

仍需要人工配置或真实第三方联调的能力：

- 微信支付真实 prepay / notify，需要商户号、证书、API v3 Key、HTTPS notify 和微信商户平台联调。
- 微信退款真实出款和退款回调，需要退款权限、证书和回调联调。
- 微信账单官方下载，需要商户账单权限和 `WECHAT_PAY_BILL_STORAGE_PATH`。
- 微信订阅消息和短信真实发送，需要模板、供应商账号、签名、频控规则和发送 adapter 联调；未配置时任务必须记录 `SKIPPED`。
- 企业微信客户群同步、权限检测、回调验签，需要企业微信自建应用权限和回调配置。
- AI 真实 provider，需要 provider、baseURL、API key、模型和费用/限流策略；后台配置已接入，但外部 LLM 调用仍需供应商联调。
- 小程序正式版发布，需要微信平台上传、体验版验证和版本审核。

## P7B-5 运营后台去 JSON 化与外部能力可用性审计

本轮只处理通知中心、企微客户群、AI provider、会议管理 badge 复核和素材彻底删除，不改支付、退款、签到、会员计价、商城支付和自动部署主链路。

- 会议管理 badge 复核：库存预警、签到核销、签到记录、签到统计已具备页面、接口、数据表、业务流转和测试覆盖，左侧菜单不再保留 `灰度`。现场大客流和设备演练仍作为上线手工验收项，不再用后台 badge 表达。
- 通知中心去 JSON 化：通知模板改为用途、标题、正文、变量插入和外部模板 ID 等表单字段；通知任务改为模板、渠道、接收人范围、会议、手动手机号/用户 ID/名单、变量预览和定时发送等运营字段。`contentJson` / `payloadJson` 仅作为高级模式保留，不再作为默认编辑方式。
- 模板、任务、日志关系：模板定义渠道和内容结构；任务选择模板并生成发送范围和变量；发送后日志记录每个渠道和接收人的 `SENT / FAILED / SKIPPED` 结果、provider 来源、失败原因和运营处理建议。微信订阅或短信未配置时继续记录 `SKIPPED`，不伪造成功。
- 企微群发去 JSON 化：客户群群发任务支持选择全部客户群、指定客户群和会议关联群，消息类型支持文本、图片、文件、链接和小程序卡片；后台展示目标群数量、发送人、企微任务 ID、错误码、错误描述和刷新时间。企业微信官方客户群群发仍需群主/成员确认，后台不做群机器人强发或个人微信群控。
- 企微能力边界：群机器人/Webhook 直发明确显示暂未接入并禁用；无企微配置时任务进入 `SKIPPED` 或创建失败提示，不返回 Secret、Token、EncodingAESKey 明文。
- AI provider 可用性：AI 配置页改为 provider 下拉、baseURL、model、apiKey、temperature 和 maxTokens 表单；提供 DeepSeek、OpenAI-compatible、Custom 和 `LOCAL_FALLBACK` 说明，并支持“测试连接”。apiKey 只显示 masked/configured；外部 provider 未配置时测试失败并给出缺口，`LOCAL_FALLBACK` 明确为本地关键词检索，不是真实 LLM。
- 素材彻底删除：素材管理保留“停用”作为常规操作，新增“彻底删除”并在删除前检查 CMS 页面版本、主题、Tabbar、会议封面、商城商品图片、会员权益图标和企微群二维码等引用。仍被引用时拒绝删除；未引用时删除 DB 记录和本地 uploads 文件，文件缺失只记录提示，不影响 DB 清理。

仍保留 badge 的原因：

- 订单交易中的支付异常保留 `辅助`：该入口只做人工核查和备注，不提供自动修复支付状态，避免绕过支付回调。
- 通知中心中的微信订阅消息、短信配置保留 `辅助`：后台配置已接入，但真实发送依赖外部模板、供应商账号和发送 adapter，未配置时必须记录 `SKIPPED`。
- AI 配置保留 `辅助`：后台 provider 配置和 apiKey 加密保存已接入，但默认仍可降级到 `LOCAL_FALLBACK` 本地关键词检索，真实 LLM 调用需外部 provider 联调。
- 系统角色权限保留 `高级`：错误配置会影响后台可见范围，应由少数管理员操作。
