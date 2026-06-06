# Mac + Codex App 版会议系统 MVP 操作手册

> 版本：v2.0 - Mac / Codex App 专用版  
> 日期：2026-06-05  
> 目标：先快速上线“会议线上报名缴费 + 基本信息显示”，再逐步扩展会员、商城、AI 问答、抖音/小红书/B站渠道能力。

---

## 0. 这份手册适合谁

你已经安装了：

- Codex App（Mac 版）
- 微信开发者工具

你希望按步骤让 Codex App 帮你开发一个可上线的会议系统 MVP。第一阶段只做最小闭环：

1. 用户能在微信小程序 / H5 看到会议首页和会议详情。
2. 用户能选择报名规格，例如“住宿+参会 1000 元”“仅参会 700 元”。
3. 用户能填写报名信息。
4. 后端能生成报名订单。
5. 后端能计算金额。
6. 用户能发起微信支付。
7. 微信支付回调成功后，系统生成正式报名记录。
8. 用户能查看“我的报名信息”。
9. 后台能配置会议、报名规格、报名字段，并查看订单和报名名单。

暂时不做：会员、商城、AI 问答、复杂页面装修、多平台抖音/小红书/B站、自动退款、发票、签到核销、复杂库存锁定策略。这些在 MVP 稳定后逐步加。

---

## 1. MVP 总路线图

按照下面顺序做，不要跳步：

| 阶段 | 目标 | 结果 |
|---|---|---|
| A | Mac 开发环境准备 | Mac 上能运行 Node、pnpm、Docker、Git |
| B | 创建项目仓库 | 有一个干净 Git 项目，Codex App 可打开 |
| C | 导入 Starter 包 | 项目里有 AGENTS.md、.codex/config.toml、Skills、Docker Compose |
| D | 配置 Codex App | Codex App 能识别项目、配置、Skills、内置终端 |
| E | 让 Codex 先写文档 | 生成 PRD、架构、数据库、API、任务拆分 |
| F | 初始化代码工程 | 建立 apps/user、apps/admin、services/api、packages/shared |
| G | 实现后端和数据库 | 会议、规格、表单、订单、支付、报名记录 |
| H | 实现用户端 | 首页、会议详情、报名页、支付页、我的报名 |
| I | 实现后台端 | 会议管理、规格管理、字段管理、订单报名列表 |
| J | 接微信支付 | 先 mock，再接真实微信支付 V3 |
| K | 上线验收 | 域名、HTTPS、回调、日志、备份、隐私合规 |

---

## 2. 推荐 MVP 技术栈

为了最快上线，同时便于后面扩展会员、商城、AI 问答，建议第一版用：

```txt
用户端：uni-app + Vue3 + TypeScript
后台管理端：Vue3 + Vite + Element Plus
后端 API：NestJS + TypeScript
数据库：PostgreSQL
缓存/锁：Redis
ORM：Prisma
包管理器：pnpm
本地容器：Docker Desktop for Mac
支付：微信支付 API v3，小程序 JSAPI 支付；H5 支付后续接
```

项目结构建议：

```txt
conference-system/
  apps/
    user/                 # uni-app 用户端：微信小程序 + H5
    admin/                # 后台管理端
  services/
    api/                  # NestJS 后端
  packages/
    shared/               # 共享类型、DTO、常量
  prisma/
    schema.prisma
    migrations/
  docs/
    PRD.md
    ARCHITECTURE.md
    DATABASE.md
    API.md
    TASKS.md
    TEST_PLAN.md
  .codex/
    config.toml
  .agents/
    skills/
  AGENTS.md
  docker-compose.yml
  pnpm-workspace.yaml
  package.json
```

---

## 3. Mac 环境准备清单

### 3.1 查看 Mac 芯片和系统

打开“终端 Terminal”，执行：

```bash
sw_vers
uname -m
```

结果说明：

```txt
arm64：Apple Silicon，例如 M1/M2/M3/M4
x86_64：Intel Mac
```

后面安装 Docker Desktop、Codex App、部分二进制工具时，Apple Silicon 和 Intel 可能下载不同版本。

---

### 3.2 安装 Xcode Command Line Tools

```bash
xcode-select --install
```

安装后验证：

```bash
xcode-select -p
git --version
```

如果 `git --version` 能输出版本号，说明基础命令行工具可用。

---

### 3.3 安装 Homebrew

先检查是否已经安装：

```bash
brew --version
```

如果提示 `command not found: brew`，执行：

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Apple Silicon 常见路径是 `/opt/homebrew`，Intel 常见路径是 `/usr/local`。安装结束后按终端提示执行 shellenv 命令。Apple Silicon 通常是：

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

Intel 通常是：

```bash
echo 'eval "$(/usr/local/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/usr/local/bin/brew shellenv)"
```

验证：

```bash
brew doctor
```

看到 `Your system is ready to brew.` 或只有轻微 warning 即可继续。

---

### 3.4 安装 Node.js、pnpm、Git、jq

