# 多会议证书系统本地验收记录

日期：2026-11-05（Asia/Shanghai）。状态：本地可验收，尚未生产发布。

## 代码位置与范围

- 分支：`codex/certificate-management`，基于 `ec65082`（原有收款单位与会议授权功能）。
- 开发目录：`/Users/yangyang/Projects/conference-system/.tmp/certificate-management`。
- 原始工作区存在其他未提交工作，本次使用独立 worktree，未覆盖其内容。
- 新增证书管理后台、独立嘉宾查询页、真实 API、7 张数据表、权限、图片生成器、旧站迁移工具与部署配置示例。
- 会议分别维护配置、模板、获证名单、规则、发布版本和固定链接。保存草稿、新增会议及名单导入不改变其他会议或已发布内容。
- 查询支持多个必填/选填字段精确组合；同名记录不按姓名合并。资格支持人工确认、全名单和字段条件，开放时间和重复下载可配置。
- 模板支持多个证书类型、图片底图、上传字体、文字位置拖动及精确参数、字段前缀、换行和服务端正式 PNG 预览。
- 历史版本可复制到草稿；归档保留链接；暂停和撤销控制后续领取。首次生成的发证 PNG 按发布版本保存。
- 本轮未部署生产、修改 DNS、停用旧站或上线官网；未修改支付金额、订单和支付回调业务。

## 验证结果

| 层级 | 结果 | 证据与范围 |
| --- | --- | --- |
| 全工作区类型检查 | PASS | `pnpm typecheck`，全部 workspace 完成 |
| API 单元测试 | PASS | 783/783，包含现有支付、订单、权限回归及证书生成器 |
| 后台单元测试 | PASS | 48/48，包含 Excel/CSV 映射、编号前导零与同名记录 |
| 证书契约与旧版转换测试 | PASS | 显式运行 6/6；此前共享包现有测试 28/28 |
| API / 后台生产构建 | PASS | `pnpm build:api`、`VITE_API_BASE_URL=https://guanchaohuiji.com/api pnpm build:admin`；后台保留原有大分块提示 |
| 数据库迁移 | PASS | 独立本机 PostgreSQL `certificate_test`，完整应用 57 个迁移；没有连接生产数据库 |
| 真实 API 集成 | PASS | 真实 NestJS + PostgreSQL；登录、无身份 401、角色权限 403、跨会议隔离、multipart 图片上传、名单导入及预检摘要、并发查询、A/B 独立发布、历史 PNG 保留、版本恢复、归档、开放时间、凭证过期、暂停与撤销、单次原图下载 |
| 浏览器业务流程 | PASS | 真实浏览器完成 A 草稿修改、B 人员新增与发布、CSV 字段映射与预检提交、服务端图片预览、原图下载、查询失败清空旧结果；320/390px 无横向溢出 |
| 旧站本地试迁移 | PASS | 当前源状态 1 人；底图字节和原编号保留；3508×2480 PNG 可生成；结果为未发布草稿 |
| 密钥与私有文件检查 | PASS | 检查本轮 40 个变更文件；3 个命中为基线原有示例占位值；未发现新增明文密钥。源名单、会话和浏览器产物均在忽略目录 |
| 依赖审计 | WARN | 从开发前 30 项降至 22 项：0 严重、12 高、7 中、3 低；无新增渲染库告警，尚非全绿 |
| 生产域名 / HTTPS / 生产迁移 | NOT_RUN | `cert.guanchaohuiji.com` 未切换，部署示例未启用 |
| 微信真机长按保存 | NOT_RUN | 浏览器预览和下载不等于微信真机验证 |
| 原生小程序证书入口 | NOT_RUN | 当前阶段为现有后台管理与会议专属 H5；原生“我的证书”另行接入 |
| 全部历史人员名单核对 | NOT_RUN | 当前旧站只有 1 条，需补充或确认完整历史名单 |

集成测试使用显式 `CERTIFICATE_TEST_DATABASE_URL`，仅允许 localhost 的 `certificate_test`；每次创建并清理自己的测试记录。预览服务器保留演示 A/B，私有迁移草稿和实际人员不加入 Git。

## 修改文件

- 后台界面与导入：`apps/admin/src/pages/certificates/index.vue`、`apps/admin/src/services/certificates.ts`、`apps/admin/src/utils/certificate-import.ts` 及其测试。
- 公众页面与入口：`apps/admin/certificate.html`、`apps/admin/src/certificate/{main.ts,page.vue}`、`apps/admin/vite.config.ts`。
- 后台菜单与授权工作台：`apps/admin/src/{App.vue,router/index.ts,pages/conferences/ScopedConferenceWorkspace.vue}`。
- API 与图片生成：`services/api/src/certificates/` 下的 module、controller、service、renderer 及生成器测试；`app.module.ts`、`main.ts`、`security/request-rate-limit.ts` 接入模块与限流。
- 权限：`services/api/src/admin/{admin-auth.service.ts,admin-permissions.ts,conference-scope.ts,admin-conference-scope.spec.ts}`。
- 配置契约与旧版转换：`packages/shared/src/certificates.ts`、`certificates-legacy.ts`、对应测试与 `index.ts` 导出。
- 数据库：`prisma/schema.prisma`、`prisma/migrations/20261104150000_certificate_management/migration.sql`。
- 迁移、联调、部署：`scripts/certificates-migrate-legacy.ts`、`scripts/certificates-local-preview.ts`、`scripts/deploy/certificates.nginx.example.conf`、`.env.example`。
- 依赖与回归：`services/api/package.json`、`pnpm-workspace.yaml`、`pnpm-lock.yaml`、`tests/e2e/certificates.integration.ts`。
- 文档：`docs/certificates.md` 与本验收记录。

