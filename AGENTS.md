# AGENTS.md

## 项目目标

这是一个会议系统 MVP，第一阶段只实现：

- 会议首页和会议详情
- 报名规格和价格
- 动态报名表单
- 报名订单
- mock 支付
- 微信支付 API v3 预留和真实接入
- 支付成功后生成报名记录
- 我的报名信息
- 最小后台：会议、规格、表单字段、订单、报名名单

暂不实现：会员、商城、AI 问答、优惠券、满减、抖音/小红书/B站渠道、复杂页面装修、退款、发票、签到核销。

## 技术栈

- macOS 本地开发
- Codex App 优先，不依赖 Codex CLI
- pnpm workspace
- apps/user：uni-app + Vue3 + TypeScript
- apps/admin：Vue3 + Vite + TypeScript + Element Plus
- services/api：NestJS + TypeScript
- ORM：Prisma
- 数据库：PostgreSQL
- 缓存/锁：Redis
- 支付：微信支付 API v3，开发环境 mock

## 强制规则

1. 所有金额字段使用整数“分”，禁止使用浮点数保存金额。
2. 前端不能传可信最终金额，创建订单时后端必须重新计价。
3. quote 接口只用于展示，不能作为支付金额依据。
4. 支付回调必须验签、解密、金额校验、事务处理、幂等处理。
5. 支付成功后才能生成 Registration。
6. 重复支付回调不能重复生成报名记录。
7. 微信 AppSecret、商户私钥、API v3 Key、JWT_SECRET 不允许写入代码、文档、日志、测试快照。
8. 后台接口必须鉴权。
9. 不要扩大 MVP 范围。涉及会员、商城、AI、优惠券时只预留扩展点，不实现。
10. 每个任务完成后必须说明修改文件、验证方式、测试结果。

## 推荐命令

- 安装依赖：pnpm install
- 启动数据库：docker compose up -d postgres redis
- 停止数据库：docker compose down
- 启动后端：pnpm dev:api
- 启动用户端 H5：pnpm dev:user:h5
- 构建/运行微信小程序：pnpm dev:user:mp-weixin
- 启动后台：admin：pnpm dev:admin
- Prisma 迁移：pnpm prisma:migrate
- Prisma Studio：pnpm prisma:studio
- 类型检查：pnpm typecheck
- 单元测试：pnpm test
- lint：pnpm lint

## 完成标准

每个功能完成后：

1. 运行相关测试或说明无法运行的原因。
2. 不产生密钥泄露。
3. 不改变 MVP 范围。
4. 说明影响的文件。
5. 说明如何人工验收。
6. 对支付、金额、权限、订单状态做重点自查。