推荐使用 Node.js LTS。你可以用官方安装包，也可以用 Homebrew。为了少折腾，第一版可以直接用 Homebrew：

```bash
brew install node git jq openssl
node -v
npm -v
```

启用 pnpm：

```bash
corepack enable pnpm
corepack prepare pnpm@latest --activate
pnpm -v
```

如果 `corepack` 不存在，说明你的 Node 安装方式可能没有附带 Corepack，可以先执行：

```bash
npm i -g corepack
corepack enable pnpm
corepack prepare pnpm@latest --activate
```

项目内建议固定 pnpm 版本。等 Codex 初始化项目后，在项目根目录执行：

```bash
corepack use pnpm@latest
```

---

### 3.5 安装 Docker Desktop for Mac

你需要 Docker 来本地启动 PostgreSQL 和 Redis。

安装方式：

1. 打开 Docker Desktop 官方下载页。
2. Apple Silicon 下载 Apple Silicon 版本。
3. Intel Mac 下载 Intel 版本。
4. 把 Docker 拖入 Applications。
5. 第一次打开 Docker Desktop，根据提示授权。

验证：

```bash
docker version
docker compose version
```

如果命令可用，继续。

---

### 3.6 推荐安装的辅助工具

这些不是强制，但能显著提高排查效率：

```bash
brew install --cask visual-studio-code
brew install --cask apifox
brew install --cask dbeaver-community
```

说明：

| 工具 | 用途 |
|---|---|
| VS Code | Codex App 点击文件时更方便打开代码 |
| Apifox / Postman | 调试后端 API、支付回调、登录接口 |
| DBeaver | 查看 PostgreSQL 数据库表和数据 |
| HBuilderX | 可选；如果你习惯 DCloud 可视化运行 uni-app，可以安装 |

你已经安装微信开发者工具，不需要重复安装。

---

## 4. 微信上线前需要准备的资料

MVP 开发阶段可以先 mock 支付，但真实上线前需要：

```txt
1. 微信小程序账号
2. 小程序 AppID
3. 小程序 AppSecret
4. 微信支付商户号 MCH_ID
5. 微信支付 API v3 Key
6. 商户 API 证书序列号
7. 商户 API 私钥 apiclient_key.pem
8. 支付回调 notify_url，必须是 HTTPS
9. 已备案域名，尤其是大陆服务器/H5支付场景
10. 小程序后台配置 request 合法域名
11. 小程序后台配置 uploadFile/downloadFile 合法域名，如后面需要上传文件
12. 用户协议、隐私政策、退款规则、客服电话
```

第一阶段开发时可以只填：

```txt
WECHAT_APP_ID=你的小程序 AppID
WECHAT_APP_SECRET=先空着或开发环境 mock
WECHAT_PAY_MOCK=true
```

等功能跑通后，再把微信支付真实参数填完整。

---

## 5. 创建本地项目目录

建议统一把代码放在：

```bash
mkdir -p ~/Projects
cd ~/Projects
mkdir conference-system
cd conference-system
git init
```

设置 Git 用户信息，如果以前没有设置：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

创建初始分支：

```bash
git branch -M main
```

---

## 6. 导入本手册附带的 Starter 包

你会拿到一个 zip：

```txt
conference_mvp_mac_codex_app_starter.zip
```

解压后会看到：

```txt
AGENTS.md
.codex/config.toml
.env.example
.gitignore
docker-compose.yml
pnpm-workspace.yaml
package.json
docs/
scripts/
.agents/skills/
```

把它复制到项目根目录。推荐用 `rsync`，因为它能复制隐藏目录：

```bash
cd ~/Projects/conference-system
rsync -av /你的解压目录/conference_mvp_mac_codex_app_starter/ ./
```

验证隐藏目录是否复制成功：

```bash
ls -la
ls -la .codex
ls -la .agents/skills
```

提交一次初始配置：

```bash
git add .
git commit -m "chore: add mac codex app starter"
```

---

## 7. Codex App 正确配置

### 7.1 打开项目

1. 打开 Codex App。
2. 登录 ChatGPT 账号或 OpenAI API key。
3. 选择 `~/Projects/conference-system` 作为项目文件夹。
4. 如果出现 Trust Project / 信任项目提示，选择信任。项目级 `.codex/config.toml` 只有在可信项目里才会加载。
5. 新建第一个 thread 时选择 `Local`，先不要选 Cloud。

推荐第一条消息：

```txt
请先只读取当前项目，不要修改任何文件。请检查并总结：
1. 当前项目目录结构
2. AGENTS.md 中的强制规则
3. .codex/config.toml 的配置含义
4. .agents/skills 下有哪些 skills
5. 当前 MVP 范围是什么
6. 你建议先做哪一个最小任务
```

Codex 应该能读到 AGENTS.md 和 Skills。如果它说没看到 Skills，检查 `.agents/skills/<skill>/SKILL.md` 是否存在，并重启 Codex App。

