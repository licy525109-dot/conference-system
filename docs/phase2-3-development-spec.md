# 会议报名缴费系统：第二阶段后续功能开发文档（给 Codex 使用）

**版本日期：2026-06-09**  
**适用项目：微信小程序 + H5 + NestJS 后端 + Vue 管理后台会议报名缴费系统**  
**当前阶段：核心链路已跑通，进入后台运营能力、团体报名、优惠计价体系开发**

---

## 0. 给 Codex 的使用方式

由于本任务较长，不建议把全文直接粘贴到 Codex 对话框。

推荐做法：

1. 把本文档保存到项目仓库，例如：

```bash
mkdir -p docs
cp conference-system-phase2-3-codex-development-spec.md docs/phase2-3-development-spec.md
```

2. 在 Codex 对话框只粘贴下面这段短提示：

```text
请先阅读 docs/phase2-3-development-spec.md。按文档要求分阶段实现：后台备注 -> 核销配置和手动核销 -> 多张票和团体报名 -> 优惠券与满减规则。每个阶段完成后单独运行测试和 build。不要修改微信支付签名算法、Authorization header、notify 核心逻辑、PaymentSuccessService 核心状态流、.env.production 和 /www/secure/wechatpay 证书目录。
```

---

## 1. 当前项目基线

当前项目是一个微信小程序 + H5 + NestJS 后端 + Vue 管理后台的会议报名缴费系统。

截至当前基线，核心链路已经跑通：

- 小程序体验版可正常打开。
- 会议首页、会议详情、报名表单、quote 报价、创建订单流程正常。
- 微信真实登录已跑通，真实 openid 已入库。
- 微信真实支付 prepay 已跑通。
- 小程序已可成功拉起微信支付。
- 0.01 元真实支付已成功。
- 微信支付 notify 已成功处理。
- 数据库已确认：
  - Order -> PAID
  - Payment -> SUCCESS
  - Payment.provider = WECHAT
  - Payment.transactionId 有微信支付交易号
  - Registration -> CONFIRMED
  - 报名幂等 count = 1
  - registration_skus / soldCount / 库存正常

生产环境重点信息：

- 服务器：阿里云 ECS + 宝塔
- 项目目录：`/www/wwwroot/conference-system`
- PostgreSQL 使用 Docker
- Redis 使用服务器本机 `127.0.0.1:6379`
- PM2 进程名：`conference-api`
- 公网 API：`https://guanchaohuiji.com/api`
- 健康检查：`https://guanchaohuiji.com/api/health`
- 管理后台：`https://admin.guanchaohuiji.com/`
- 微信支付证书目录：`/www/secure/wechatpay/`

证书和密钥不要放进 `/www/wwwroot`，不要提交到 Git。

---

## 2. 本轮新增需求总览

本轮新增以下功能：

1. 后台备注。
2. 手动核销，并且后端可配置本次会议是否需要核销。
3. 报名时可选择多张票，支持团体报名。
4. 买多张票时必须同步生成多个报名表单。
5. 优惠券功能。
6. 满减功能，满减规则可自定义，例如限制购买张数满几张后才可参与满减。

这些功能会影响数据库 schema、quote 计价、订单创建、报名表单结构、后台运营页面和测试体系。

**不要一次性全部完成。必须按阶段推进。**

---

## 3. 绝对禁止修改的内容

本轮开发必须保护已跑通的真实支付链路。

严禁修改：

1. 微信支付签名算法。
2. 微信支付 `Authorization header` 格式。
3. 微信支付 notify 核心逻辑。
4. `PaymentSuccessService` 核心状态流。
5. 已跑通的真实支付配置。
6. `.env.production`。
7. `/www/secure/wechatpay` 证书目录。
8. `docker-compose.prod.yml`。
9. 订单状态流，除非是为了兼容新增参会人核销状态，且必须保持现有支付成功流程稳定。

特别注意：之前已经修复过微信支付 APIv3 Authorization header 格式，不能改回错误格式。

正确格式类似：

```text
WECHATPAY2-SHA256-RSA2048 mchid="...",nonce_str="...",timestamp="...",serial_no="...",signature="..."
```

错误格式类似：

