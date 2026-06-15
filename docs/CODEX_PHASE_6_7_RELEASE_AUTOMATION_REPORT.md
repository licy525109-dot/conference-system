# Codex Phase 6 + 7 Release Automation Report

## 1. 本次新增文档和脚本

新增部署文档：

- `docs/deploy/BAOTA_RELEASE_GUIDE.md`
- `docs/deploy/MINIPROGRAM_RELEASE_GUIDE.md`
- `docs/deploy/ENV_AND_SECRETS_POLICY.md`
- `docs/deploy/GITHUB_ACTIONS_MANUAL_DEPLOY.md`

新增脚本模板：

- `scripts/deploy/baota-deploy.example.sh`
- `scripts/deploy/baota-api-deploy.example.sh`
- `scripts/deploy/baota-rollback.example.sh`
- `scripts/miniprogram/upload-preview.example.js`

本阶段所有脚本均为模板或手动预案，不在本地执行真实部署，不触发真实服务器操作。

## 2. 本次新增 workflow

新增 GitHub Actions 手动 workflow：

- `.github/workflows/deploy-baota.manual.yml`
  - 仅支持 `workflow_dispatch`。
  - 不包含 `push` 自动部署触发。
  - 使用 `BAOTA_HOST`、`BAOTA_PORT`、`BAOTA_USER`、`BAOTA_SSH_KEY` 占位 Secrets。
  - 只远程执行服务器上已审核的脚本路径，默认 `/www/scripts/conference-system-deploy.sh`。

- `.github/workflows/miniprogram-preview.manual.yml`
  - 仅支持 `workflow_dispatch`。
  - 不包含 `push` 自动上传触发。
  - 默认 `dry-run`，只构建小程序，不执行 `miniprogram-ci`。
  - `preview` / `upload` 需要 `MP_APPID`、`MP_PRIVATE_KEY`。
  - 私钥通过 runner 临时文件传递，任务结束后删除。

## 3. 当前推荐发布流程

推荐继续保持“PR 审核后手动发布”：

1. 合并 PR 到 `main`。
2. 判断变更类型：文档、前端-only、后端/API、Prisma migration、小程序。
3. 文档-only：不部署服务器。
4. 前端-only：构建用户端 H5 和后台，rsync 静态文件。
5. 后端/API：人工确认后执行后端部署流程。
6. Prisma migration：必须先备份数据库，再人工确认 `migrate deploy`。
7. 小程序：通过微信开发者工具或手动 CI 预案上传体验版，审核发布仍走微信公众平台。

## 4. 前端-only 改动部署流程

适用于用户端 H5、后台前端和纯 UI 文案改动。

推荐命令：

```bash
cd /www/wwwroot/conference-system
git fetch origin
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm build:user:h5
pnpm build:admin
rsync -a --delete --exclude='.user.ini' apps/user/dist/build/h5/ /www/wwwroot/m.guanchaohuiji.com/
rsync -a --delete --exclude='.user.ini' apps/admin/dist/ /www/wwwroot/admin.guanchaohuiji.com/
curl http://127.0.0.1:3001/api/health
```

不需要：

- Prisma migrate
- `pm2 restart conference-api`
- 修改 `.env.production`

## 5. 后端/API 改动部署流程

适用于 `services/api/**` 或后端运行时行为变化。

要求：

- 人工确认 API 变更。
- 保持支付、金额、订单、报名状态逻辑的安全审查。
- 确认 `.env.production` 仍在服务器。
- 执行 `build:api`。
- 必要时重启 `conference-api`。
- 验证 `http://127.0.0.1:3001/api/health`。

后端模板：`scripts/deploy/baota-api-deploy.example.sh`。

## 6. Prisma 改动部署流程

适用于 `prisma/migrations/**` 变化。

要求：

- 先备份 PostgreSQL。
- 加载服务器 `.env.production`。
- 等待 PostgreSQL ready。
- 执行 `pnpm exec prisma migrate deploy --schema prisma/schema.prisma`。
- 禁止在生产使用 `prisma migrate dev`。
- 禁止在生产使用 `prisma migrate reset`。
- 迁移不会自动回滚。

## 7. 回滚策略

代码/静态资源回滚：

- 使用目标 commit hash。
- 回滚前输出当前 HEAD。
- 人工确认后 reset 到目标 commit。
- 重新 build user H5 / admin。
- rsync 静态文件。
- 验证 API health。

模板：`scripts/deploy/baota-rollback.example.sh`。

注意：