---

### 7.2 Codex App Settings 建议

在 Codex App 中按：

```txt
Cmd + ,
```

建议设置：

| 设置项 | 建议 |
|---|---|
| Default editor | VS Code 或你常用编辑器 |
| Notifications | 开启任务完成提醒 |
| Terminal | 使用内置 Terminal 即可 |
| Agent configuration | 优先用项目里的 `.codex/config.toml` |
| Approval | 保持需要确认的模式，不要直接 full access |
| Sandbox | workspace-write，避免 danger-full-access |
| Worktrees | 后续每个功能用 worktree，避免污染 main |
| Computer Use | 只在需要操作微信开发者工具 GUI 时启用 |

如果要让 Codex 操作微信开发者工具或浏览器界面，需要在 Codex App Settings 里安装 Computer Use 插件，并在 macOS 系统设置中授权 Screen Recording 和 Accessibility。开发业务代码时优先使用文件和命令行，不要让 Codex 随意控制桌面。

---

### 7.3 `.codex/config.toml` 推荐内容

Starter 包里已经放好了项目级配置：

```toml
model = "gpt-5.5"
model_reasoning_effort = "high"
model_verbosity = "medium"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
web_search = "cached"
project_doc_max_bytes = 120000
project_root_markers = ["pnpm-workspace.yaml", "package.json", ".git"]

[sandbox_workspace_write]
network_access = false
exclude_tmpdir_env_var = true
exclude_slash_tmp = true

[shell_environment_policy]
inherit = "core"
include_only = [
  "PATH",
  "HOME",
  "SHELL",
  "USER",
  "TMPDIR",
  "PNPM_HOME",
  "NODE_ENV",
  "DATABASE_URL",
  "REDIS_URL"
]
```

解释：

| 配置 | 作用 |
|---|---|
| `model` | 默认使用的模型 |
| `model_reasoning_effort` | 复杂工程任务使用高推理强度 |
| `approval_policy=on-request` | Codex 执行敏感命令前向你确认 |
| `sandbox_mode=workspace-write` | Codex 可写当前项目目录，但不能乱改全盘 |
| `web_search=cached` | 允许 Codex 在需要时查资料 |
| `network_access=false` | 默认不让 sandbox 命令访问外网，避免自动乱装依赖 |

注意：

- 第一次 `pnpm install` 建议你自己在终端运行。
- 如果你明确要让 Codex 安装依赖，可以临时把 `network_access = true`，完成后再改回 false。
- 不要把微信支付密钥、OpenAI API key、小程序 AppSecret 写进 `.codex/config.toml` 或 AGENTS.md。

---

### 7.4 Codex App 的 Local、Worktree、Cloud 怎么选

| 模式 | 什么时候用 | 建议 |
|---|---|---|
| Local | 初始化项目、运行本地服务、你想直接改当前目录 | 第一次验证用 Local |
| Worktree | 每个功能独立开发、避免污染 main | MVP 功能开发推荐使用 |
| Cloud | 远程任务、连接 GitHub 后让 Codex 在云端工作 | 第一版先不用，等项目稳定后再用 |

推荐流程：

```txt
初始导入 Starter：Local
让 Codex 读项目：Local
生成 docs：Worktree
初始化 monorepo：Worktree
实现后端：Worktree
实现前端：Worktree
接支付：Worktree
最终验收：Local
```

如果你用 Worktree，项目必须是 Git 仓库，所以前面已经执行 `git init`。

---

### 7.5 Codex App Local Environment / Actions 建议

Codex App 支持在项目中配置常用操作，例如安装依赖、启动后端、跑测试。由于不同版本 UI 细节可能变化，最稳的方式是在 Codex App 的项目 Settings 里手动添加这些 Actions：

| Action 名称 | 命令 |
|---|---|
| Install deps | `pnpm install` |
| Start DB | `docker compose up -d postgres redis` |
| Stop DB | `docker compose down` |
| API dev | `pnpm dev:api` |
| User H5 dev | `pnpm dev:user:h5` |
| User WeChat build | `pnpm dev:user:mp-weixin` |
| Admin dev | `pnpm dev:admin` |
| Prisma migrate | `pnpm prisma:migrate` |
| Prisma studio | `pnpm prisma:studio` |
| Test | `pnpm test` |
| Typecheck | `pnpm typecheck` |
| Lint | `pnpm lint` |

Worktree setup script 建议：

```bash
corepack enable pnpm
pnpm install
```

如果你让 worktree 自动跑 `pnpm install`，需要临时允许网络访问，或者由你手动执行。

---

## 8. 安装和验证 Skills

Starter 包已经把项目专属 Skills 放到：

```txt
.agents/skills/
```

包含：

```txt
conference-mvp-architect
mac-codex-app-workflow
uniapp-wechat-h5
registration-order-pricing
wechat-pay-idempotency
dynamic-form-mvp
qa-release-checklist
deployment-observability-mvp
```

每个 Skill 都有：

