# 会议报名缴费 MVP 数据库设计

## 1. 设计原则

- 所有金额使用 Int，单位为分。
- 创建订单时复制规格价格快照，后续规格改价不影响已创建订单。
- 支付成功后才能生成 Registration。
- 重复支付回调不能重复生成 Registration。
- 动态表单提交值保存为 JSON，常用查询字段冗余到 Registration。
- 后台接口鉴权所需账号与密码哈希保存在数据库。
- 真实密钥不进入数据库种子、文档、测试快照。

## 2. 枚举

### ConferenceStatus

- draft
- published
- archived

### SkuStatus

- enabled
- disabled

### FieldType

- text
- phone
- email
- select
- radio
- date
- textarea

### OrderStatus

- pending
- paid
- closed
- failed

### PaymentProvider

- mock
- wechat

### PaymentStatus

- created
- success
- failed

### RegistrationStatus

- confirmed
- canceled

## 3. 数据表

### User

普通用户。MVP 可先支持最小身份模型，后续再扩展完整会员，但不实现会员功能。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 主键 |
| openid | String? | 微信 openid，唯一，可为空 |
| unionid | String? | 微信 unionid，可为空 |
| nickname | String? | 昵称 |
| phone | String? | 手机号 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

约束：

- openid 唯一，允许为空。

### AdminUser

后台管理员。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 主键 |
| username | String | 登录名，唯一 |
| passwordHash | String | 密码哈希 |
| displayName | String? | 展示名 |
| enabled | Boolean | 是否启用 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

约束：

- username 唯一。
- 不保存明文密码。

### Conference

会议主体。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 主键 |
| title | String | 会议标题 |
| slug | String | URL 标识，唯一 |
| coverImageUrl | String? | 封面图 |
| summary | String? | 摘要 |
| location | String? | 地点 |
| startsAt | DateTime | 会议开始时间 |
| endsAt | DateTime | 会议结束时间 |
| registrationStartsAt | DateTime? | 报名开始时间 |
| registrationEndsAt | DateTime? | 报名结束时间 |
| status | ConferenceStatus | 状态 |
| sortOrder | Int | 排序 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

约束：

- slug 唯一。
- 用户端只展示 published。

### ConferencePage

会议详情内容。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 主键 |
| conferenceId | String | 会议 ID，唯一 |
| contentJson | Json | 详情内容 JSON |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

约束：

- conferenceId 唯一。

### RegistrationSku

报名规格。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 主键 |
| conferenceId | String | 会议 ID |
| name | String | 规格名称 |
| description | String? | 规格说明 |
| priceCent | Int | 价格，单位分 |
| status | SkuStatus | 启用状态 |
| sortOrder | Int | 排序 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

约束：

- priceCent 必须大于等于 0。
- 用户端只展示 enabled。

### FormDefinition

会议报名表单定义。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 主键 |
| conferenceId | String | 会议 ID，唯一 |
| title | String? | 表单标题 |
| description | String? | 表单说明 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

约束：

- conferenceId 唯一。

### FormField

动态表单字段。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 主键 |
| formDefinitionId | String | 表单定义 ID |
| key | String | 字段 key |
| label | String | 字段标签 |
| type | FieldType | 字段类型 |
| required | Boolean | 是否必填 |
| placeholder | String? | 占位提示 |
| optionsJson | Json? | select/radio 选项 |
| validationJson | Json? | 扩展校验规则 |
| sortOrder | Int | 排序 |
| enabled | Boolean | 是否启用 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

约束：

- 同一 formDefinitionId 下 key 唯一。
- label、options 不允许任意脚本或 HTML 注入。

### Order

报名订单。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 主键 |
| orderNo | String | 订单号，唯一 |
| userId | String? | 用户 ID |
| conferenceId | String | 会议 ID |
| skuId | String | 规格 ID |
| originAmountCent | Int | 原价金额，单位分 |
| payableAmountCent | Int | 应付金额，单位分 |
| status | OrderStatus | 订单状态 |
| submittedFormJson | Json | 用户提交表单快照 |
| attendeeName | String? | 报名人姓名 |
| phone | String? | 报名人手机号 |
| paidAt | DateTime? | 支付成功时间 |
| closedAt | DateTime? | 关闭时间 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

约束：

- orderNo 唯一。
- payableAmountCent 由后端计算。
- 前端金额不得入库作为可信金额。

### OrderItem

订单项。MVP 每个订单只有一条报名规格订单项，但仍保留订单项用于价格快照。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 主键 |
| orderId | String | 订单 ID |
| skuId | String | 规格 ID |
| skuName | String | 规格名称快照 |
| unitPriceCent | Int | 单价快照，单位分 |
| quantity | Int | 数量，MVP 固定 1 |
| totalAmountCent | Int | 小计，单位分 |
| createdAt | DateTime | 创建时间 |

约束：

- unitPriceCent 必须来自服务端 SKU。
- totalAmountCent = unitPriceCent * quantity。

### Payment

支付记录。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 主键 |
| orderId | String | 订单 ID |
| provider | PaymentProvider | 支付渠道 |
| status | PaymentStatus | 支付状态 |
| outTradeNo | String | 商户订单号，唯一 |
| transactionId | String? | 微信支付交易号 |
| amountCent | Int | 支付金额，单位分 |
| notifyRawId | String? | 回调事件 ID 或幂等 ID |
| paidAt | DateTime? | 支付成功时间 |
| failedReason | String? | 失败原因摘要 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

约束：

- outTradeNo 唯一。
- transactionId 唯一，可为空。
- amountCent 必须等于 Order.payableAmountCent。

### Registration

报名记录。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String | 主键 |
| registrationNo | String | 报名编号，唯一 |
| userId | String? | 用户 ID |
| conferenceId | String | 会议 ID |
| skuId | String | 规格 ID |
| orderId | String | 订单 ID，唯一 |
| attendeeName | String? | 报名人姓名 |
| phone | String? | 手机号 |
| formDataJson | Json | 报名表单数据 |
| paidAmountCent | Int | 实付金额，单位分 |
| status | RegistrationStatus | 报名状态 |
| confirmedAt | DateTime | 确认时间 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

约束：

- registrationNo 唯一。
- orderId 唯一，防止重复回调重复生成报名。
- paidAmountCent 来自已支付订单。

## 4. 关键索引

- Conference(status, sortOrder)
- RegistrationSku(conferenceId, status, sortOrder)
- FormField(formDefinitionId, sortOrder)
- Order(orderNo)
- Order(userId, createdAt)
- Order(conferenceId, status)
- Payment(outTradeNo)
- Payment(transactionId)
- Registration(orderId)
- Registration(userId, createdAt)
- Registration(conferenceId, createdAt)

## 5. 支付幂等要求

支付成功处理必须满足：

- 根据 outTradeNo 定位订单。
- 验证 Payment.amountCent 与 Order.payableAmountCent 相等。
- 在数据库事务中更新 Order、Payment、Registration。
- 如果 Order 已 paid 且 Registration 已存在，直接返回成功。
- Registration.orderId 唯一约束作为最终防线。

## 6. 暂不建模的业务

MVP 不设计完整表结构：

- 优惠券
- 会员等级
- 商城商品和购物车
- AI 知识库
- 房间、座位、酒店
- 抖音 / 小红书 / B 站原生小程序账号体系