```text
WECHATPAY2-SHA256-RSA2048,mchid="..."
```

---

## 4. 推荐开发顺序

### 阶段 A：后台备注

风险最低，优先实现。

目标：后台可以给报名记录、参会人记录添加内部备注。

### 阶段 B：核销配置和手动核销

引入会议级配置：本会议是否需要核销。核销维度必须是参会人，而不是订单。

### 阶段 C：多张票和团体报名

支持一个订单购买多张票。买几张票，就必须提交几个参会人表单。

### 阶段 D：优惠券与满减规则

最后接入价格体系。quote 和 create order 必须共用后端价格计算服务，create order 必须重新计算价格，不可信任前端金额。

---

## 5. 数据模型设计建议

请 Codex 先读取当前 Prisma schema、订单、报名、quote、支付成功处理相关代码，再做最小必要 migration。

当前系统疑似存在 `Registration.orderId unique` 幂等逻辑。不要为了多张票直接把 `Registration` 改成“一张票一个 Registration”，否则可能破坏现有支付成功幂等逻辑。

推荐结构：

```text
Order
  -> Registration
       -> RegistrationAttendee[]
       -> registration_skus[]
```

也就是：一个订单对应一个总报名记录，一个总报名记录下挂多个参会人表单。

### 5.1 Conference 建议新增字段

```text
checkInEnabled Boolean default false
```

含义：本会议是否需要核销。

```text
groupRegistrationEnabled Boolean default true
```

含义：本会议是否允许团体报名。

```text
maxTicketsPerOrder Int?
```

含义：单个订单最大购票数。

### 5.2 Registration 建议新增字段

```text
adminRemark String?
remarkUpdatedAt DateTime?
remarkUpdatedBy String?
```

用于后台内部备注。

### 5.3 新增 RegistrationAttendee

建议新增参会人表：

```text
id
registrationId
skuId
name
phone
company
title
formData Json?
checkInStatus enum: NOT_REQUIRED / PENDING / CHECKED_IN / CANCELLED
checkedInAt DateTime?
checkedInBy String?
adminRemark String?
createdAt
updatedAt
```

注意：字段名称应根据当前项目风格调整。

### 5.4 Order 建议新增价格快照字段

```text
originalAmountCents Int?
discountAmountCents Int?
payableAmountCents Int?
```

如果当前 Order 已有 amount、totalAmount、payAmount 等字段，不要删除旧字段。新增字段必须兼容旧数据。

### 5.5 新增 OrderDiscount

用于记录订单优惠快照，避免支付成功后重新计算优惠。

```text
id
orderId
type
title
amountCents
couponId?
promotionId?
snapshot Json?
createdAt
```

### 5.6 新增 Coupon

```text
id
code unique
name
type: AMOUNT / PERCENT
discountAmountCents?
discountPercent?
maxDiscountCents?
minAmountCents?
minQuantity?
totalLimit?
perUserLimit?
enabled
startAt
endAt
stackableWithPromotion Boolean default false
conferenceId?
allowedSkuIds Json?
createdAt
updatedAt
```

### 5.7 新增 CouponRedemption

```text
id
couponId
userId
orderId
status: PENDING / USED / CANCELLED
usedAt DateTime?
createdAt
updatedAt
```

建议生命周期：

- 创建订单时：PENDING
- 支付成功后：USED
- 订单关闭、支付失败或超时：CANCELLED

### 5.8 新增 PromotionRule

```text
id
name
type: FULL_REDUCTION
conferenceId?
allowedSkuIds Json?
minAmountCents?
minQuantity?
discountAmountCents
enabled
startAt
endAt
stackableWithCoupon Boolean default false
createdAt
updatedAt
```

满减规则必须支持按购票张数限制，例如“满 3 张减 100 元”。

---

## 6. 阶段 A：后台备注

### 6.1 后端接口

新增或完善：

```text
PATCH /api/admin/registrations/:id/remark
```

请求体：

```json
{
  "adminRemark": "内部备注内容"
}
```

要求：

- 必须后台权限。
- 只更新备注字段。
- 记录 `remarkUpdatedAt`。
- 如果当前后台用户体系支持，记录 `remarkUpdatedBy`。
- 报名列表和报名详情返回 `adminRemark`。