```txt
SKILL.md
agents/openai.yaml
references/*.md
```

验证方式：

1. 打开 Codex App。
2. 打开项目 `~/Projects/conference-system`。
3. 在 thread 里输入：

```txt
请列出当前项目可用的 skills，并说明每个 skill 适合什么任务。不要修改文件。
```

4. 如果 Codex 没识别，检查目录：

```bash
find .agents/skills -maxdepth 2 -name SKILL.md -print
```

5. 目录正确但 Codex 仍没识别时，重启 Codex App。

---

## 9. 第一次让 Codex 生成项目文档

先不要写代码。先让 Codex 根据 MVP 范围生成文档，后面所有开发都按文档做。

在 Codex App 新建 Worktree thread，输入：

```txt
请使用 conference-mvp-architect、registration-order-pricing、wechat-pay-idempotency、dynamic-form-mvp、qa-release-checklist 这些 skills。

当前目标：先实现会议线上报名缴费和基本信息显示 MVP，不做会员、商城、AI 问答、多平台渠道。

请先不要写业务代码，只在 docs/ 下生成或更新：
1. PRD.md：MVP产品需求
2. ARCHITECTURE.md：MVP架构设计
3. DATABASE.md：数据库模型
4. API.md：接口设计
5. TASKS.md：按里程碑拆分开发任务
6. TEST_PLAN.md：测试计划

MVP功能范围：
- 用户微信登录，开发环境允许 mock。
- 首页显示会议列表。
- 会议详情显示标题、时间、地点、封面、详情内容、报名规格。
- 报名规格支持不同价格，例如住宿+参会1000元，仅参会700元。
- 报名前根据后台配置填写动态报名字段。
- 后端创建报名订单并重新计算金额。
- 开发环境支持 mock 支付。
- 正式环境预留微信支付 API v3。
- 支付成功回调后生成 Registration。
- 用户可以查看我的报名信息。
- 后台可配置会议、报名规格、报名字段，可查看订单和报名名单。

强制规则：
- 所有金额用分，Int。
- 前端不能传最终可信金额。
- 创建订单时后端必须重新计价。
- 支付回调必须验签、校验金额、事务处理、幂等处理。
- AppSecret、商户私钥、API v3 Key 不得写入代码。
- 每个任务完成后必须说明修改文件、验证方式、测试结果。

完成后停下来，等待我 review，不要继续写代码。
```

Codex 生成文档后，你做三件事：

```bash
git status
git diff -- docs
```

阅读文档，确认没有超出 MVP 范围。确认后：

```bash
git add docs

git commit -m "docs: define conference registration mvp"
```

---

## 10. 让 Codex 初始化项目工程

新建 Worktree thread，输入：

```txt
请阅读 AGENTS.md 和 docs/ 下所有 MVP 文档，使用 mac-codex-app-workflow、conference-mvp-architect、uniapp-wechat-h5、qa-release-checklist skills。

任务：初始化 MVP monorepo 工程。

请创建：
- apps/user：uni-app + Vue3 + TypeScript，支持 H5 和 mp-weixin。
- apps/admin：Vue3 + Vite + TypeScript + Element Plus。
- services/api：NestJS + TypeScript。
- packages/shared：共享类型和常量。
- prisma：Prisma schema 目录。

要求：
1. 使用 pnpm workspace。
2. 根目录 package.json 配置 scripts：
   - dev:api
   - dev:user:h5
   - dev:user:mp-weixin
   - dev:admin
   - test
   - lint
   - typecheck
   - prisma:migrate
   - prisma:studio
3. services/api 提供 GET /health。
4. apps/user 有一个 Hello Conference 页面。
5. apps/admin 有一个 Hello Admin 页面。
6. 不接真实微信支付，只保留 mock 配置。
7. 不要把密钥写进代码。
8. 完成后运行 pnpm install、typecheck 或说明无法运行的原因。
```

如果 Codex 因网络限制无法安装依赖，你在终端手动运行：

```bash
cd ~/Projects/conference-system
pnpm install
pnpm typecheck
```

然后把错误复制给 Codex：

```txt
我执行 pnpm typecheck 得到以下错误，请修复最小代码路径，不要扩大范围：
<粘贴错误>
```

---

## 11. 启动数据库

Starter 包提供了 `docker-compose.yml`：

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: conference
      POSTGRES_PASSWORD: conference_dev_password
      POSTGRES_DB: conference_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
```

启动：

```bash
docker compose up -d postgres redis
docker compose ps
```

创建本地环境变量：

```bash
cp .env.example .env
```

`.env` 第一版可用：

```env
NODE_ENV=development
API_PORT=3000
DATABASE_URL="postgresql://conference:conference_dev_password@localhost:5432/conference_dev?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="replace-with-local-dev-secret"
WECHAT_PAY_MOCK=true
WECHAT_APP_ID="your-wechat-mini-program-app-id"
WECHAT_APP_SECRET="dev-mock-secret"
WECHAT_PAY_NOTIFY_URL="https://your-domain.com/api/payments/wechat/notify"
```

---

## 12. 让 Codex 实现数据库模型和 seed

新建 Worktree thread：

```txt
请阅读 docs/DATABASE.md 和 AGENTS.md，使用 registration-order-pricing、dynamic-form-mvp、wechat-pay-idempotency、qa-release-checklist skills。