## 依赖修补与剩余告警

本次新增文件上传与公众查询，故对相关请求处理依赖做同一主版本内修补：`body-parser 1.20.9`、`multer 2.5.0`、`proxy-addr 2.0.8`。锁文件变动仅包含渲染库、上述修补和对应移除的无用传递依赖；图片上传及 API 全量测试在修补后通过。

对应上游公告：[body-parser](https://github.com/advisories/GHSA-27r3-jxmh-p828)、[multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m)、[proxy-addr](https://github.com/advisories/GHSA-jqcg-44mw-7w3h)。

剩余告警均已在基线存在，涉及 uni-app 工具依赖、Vue 编译/服务端渲染依赖，以及 API 的 NestJS、qs。未在证书任务中跨大版本升级现有框架。正式上线前需单独评估运行时受影响路径和升级回归，不能把本地功能通过视为安全审计通过。

## 本机人工验收

1. 打开 `http://127.0.0.1:5178/#/certificates`。本机演示账号放在忽略文件 `.tmp/certificate-preview-login.txt`，仅用于独立测试数据库。
2. 打开“证书联调 · 会议 A”，依次查看基本信息、证书模板、获证名单、规则配置、预览与发布。保存一处草稿后，通过原专属链接确认嘉宾页面仍为已发布内容。
3. 打开“证书联调 · 会议 B”，核对已有人员与后续导入的两个同名记录。B 的草稿名单为 3 条，当前发布名单仍为先前的 1 条，便于检查草稿与发布的区别。
4. 点击正式图片预览，核对中文、编号与位置。上传真实模板后，以真实长姓名、单位和不同证书类型逐个预览。
5. 下载名单模板，填入一小批测试人员，确认映射、发证资格与领取码。先预检，再写入草稿，再明确发布。
6. A 查询链接：`http://127.0.0.1:5178/c/bX-2sLkUwQL9IJV0`，使用“联调嘉宾甲”与领取码 `DEMO-CODE-1`；B 链接：`http://127.0.0.1:5178/c/if-BBebn_NVkTj-l`，使用“联调嘉宾乙”与领取码 `DEMO-B-CODE`。核对预览、下载及错误查询后旧结果消失。
7. 在 A/B 之间切换，分别确认链接与发布状态；可测试暂停、恢复、归档和历史版本复制。以上操作都仅发生在本机演示库。

截图位于 `output/playwright/certificates/`。本机进程停止后需重新启动独立测试数据库与预览服务；启动脚本会重新生成演示会话，不能使用生产凭据。

## 正式迁移前待办

1. 确认完整历史名单，以及每个会议最终底图、字体、证书文字、编号和获证规则。
2. 对本机效果完成业务核对；在微信真机验证领取和保存。
3. 评估剩余依赖告警，准备服务器中文字体、数据库二进制资料备份与可恢复演练。
4. 安排生产备份与迁移、新域名 DNS/HTTPS、反向代理与精确 CORS 来源。既有后台上传路径需允许 21MB 请求体，公众路径继续使用较小上限。
5. 在新域名检查真实会议的完整领取路径，再停用旧证书站。官网仍不在本轮上线范围。

配置和部署说明见 `docs/certificates.md`。本记录不代表生产发布批准或微信真机验收完成。

## 用户后续授权与上线前补充

用户在完成 DNS 解析后，明确要求完成后续服务器配置及上线。此次授权不要求提前提供会议素材和名单；这些内容在后台配置，未准备好的会议保持草稿。

兼容性修补补充了 qs、Vue 服务端渲染器、source-map-js、adm-zip、follow-redirects、PostCSS 选择器解析器以及 Babel 7 的已发布稳定修补版本。采用较早发布的 Babel 7.29.7 系列，未为当日新版本保留最低发布时间例外。

当前全仓库生产依赖审计为 6 项：3 高、1 中、2 低。3 高与2低均属于既有 uni-app 的 Vue I18n 依赖；1中为 NestJS 的 SSE 消息字段公告。应用源码没有 `@Sse`、`SseStream`、`EventSource`，也没有调用 `vue-i18n`、`createI18n`、`useI18n`、`escapeParameter` 或翻译 HTML 的路径。本次证书 API 和后台不依赖这些触发功能，未跨大版本升级原有框架。公告依据：[NestJS SSE](https://github.com/advisories/GHSA-36xv-jgw5-4q75)、[Vue I18n HTML](https://github.com/advisories/GHSA-83rm-6c8r-g728)、[Vue I18n 参数转义](https://github.com/advisories/GHSA-8rc2-428q-7ww3)。这属于当前调用路径的风险评估，不代表依赖包已消除公告。

全工作区现有单元测试 951/951 通过（API 783、后台48、用户端92、共享包28），类型检查通过，API、后台、H5、小程序构建均通过。新增 GitHub Actions 独立 PostgreSQL 证书集成检查，覆盖发布隔离和权限。

生产备份已经完成，路径 `/www/backup/certificate-management-20261105-004417`，包含数据库压缩备份、原版本项目、后台静态文件、环境配置和主域名代理配置，权限仅限服务器管理员读取。新域名 HTTPS 已签发，后续部署与独立核验结果另行记录。
