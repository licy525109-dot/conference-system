# 外部会议扫码签到

## 本次范围

由用户明确要求增加外部协同会议签到：后台建立独立会议、配置嘉宾填写的字段、导入外部名单、下载现场二维码；嘉宾无需登录，扫码填写配置项，指定核验字段匹配同一人后完成签到，未匹配显示签到失败。

外部会议、名单使用独立数据表，不创建 User、Order、Payment 或 Registration，不改变原报名支付流程。

## 配置与匹配

- 每场会议配置 1–20 个名单字段，分别配置“嘉宾填写”“必填”“用于核验”，至少一个字段用于核验。允许姓名、单位、手机号、外部编号等任意字段，全部为文本，保留前导零。
- 嘉宾仅看到开启填写的字段，非核验字段可设必填或选填。核验字段必须开启填写且必填，只有核验字段参与匹配；其他填写内容单独保存为现场补充资料，不覆盖导入名单。所有核验字段须在同一条名单上精确匹配；仅统一全半角并去除首尾空格，不做模糊匹配。
- 导入前预检空值、长度、重复和歧义。有错误时整批拒绝写入。完全相同的记录重复导入会跳过；同一匹配组合对应不同资料会阻止导入，提示增加核对字段。
- 已导入后仍可调整核对字段；必须先暂停签到，后台重新核对全体名单能否被唯一识别。变更字段或导入时使用版本检查，避免覆盖他人的修改。
- 扫码页面仅返回会议说明与表单定义；不返回名单、候选人员或原始个人资料。匹配数据通过 POST 提交。

## 状态、权限与并发

- 新会议默认暂停，管理员导入名单并核对后开启；可设置签到开始、结束时间。
- 首次匹配写入签到时间；重复或并发提交返回“已签到”，保留首次时间且仅产生一次成功记录，同时保留首次现场填写内容。
- 签到与暂停、字段调整、名单导入使用数据库锁协调，状态判定与写入在同一事务完成。
- 后台独立 `external-checkin:view` / `external-checkin:write` 权限，沿用管理员登录及会议范围隔离；仅会议授权账号不能访问本独立模块。
- 管理操作记录不含名单内容的审计日志；公开接口限制请求频率。导出为文本单元格，避免表格公式执行。

## 验收

创建测试会议 → 配置姓名/单位/编号为填写字段，仅编号用于核验 → 下载模板并填入测试名单 → 导入预检和确认 → 开启签到并下载二维码 → 扫码填写匹配编号及不同的姓名/单位 → 检查签到成功、后台时间和计数、现场填写资料单独保存；再测未匹配、重复提交、暂停、时间窗口、会议隔离及重复名单。

部署需要数据库迁移、API 和后台重新构建；公众签到页随 API 提供。代码完成并不代表已经发布或完成真实微信扫码验收。

## 名单与核验初版验证（2026-11-10）

- 独立本地 PostgreSQL `external_checkin_test` 中成功执行全部 58 个迁移，包含本次新增的两张表；未访问生产数据库。
- API 单元测试 785/785、后台 50/50、共享模块 34/34 通过；API、后台类型检查和生产构建通过。
- `tests/e2e/external-checkin.integration.ts`：8/8 通过。涵盖后台未登录/只读/会议范围权限、导入事务与预检摘要、重复与歧义名单、不同会议隔离、填写和核验分开、12 路并发首次签到、暂停与提交竞争、签到时间窗口、修改核验字段后重新索引、旧表单拒绝、零新增订单/支付/报名记录。
- Playwright 操作真实本地 API：中文 CSV 导入 2 人、列名自动映射、保留编号前导零、手机尺寸失败与成功页面、后台刷新为 4 人/1 人已签到、模板下载、二维码下载、签到名单导出均通过。修复了无 BOM 中文 CSV 的编码问题。
- 下载的 Excel 已重新读取核对：原始资料与现场填写分列，签到状态和时间准确，全部单元格为文本；二维码 PNG 为 840×840。公开页面控制台 0 错误、0 警告。
- 本地截图位于 `output/playwright/external-checkin-{config,admin-results,mobile-form,mobile-failure,mobile-success}.png`。截图与测试数据均不提交。
- 构建保留项目现有的第三方 PURE 注释及大包提示；不影响构建结果。真实微信扫码、线上网络与主办方名单验收尚未执行。

复跑集成测试前先构建 API/后台并迁移独立测试库，再设置 `EXTERNAL_CHECKIN_TEST_DATABASE_URL` 指向本机 `/external_checkin_test`，运行 `pnpm exec tsx --test tests/e2e/external-checkin.integration.ts`。`scripts/external-checkin-local-preview.ts` 可启动独立测试预览，生成的本地会话仅保存在被忽略的 `.tmp/` 中。

## 接入与修改文件

- `prisma/schema.prisma`、`prisma/migrations/20261110090000_external_checkin/migration.sql`：独立会议和名单，包含导入资料、核验摘要、首次签到时间、现场填写资料。
- `packages/shared/src/external-checkin.ts`、`packages/shared/src/index.ts`：字段契约、文本规范化、核验身份和导入预检；相应 `external-checkin.spec.ts` 覆盖规则。
- `services/api/src/external-checkin/`：后台和公开接口、事务、版本检查、时间窗口、统计与权限；`services/api/src/app.module.ts` 注册模块。
- `services/api/src/admin/admin-permissions.ts`：新增查看/导出与编辑/导入权限。
- `services/api/src/main.ts`：本模块导入 JSON 限额与公开静态资源；`services/api/src/security/request-rate-limit.ts` 及对应测试覆盖公开请求限流。
- `apps/admin/src/pages/external-checkin/index.vue`、`apps/admin/src/services/external-checkin.ts`：会议、字段、导入、名单、状态、二维码和导出管理。
- `apps/admin/src/utils/external-checkin-sheet.ts` 及对应测试：Excel/CSV 读取、编码、列映射和文本单元格导出。
- `apps/admin/src/router/index.ts`、`apps/admin/vite.config.ts`、`apps/admin/external-checkin.html`、`apps/admin/src/external-checkin/{main.ts,page.vue}`：后台入口及独立手机签到页。
- `tests/e2e/external-checkin.integration.ts`、`scripts/external-checkin-local-preview.ts`：独立数据库验收和本地预览。