任务：实现 MVP Prisma schema、migration 和 seed。

至少包含模型：
- User
- AdminUser
- Conference
- ConferencePage
- RegistrationSku
- FormDefinition
- FormField
- Order
- OrderItem
- Payment
- Registration

要求：
1. 所有金额字段使用 Int，单位为分。
2. 订单号 orderNo 唯一。
3. outTradeNo 唯一。
4. status 使用 enum。
5. Conference 状态支持 draft/published/closed。
6. RegistrationSku 支持 priceCent、stock、soldCount。
7. FormField 支持 type、required、validationJson、optionsJson、sortOrder。
8. Order 支持 totalAmountCent、discountAmountCent、payableAmountCent、paidAmountCent。
9. Payment 支持 rawNotifyJson，但不要记录密钥。
10. seed 生成：
   - 一个已发布会议
   - 两个报名规格：住宿+参会 100000 分，仅参会 70000 分
   - 一个动态报名表单：姓名、手机号、公司、职务
   - 一个后台管理员账号，密码从环境变量或开发默认 hash 生成
11. 添加基础单元测试。
12. 完成后运行 prisma migrate dev、prisma db seed、pnpm test 或说明原因。
```

你执行：

```bash
pnpm prisma:migrate
pnpm prisma:seed
pnpm prisma:studio
```

打开 Prisma Studio 看 seed 数据是否存在。

---

## 13. 让 Codex 实现后端核心 API

新建 Worktree thread：

```txt
请实现 MVP 后端 API。使用 conference-mvp-architect、registration-order-pricing、dynamic-form-mvp、wechat-pay-idempotency、qa-release-checklist skills。

接口范围：

公开用户端：
- GET /api/health
- POST /api/auth/wechat/login
- GET /api/conferences
- GET /api/conferences/:id
- GET /api/conferences/:id/registration-form
- POST /api/registration/quote
- POST /api/registration/orders
- GET /api/me/registrations
- GET /api/me/registrations/:id

支付：
- POST /api/payments/wechat/prepay
- POST /api/payments/wechat/notify
- GET /api/orders/:orderNo/payment-status

后台：
- POST /api/admin/auth/login
- GET /api/admin/conferences
- POST /api/admin/conferences
- PUT /api/admin/conferences/:id
- POST /api/admin/conferences/:id/skus
- PUT /api/admin/skus/:id
- POST /api/admin/conferences/:id/form-fields
- PUT /api/admin/form-fields/:id
- GET /api/admin/orders
- GET /api/admin/registrations

强制要求：
1. 开发环境微信登录允许 mock openid。
2. 前端不能传最终可信金额。
3. quote 只用于展示，create order 必须重新计算。
4. 支付 mock 模式下可以模拟支付成功。
5. 微信支付真实参数只从环境变量读取。
6. 后台接口必须鉴权。
7. 错误返回结构统一。
8. 添加 service 层测试，覆盖金额计算、订单创建、重复支付回调。
```

后端完成后，你验证：

```bash
pnpm dev:api
curl http://localhost:3000/api/health
curl http://localhost:3000/api/conferences
```

---

## 14. 让 Codex 实现用户端小程序/H5

新建 Worktree thread：

```txt
请实现 apps/user 的 MVP 用户端页面，使用 uniapp-wechat-h5、dynamic-form-mvp、registration-order-pricing、qa-release-checklist skills。

页面：
1. 首页：会议列表
2. 会议详情页：会议标题、封面、时间、地点、详情内容、报名规格
3. 报名页：选择规格，渲染动态报名表单，提交前端基础校验
4. 订单确认页：展示原价、优惠、应付金额；第一版优惠为0
5. 支付结果页：展示支付状态
6. 我的报名页：展示报名信息

要求：
- API baseURL 通过环境配置。
- H5 和微信小程序都能运行。
- 微信端使用 wx.login 获取 code，开发环境可 mock。
- 支付调用封装为 payment service，开发环境 mock 支付。
- 不要把金额计算写死在前端。
- 金额展示由分转元。
- 表单字段来自后端 FormField。
- 完成后运行 H5 和 mp-weixin 构建命令。
```

验证 H5：

```bash
pnpm dev:user:h5
```

验证微信小程序：

```bash
pnpm dev:user:mp-weixin
```

然后打开微信开发者工具：

1. 选择“导入项目”。
2. 项目目录选 `apps/user/dist/dev/mp-weixin` 或 Codex 生成脚本提示的目录。
3. 填你的 AppID；开发阶段也可以用测试号。
4. 开启“不校验合法域名、web-view、TLS 版本以及 HTTPS 证书”，仅限本地开发。
5. 运行首页、详情页、报名页、支付 mock 流程。

---

## 15. 让 Codex 实现后台管理端

新建 Worktree thread：

```txt
请实现 apps/admin 的 MVP 后台，使用 conference-mvp-architect、dynamic-form-mvp、registration-order-pricing、qa-release-checklist skills。

