# Conference MVP - Mac + Codex App Starter

这个 Starter 包用于在 Mac 上配合 Codex App 快速搭建会议报名缴费 MVP。

## 使用方式

```bash
mkdir -p ~/Projects/conference-system
cd ~/Projects/conference-system
git init
rsync -av /path/to/conference_mvp_mac_codex_app_starter/ ./
git add .
git commit -m "chore: add mac codex app starter"
```

然后用 Codex App 打开 `~/Projects/conference-system`，先发送：

```txt
请先只读取当前项目，不要修改文件。请总结 AGENTS.md、.codex/config.toml、.agents/skills 和 MVP 范围。
```

## 内容

- `AGENTS.md`：项目级永久规则
- `.codex/config.toml`：Codex App/CLI/IDE 共享的项目配置
- `.agents/skills/`：MVP 专属 Skills
- `docs/CODEX_PROMPTS.md`：可直接复制给 Codex App 的提示词
- `docs/MVP_ACCEPTANCE_CHECKLIST.md`：上线验收清单
- `scripts/mac-check-env.sh`：Mac 环境检查脚本
- `docker-compose.yml`：PostgreSQL + Redis
- `.env.example`：环境变量模板

## 注意

不要提交 `.env`、微信支付私钥、API v3 Key、小程序 AppSecret。
