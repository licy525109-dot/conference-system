# 部署后 Smoke Test

更新时间：2026-06-18

## 适用场景

每次 main 自动部署到宝塔服务器后执行。本 smoke test 只检查生产可用性、静态包、数据库结构和关键状态枚举，不会登录后台，不会触发真实支付、真实退款、真实短信、真实企微群发或真实 AI 调用。

## 执行命令

在服务器项目目录执行：

```bash
cd /www/wwwroot/conference-system
bash scripts/smoke/check-production-config.sh
bash scripts/smoke/production-smoke.sh
```

可选环境变量：

```bash
API_BASE="${API_BASE:-https://guanchaohuiji.com/api}"
ADMIN_ROOT="${ADMIN_ROOT:-/www/wwwroot/admin.guanchaohuiji.com}"
PROJECT_DIR="${PROJECT_DIR:-/www/wwwroot/conference-system}"
PM2_PROCESS="${PM2_PROCESS:-conference-api}"
CMS_PAGE_KEY="${CMS_PAGE_KEY:-home}"
```

如果生产 CMS 首页不是 `home`，执行前指定：

```bash
CMS_PAGE_KEY=index bash scripts/smoke/production-smoke.sh
```

## `check-production-config.sh` 检查内容

- 加载 `${PROJECT_DIR}/.env.production`。
- 不打印任何 Secret 明文。
- 对核心必需项输出 `configured` 或 `missing`。
- 对可选 provider 输出 `disabled`、`configured` 或 fallback 提示。
- 微信支付、商城支付、退款、AI、短信、通知、账单下载按开关判断是否缺配置。

缺少 `DATABASE_URL`、`JWT_SECRET`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET` 会失败。

## `production-smoke.sh` 检查内容

1. API health：`GET /api/health`。
2. 公开会议接口：`GET /api/conferences?page=1&pageSize=1`。
3. 已发布 CMS 页面：`GET /api/pages/:pageKey/published`。
4. 动态底部导航：`GET /api/app/tabbar`。
5. 后台登录端点存在性：`POST /api/admin/auth/login`，允许 400/401/403，不能 404/502。
6. 上传静态资源路径：写入临时 smoke 文件后请求 `/api/uploads/:file`。
7. 数据库关键表存在：会议、报名订单、支付、商城、财务、通知、企微、AI、会员、CMS。
8. 关键枚举存在：`NotificationTaskStatus.SKIPPED`、`CustomerGroupMessageStatus.WAITING_CONFIRM`、`RefundStatus.REQUESTED/SUCCESS`、`PaymentStatus.SUCCESS`。
9. PM2 `conference-api` online。
10. 后台静态包不包含 `ReservedPage`、`功能建设中`、`预留页面`。

## 通过标准

脚本最后输出：

```text
Production config check passed.
Production smoke passed
```

## 常见失败处理

### API health 失败

```bash
pm2 status conference-api
pm2 logs conference-api --lines 100
curl http://127.0.0.1:3001/api/health
```

重点检查 PM2 是否 online、端口是否为 3001、Nginx `/api` 反向代理是否正确。

### CMS 页面失败

确认后台页面装修已发布目标 pageKey。可以临时指定正确 key：

```bash
CMS_PAGE_KEY=home bash scripts/smoke/production-smoke.sh
```

不要为了让 smoke 通过而在数据库中手动改发布状态。

### 上传路径失败

确认 API 进程工作目录是 `/www/wwwroot/conference-system`，并且 `uploads` 目录可写：

```bash
ls -ld /www/wwwroot/conference-system/uploads
```

### 数据库结构失败

确认部署脚本已经执行：

```bash
pnpm --filter @conference/api exec prisma migrate deploy --schema ../../prisma/schema.prisma
```

如果 migration 失败，先恢复数据库备份，不要跳过迁移直接重启 API。

### PM2 不在线

```bash
pm2 restart conference-api --update-env
pm2 logs conference-api --lines 100
```

如日志提示 Nest 依赖注入失败，说明当前 main 有启动级错误，应回滚。

### 后台静态包包含预留文案

重新构建并发布后台：

```bash
pnpm --filter @conference/admin build
grep -R -E "ReservedPage|功能建设中|预留页面" -n apps/admin/dist || true
```

如仍有输出，需要修源码，不要手工改 dist。

## 不做的事

Smoke test 不会：

- 使用后台账号密码登录。
- 触发真实微信支付。
- 触发真实微信退款。
- 发送真实短信或微信订阅消息。
- 创建企微群发任务。
- 调用真实 AI provider。
- 自动修复订单、支付、退款或对账差异。