可选增加：

```text
PATCH /api/admin/registration-attendees/:id/remark
```

用于对单个参会人添加备注。

### 6.2 管理后台页面

报名列表：

- 增加备注列，内容过长时省略展示。
- 支持查看完整备注。

报名详情：

- 增加“内部备注”区域。
- 支持编辑、保存。
- 保存失败显示中文提示。

参会人列表：

- 如果已实现 `RegistrationAttendee`，每个参会人也可有单独备注。

### 6.3 验收点

- 编辑备注不会影响订单状态。
- 编辑备注不会影响支付状态。
- 编辑备注不会触发微信支付相关逻辑。
- 旧数据没有备注时正常显示为空或“暂无备注”。

---

## 7. 阶段 B：核销配置和手动核销

### 7.1 核销设计原则

核销必须按参会人维度进行，而不是按订单维度。

原因：团体报名后，一个订单可能包含多个参会人。如果只核销订单，无法判断具体哪位参会人已到场。

### 7.2 会议级核销配置

新增接口：

```text
PATCH /api/admin/conferences/:id/check-in-config
```

请求体：

```json
{
  "checkInEnabled": true
}
```

后台会议配置页增加：

- 是否需要核销 `checkInEnabled`

### 7.3 支付成功后的参会人核销状态

支付成功后：

- 如果 `conference.checkInEnabled = false`：`RegistrationAttendee.checkInStatus = NOT_REQUIRED`
- 如果 `conference.checkInEnabled = true`：`RegistrationAttendee.checkInStatus = PENDING`

如果当前系统是在支付成功后才创建 Registration，则应保持该模式，并在支付成功创建 Registration 时同步创建 RegistrationAttendee。

如果当前系统是在创建订单时已经创建 Registration，则应保持兼容，只在支付成功后确认状态。

**不要创建未支付但状态为 CONFIRMED 的参会人。**

### 7.4 手动核销接口

新增接口：

```text
POST /api/admin/registration-attendees/:id/check-in
```

要求：

- 必须后台权限。
- 只能核销已支付、已确认报名下的参会人。
- 只能从 `PENDING` 改为 `CHECKED_IN`。
- 重复核销返回中文提示：`该参会人已核销`。
- 记录 `checkedInAt`。
- 记录 `checkedInBy`，如果当前后台用户体系支持。

可选后续接口：

```text
POST /api/admin/registration-attendees/:id/check-in/revoke
```

本轮可以先不做撤销核销。

### 7.5 管理后台页面

会议配置页：

- 增加“是否需要核销”。

报名列表：

- 展示核销进度，例如 `2/3 已核销`。
- 支持按核销状态筛选，若实现成本低可以做。

报名详情：

- 展示所有参会人。
- 每个参会人展示核销状态。
- `PENDING` 状态显示“确认核销”按钮。
- `CHECKED_IN` 显示核销时间和核销人。
- `NOT_REQUIRED` 显示“无需核销”。

### 7.6 验收点

- 不需要核销的会议，支付成功后参会人显示“无需核销”。
- 需要核销的会议，支付成功后参会人显示“待核销”。
- 手动核销后状态变为“已核销”。
- 重复核销返回明确中文提示。
- 核销不会影响 Order、Payment、Registration 的已支付状态。

---

## 8. 阶段 C：多张票和团体报名

### 8.1 核心业务规则

用户报名时可以选择多张票。

买几张票，就必须填写几个参会人表单。

例如购买：

- 标准票 2 张
- VIP 票 1 张

则必须填写 3 个参会人表单：

- 标准票第 1 位参会人
- 标准票第 2 位参会人
- VIP 票第 1 位参会人

### 8.2 quote 请求建议

```json
{
  "conferenceId": "xxx",
  "items": [
    {
      "skuId": "standard-ticket",
      "quantity": 2
    },
    {
      "skuId": "vip-ticket",
      "quantity": 1
    }
  ],
  "couponCode": "MEETING50"
}
```

### 8.3 quote 返回建议

