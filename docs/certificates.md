# 多会议证书管理

状态：按已确认原型实施。独立分支开发；不在本次开发动作中切换生产域名、停用旧站或发布官网。

2026-11-05 后续进展：用户已完成新域名解析，并明确授权完成服务器配置及上线。上线继续使用本模块的独立配置和迁移，不发布官网；真实会议素材、名单与规则由管理员自行配置。

## 业务边界

- 每个证书项目关联一个会议（历史活动可暂不关联），拥有不可变的公开标识和 `/c/:publicId` 链接。
- 一个项目内支持多个证书类型，每个类型独立模板和文字字段。所有数据按项目隔离。
- 草稿配置、草稿名单、不可变发布版本、发证记录分别存储。保存、导入、新建会议不会改变已发布内容。
- 查询字段、必填项、获证条件、开放时间、重复下载、页面说明均由后台配置。
- 同名人员使用记录 ID 区分；按证书类型与编号导入更新，不按姓名去重。导入先预检，再基于草稿版本确认。
- 复用管理员身份、角色权限与既有会议授权。权限与会议范围同时在服务端检查。
- 客户端不接收完整名单、领取码摘要、模板内部路径。成功查询后使用短期凭证获取服务端生成的 PNG。
- 草稿预览和正式导出共用服务端生成器；生成文件绑定发布版本，更改模板不覆盖历史证书。
- 本模块不修改订单、支付、获证之外的业务状态，不新增签到、会员或营销功能。

## 数据与并发

`CertificateProject` 保存草稿及当前发布版本号；`CertificateRecipient` 保存草稿名单；`CertificateVersion` 保存配置快照；`CertificatePublishedRecipient` 保存发布名单快照；`CertificateIssue` 保存 PNG 与发证状态；`CertificateGrant` 保存短期领取凭证摘要。独立素材表保存经过校验的图片和字体，发布版本使用不可变素材 ID。

所有草稿写入带 `draftRevision`，以事务内条件更新防止覆盖；发布事务复制配置与名单。发布/暂停/恢复只作用于目标项目。导入预检摘要绑定项目、版本、模式和记录，确认时重新检查。历史版本及发证文件不物理删除。

## 接口和入口

- 后台 `#/certificates`，API `/api/admin/certificates`。
- 公众 `/c/:publicId`，API `/api/certificates/:publicId`；查询和下载使用 POST，凭证不放在 URL。
- 公众入口和后台分开构建为 `certificate.html` 与原后台入口，复用 Vue，公众包不含后台应用或名单。
- 新域名计划为 `cert.guanchaohuiji.com`，启用前验证 HTTPS、静态路径和 API 反代。

## 验收

1. A 发布后建立/发布 B，A 的链接、名单、图片与版本不变。
2. 草稿保存、导入、模板修改不影响已发布版；过期版本提交返回冲突。
3. 同名保留、重复导入幂等、空字段和冲突明确报告；失败批次不清空旧名单。
4. 查询多匹配要求补充信息；失败清空旧结果；必填、资格、开放时间在服务端执行。
5. 后台无身份返回 401，无权限或无会议授权不能读取、预览、导出或修改。
6. 领取凭证仅可访问指定项目/发布记录，过期、暂停、撤销不能下载。
7. 服务端 PNG 预览与下载一致；零坐标、长姓名、多行和中文字体可验证。
8. 测试使用独立临时 PostgreSQL；不连接生产或现有开发数据库。

## 迁移与上线

提供旧站 `state.json` 的本地预检/导入工具，默认只生成报告，写入必须指定管理员身份与目标项目并走服务校验。旧站当前仅一条有效名单，迁移数据范围需用户确认。完整备份、试迁移、核对名单/编号/模板后，再安排正式切换。官网保持筹划状态；原主域名 API、素材、邀请函路径保留。

### 开发与验收命令