后台入口为 `#/external-checkins`，接口为 `/api/admin/external-checkins`；嘉宾入口为 `/api/external-checkins/:token/page`。公开页面与资源都在既有 `/api/` 代理路径下，不需要新增域名或小程序页面。

## 每场会议的链接与签到页外观（2026-11-10 追加需求）

- 在会议列表和详情页直接显示独立签到链接，提供复制、打开及二维码入口，保存 UI 不改变链接。
- 每场会议单独保存配色、布局、Logo、封面、页眉、页面标题、说明、按钮和签到结果文案；使用现场明亮环境下可清楚阅读的手机表单，后台采用左侧配置、右侧实时手机预览。
- 外观编辑与字段/签到开关分开保存，使用版本检查。外观修改不改变核验规则，正在使用旧表单的嘉宾仍可正常签到。
- Logo/封面仅允许 PNG/JPEG 图片，每张最多 5 MB、1600 万像素，验证格式头和尺寸；每场会议隔离素材，公开接口仅提供该会议当前启用的图片。
- 保存前仅编辑本地草稿，明确显示未保存状态；可预览填写、成功、失败三种状态。成功/失败的事实由接口返回，UI 文案不能修改签到记录。
- 已有会议自动使用默认外观。更新本地预览时复用既有管理员账号和会议，不重新生成密码或清空名单。

### 使用与人工验收

1. 进入“外部会议签到”，每一行都有只读签到链接，以及“复制”“打开”“签到页 UI”入口。新建会议后，详情顶部也可复制链接、打开页面或下载二维码。
2. 进入“签到页 UI”，配置颜色、卡片/简洁布局、文字大小、圆角、Logo/封面和各项文案。图片每场最多保留 30 张，同一文件重复上传复用素材；外观草稿中移除图片后，保存即可停止公开该图片。
3. 切换右侧“填写 / 成功 / 失败”预览，预览不会提交签到。点击“保存外观”，原链接和原二维码继续有效；重新进入编辑器或打开签到页检查配置持久化。
4. 使用测试名单分别提交错误和正确核验信息，检查失败不改变人数，成功只写入一次，其他填写内容单独保存。保存 UI 后再试之前已打开的表单，应能继续正常签到。

### 外观与链接追加验证（2026-11-10）

- 本地独立 PostgreSQL 已完成第 59 个迁移，既有账号、会议、名单和签到状态保留。预览进程重启会更新本地登录令牌，使用原用户名/密码重新登录即可。
- 共享模块 37/37、后台 50/50、API 786/786 单元测试通过；API 和后台类型检查/生产构建通过。新增颜色格式、对比度、文案边界、素材标识与图片请求限流验证。
- 真实 NestJS + PostgreSQL 集成测试 10/10 通过，新增外观保存的鉴权/只读/会议范围、版本冲突、固定链接、旧表单兼容、自定义结果文案、会议隔离，以及图片上传鉴权、格式/大小、去重、未保存图片不可公开、跨会议图片拒绝、移除图片不再公开。
- Playwright 验证列表复制链接、进入编辑器、修改海蓝配色及文案、上传 Logo 和封面、成功/失败实时预览、未保存离开提示、保存并重新进入，以及 390px 手机页面真实失败/成功提交和后台人数/现场填写资料。公开签到页控制台无错误；后台原有 favicon 404 不影响功能。
- 截图位于 `output/playwright/external-checkin-links.png`、`external-checkin-ui-editor.png`、`external-checkin-ui-mobile-{form,failure,success}.png`、`external-checkin-ui-admin-results.png`，均为本地测试素材，不提交。
- 仅更新本地预览，未部署线上；真实手机微信扫码和正式会议名单仍需现场验收。生产发布需应用本次迁移，并同时构建 API 与后台。

### 外观功能修改文件

- `packages/shared/src/external-checkin-appearance.ts`、对应 `.spec.ts` 和 `index.ts`：外观契约、默认值、预设配色、文本/颜色/对比度校验。
- `prisma/schema.prisma`、`prisma/migrations/20261110110000_external_checkin_appearance/migration.sql`：每场会议外观与独立图片存储。
- `services/api/src/external-checkin/{external-checkin.service.ts,external-checkin.controller.ts}`：外观保存、图片权限与公开访问、签到结果文案；`services/api/src/security/request-rate-limit{,.spec}.ts`：图片请求限流。
- `apps/admin/src/components/external-checkin/{CheckinAppearanceEditor.vue,CheckinExperience.vue}`：外观编辑器与预览/公开页面共用渲染组件。
- `apps/admin/src/pages/external-checkin/index.vue`、`apps/admin/src/services/external-checkin.ts`、`apps/admin/src/external-checkin/page.vue`：链接入口、配置接口和实际嘉宾页面。
- `tests/e2e/external-checkin.integration.ts`、`scripts/external-checkin-local-preview.ts`：端到端验收及保留既有本地账号/会议的预览启动。