```json
{
  "originalAmountCents": 30000,
  "discountAmountCents": 5000,
  "payableAmountCents": 25000,
  "items": [
    {
      "skuId": "standard-ticket",
      "skuName": "标准票",
      "quantity": 2,
      "unitPriceCents": 10000,
      "subtotalCents": 20000
    },
    {
      "skuId": "vip-ticket",
      "skuName": "VIP 票",
      "quantity": 1,
      "unitPriceCents": 10000,
      "subtotalCents": 10000
    }
  ],
  "discounts": [
    {
      "type": "FULL_REDUCTION",
      "title": "满 3 张减 50 元",
      "amountCents": 5000
    }
  ],
  "messages": []
}
```

### 8.4 create order 请求建议

```json
{
  "conferenceId": "xxx",
  "items": [
    {
      "skuId": "standard-ticket",
      "quantity": 2
    }
  ],
  "attendees": [
    {
      "skuId": "standard-ticket",
      "name": "张三",
      "phone": "13800000001",
      "company": "某公司",
      "title": "经理"
    },
    {
      "skuId": "standard-ticket",
      "name": "李四",
      "phone": "13800000002",
      "company": "某公司",
      "title": "主管"
    }
  ],
  "couponCode": "MEETING50"
}
```

### 8.5 后端必须校验

创建订单时后端必须校验：

1. 每个 SKU 的 attendee 数量必须等于对应购买 quantity。
2. attendees 总数必须等于 items 总 quantity。
3. SKU 必须属于当前会议。
4. SKU 必须有效、上架、库存足够。
5. 单次购买数量不能超过 `maxTicketsPerOrder`。
6. 前端传来的金额不可信，create order 必须重新计算 quote。
7. 订单金额必须使用后端计算结果。
8. 优惠券和满减结果必须写入 `OrderDiscount` 作为快照。
9. 不允许用户用 A 会议的 SKU 创建 B 会议的订单。
10. 不允许购买数量为 0 或负数。

### 8.6 未支付订单的参会人数据保存

Codex 必须先检查当前系统的订单和报名创建流程。

如果当前系统是支付成功后才创建 Registration，则推荐：

- create order 时把 attendees 作为订单报名快照保存，例如存在 Order metadata 或新增 PendingRegistrationSnapshot。
- 支付成功后由 `PaymentSuccessService` 根据快照创建 Registration 和 RegistrationAttendee。
- 保持现有 `Registration.orderId unique` 幂等逻辑。

如果当前系统创建订单时已经创建 Registration，则推荐：

- create order 时创建 PENDING 类型的 Registration/RegistrationAttendee。
- 支付成功后确认 Registration 和 RegistrationAttendee。

无论采用哪种方式，都不能让未支付订单生成 `CONFIRMED` 报名。

### 8.7 小程序端改造

会议详情页：

- 每个 SKU 支持选择数量。
- 显示库存、价格、已选数量。
- 校验最大购买数量。

报名页：

- 根据选择的 SKU 和数量动态生成多个参会人表单。
- 每张票一个表单。
- 不同票种清晰标识。
- 必填项缺失时不能提交。

报价页：

- 展示原价。
- 展示满减优惠。
- 展示优惠券优惠。
- 展示应付金额。

创建订单：

- 提交 `items`、`attendees`、`couponCode`。
- 不提交最终价格，或即使提交也只作展示，后端不得信任。

支付取消文案保持：

```text
你已取消支付，订单仍为待支付，可稍后继续支付。
```

### 8.8 管理后台展示

报名列表：

- 展示团体报名人数。
- 展示票种汇总。
- 展示核销进度。

报名详情：

- 展示所有参会人表单。
- 每个参会人显示票种、姓名、手机号、单位、职位、核销状态、备注。

订单详情：

- 展示订单购买明细。
- 展示参会人列表。
- 展示优惠明细。

---

## 9. 阶段 D：优惠券与满减规则

### 9.1 计价总原则

quote 和 create order 必须共用同一套后端价格计算服务。

流程：

```text
前端选择票种和数量
-> 调用 quote
-> 后端计算原价、满减、优惠券、最终应付金额
-> 前端展示价格明细
-> 创建订单
-> 后端重新计算一次价格
-> 保存订单金额和优惠快照
-> 微信支付
-> notify 成功
-> 只确认支付结果，不重新计算优惠
```

