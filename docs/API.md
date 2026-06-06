# 会议报名缴费 MVP API 设计

## 1. 通用约定

### 1.1 Base URL

- 本地开发：`/api`
- 后台接口前缀：`/api/admin`

### 1.2 响应格式

```json
{
  "code": "OK",
  "message": "ok",
  "data": {}
}
```

错误响应：

```json
{
  "code": "VALIDATION_ERROR",
  "message": "字段校验失败",
  "details": []
}
```

### 1.3 金额约定

- 所有金额字段使用整数分。
- 字段名统一使用 `Cent` 后缀，例如 `priceCent`、`payableAmountCent`。
- 前端金额只用于展示，后端创建订单时重新计价。

### 1.4 鉴权约定

- 用户端 MVP 可使用最小用户身份，后续接微信 openid。
- 后台接口必须通过 `Authorization: Bearer <token>` 鉴权。
- 未登录访问后台接口返回 401。

## 2. 健康检查

### GET /api/health

返回服务健康状态。

响应：

```json
{
  "code": "OK",
  "message": "ok",
  "data": {
    "status": "ok"
  }
}
```

## 3. 用户端会议 API

### GET /api/conferences

查询已发布会议列表。

Query：

| 参数 | 说明 |
|---|---|
| page | 页码，默认 1 |
| pageSize | 每页数量，默认 20 |

响应 data：

```json
{
  "items": [
    {
      "id": "conf_001",
      "title": "会议标题",
      "slug": "demo-conf",
      "coverImageUrl": "https://example.com/cover.jpg",
      "summary": "会议摘要",
      "location": "上海",
      "startsAt": "2026-08-01T09:00:00.000Z",
      "endsAt": "2026-08-03T18:00:00.000Z"
    }
  ],
  "total": 1
}
```

### GET /api/conferences/:id

查询会议详情、详情内容、报名规格。

响应 data：

```json
{
  "id": "conf_001",
  "title": "会议标题",
  "summary": "会议摘要",
  "location": "上海",
  "startsAt": "2026-08-01T09:00:00.000Z",
  "endsAt": "2026-08-03T18:00:00.000Z",
  "registrationStartsAt": "2026-06-01T00:00:00.000Z",
  "registrationEndsAt": "2026-07-20T23:59:59.000Z",
  "contentJson": {},
  "skus": [
    {
      "id": "sku_001",
      "name": "仅参会",
      "description": "不含住宿",
      "priceCent": 70000
    }
  ]
}
```

### GET /api/conferences/:id/form

查询会议报名表单字段。

响应 data：

```json
{
  "formId": "form_001",
  "title": "报名信息",
  "fields": [
    {
      "key": "attendeeName",
      "label": "姓名",
      "type": "text",
      "required": true,
      "placeholder": "请输入姓名",
      "options": []
    },
    {
      "key": "phone",
      "label": "手机号",
      "type": "phone",
      "required": true,
      "options": []
    }
  ]
}
```

## 4. 报名订单 API

### POST /api/orders/quote

展示预计金额。该接口不能作为支付金额依据。

请求：

```json
{
  "conferenceId": "conf_001",
  "skuId": "sku_001"
}
```

响应 data：

```json
{
  "conferenceId": "conf_001",
  "skuId": "sku_001",
  "originAmountCent": 70000,
  "payableAmountCent": 70000
}
```

### POST /api/orders

创建报名订单。后端必须重新读取会议、规格和表单配置，并重新计价。

请求：

```json
{
  "conferenceId": "conf_001",
  "skuId": "sku_001",
  "formData": {
    "attendeeName": "张三",
    "phone": "13800000000",
    "email": "demo@example.com"
  }
}
```

响应 data：

```json
{
  "orderId": "order_001",
  "orderNo": "202606060001",
  "status": "pending",
  "originAmountCent": 70000,
  "payableAmountCent": 70000
}
```

规则：

- 请求体不接受可信金额字段。
- 即使前端传金额，后端也必须忽略。
- 必填字段缺失返回 `VALIDATION_ERROR`。
- 会议未发布、规格停用、报名结束返回业务错误。

### GET /api/orders/:id

查询订单详情。

响应 data：

```json
{
  "id": "order_001",
  "orderNo": "202606060001",
  "conferenceTitle": "会议标题",
  "skuName": "仅参会",
  "status": "pending",
  "payableAmountCent": 70000,
  "createdAt": "2026-06-06T10:00:00.000Z"
}
```