- 数据库 migration 不会自动回滚。
- 后端回滚需要单独判断是否 build API 和 restart PM2。

## 8. GitHub Actions 手动部署预案

`deploy-baota.manual.yml` 用于手动触发宝塔部署：

- GitHub runner 不内联大段部署命令。
- 通过 SSH 调用服务器上已审核脚本。
- 如果脚本不存在或不可执行，workflow 会清楚失败。
- 正式启用前，需人工把 `scripts/deploy/baota-deploy.example.sh` 审核后复制到 `/www/scripts/conference-system-deploy.sh` 并 `chmod +x`。

## 9. 小程序体验版发布预案

小程序发布不等同于宝塔部署。

推荐路径：

- 本地或 CI 构建 `pnpm build:user:mp-weixin`。
- 使用微信开发者工具上传体验版。
- 或手动触发 `.github/workflows/miniprogram-preview.manual.yml`。
- 默认先 dry-run，再 preview。
- upload 模式必须人工确认。

`miniprogram-ci` 示例脚本：`scripts/miniprogram/upload-preview.example.js`。

## 10. 环境变量和密钥管理策略

策略文档：`docs/deploy/ENV_AND_SECRETS_POLICY.md`。

核心规则：

- `.env.example` 只能放 mock / placeholder。
- 真实 `.env.production` 只保存在服务器。
- 微信 AppSecret、商户 API v3 key、证书、JWT_SECRET、Mini Program private key 不允许提交。
- 如真实 secret 曾进入 Git 历史，必须重置 secret。
- Codex 不读取、不打印、不提交真实密钥。
- 新增环境变量时只更新 `.env.example`，并在 PR 说明列出人工配置项。
- GitHub Actions 使用 GitHub Secrets，占位名称不等同真实值。

## 11. 未修改的业务代码/后端/支付/金额/Prisma/生产配置

本阶段未修改：

- `services/api/**`
- `prisma/**`
- `apps/user/src/**`
- `apps/admin/src/**`
- `packages/shared/**`
- `.env`
- `.env.local`
- `.env.production`
- `apps/admin/.env.production`
- `uploads/**`
- `services/api/uploads/**`
- `docker-compose.prod.yml`
- `start-api.sh`
- 任意证书、私钥、微信商户私钥、API v3 Key、AppSecret、JWT_SECRET
- 任意构建产物

本阶段未执行：

- 真实部署脚本
- 数据库迁移
- PM2 restart
- 真实服务器部署
- GitHub Actions workflow
- 小程序上传

## 12. 验证结果

- `git diff --check`
  - 结果：通过，无输出。
- `git diff --cached --check`
  - 结果：通过，无输出。
- `shellcheck scripts/deploy/baota-deploy.example.sh scripts/deploy/baota-api-deploy.example.sh scripts/deploy/baota-rollback.example.sh`
  - 结果：未运行；本地环境未安装 `shellcheck`，命令检查输出为 `shellcheck not found`。
- `bash -n scripts/deploy/baota-deploy.example.sh && bash -n scripts/deploy/baota-api-deploy.example.sh && bash -n scripts/deploy/baota-rollback.example.sh`
  - 结果：通过，无输出。
- `node --check scripts/miniprogram/upload-preview.example.js`
  - 结果：通过，无输出。
- `rg -n "^\\s*push:" .github/workflows`
  - 结果：通过，无输出；新增 workflow 未配置 `push` 自动触发。
- 禁止范围 diff 检查：`git diff --name-only -- services/api prisma apps/user/src apps/admin/src packages/shared .env .env.local .env.production apps/admin/.env.production uploads services/api/uploads docker-compose.prod.yml start-api.sh`
  - 结果：通过，无输出。
- workflow 触发状态
  - 结果：未触发 GitHub Actions workflow。
- 真实部署状态
  - 结果：未运行真实部署脚本、未执行数据库迁移、未执行 PM2 restart、未调用真实服务器部署、未上传小程序。

## 13. 后续建议

- 在真实服务器上由人工审核后复制部署脚本模板到 `/www/scripts/`。
- 为 `/www/scripts/conference-system-deploy.sh` 做一次 dry-run 式人工演练，确认路径、权限和 rsync 目标。
- 建立固定数据库备份目录和保留策略。
- 确认 GitHub Secrets 配置权限，仅允许可信维护者触发手动部署。
- 小程序 CI 先保持 dry-run/preview，不建议直接默认 upload。
- 后续如需要真正自动化后端部署，应单独做支付、金额、Prisma 和回滚专项评审。