关键原则：

- quote 只是预估展示。
- create order 必须重新计算。
- 前端金额不可信。
- notify 不重新计算价格。
- 订单优惠明细必须落库为快照。

### 9.2 满减规则

后台需要支持满减规则 CRUD：

```text
GET /api/admin/promotion-rules
POST /api/admin/promotion-rules
PATCH /api/admin/promotion-rules/:id
DELETE 或 PATCH 禁用 /api/admin/promotion-rules/:id
```

满减规则字段至少支持：

- 规则名称。
- 指定会议。
- 指定 SKU，或全部 SKU。
- 满金额条件 `minAmountCents`。
- 满张数条件 `minQuantity`。
- 减免金额 `discountAmountCents`。
- 有效期。
- 是否启用。
- 是否允许和优惠券叠加。

例子：

```json
{
  "name": "三人同行优惠",
  "type": "FULL_REDUCTION",
  "conferenceId": "xxx",
  "minQuantity": 3,
  "minAmountCents": null,
  "discountAmountCents": 10000,
  "allowedSkuIds": ["standard-ticket"],
  "enabled": true,
  "startAt": "2026-06-01T00:00:00+10:00",
  "endAt": "2026-06-30T23:59:59+10:00",
  "stackableWithCoupon": false
}
```

满张数计算建议：

- 如果配置了 allowedSkuIds，则只统计这些 SKU 的购买数量。
- 如果未配置 allowedSkuIds，则统计整个订单总票数。

多条满减规则同时命中时，建议默认只使用优惠力度最大的一条，除非后续明确设计多规则叠加。

### 9.3 优惠券

后台需要支持优惠券 CRUD：

```text
GET /api/admin/coupons
POST /api/admin/coupons
PATCH /api/admin/coupons/:id
DELETE 或 PATCH 禁用 /api/admin/coupons/:id
```

优惠券字段至少支持：

- 优惠码 code。
- 名称 name。
- 固定金额减免 AMOUNT。
- 折扣 PERCENT。
- 最大优惠金额 maxDiscountCents。
- 最低消费金额 minAmountCents。
- 最低购票张数 minQuantity。
- 总使用次数 totalLimit。
- 每用户使用次数 perUserLimit。
- 指定会议 conferenceId。
- 指定 SKU allowedSkuIds。
- 有效期 startAt / endAt。
- 是否启用 enabled。
- 是否允许和满减叠加 stackableWithPromotion。

优惠券校验：

- 不存在：返回中文提示“优惠券不存在”。
- 未启用：返回“优惠券不可用”。
- 未到有效期：返回“优惠券尚未开始”。
- 已过期：返回“优惠券已过期”。
- 不满足金额：返回“未达到优惠券使用金额”。
- 不满足张数：返回“未达到优惠券使用张数”。
- 不适用于当前会议：返回“优惠券不适用于当前会议”。
- 不适用于当前票种：返回“优惠券不适用于当前票种”。
- 超过总次数：返回“优惠券已被领完或使用完”。
- 超过用户限制：返回“你已使用过该优惠券”。

### 9.4 优惠叠加规则

默认规则：优惠券和满减不叠加。

只有同时满足以下条件时才允许叠加：

- 满减规则 `stackableWithCoupon = true`
- 优惠券 `stackableWithPromotion = true`

叠加顺序建议：

1. 先应用满减。
2. 再应用优惠券。
3. 最终应付金额不能小于 0。
4. 优惠总额不能大于原价。

### 9.5 OrderDiscount 快照

每个订单需要保存优惠明细：

```json
[
  {
    "type": "FULL_REDUCTION",
    "title": "三人同行优惠",
    "amountCents": 10000,
    "promotionId": "xxx",
    "snapshot": {}
  },
  {
    "type": "COUPON",
    "title": "优惠券 MEETING50",
    "amountCents": 5000,
    "couponId": "xxx",
    "snapshot": {}
  }
]
```

支付成功后不要重新计算优惠，只使用订单创建时保存的金额和快照。

### 9.6 小程序端展示

小程序报名 / 报价页：

- 支持输入优惠券码。
- 展示原价。
- 展示满减优惠。
- 展示优惠券优惠。
- 展示最终应付金额。
- 优惠券不可用时显示中文提示。

