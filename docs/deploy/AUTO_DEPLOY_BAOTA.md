# Baota 自动部署说明

## 目标

合并到 `main` 后，GitHub Actions 自动 SSH 到宝塔服务器，在服务器本地完成拉取代码、备份、安装依赖、Prisma、构建、发布后台静态文件、重启 PM2 和健康检查。

也可以在 GitHub Actions 页面手动触发 `workflow_dispatch`。

## Workflow

文件：

```text
.github/workflows/deploy-baota.yml
```

名称：

```text
Deploy Baota Production
```

触发：

- push 到 `main`
- GitHub Actions 手动触发

并发：

- `baota-production-deploy`
- 不取消正在运行的部署

## GitHub 配置

必填 Secrets：

```text
BAOTA_HOST
BAOTA_PORT
BAOTA_USER
BAOTA_SSH_KEY
```

可选 Variables：

```text
BAOTA_PROJECT_DIR=/www/wwwroot/conference-system
BAOTA_ADMIN_ROOT=/www/wwwroot/admin.guanchaohuiji.com
BAOTA_H5_ROOT=/www/wwwroot/m.guanchaohuiji.com
BAOTA_H5_PUBLIC_URL=https://m.guanchaohuiji.com
```

如果不配置可选 Variables，workflow 使用上述默认值。

不要把 `.env.production`、数据库密码、微信支付证书、企微 Secret 写进 GitHub Actions。Actions 只负责 SSH 到服务器，生产密钥仍留在服务器。

## pnpm PATH 排查

如果 GitHub Actions 报：

```text
ERROR: missing required command: pnpm
```

但服务器手动执行：

```bash
bash -lc 'command -v pnpm && pnpm -v'
```

可以正常输出 pnpm，则说明 workflow 或 deploy script 没有在非交互 SSH shell 中加载宝塔 Node PATH。应确认 `baota-deploy.sh` 的 PATH 初始化在 `require_cmd pnpm` 之前，并确认 workflow 使用 `bash -lc` 执行。

宝塔服务器当前 pnpm 路径：

```text
/www/server/nvm/versions/node/v24.16.0/bin/pnpm
```

## 服务器脚本

文件：

```text
scripts/deploy/baota-deploy.sh
```

服务器上也可以直接执行：

```bash
cd /www/wwwroot/conference-system
bash scripts/deploy/baota-deploy.sh
```

可覆盖的环境变量：

```bash
PROJECT_DIR=/www/wwwroot/conference-system
ADMIN_ROOT=/www/wwwroot/admin.guanchaohuiji.com
H5_ROOT=/www/wwwroot/m.guanchaohuiji.com
H5_PUBLIC_URL=https://m.guanchaohuiji.com
BRANCH=main
API_HEALTH_LOCAL=http://127.0.0.1:3001/api/health
API_HEALTH_PUBLIC=https://guanchaohuiji.com/api/health
BACKUP_ROOT=/www/backup
PM2_PROCESS=conference-api
```

## 部署步骤

脚本按阶段输出日志，失败即退出：

1. 创建部署锁，避免并发部署。
2. 备份 `.env.production`、PostgreSQL、后台静态文件和用户端 H5 静态文件。
3. 拉取最新 `main`。
4. `pnpm install --frozen-lockfile`。
5. 加载服务器本地 `.env.production`，不打印内容。
6. `prisma generate` 和 `prisma migrate deploy`。
7. 构建 API、用户端 H5 和 Admin。
8. 检查 Admin dist 不含旧预留页关键字，并检查 H5 dist 包含 `pages/cms-preview/index`。
9. 发布用户端 H5 到 `/www/wwwroot/m.guanchaohuiji.com`，发布后台静态文件到 `/www/wwwroot/admin.guanchaohuiji.com`。
10. `nginx -t && nginx -s reload`。
11. `pm2 restart conference-api --update-env`。
12. 检查本机、公网 API health 和用户端 H5 公网地址。
13. 输出 PM2 状态和最近日志。

## 备份位置

每次部署都会创建：

```text
/www/backup/conference-system-auto-deploy-YYYYMMDD-HHMMSS
```

包含：

```text
.env.production
conference_dev.sql
admin-static/
user-h5-static/
```

## 失败处理

失败时脚本会输出：

- 失败阶段。
- 备份目录。
- 如果后台静态文件已被清理或覆盖，会提示从 `admin-static` 手动恢复。

脚本不会：

- 自动 drop 数据库。
- 自动 reset 数据库。
- 删除 `.env.production`。
- 在 GitHub Actions 拉取或打印生产密钥。

## 手动恢复后台静态文件

将 `BACKUP` 替换为实际备份目录：

```bash
ADMIN_ROOT=/www/wwwroot/admin.guanchaohuiji.com
BACKUP=/www/backup/conference-system-auto-deploy-xxxx/admin-static

find "$ADMIN_ROOT" -mindepth 1 -maxdepth 1 ! -name ".user.ini" -exec rm -rf {} +
cp -a "$BACKUP"/. "$ADMIN_ROOT"/
nginx -t && nginx -s reload
```

## 验证命令

部署后应能通过：

```bash
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS https://guanchaohuiji.com/api/health
grep -R -E "ReservedPage|功能建设中|预留页面" -n /www/wwwroot/conference-system/apps/admin/dist || true
pm2 status conference-api
```
