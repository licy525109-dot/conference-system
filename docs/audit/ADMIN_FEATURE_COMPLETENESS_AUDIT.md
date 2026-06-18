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
| 会议管理 | `/inventory-alerts` | OperationalWorkflowsPage | `/admin/conferences/:id/inventory-alert-rule`, `/admin/inventory-alerts/scan`, `/admin/inventory-alert-logs` | InventoryAlertRule, InventoryAlertLog | 不需要 | 灰度 | 否 | 有真实规则和日志，但通知任务联动仍按配置保守启用。 |
| 会议管理 | `/checkin/verify` | OperationalWorkflowsPage | `/admin/checkin/verify`, `/admin/checkin/manual`, `/admin/checkin/:id/revoke` | CheckinLog, RegistrationAttendee | 凭证页展示签到码/状态 | 灰度 | 否 | 核销状态机已接入，仍需补扫码端专项 E2E。 |
| 会议管理 | `/checkin/logs` | OperationalWorkflowsPage | `/admin/checkin/logs` | CheckinLog | 凭证页 | 灰度 | 否 | 日志真实，重复核销和撤销已有单测；扫码端 E2E 仍缺。 |
| 会议管理 | `/checkin/stats` | OperationalWorkflowsPage | `/admin/checkin/stats` | RegistrationAttendee | 不需要 | 灰度 | 否 | 统计真实，仍按会议配置逐步开放。 |
| 订单交易 | `/orders` | 订单支付 | `/admin/orders*` | Order, Payment | 支付/我的报名 | 无 | 是 | 单删/筛选删除受后端规则保护。 |
| 订单交易 | `/payment-exceptions` | OperationalWorkflowsPage | `/admin/payment-exceptions` | Order, Payment | 不需要 | 辅助 | 否 | 只读异常辅助，不允许后台改成功支付状态。 |
| 订单交易 | `/payment-records` | OperationalWorkflowsPage | `/admin/payments`, `/admin/finance/payments` | Payment | 不需要 | 无 | 是 | 支付流水只读查询已接入。 |
| 营销活动 | `/coupons` | 优惠券 | `/admin/coupons*` | Coupon, CouponRedemption | 领券/我的券/报名下单 | 无 | 是 | 支持自动券码、启停、时效、领取限制、适用会议/票种；quote/create order 后端重算并固化用券快照。 |
| 营销活动 | `/coupon-campaigns` | 券活动 | `/admin/coupon-campaigns*`, `/coupons/claim`, `/my/coupons` | CouponCampaign, CouponClaim | 领券页/我的券/CMS 券卡入口 | 无 | 是 | 活动批次、领取码、小程序路径、重复领取和库存耗尽拦截已接入，并补单测。 |
| 营销活动 | `/promotions` | 满减规则 | `/admin/promotion-rules*` | PromotionRule | 下单 quote/create order | 无 | 是 | 满金额/满张数、适用会议/票种、启停、时效和叠加规则已进入后端计价链路。 |
| 通知中心 | `/notifications*` | 通知中心 | `/admin/notification-*`, `/notifications/subscribe` | NotificationTemplate, NotificationTask, NotificationLog, NotificationSubscription | 订阅入口/小程序管理员通知入口 | 无 | 是 | 模板、任务、日志、预览、测试发送、重试和 SKIPPED 状态已接入；未配置外部 provider 不伪造成功。 |
| 通知中心 | `/notifications/wechat-subscribe` | 通知中心配置视图 | `/admin/wechat-subscribe-config` | NotificationTemplate, NotificationSubscription, AuditLog | 订阅入口 | 辅助 | 否 | 微信订阅消息必须依赖官方模板 ID 和用户订阅；未配置或未订阅时记录 SKIPPED。 |
| 通知中心 | `/notifications/sms` | 通知中心配置视图 | `/admin/sms-config` | NotificationTemplate, NotificationLog, AuditLog | 不需要 | 辅助 | 否 | 短信供应商和密钥通过服务器 env 控制；未配置时记录 SKIPPED，不保存明文敏感 key。 |
| 企微客户群 | `/wecom/config` | WecomPage | `/admin/wecom/config*` | WecomIntegration, WecomAccessTokenCache | 加群入口 | 无 | 是 | Secret 加密存储，前端脱敏展示。 |
| 企微客户群 | `/wecom/groups` | WecomPage | `/admin/wecom/customer-groups*` | WecomCustomerGroup | 加群入口 | 无 | 是 | 只做企微客户群官方接口。 |
| 企微客户群 | `/wecom/bindings` | WecomPage | `/admin/wecom/customer-groups/:id/bind-conference` | WecomCustomerGroup | 会议客户群入口 | 无 | 是 | 绑定会议已接入。 |
| 企微客户群 | `/wecom/welcome` | WecomPage | `/admin/wecom/welcome-templates*` | GroupWelcomeTemplate / Wecom data | 用户入群欢迎 | 无 | 是 | 欢迎语配置真实。 |
| 企微客户群 | `/wecom/tasks` | WecomPage | `/admin/wecom/group-message-tasks*` | CustomerGroupMessageTask, CustomerGroupMessageLog | 不需要 | 无 | 是 | 保持待成员确认，不做后台强发。 |
| 企微客户群 | `/wecom/logs` | WecomPage | `/admin/wecom/group-message-logs` | CustomerGroupMessageLog | 不需要 | 无 | 是 | 展示确认/发送结果和失败原因。 |
| 企微客户群 | `/wecom/callback-events` | WecomPage | `/admin/wecom/callback-events` | WecomCallbackEvent | 不需要 | 无 | 是 | 回调事件可查。 |
| AI 知识库 | `/ai/knowledge-bases` | AIKnowledgePage | `/admin/knowledge-bases` | KnowledgeBase, KnowledgeDocument, KnowledgeChunk, AiQuestionLog | AI 助手入口 | 无 | 是 | 支持按会议创建、唯一性保护、启停、会议筛选、搜索、文档数、分块数和问答数。 |
| AI 知识库 | `/ai/conference-knowledge` | AIKnowledgePage | `/admin/conferences/:id/knowledge-base` | KnowledgeBase | AI 助手入口 | 无 | 是 | 会议选择器隔离配置，支持回答范围、兜底提示、引用来源和问答日志开关。 |
| AI 知识库 | `/ai/documents` | AIKnowledgePage | `/admin/conferences/:id/knowledge-documents`, `/admin/knowledge-documents/:id/rebuild` | KnowledgeDocument, KnowledgeChunk | AI 助手 | 无 | 是 | 支持 txt/md 录入、DRAFT/ACTIVE/DISABLED、启停、删除、重建分块、处理状态和失败原因展示；当前为轻量关键词检索。 |
| AI 知识库 | `/ai/suggestions` | AIKnowledgePage | `/admin/conferences/:id/ai-suggestions`, `/conferences/:id/ai/suggestions` | AiSuggestion, KnowledgeDocument | AI 助手 | 无 | 是 | 支持运营按会议批量维护、排序、启停，用户端只展示当前会议问题。 |
| AI 知识库 | `/ai/question-logs` | AIKnowledgePage | `/admin/conferences/:id/ai-question-logs` | AiQuestionLog | AI 助手 | 无 | 是 | 记录用户、会议、知识库、命中文档/分块、引用摘要、命中/兜底、provider、model、错误原因，支持会议、关键词和兜底筛选。 |
| AI 知识库 | `/ai/config` | AIKnowledgePage | `/admin/ai-config` | AiConfig, AdminAuditLog | AI 助手降级状态 | 辅助 | 否 | provider key 通过服务器 env 配置，后台只显示 configured/masked；真实 LLM provider 默认未启用，LOCAL_FALLBACK 明示为本地关键词检索。 |
| 会员 | `/members/users` | 会员管理 | `/admin/memberships`, `/admin/users` | MemberLevel, MembershipOrder | 会员中心 | 后续 | 否 | 手动授予会员真实，会员购买自动开通仍未完成。 |
| 会员 | `/members/levels` | 会员等级 | `/admin/member-levels*` | MemberLevel | 会员中心 | 后续 | 否 | 等级真实，会员购买自动开通仍未完成。 |
| 会员 | `/members/benefits` | OperationalWorkflowsPage | `/admin/member-benefits` | MemberBenefit | CMS 会员权益/会员中心 | 后续 | 否 | 权益展示已接入，权益发放自动化未完成。 |
| 会员 | `/members/pricing-rules` | OperationalWorkflowsPage | `/admin/member-pricing-rules` | MembershipPriceRule | quote/create order | 无 | 是 | 会员价已进入 quote/create order，支持固定价、折扣基点、立减，并保存订单计价快照。 |
| 商城 | `/mall/products` | 商品管理 | `/admin/mall/products*` | Product, ProductSku, ProductImage | 商城首页/详情 | 无 | 是 | 商品、封面、详情图和上架状态真实；支付成功后才进入发货与售后流程。 |
| 商城 | `/mall/categories` | MallWorkflowsPage | `/admin/mall/categories*` | ProductCategory | 商城首页 | 无 | 是 | 分类列表、新增、编辑、启停和排序真实。 |
| 商城 | `/mall/skus` | MallWorkflowsPage | `/admin/mall/skus`, `/admin/mall/inventory-logs` | ProductSku, MallInventoryLog | 商品详情 | 无 | 是 | SKU 价格、总库存、锁定库存、可售库存和库存流水真实。 |
| 商城 | `/mall/orders` | 商城订单 | `/admin/mall/orders*`, `/my/mall-orders*`, `/mall/orders`, `/mall/orders/:id/payments/wechat/prepay`, `/mall/orders/:id/payments/mock-pay`, `/mall/orders/:id/payment-status`, `/mall/payments/wechat/notify` | MallOrder, MallOrderItem, MallPayment, MallInventoryLog | 我的商城订单 | 无 | 是 | 创建订单由后端重算金额并锁库存；商城支付使用 `MALL_` 前缀 out_trade_no、独立 notify 和 MallPaymentSuccessService，成功后转 PAID 并将锁定库存转为已售。 |
| 商城 | `/mall/fulfillment` | MallWorkflowsPage | `/admin/mall/shipments`, `/admin/mall/orders/:id/ship`, `/admin/mall/orders/:id/verify` | MallShipment | 我的商城订单 | 无 | 是 | 仅 PAID 订单可发货，SHIPPED 可完成核销；不会由后台伪造支付成功。 |
| 商城 | `/mall/aftersales` | MallWorkflowsPage | `/admin/mall/aftersales`, `/admin/mall/aftersales/:id/process-refund`, `/my/mall-aftersales` | MallAfterSale, MallRefund | 我的商城订单 | 无 | 是 | 售后申请、后台审批、MallRefund 创建和处理真实；mock 退款可成功，微信退款未配置时只进入 PROCESSING 并记录原因，不伪造到账。 |
| 财务管理 | `/finance/payments` | FinancePage | `/admin/finance/payments`, `/admin/payments` | Payment | 不需要 | 辅助 | 否 | 只读流水核对。 |
| 财务管理 | `/finance/refunds` | OperationalWorkflowsPage | `/admin/refunds*`, `/my/refunds` | Refund | 我的退款 | 灰度 | 否 | 后台审批状态机和幂等已有单测，微信退款默认关闭。 |
| 财务管理 | `/finance/invoices` | OperationalWorkflowsPage | `/admin/invoices*`, `/invoices`, `/my/invoices` | InvoiceApplication | 我的发票 | 灰度 | 否 | 自有发票流程真实，未接微信电子发票。 |
| 财务管理 | `/finance/reconciliation` | FinancePage | `/admin/finance/*`, `/admin/finance/reconciliation-results` | ReconciliationResult | 不需要 | 辅助 | 否 | 本地轻量对账，不影响支付主链路。 |
| 财务管理 | `/finance/wechat-bills` | OperationalWorkflowsPage | `/admin/finance/wechat-bills*` | WechatBill, ReconciliationResult | 不需要 | 辅助 | 否 | 支持创建/导入/下载占位/对账，真实微信下载默认关闭。 |
| 页面装修 | `/pages` | 页面装修 | `/admin/pages*`, `/pages/:key/published` | CmsPage, CmsPageVersion | H5/小程序渲染 | 无 | 是 | 新增 CMS 搜索、券卡、会员、订单、商城组件基础渲染。 |
| 页面装修 | `/themes` | 主题配置 | `/admin/theme*` | AppTheme | H5/小程序主题 | 无 | 是 | 真实主题配置。 |
| 页面装修 | `/tabbar` | 底部导航 | `/admin/tabbar`, `/app/tabbar` | TabBarConfig | 小程序动态导航 | 无 | 是 | 文案已改为独立业务模块。 |
| 页面装修 | `/materials` | 素材管理 | `/admin/materials*` | Material, MaterialCategory | 页面装修 | 无 | 是 | 素材库真实。 |
| 系统管理 | `/system/accounts` | 管理员账号 | `/admin/accounts*` | AdminUser, AdminRole | 不需要 | 无 | 是 | 真实 RBAC。 |
| 系统管理 | `/system/roles` | 角色权限 | `/admin/roles*`, `/admin/permissions` | AdminRole, AdminPermission | 不需要 | 高级 | 否 | 高风险权限配置保留高级提示。 |
| 系统管理 | `/system/audit-logs` | 操作日志 | `/admin/audit-logs` | AdminAuditLog | 不需要 | 无 | 是 | 真实审计日志。 |