### 9.7 管理后台页面

新增优惠券管理页：

- 列表。
- 新建。
- 编辑。
- 启用 / 禁用。
- 查看使用次数。

新增满减规则管理页：

- 列表。
- 新建。
- 编辑。
- 启用 / 禁用。
- 配置满张数 `minQuantity`。
- 配置满金额 `minAmountCents`。
- 配置适用会议和 SKU。

订单详情页：

- 展示原价。
- 展示优惠金额。
- 展示实付金额。
- 展示优惠券和满减明细。

---

## 10. 后台页面总清单

### 10.1 会议配置页

新增：

- 是否需要核销 `checkInEnabled`
- 是否允许团体报名 `groupRegistrationEnabled`
- 单订单最大购票数 `maxTicketsPerOrder`

### 10.2 报名列表页

新增或优化：

- 团体报名人数。
- 票种汇总。
- 核销进度。
- 后台备注。
- 微信头像和微信昵称。
- 报名姓名和手机号。

### 10.3 报名详情页

新增或优化：

- 订单信息。
- 支付信息。
- 优惠明细。
- 所有参会人表单。
- 每个参会人的核销状态。
- 每个参会人的手动核销按钮。
- 报名备注和参会人备注。

### 10.4 订单详情页

新增或优化：

- 原价。
- 优惠金额。
- 实付金额。
- 优惠明细。
- 关联报名记录。
- 参会人列表。
- 微信交易号。

### 10.5 优惠券管理页

新增：

- 优惠券列表。
- 新增优惠券。
- 编辑优惠券。
- 启用 / 禁用。

### 10.6 满减规则管理页

新增：

- 满减规则列表。
- 新增规则。
- 编辑规则。
- 启用 / 禁用。
- 支持配置满张数。

---

## 11. 测试要求

至少补充以下测试：

1. quote 多 SKU 多数量金额计算正确。
2. 购买 3 张票时必须提交 3 个 attendee。
3. attendee 数量少于 quantity 时创建订单失败。
4. attendee 的 skuId 数量和 items 不一致时创建订单失败。
5. SKU 不属于当前会议时创建订单失败。
6. 库存不足时创建订单失败。
7. 超过 maxTicketsPerOrder 时创建订单失败。
8. 满 3 张减 100 元规则生效。
9. 未满 3 张不享受满减。
10. 指定 SKU 满减只统计指定 SKU 数量。
11. 优惠券不存在不可用。
12. 优惠券过期不可用。
13. 优惠券未到开始时间不可用。
14. 优惠券使用次数达到限制不可用。
15. 优惠券每用户次数达到限制不可用。
16. create order 会重新计算价格，不信任前端金额。
17. create order 会写入 OrderDiscount 快照。
18. 支付成功后多个 attendee 状态正确。
19. checkInEnabled=false 时 attendee 为 NOT_REQUIRED。
20. checkInEnabled=true 时 attendee 为 PENDING。
21. 手动核销 PENDING -> CHECKED_IN。
22. 重复核销返回明确中文提示。
23. 后台备注只更新备注，不影响订单和支付状态。
24. 支付 notify 不重新计算优惠。
25. 微信支付 Authorization header 格式没有被改坏。

---

## 12. 验收命令

每个阶段完成后执行：

```bash
pnpm typecheck
pnpm test
pnpm --filter @conference/api build
pnpm --filter @conference/user build:mp-weixin
pnpm --filter @conference/admin build
```

如果项目没有统一 `typecheck` 或 `test` 命令，请先查看 `package.json`，以项目已有命令为准。

### 12.1 小程序构建检查

```bash
cd /Users/yangyang/Projects/conference-system

pnpm --filter @conference/user build:mp-weixin

node -e "const fs=require('fs'); const app=JSON.parse(fs.readFileSync('apps/user/dist/build/mp-weixin/app.json','utf8')); console.log(app.pages.slice(0,10))"

grep -R "https://guanchaohuiji.com/api" -n apps/user/dist/build/mp-weixin/config apps/user/dist/build/mp-weixin/services 2>/dev/null

grep -R "localhost|127.0.0.1|192.168|:3000|vconsole|VConsole" -n apps/user/dist/build/mp-weixin 2>/dev/null || true
```