## 5. 支付 API

### POST /api/payments/mock/pay

开发环境 mock 支付成功。

请求：

```json
{
  "orderId": "order_001"
}
```

响应 data：

```json
{
  "orderId": "order_001",
  "status": "paid",
  "registrationId": "reg_001"
}
```

规则：

- 仅开发或测试环境启用。
- mock 成功流程必须复用真实支付成功后的订单更新和报名创建逻辑。
- 重复 mock 支付同一个已支付订单，返回当前成功状态，不重复创建 Registration。

### POST /api/payments/wechat/prepay

微信支付预下单。

请求：

```json
{
  "orderId": "order_001"
}
```

响应 data：

```json
{
  "provider": "wechat",
  "orderId": "order_001",
  "payParams": {
    "timeStamp": "1760000000",
    "nonceStr": "nonce",
    "package": "prepay_id=wx_prepay_id",
    "signType": "RSA",
    "paySign": "signature"
  }
}
```

规则：

- 后端按本地订单 payableAmountCent 调用微信预下单。
- 不信任前端金额。
- 微信密钥只从环境变量读取。

### POST /api/payments/wechat/notify

微信支付回调。

请求体由微信支付平台发送。

处理规则：

- 验签。
- 解密。
- 根据 outTradeNo 查询本地订单。
- 校验支付金额等于 Order.payableAmountCent。
- 订单更新、支付记录更新、Registration 创建必须在事务中完成。
- 重复成功回调返回成功，不产生副作用。
- 验签失败、解密失败、金额不一致不得更新订单。

成功响应：

```json
{
  "code": "SUCCESS",
  "message": "成功"
}
```

## 6. 我的报名 API

### GET /api/my/registrations

查询当前用户报名记录。

响应 data：

```json
{
  "items": [
    {
      "id": "reg_001",
      "registrationNo": "REG202606060001",
      "conferenceTitle": "会议标题",
      "skuName": "仅参会",
      "attendeeName": "张三",
      "phone": "13800000000",
      "paidAmountCent": 70000,
      "status": "confirmed",
      "confirmedAt": "2026-06-06T10:05:00.000Z"
    }
  ]
}
```

## 7. 后台鉴权 API

### POST /api/admin/auth/login

请求：

```json
{
  "username": "admin",
  "password": "password"
}
```

响应 data：

```json
{
  "token": "jwt-token",
  "admin": {
    "id": "admin_001",
    "username": "admin",
    "displayName": "管理员"
  }
}
```

规则：

- 密码使用哈希校验。
- JWT_SECRET 从环境变量读取。

## 8. 后台管理 API

所有接口都需要后台鉴权。

### Conferences

- GET /api/admin/conferences
- POST /api/admin/conferences
- GET /api/admin/conferences/:id
- PATCH /api/admin/conferences/:id
- PATCH /api/admin/conferences/:id/publish
- PATCH /api/admin/conferences/:id/archive

### Registration SKUs

- GET /api/admin/conferences/:conferenceId/skus
- POST /api/admin/conferences/:conferenceId/skus
- PATCH /api/admin/skus/:skuId
- PATCH /api/admin/skus/:skuId/enable
- PATCH /api/admin/skus/:skuId/disable

### Form Fields

- GET /api/admin/conferences/:conferenceId/form
- PUT /api/admin/conferences/:conferenceId/form
- POST /api/admin/forms/:formId/fields
- PATCH /api/admin/form-fields/:fieldId
- DELETE /api/admin/form-fields/:fieldId

### Orders

- GET /api/admin/orders
- GET /api/admin/orders/:id

Query 支持：

- conferenceId
- status
- phone
- page
- pageSize

### Registrations

- GET /api/admin/registrations
- GET /api/admin/registrations/:id

Query 支持：

- conferenceId
- phone
- attendeeName
- page
- pageSize

## 9. 暂不提供的 API

MVP 不提供：

- 优惠券领取、核销、试算 API
- 会员等级、积分、权益 API
- 商城商品、购物车、商城订单 API
- AI 知识库问答 API
- 房间、座位、酒店分配 API
- 抖音 / 小红书 / B 站原生小程序登录和支付 API
- 退款 API
- 发票 API
- 签到核销 API