```sh
pnpm typecheck
pnpm --filter @conference/api test
pnpm --filter @conference/admin test
pnpm --filter @conference/shared test
pnpm build:api
VITE_API_BASE_URL=https://guanchaohuiji.com/api pnpm build:admin
```

真实 API 集成测试仅在显式设置 `CERTIFICATE_TEST_DATABASE_URL` 时运行，并要求本机 `certificate_test` 数据库。测试独立创建/清理自己的会议、角色、管理员和证书记录，不导入生产数据。

```sh
CERTIFICATE_TEST_DATABASE_URL=postgresql://certificate_test@127.0.0.1:55441/certificate_test pnpm exec tsx --test tests/e2e/certificates.integration.ts
pnpm exec tsx scripts/certificates-migrate-legacy.ts --input /private/path/state.json
```

实际迁移在预检命令后增加 `--apply --api-origin <API站点> --project-id <未发布项目ID> --asset-root <旧站public目录>`。管理员会话通过 `CERTIFICATE_ADMIN_TOKEN` 环境变量提供，不放入命令参数。工具不会自动发布；源 JSON、名单、图片及会话均不得加入 Git。

本机联调使用 `scripts/certificates-local-preview.ts`，固定拒绝非本机或非 `certificate_test` 数据库。它创建明确标记的演示数据，将本机演示登录资料以 0600 权限写入忽略的 `.tmp/certificate-preview-login.txt`，不输出密码或会话。后台 Vite 使用 `VITE_API_BASE_URL=http://127.0.0.1:3317/api`、端口 5178。此环境不等于生产验收。

### 上线配置

- 先备份 PostgreSQL，执行版本化迁移；迁移只新增证书表和权限，不向既有合作方角色自动授予新权限。
- 生产服务器安装对应系统的 resvg 原生依赖包（锁文件已固定版本），并准备中文字体。Linux 建议安装 Noto CJK；也可上传 TTF/OTF/TTC 并选择具体字体文件。上传图片最多 10MB/1600 万像素，字体最多 20MB。
- 可通过 `CERTIFICATE_DEFAULT_FONT_FAMILY` 指定服务器的默认中文字体家族。上传字体使用文件内家族名称，避免文件名和字体名不一致。
- 依赖修补后的剩余公告需按实际调用路径评估。当前 NestJS SSE 公告要求应用把不可信内容传入 SSE 消息的 type/id，本项目没有 SSE 路由；Vue I18n 公告要求翻译结果进入 HTML，应用代码未调用该翻译 HTML 路径。保留原框架主版本，单独记录后续框架升级任务；审计告警不伪报为零。
- `CERTIFICATE_PUBLIC_ORIGIN=https://cert.guanchaohuiji.com`；将该精确来源追加到现有 `CORS_ALLOWED_ORIGINS`，保留原有来源。
- `apps/admin/dist/certificate.html` 和公共资源随后台构建产物部署。可参考 `scripts/deploy/certificates.nginx.example.conf` 新建独立站点；不替换主站配置。
- 在既有后台域名的 `/api/admin/certificates/` 路径单独确认请求体上限至少为 21MB，以容纳字体上传和 multipart 边界；公众域名仍使用较小请求体上限。本次未修改任何线上 Nginx 配置。
- 验证新域名 HTTPS、公众 API、中文字体、模板预览、PNG 下载和微信真机保存，再安排旧证书站停用。
- 若回退，暂停新证书入口、恢复旧站路由；保留新增表、历史发证图片和新数据，不执行丢数据的反向删除迁移。

### 下载与历史

允许重复下载时，预览和下载使用已持久保存的原图。限制重复下载时，首次查询提供带标记的低清预览，原图领取次数在数据库事务中检查；已保存到个人设备的文件无法远程删除。撤销控制后续查询和领取。

发证 PNG、模板图片与字体保存在独立数据库记录内，未暴露于公共 uploads 目录；数据库备份包含这些二进制资料。未来数量增长时可迁移到私有对象存储，接口和版本绑定保持一致。