目标：

- 第一项必须是 `pages/index/index`。
- API_BASE_URL 必须是 `https://guanchaohuiji.com/api`。
- PAYMENT_MODE 必须是 real。
- 不包含 localhost / 127.0.0.1 / 192.168 / :3000。
- 生产体验版默认不启用 vConsole。

### 12.2 支付核心保护检查

```bash
grep -R "WECHATPAY2-SHA256-RSA2048" -n services/api/src services/api/dist 2>/dev/null

grep -R "Authorization" -n services/api/src/payments services/api/dist/payments 2>/dev/null
```

确认没有把微信支付 Authorization header 改回逗号格式。

---

## 13. 真实支付回归流程

每次涉及 quote、create order、PaymentSuccessService、报名创建相关改动后，必须做真机回归。

测试顺序：

1. 新微信体验号打开小程序。
2. 进入会议详情。
3. 选择 1 张票，填写 1 个报名表单。
4. quote 报价正常。
5. 创建订单正常。
6. 拉起微信支付。
7. 主动取消支付，检查文案：

```text
你已取消支付，订单仍为待支付，可稍后继续支付。
```

8. 再选择多张票，例如 3 张票，填写 3 个报名表单。
9. 如配置满 3 张优惠，检查 quote 是否生效。
10. 创建订单。
11. 支付 0.01 元测试订单。
12. 微信支付 notify 成功。
13. 数据库检查：

```text
Order = PAID
Payment = SUCCESS
Payment.provider = WECHAT
Payment.transactionId 有微信支付交易号
Registration = CONFIRMED
RegistrationAttendee 数量 = 购票数量
核销状态符合会议配置
OrderDiscount 快照正确
soldCount / 库存正常
```

---

## 14. Codex 每阶段完成后的输出要求

每阶段完成后，Codex 必须输出：

1. 修改了哪些文件。
2. 新增了哪些数据库 migration。
3. 新增了哪些后端接口。
4. 小程序报名流程是否变化。
5. 后台增加了哪些页面和按钮。
6. 优惠券和满减规则如何配置。
7. 是否修改了微信支付核心逻辑。
8. 如何本地验证。
9. 测试和 build 结果。
10. 真实支付链路是否仍保持原样。

---

## 15. 推荐给 Codex 的第一条短提示

如果 Codex 对话框放不下全文，只粘贴下面这段：

```text
请先阅读 docs/phase2-3-development-spec.md。不要一次性实现全部，请先读取当前 Prisma schema 和订单/报名/quote/payment-success 相关代码，确认现有 Registration、Order、registration_skus 的关系，然后按“后台备注 -> 核销配置和手动核销 -> 多票表单和团体报名 -> 优惠券与满减”的顺序分阶段实现。每一阶段完成后单独跑测试和 build。不要改微信支付签名算法、Authorization header、notify 核心逻辑、PaymentSuccessService 核心状态流、.env.production、/www/secure/wechatpay 证书目录和 docker-compose.prod.yml。
```

---

## 16. 最容易踩坑的地方

1. 不要把订单核销当作参会人核销。
2. 不要只在前端校验报名表单数量，后端必须再次校验。
3. 不要信任前端传来的价格。
4. 不要在支付 notify 中重新计算优惠。
5. 不要破坏 `Registration.orderId unique` 幂等逻辑。
6. 优惠券和满减默认不要叠加，除非后台明确允许。
7. 优惠金额不能大于订单原价。
8. 优惠后应付金额不能小于 0。
9. 多 SKU 的满张数规则要明确统计范围。
10. 旧订单、旧报名没有新字段时，后台不能报错。

---

## 17. 本文档结论

本轮需求可以做，但必须分阶段推进。

优先顺序：

```text
后台备注
-> 核销配置和手动核销
-> 多张票和团体报名
-> 优惠券与满减规则
```

最重要的底线：

```text
保护已跑通的真实微信支付链路。
create order 重新计算价格。
notify 不重新计算优惠。
核销按参会人维度。
团体报名不破坏 Registration.orderId unique 幂等逻辑。
```
