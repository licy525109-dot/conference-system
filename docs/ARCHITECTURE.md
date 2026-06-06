# 会议报名缴费 MVP 架构设计

## 1. 架构目标

MVP 架构以快速上线、支付安全、后续可扩展为目标。第一阶段只实现会议报名缴费闭环，不引入会员、商城、AI 知识库、优惠券、房间座位酒店、抖音 / 小红书 / B 站原生小程序。

## 2. 技术栈

- 包管理：pnpm workspace
- 用户端：apps/user，uni-app + Vue3 + TypeScript
- 后台端：apps/admin，Vue3 + Vite + TypeScript + Element Plus
- 后端：services/api，NestJS + TypeScript
- 共享包：packages/shared，共享 DTO、类型、常量
- ORM：Prisma
- 数据库：PostgreSQL
- 缓存和锁：Redis
- 支付：开发环境 mock，生产预留微信支付 API v3

## 3. 目录规划

```txt
conference-system/
  apps/
    user/
    admin/
  services/
    api/
  packages/
    shared/
  prisma/
    schema.prisma
    migrations/
    seed.ts
  docs/
    PRD.md
    ARCHITECTURE.md
    DATABASE.md
    API.md
    TASKS.md
    TEST_PLAN.md
  docker-compose.yml
  pnpm-workspace.yaml
  package.json
```

## 4. 系统边界

### 4.1 用户端

负责展示和交互：

- 会议首页
- 会议详情
- 报名规格选择
- 动态报名表单渲染
- 订单确认
- mock 支付或微信支付唤起
- 支付结果
- 我的报名

用户端不负责可信计价。用户端只展示后端返回的金额，金额格式化仅用于显示。

### 4.2 后台端

负责最小运营管理：

- 登录
- 会议管理
- 规格管理
- 表单字段管理
- 订单列表
- 报名名单

后台端所有接口必须鉴权。

### 4.3 API 服务

负责业务规则和可信状态：

- 会议查询
- 表单配置查询
- 表单数据校验
- quote 展示
- 订单创建与重新计价
- mock 支付
- 微信支付预下单
- 微信支付回调
- 支付成功后生成报名记录
- 后台管理接口
- 健康检查

### 4.4 数据库

PostgreSQL 保存所有核心业务状态：

- 用户和管理员
- 会议
- 会议详情页内容
- 报名规格
- 表单定义和字段
- 订单和订单项
- 支付记录
- 报名记录

### 4.5 Redis

MVP 中 Redis 用于：

- 支付回调幂等辅助锁
- 后续可扩展为短期验证码、会话、限流

最终幂等仍以数据库唯一约束和事务为准，Redis 不能替代数据库约束。

## 5. 服务模块划分

### 5.1 Public Conference Module

- 查询已发布会议列表。
- 查询会议详情。
- 查询会议报名规格。
- 查询会议动态表单字段。

### 5.2 Registration Form Module

- 后台配置字段。
- 用户端读取字段。
- 后端提交时校验字段。
- 提交数据保存为 JSON。
- 常用字段复制到 Registration columns，例如 attendeeName、phone。

### 5.3 Pricing and Order Module

- quote 只用于展示。
- create order 必须重新读取 SKU 价格。
- 订单项保存创建订单时的规格快照和单价。
- 订单 payableAmountCent 必须来自后端计算。

### 5.4 Payment Module

- mock 支付。
- 微信支付 API v3 prepay。
- 微信支付 notify。
- 支付金额校验。
- 支付状态流转。
- 支付成功后创建 Registration。

### 5.5 Admin Module

- 管理员登录。
- JWT 鉴权。
- 会议、规格、字段、订单、报名名单管理。

## 6. 核心状态设计

### 6.1 会议状态

- draft：草稿，不对用户展示。
- published：已发布，用户可见。
- archived：已归档，不可报名。

### 6.2 订单状态

- pending：待支付。
- paid：已支付。
- closed：已关闭。
- failed：支付失败或异常。

订单状态流转：

```txt
pending -> paid
pending -> closed
pending -> failed
failed -> pending 不允许
paid -> pending 不允许
paid -> paid 重复回调幂等返回成功
```

### 6.3 支付状态

- created：支付记录已创建。
- success：支付成功。
- failed：支付失败。

### 6.4 报名状态

- confirmed：支付成功后生成的有效报名。
- canceled：预留，不在 MVP 实现取消和退款流程。

## 7. 支付安全架构

支付相关逻辑必须集中在后端 Payment Module：

- 微信支付密钥只从环境变量读取。
- 不在代码、文档、日志、测试快照中写入真实密钥。
- notify 必须验签。
- notify 必须解密。
- notify 必须校验金额。
- 订单更新和报名创建必须在数据库事务中完成。
- 重复回调必须无副作用。
- 对同一个 orderId 只能创建一条 Registration。

## 8. API 安全

- 用户端公开接口只提供已发布会议、表单、订单创建、支付、我的报名等必要能力。
- 后台接口统一使用 `/api/admin` 前缀。
- 后台接口必须通过 JWT 鉴权。
- 后台登录密码必须哈希保存。
- 不将敏感字段返回前端。

## 9. 环境配置

配置从环境变量读取：

- DATABASE_URL
- REDIS_URL
- JWT_SECRET
- WECHAT_APP_ID
- WECHAT_MCH_ID
- WECHAT_API_V3_KEY
- WECHAT_PRIVATE_KEY
- WECHAT_CERT_SERIAL_NO
- WECHAT_NOTIFY_URL
- PAYMENT_MODE

文档仅写变量名，不写真实值。

## 10. 暂不实现的架构能力

MVP 不引入以下模块：

- 优惠券服务
- 会员中心
- 商城订单
- AI 知识库
- 房间、座位、酒店分配
- 抖音 / 小红书 / B 站原生小程序适配层

如未来需要扩展，可在订单、会议、报名记录中保留轻量字段，但不实现业务流程。