页面：
1. 登录页
2. 会议列表
3. 创建/编辑会议
4. 报名规格管理
5. 报名字段管理
6. 订单列表
7. 报名名单

要求：
- 使用 Vue3 + Vite + Element Plus。
- 登录 token 存储要简单安全，第一版可 localStorage，但封装 auth service。
- 后台 API 请求统一封装。
- 后台接口错误统一提示。
- 报名字段支持 text/phone/email/select/radio/date。
- 可以配置 required、placeholder、sortOrder。
- 订单金额用分转元显示。
- 不要实现会员、商城、AI。
```

验证：

```bash
pnpm dev:admin
```

进入后台后测试：

```txt
1. 新建会议
2. 添加两个规格
3. 添加报名字段
4. 前台能看到会议
5. 前台能提交报名订单
6. 后台能看到订单和报名记录
```

---

## 16. 微信支付接入顺序

强烈建议三步走：

```txt
第一步：mock 支付
第二步：沙箱/开发配置验证签名、回调、查单逻辑
第三步：真实商户号上线
```

### 16.1 mock 支付阶段

`.env`：

```env
WECHAT_PAY_MOCK=true
```

要求：

```txt
1. 创建订单后状态 pending。
2. 点击支付调用 mock prepay。
3. mock 支付成功后调用后端 mock notify 或 test endpoint。
4. 后端把订单改为 paid。
5. 后端生成 Registration。
6. 再次调用 mock notify，不重复生成 Registration。
```

### 16.2 真实微信支付阶段

`.env.production` 需要：

```env
WECHAT_PAY_MOCK=false
WECHAT_APP_ID="小程序AppID"
WECHAT_APP_SECRET="小程序AppSecret"
WECHAT_PAY_MCH_ID="商户号"
WECHAT_PAY_API_V3_KEY="APIv3密钥"
WECHAT_PAY_CERT_SERIAL_NO="证书序列号"
WECHAT_PAY_PRIVATE_KEY_PATH="/secure/path/apiclient_key.pem"
WECHAT_PAY_NOTIFY_URL="https://api.yourdomain.com/api/payments/wechat/notify"
```

支付回调必须做到：

```txt
1. 验证微信支付平台证书签名。
2. 解密回调报文。
3. 用 outTradeNo 找本地订单。
4. 校验金额是否等于本地 payableAmountCent。
5. 使用数据库事务处理状态变化。
6. 使用唯一约束或锁防止重复处理。
7. paid 订单收到重复通知直接返回成功。
8. 成功后生成 Registration。
9. 失败时记录 Payment 日志，但不记录密钥。
```

给 Codex 的提示：

```txt
请实现微信支付 API v3 真实接入。使用 wechat-pay-idempotency skill。

要求：
- 保留 mock 模式。
- 真实模式只从环境变量读取商户号、证书序列号、私钥路径、API v3 Key、notify_url。
- notify 必须验签、解密、校验金额、幂等、事务处理。
- 如果订单已经 paid，重复回调直接返回微信要求的成功响应。
- 支付成功后生成 Registration，不能重复生成。
- 添加测试：正常回调、重复回调、金额不一致、订单不存在、签名失败。
```

---

## 17. 本地验收清单

### 17.1 后端验收

```bash
pnpm dev:api
curl http://localhost:3000/api/health
```

检查：

```txt
[ ] /api/health 返回 ok
[ ] GET /api/conferences 有 seed 会议
[ ] GET /api/conferences/:id 有两个规格
[ ] GET /api/conferences/:id/registration-form 有动态字段
[ ] POST /api/registration/quote 返回金额分
[ ] POST /api/registration/orders 创建 pending 订单
[ ] mock 支付后订单变 paid
[ ] paid 后生成 Registration
[ ] 重复 mock notify 不重复生成 Registration
```

### 17.2 用户端验收

```txt
[ ] H5 首页能打开
[ ] 小程序首页能打开
[ ] 会议列表显示正确
[ ] 详情页显示时间、地点、规格
[ ] 选择“住宿+参会”显示1000元
[ ] 选择“仅参会”显示700元
[ ] 报名字段按后台配置渲染
[ ] 必填字段为空时不能提交
[ ] 提交后生成订单
[ ] mock 支付成功后跳转成功页
[ ] 我的报名能看到报名记录
```

### 17.3 后台验收

```txt
[ ] 管理员可登录
[ ] 可创建会议
[ ] 可编辑会议标题、时间、地点、封面、详情
[ ] 可新增/编辑报名规格
[ ] 可配置报名字段
[ ] 可查看订单列表
[ ] 可查看报名名单
[ ] 后台接口未登录不能访问
```

### 17.4 安全验收

```txt
[ ] .env 没有提交到 Git
[ ] AppSecret 没有写进代码
[ ] API v3 Key 没有写进代码
[ ] 私钥文件没有提交到 Git
[ ] 金额全部用分 Int
[ ] 创建订单时后端重新计价
[ ] 支付回调幂等
[ ] 后台接口鉴权
[ ] 日志不输出手机号之外的敏感信息；若有身份证字段必须脱敏
```

---

## 18. Git 提交流程

每完成一个小任务就提交：

```bash
git status
git diff
pnpm test
pnpm typecheck
git add .
git commit -m "feat: implement registration order quote"
```

建议提交粒度：

```txt
1. docs: define mvp
2. chore: init monorepo
3. feat(api): add database schema and seed
4. feat(api): add conference APIs
5. feat(api): add registration quote and order
6. feat(user): add conference list and detail pages
7. feat(user): add registration flow
8. feat(admin): add conference management
9. feat(payment): add mock payment flow
10. feat(payment): add wechat pay v3 notify idempotency
```

---

## 19. 让 Codex 做 Review 的固定提示词

每个功能完成后，在 Codex App 中开一个 review thread：

```txt
请 review 当前 diff，使用 qa-release-checklist、registration-order-pricing、wechat-pay-idempotency skills。