## ReservedPage 审计

- 后台路由已不再引用 `ReservedPage`。
- 无引用文件已删除，避免后续误把预留页注册回菜单。
- 新增页面统一使用 `OperationalWorkflowsPage` 接入真实接口和状态说明。

## CMS 组件审计

本轮补齐用户端基础渲染并加入后端可发布组件：

- 搜索框：用户端展示搜索输入，确认后进入会议首页。
- 快捷标签：已有基础列表展示，当前不做真实筛选。
- 优惠券卡片：进入优惠券领取或我的券页面。
- 会员权益：展示权益列表并进入会员中心。
- 用户资料卡：进入会员中心。
- 我的订单列表：进入我的报名和商城订单入口。
- 商城商品宫格：展示商品入口并进入商城。
- 下载列表、直播卡片、评价列表：已在 `PageRenderer` 基础展示。

仍保留 `basic` 状态的原因：这些组件具备 H5/小程序基础渲染，但部分交互如真实搜索筛选、商品精选数据源、会员权益自动发放仍未做完整运营闭环。

## 安全与主链路结论

- 未改支付回调验签、解密、金额校验和报名生成主事务。
- 商城支付新增独立 `MallPayment` / `MallRefund` 表、独立 `/mall/payments/wechat/notify` 和独立 `MallPaymentSuccessService`，未写入报名 `Order` / `Payment`，不会生成 Registration。
- 新增退款、财务、商城、通知、AI、企微相关入口默认走现有鉴权和权限码。
- 企微 Secret、Token、EncodingAESKey 仍只在后台配置，前端不展示原文。
- 微信订阅、短信、AI provider、微信退款、微信账单真实下载在无配置时保持跳过或灰度，不伪造外部成功。通知中心核心任务会区分 SENT、PARTIAL_FAILED、FAILED、SKIPPED。
- 后台新增只读列表均限制分页或最多 100 条，避免默认大表全扫。

## 后续测试缺口

- 营销活动已补优惠券适用范围、领取库存、重复领取、会员价/优惠券/满减组合和金额篡改回归测试；后续主要关注真实运营数据下的人工验收。
- 签到扫码、重复核销、撤销核销需补 E2E。
- 微信退款回调金额校验需补真实 provider 回调路径测试。
- 商城已补金额篡改拒绝、待支付订单锁库存、关闭释放库存、商城微信 prepay 后端金额、mock 支付成功、库存转已售、重复支付幂等、金额不一致拒绝、非本人支付拒绝、mock 退款、未配置微信退款不伪造成功、超额退款和重复退款单测；真实微信支付/退款联调和端到端发货核销仍需在有商户配置后补专项 E2E。
- AI provider 真实接入、企微客户群真实权限检测需在有企业配置后做联调；AI 知识库本轮已补 provider 未配置降级、会议隔离、兜底、日志、推荐问题隔离、文档启停/重建和密钥脱敏测试。
