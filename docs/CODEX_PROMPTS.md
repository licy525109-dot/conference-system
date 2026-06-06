# Codex App 提示词库

## 1. 只读检查

```txt
请先只读取当前项目，不要修改任何文件。请检查并总结：
1. 当前项目目录结构
2. AGENTS.md 中的强制规则
3. .codex/config.toml 的配置含义
4. .agents/skills 下有哪些 skills
5. 当前 MVP 范围是什么
6. 你建议先做哪一个最小任务
```

## 2. 生成 MVP 文档

```txt
请使用 conference-mvp-architect、registration-order-pricing、wechat-pay-idempotency、dynamic-form-mvp、qa-release-checklist skills。
当前目标：先实现会议线上报名缴费和基本信息显示 MVP，不做会员、商城、AI 问答、多平台渠道。
请先不要写业务代码，只在 docs/ 下生成 PRD.md、ARCHITECTURE.md、DATABASE.md、API.md、TASKS.md、TEST_PLAN.md。
完成后停下来，等待我 review，不要继续写代码。
```

## 3. 初始化项目

```txt
请阅读 AGENTS.md 和 docs/ 下所有 MVP 文档，使用 mac-codex-app-workflow、conference-mvp-architect、uniapp-wechat-h5、qa-release-checklist skills。
任务：初始化 pnpm monorepo，创建 apps/user、apps/admin、services/api、packages/shared、prisma。配置 scripts 和 /health。不要接真实微信支付。
```

## 4. 数据库

```txt
请根据 docs/DATABASE.md 实现 MVP Prisma schema、migration 和 seed。包含 User、AdminUser、Conference、ConferencePage、RegistrationSku、FormDefinition、FormField、Order、OrderItem、Payment、Registration。金额用 Int 分，状态用 enum。
```

## 5. 后端 API

```txt
请实现会议、报名表单、quote、订单、mock支付、我的报名、后台管理 API。创建订单必须后端重新计价。支付成功后生成 Registration。重复回调不能重复生成。
```

## 6. 用户端

```txt
请实现 apps/user 的 MVP 用户端：首页、会议详情、报名页、订单确认、支付结果、我的报名。H5 和 mp-weixin 都要支持。
```

## 7. 后台端

```txt
请实现后台登录、会议管理、规格管理、字段管理、订单列表、报名名单。后台接口必须鉴权。
```

## 8. 支付真实接入

```txt
请保留 mock 支付，并增加微信支付 API v3 真实接入。所有密钥从环境变量读取。notify 必须验签、解密、金额校验、事务、幂等、重复回调成功返回。
```

## 9. Review

```txt
请 review 当前 diff，重点检查金额篡改、重复支付回调、重复报名、后台鉴权、密钥泄露、订单状态流转、测试缺失、是否超出MVP范围。
```