重点检查：
1. 前端是否能篡改金额
2. 创建订单是否重新计价
3. 支付回调是否验签、校验金额、事务处理、幂等
4. 重复支付回调是否会重复生成报名记录
5. 后台接口是否都有鉴权
6. 是否有密钥或 .env 被提交
7. 是否有订单状态流转漏洞
8. 是否有缺失测试
9. 是否超出 MVP 范围

请输出：
- 高风险问题
- 中风险问题
- 可优化项
- 必须修复的文件列表
- 建议的测试命令
```

---

## 20. 上线前准备

### 20.1 服务器和域名

最小上线配置：

```txt
1. 一台云服务器，例如腾讯云/阿里云。
2. 一个备案域名。
3. HTTPS 证书。
4. PostgreSQL，生产建议用云数据库。
5. Redis，生产建议用云 Redis。
6. Nginx 反向代理。
7. 对象存储，后续放图片、资料、电子参会证。
```

生产环境建议：

```txt
api.yourdomain.com      -> NestJS API
admin.yourdomain.com    -> 后台管理端
event.yourdomain.com    -> H5 用户端
```

微信小程序后台需要配置：

```txt
request 合法域名：https://api.yourdomain.com
uploadFile 合法域名：https://api.yourdomain.com 或对象存储域名
downloadFile 合法域名：https://api.yourdomain.com 或对象存储域名
```

### 20.2 生产部署最小流程

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm prisma:migrate:deploy
pm2 start ecosystem.config.js
```

或使用 Docker 部署。第一版为了快，可以先用 PM2，后续再容器化。

### 20.3 微信小程序发布

```txt
1. 在微信开发者工具中打开 mp-weixin 构建目录。
2. 确认 AppID 正确。
3. 关闭“不校验合法域名”调试开关。
4. 真机预览。
5. 上传代码。
6. 在微信公众平台提交审核。
7. 审核通过后发布。
```

---

## 21. 常见问题排查

### 21.1 Codex 看不到 Skills

检查：

```bash
find .agents/skills -maxdepth 2 -name SKILL.md -print
```

处理：

```txt
1. 确认 Codex App 打开的目录是项目根目录。
2. 确认 .agents/skills 在项目根目录下。
3. 重启 Codex App。
4. 提示 Codex：“请重新扫描项目 skills”。
```

### 21.2 Codex 说不能写文件

原因可能是：

```txt
1. 项目未信任。
2. sandbox 是 read-only。
3. 打开的不是项目根目录。
4. macOS 权限不允许访问该目录。
```

处理：

```txt
1. 确认项目被 Codex App 信任。
2. 检查 .codex/config.toml 的 sandbox_mode。
3. 把项目放在 ~/Projects，不要放在 Desktop/Downloads 等可能触发额外权限的位置。
```

### 21.3 pnpm install 失败

处理：

```bash
node -v
corepack enable pnpm
corepack prepare pnpm@latest --activate
pnpm store prune
pnpm install
```

如果是网络问题，换网络或配置 npm registry：

```bash
pnpm config set registry https://registry.npmmirror.com
pnpm install
```

注意：生产和 CI 最好使用官方 registry，镜像源只作为本地排障。

### 21.4 Docker 连接不上 PostgreSQL

检查：

```bash
docker compose ps
docker logs conference_postgres
lsof -i :5432
```

如果 5432 被占用：

```yaml
ports:
  - "5433:5432"
```

然后修改：

```env
DATABASE_URL="postgresql://conference:conference_dev_password@localhost:5433/conference_dev?schema=public"
```

### 21.5 微信开发者工具打不开项目

