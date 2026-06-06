# Codex App Local Environment / Actions 建议

在 Codex App 项目设置里手动添加以下 Actions。

| Action | Script |
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

Worktree setup script 推荐：

```bash
corepack enable pnpm
pnpm install
```

如果 `.codex/config.toml` 中 `network_access=false`，Codex 执行安装依赖可能失败。第一版建议你自己在终端里运行 `pnpm install`。