检查：

```txt
1. 是否选择了正确的 mp-weixin 输出目录。
2. 是否先运行 pnpm dev:user:mp-weixin。
3. manifest.json 里的 mp-weixin appid 是否正确。
4. 是否关闭了开发阶段的合法域名校验。
```

### 21.6 支付回调收不到

检查：

```txt
1. notify_url 是否 HTTPS。
2. notify_url 是否外网可访问。
3. 服务器防火墙是否开放 443。
4. Nginx 是否转发到 API。
5. 回调路径是否与后端一致。
6. 微信商户平台证书和 API v3 Key 是否正确。
```

---

## 22. MVP 完成后再做什么

建议顺序：

```txt
第二阶段：优惠券 / 满减
第三阶段：会员体系 / 会员价 / 会员权益
第四阶段：房间、座位、酒店、电子参会证
第五阶段：商城
第六阶段：AI 本场会议知识库问答
第七阶段：抖音、小红书、B站、视频号渠道增长
```

不要在 MVP 阶段同时做这些，否则上线会被拖慢。

---

## 23. 参考来源

以下是本手册编写时参考的官方/权威文档，建议你以后遇到版本差异时优先看这些来源：

| 主题 | 来源 |
|---|---|
| Codex App 概览、macOS/Windows、项目选择 | OpenAI Codex App 文档：developers.openai.com/codex/app |
| Codex App Local / Worktree / Cloud、内置 Git、内置终端 | OpenAI Codex App Features / Worktrees 文档 |
| Codex App Settings 和 Agent configuration | OpenAI Codex App Settings 文档 |
| Codex Skills 目录结构、SKILL.md、.agents/skills | OpenAI Agent Skills 文档 |
| Codex config.toml、sandbox、approval、项目级配置 | OpenAI Codex Config Basics / Config Reference |
| AGENTS.md 项目指令 | OpenAI AGENTS.md 文档 |
| Homebrew 安装 | brew.sh |
| Node.js LTS | nodejs.org |
| pnpm / Corepack | pnpm.io |
| Docker Desktop for Mac | Docker 官方文档 |
| uni-app 多端发布、CLI 创建项目 | DCloud uni-app 官方文档 |
| NestJS CLI | NestJS 官方文档 |
| Prisma + PostgreSQL | Prisma 官方文档 |
| 微信支付 JSAPI / API v3 / 回调 | 微信支付官方文档 |

---

# 附录 A：完整 Codex App 提示词顺序

## A1. 只读检查

```txt
请先只读取当前项目，不要修改任何文件。请检查并总结：
1. 当前项目目录结构
2. AGENTS.md 中的强制规则
3. .codex/config.toml 的配置含义
4. .agents/skills 下有哪些 skills
5. 当前 MVP 范围是什么
6. 你建议先做哪一个最小任务
```

## A2. 生成 MVP 文档

```txt
请使用 conference-mvp-architect、registration-order-pricing、wechat-pay-idempotency、dynamic-form-mvp、qa-release-checklist skills。
先不要写业务代码，只生成 docs/PRD.md、ARCHITECTURE.md、DATABASE.md、API.md、TASKS.md、TEST_PLAN.md。
MVP只做会议展示、报名规格、动态报名表单、订单、mock支付、微信支付预留、我的报名、最小后台。
金额用分，订单后端重算，支付回调幂等，密钥不入库不入代码。
完成后停止等待我 review。
```

## A3. 初始化 monorepo

```txt
请按 docs/ARCHITECTURE.md 初始化 pnpm monorepo。创建 apps/user、apps/admin、services/api、packages/shared、prisma。配置 scripts，后端提供 /health，前端提供 hello 页面。不要接真实微信支付。
```

## A4. 实现数据库

```txt
请根据 docs/DATABASE.md 实现 Prisma schema、migration、seed。金额用 Int 分，状态用 enum，seed 一个会议、两个报名规格、一个报名表单、一个管理员。
```

## A5. 实现后端 API

```txt
请实现会议、报名表单、quote、订单、mock支付、我的报名、后台管理 API。创建订单必须后端重新计价。支付成功后生成 Registration。重复回调不能重复生成。
```

## A6. 实现用户端

```txt
请实现 uni-app 用户端：首页、会议详情、报名页、订单确认、mock支付、支付结果、我的报名。H5 和 mp-weixin 都要支持。
```

## A7. 实现后台端

```txt
请实现后台登录、会议管理、规格管理、字段管理、订单列表、报名名单。后台接口必须鉴权。
```

## A8. 微信支付真实接入

```txt
请保留 mock 支付，并增加微信支付 API v3 真实接入。所有密钥从环境变量读取。notify 必须验签、解密、金额校验、事务、幂等、重复回调成功返回。
```

## A9. 最终 Review

```txt
请 review 当前 diff，重点检查金额篡改、重复支付回调、重复报名、后台鉴权、密钥泄露、订单状态流转、测试缺失、是否超出MVP范围。
```
