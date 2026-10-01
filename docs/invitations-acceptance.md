# 邀请函实施与验收记录

日期：2026-10-01。状态：本地实现，未部署正式环境，正式视觉待用户验收。

## 本轮：章节导航自定义

- 入口：「专属邀请函 → 视觉与分享 → 章节导航」。整栏/单项显示、上下排序、自定义名称、吸顶切换和恢复正文顺序均可配置，页面内可预览导航。
- 导航名称和顺序与正文独立；隐藏导航不会删除或隐藏正文。空模块/隐藏模块不会产生无效链接，新模块追加，删除模块自动清理引用。旧数据保持默认导航展示。
- 保持当前会议资料、海报、主题和内容排版不变。未采用用户随后撤回的旧手册视觉参考，未改既有会议草稿或发布数据。
- 真实本地 API 流程验证了保存回读、草稿隔离、两条旧链接发布同步、原有角色/会议权限、支付归因和停用。重载 3001 本地服务时保留登录签名及既有账号密码，不触及生产。
- 验证：521 项后端单元测试、31 项后台工具测试、32 项邀请函浏览器回归、1 个真实 API 集成流程均 PASS；全 workspace 类型检查、API/后台构建、`git diff --check` PASS。新增导航浏览器用例覆盖 390/1512px 编辑、刷新持久化、全局/单项开关、恢复顺序，以及 390/1440px 嘉宾跳转、非吸顶、在线更新与无横向溢出。另有 2 项正式构建 + 真实 API 只读导航回归 PASS，对当前已编辑的旧链接核对实际章节、名称、锚点、跳转及资源加载。
- 既有 `invitations-studio-live.spec.ts` 两项固定演示回归 FAIL：目标链接已被后续编辑为新的会议内容，并移除了轮播模块，固定 `.invitation-carousel` 断言超时。未重新灌入种子或覆盖用户内容；本轮改用 `invitations-navigation-live.spec.ts` 的只读断言验证当前发布页面。该失败不计入上述 32 项接口夹具回归，也不宣称本轮完整素材演示验收通过。
- 修改文件：`packages/shared/src/invitation-design.ts`、`invitations.ts`；`apps/admin/src/components/invitations/InvitationNavigationEditor.vue`、`InvitationDesignStudio.vue`、`InvitationDocument.vue`；`apps/admin/src/utils/invitation-design.spec.ts`、`tests/frontend/invitations.spec.ts`、`tests/frontend/invitations-navigation-live.spec.ts`、`tests/e2e/invitations.integration.ts`，以及本记录和实施文档。没有新增依赖或迁移，已有未提交的其他工作保持原状。
- 视觉证据：`output/playwright/invitation-navigation-editor-390.png`、`invitation-navigation-editor-1512.png`、`invitation-navigation-public-390.png`、`invitation-navigation-public-1440.png`、`invitation-navigation-live-390.png`、`invitation-navigation-live-1440.png`。微信真机/生产环境 NOT_RUN。

人工验收：刷新后台，打开「章节导航」，将「会议议程」上移并改名，关闭一个导航项，预览确认正文未改；保存草稿后刷新核对。使用「保存并发布」确认发布，再打开已有个人链接核对导航变化。

## 封面定位入口修复

- 原海报画布及图层未丢失；新增功能预览默认模板模式，原入口位于「视觉与分享 → 封面设计 → 上传成品海报」，容易被误认为移除。
- 后台页头新增「封面定位」，已有海报直接打开拖拽画布，支持从内容/动效/分享页面返回。模板模式先确认切换，保留当前图片和已有图层，仅修改草稿；取消不改变模式，不自动发布。
- 画布滚动位置避开固定导航及保存工具栏。回归覆盖确认/取消、上传、鼠标拖拽、字号/斜体保存、刷新后手机端打开及定位数据回读；无内容编辑权限的邀约员不显示入口。
- 修改文件：`apps/admin/src/pages/invitations/index.vue`、`InvitationDesignStudio.vue`、`InvitationCoverEditor.vue`、`tests/frontend/invitations.spec.ts` 及本记录。未修改后端、权限规则、支付或会议数据。
- 验证：后台类型检查/构建 PASS；28 项邀请函浏览器回归全部 PASS，包含本次新增入口与保存回读检查；`git diff --check` PASS。仅本地修复，未部署生产。

## 最新一轮：模块、素材库与主题扩展

本轮在已有海报画布基础上增加议程头像、嘉宾长介绍、规则/手动名单排序、统一素材上传与选取、7 类展示模块、模块独立样式、主题和自定义字体。原海报演示及已有会议资料未改写；没有部署生产，也未修改支付、金额、订单或通知核心逻辑。

### 操作入口

1. 后台 `http://localhost:5174/#/invitations`，选择「交互模块 · 功能预览」。仍使用既有本地账号，密码未轮换。
2. 「会议内容 → 嘉宾介绍/会议议程」编辑长介绍、上传头像，或从素材库复用。「内容模块」加号新增音视频、轮播、标签页、地图、图标链接及搜索。
3. 模块「样式」调整颜色、背景、间距；「公开名单」设置排序规则，或输入位置/上下移动。保存并刷新后配置应保持。
4. 「视觉与分享 → 视觉与动效」配置主题、背景、字体和统一替换。预览确认后发布，旧个人链接仍统一更新，草稿不对外展示。
5. 嘉宾效果：`http://localhost:3001/i/robpMSTgZ00QxpcfzdPHkvHOlTPzagxcfYJ-SPL5VvU`。独立本地示例，明确标注测试内容；地图为北京示例，不是实际会场。原「成品海报 · 邀请函编辑演示」保持不变。

### 最新验证结果

| 项目 | 结果 | 范围 |
| --- | --- | --- |
| 后端全量单元测试 | PASS，521 项 | 素材类型/大小/签名、素材读取范围、引用删除保护及全部既有后端回归 |
| 后台工具单元测试 | PASS，29 项 | 本轮新增结构化模块、样式和字体过滤、稳定排序、长介绍与头像回读 |
| 真实 API 集成 | PASS，1 个完整流程 | 上传图片和字体自动入库、邀约员越权拒绝、扩展字段发布，保留旧链接同步和原权限/支付归因验证 |
| 接口夹具浏览器回归 | PASS，28 项 | 手机/桌面编辑、素材复用、保存刷新回读、排序定位、轮播滑块、标签键盘、搜索、字体实际加载/回退、WAV 实际解码播放与视频失败提示，以及既有功能 |
| 正式构建 + 真实 API 浏览器 | PASS，2 项 | 390/1440px，异步资源、真实上传海报、轮播、标签、跨页定位、真实地图瓦片与页面无横向溢出 |
| 类型检查、构建、渲染契约 | PASS | 全 workspace 类型检查，API/后台构建，Runtime/Render Governor 两份契约 |
| 微信真机、正式域名、正式媒体播放 | NOT_RUN | 未部署生产；未验证微信 iOS/Android 的 MP4 解码和地图连通性；本轮未改用户端，未重跑 H5/小程序构建 |

图片加载成功不能直接等同地图成功：实际截图发现 OSM 返回访问受限图片，已按其要求仅对瓦片设置 `referrerPolicy: origin`，复测确认显示真实街道与标记，不向外发送完整嘉宾 URL。正式构建另修复了延迟模块的 CSS/JS 路径和上传资源错误指向生产域名的问题。后台构建仍有既有大包和依赖注释提示，不影响完成。

本轮主要文件：`packages/shared/src/invitation-design.ts`、`invitations.ts`，`apps/admin/src/components/invitations/` 下的 `InvitationAssetField`、`InvitationExtraModuleEditor`、`InvitationModuleStyleEditor`、`InvitationThemeEditor`、`InvitationCarousel`、`InvitationMap`、`InvitationExtraModule`，以及既有 Document/Modules/Rows/Roster 编辑器；`utils/invitation-font.ts`，邀请页面及 services，API `invitation-assets.service.ts`/控制器/模块，`admin-materials.service.ts`，Vite/依赖文件、相关测试与 `scripts/invitations-studio-preview.mjs`。本轮无新迁移，既有未提交 CMS 工作保持原状。

视觉证据：`output/playwright/invitation-studio-style-390.png`、`invitation-studio-style-1512.png`、`invitation-studio-live-390.png`、`invitation-studio-live-1440.png`、`invitation-map-live-detail.png`。用户仍需确认最终审美与正式会议素材。

以下保留前几轮记录，最新结果以上表为准。

## 上轮：海报画布与模块编辑

- 成品海报原比例展示，姓名等可选文字图层支持拖动、键盘微调及位置/宽高数值；支持字号、三类字体、颜色、粗斜体、下划线、对齐和长文本自适应。显示实际上传尺寸与 1080 × 1920 px 建议尺寸。
- 会议文字可留空，图片已包含的日期、地点、名称和正文无需重复填写。海报模式不再套模板标题和遮罩。
- 内容区扩展为模块列表 + 大画布，支持新增图文/图片及结构化模块，排序、隐藏、删除；完整富文本工具栏与全屏编辑。
- 视觉区独立配置章节动画、封面动画、滚动形式和时长，保持手机端和系统减少动态效果可用。
- 公共名单、姓名变量、邀请权限、草稿隔离和全链接同步继续保留；未修改支付、计价、订单或其他 CMS 编辑器的既有改动。
- 新增共享契约 `packages/shared/src/invitation-design.ts`，新增 `InvitationCoverCanvas.vue`、`InvitationCoverEditor.vue`、`InvitationModulesEditor.vue`、`InvitationRichTextEditor.vue`、`utils/invitation-richtext.ts`；调整邀请函页面、设计面板、公共渲染、图片字段及发布校验。JSON 向后兼容，本轮无新数据库迁移或依赖。

### 本轮验收入口

- 后台 `http://localhost:5174/#/invitations`，选择「成品海报 · 邀请函编辑演示」。仍使用现有本地演示账号，密码未轮换。
- 嘉宾甲 `http://localhost:3001/i/yeyNUmG4mgKFKHLfPjP106oa1Hbl7dmYLuGYJBfkXIs`。
- 嘉宾乙 `http://localhost:3001/i/q1fPFqCXt7GF5oXXDE9AJHgYmtYSM0rReVcneEUyrUc`。
- 封面使用用户提供的原图，未修改图内文案、照片、标识和二维码。该会议为独立本地演示，不对外发送，报名入口关闭；不是正式发布的会议。
- 「封面设计 → 上传成品海报」选择文字层，拖动或调整数值；在「会议内容」新增图文模块并调整顺序；预览后保存并发布，再打开两条旧链接核对。
- 演示种子脚本 `scripts/invitations-artwork-preview.mjs` 仅允许本机隔离数据库，读取既有本地账号，不轮换密码、不覆盖已发布的演示内容。

以下为前两轮功能与基线记录，最终本轮测试结果见文末。

## 已实现

- 一场会议一份共享发布内容，个人链接只存受邀人和负责人。草稿独立保存，发布后所有旧链接读取新内容；已打开的在线页面每 20 秒及恢复可见时更新。
- 独立邀请函后台：会议内容、议程、公开嘉宾及拟邀名单、可配置会议主视觉与配色、分享封面、个人邀请生成/修改/停用、授权与分页搜索。
- 查看、生成、内容编辑、发布、查看全部邀约、会议授权六项权限；按会议及创建者隔离，普通邀约员不能读取未发布草稿。
- 手机优先邀请页面和工作人员后台。后台预览与公开页面共用同一受 Render Governor 管理的组件。
- 本轮新增 Excel/XLS/CSV/TSV 公开名单导入、自动列识别和可修正映射、重复/异常行检查、表格搜索及分页；姓名唯一时自动定位，同名要求工作人员选择绑定，删除绑定行不误认另一人。
- 视觉编辑改为三种整套预设、双主视觉素材、实时手机预览与可重播入场动效；精细设置折叠；快速配置导航与保存并发布。
- 分享标题及摘要支持 `{姓名}`、`{称谓}`、`{会议名称}`，同一解析器覆盖后台预览、页面标题、服务端分享元信息和微信 SDK。
- 正式域名限制为 guanchaohuiji.com 及其 HTTPS 子域名。本地演示明确使用 localhost，不是正式发送地址。
- 微信图文卡片签名、品牌链接二维码、开放标签报名及小程序码降级入口；已有聊天卡片缓存不能保证更新。
- 小程序直接报名保留邀请标识，订单事务验证匹配；只有支付成功的 Registration 计入报名。普通购物车和定价、支付逻辑不变。

## 验证结果

| 项目 | 结果 | 范围 |
| --- | --- | --- |
| 后端全量测试 | PASS，515 项 | 邀请权限、名单上限/重复 ID/空姓名、HTML 转义、签名、限流、报名、支付等 |
| 后台单元测试 | PASS，20 项 | 含本轮 7 项名单识别/稳定 ID/冲突/合并/超限、变量替换、微信 SDK 与预设测试 |
| 真实接口集成 | PASS | 角色/会议/负责人隔离、草稿隔离、两条旧链接同步、同名绑定/错误绑定拒绝/删除行不误匹配、不同姓名的服务端标题、版本冲突、支付关联及幂等、停用 |
| 浏览器验证 | PASS，19 项 | 16 项接口夹具测试；3 项真实 API 测试，含 Excel/XLS/CSV 上传、同名确认、本人定位、保存并发布、姓名变量及动效开关 |
| 多尺寸页面 | PASS | 320×640、360/390/430/1440px，首屏正文入口、图片加载、文字换行、横向溢出、议程切换、名单搜索、定位、二维码 |
| 数据库迁移 | PASS | 隔离本机 PostgreSQL 18.4 测试库，53 个迁移；本轮新增 nullable 公开名单行绑定列，Prisma schema diff 无差异 |
| API/后台构建 | PASS | 后台构建含独立 invitation.html 入口 |
| 用户 H5/小程序构建 | 上轮 PASS，本轮未重跑 | 本轮未改用户端代码；未运行微信开发者工具 |
| 类型检查 | PASS | 本轮全 workspace 类型检查通过，包括 API、后台和用户端 |
| Runtime/Render Governor | PASS | 两份既有契约测试文件 |
| 微信真机、正式域名与正式支付 | NOT_RUN | 需正式部署、公众号配置、小程序发布和 iOS/Android 验收 |

此前全量测试遇到系统临时目录权限限制，改用项目 `.tmp` 后重跑全部通过。Docker 启动受阻，使用了独立本机测试库，未重启其他容器或修改正式数据。后台构建保留既有大包提示，公开邀请入口未加载后台主包。

本轮修复首次启动解析 Worker 时 Vite 依赖优化触发刷新问题，使用 `optimizeDeps.include: ["xlsx"]` 提前优化。后端 Node 测试须在 `services/api` 工作目录运行以加载实验性装饰器配置；从仓库根目录直接执行会得到测试运行器配置错误，不是产品接口故障。

## 主要文件

- `packages/shared/src/invitations.ts`：共享内容与接口契约。
- `services/api/src/invitations/`：公开页面、接口、发布、权限、上传及微信服务。
- `prisma/schema.prisma` 和 `prisma/migrations/20260930123000_conference_invitations/`：增量模型与迁移。
- `apps/admin/src/pages/invitations/`、`components/invitations/`、`invitation/`、`invitation.html`：后台和公开 H5。
- `apps/user/src/pages/registration/form.vue`、`services/registration.ts`，以及 API 报名服务：仅增加邀请来源与直接报名入口保护。
- 后台路由与角色权限、API 模块与静态路由、Design System 注册、Vite 多入口、环境变量示例和依赖锁文件。
- `tests/e2e/invitations.integration.ts`、`tests/frontend/invitations*.spec.ts`、邀请模块与限流单元测试。
- 本轮主要新增/修改：`InvitationDesignStudio.vue`、`InvitationRosterEditor.vue`、`InvitationDocument.vue`、`utils/invitation-roster*`、共享邀请契约、名单绑定迁移、邀请 API、分享解析消费端、两张 `public/invitation-art/` 图片。

已有 CMS 编辑器、页面预览等未提交修改保持原状，未混入本功能重构。

## 本地验收

后台：`http://localhost:5174/#/invitations`。本次隔离测试账号存于 `.tmp/invitation-preview-access.json`，仅有邀请函模块权限，不是正式账号。可用 `scripts/invitations-local-preview.mjs` 轮换测试密码。

1. 登录后台，在「视觉与分享」点选整套预设，修改预览姓名，确认分享标题替换；可展开高级设置上传本场会议视觉。
2. 在「公开名单」上传 Excel/CSV，检查自动识别的表头与列、预览行，选择合并或替换。上传文件与内部手机号不进入公开接口。
3. 保存草稿时旧链接仍显示已发布内容；点击「保存并发布」或「发布更新」，所有旧链接同步。两位同名嘉宾须选择对应单位才能生成。
4. 打开个人邀请，在公开名单点击「查看我的位置」，应跨页定位、高亮本人；将绑定行删除后发布，不应高亮另一位同名嘉宾。
5. 在手机体验生成邀请、微信卡片预览、名单搜索、报名入口；开启系统减少动态效果时页面不播放入场动画。

公开演示：`http://localhost:3001/i/WSAZ7lcQDCSpz2IM7GKGrcJArPmKfwDQSZPgaKMMovo`。仅更新了隔离测试库中的演示会议：潮汐朱红预设、30 行明确标注的演示名单、姓名变量标题。

演示内容和封面仅用于功能验证，不代表正式会议资料。正式配置和发布步骤见 `docs/invitations-implementation.md`。

## 上轮最终结果（2026-10-01，海报画布）

| 项目 | 结果 | 范围 |
| --- | --- | --- |
| 后端全量单元测试 | PASS，517 项 | 包括无重复会议文字的海报发布、模块/图层上限、既有权限与支付测试 |
| 后台单元测试 | PASS，26 项 | 新增 6 项旧数据兼容、图层边界、模块顺序、富文本过滤/字体回读、URL 安全和动效校验 |
| 真实 API 集成 | PASS，1 项完整流程 | 两条旧链接同时更新封面图层、富文本、模块顺序/隐藏状态和动效；未发布草稿不泄露；保留权限、版本冲突、支付归因和幂等验证 |
| 浏览器回归 | PASS，27 项 | 22 项接口夹具 + 5 项真实 API；实际用户海报、320/390/1440px 定位、长姓名收缩、拖动、字体/字号/粗斜体保存回读、全屏、模块排序/隐藏、章节停靠与减少动态效果，以及既有名单导入/定位/分享 |
| 类型检查 | PASS | 全 workspace；富文本字体兼容修复后后台类型检查再次通过 |
| Runtime / Render Governor | PASS，2 份契约测试 | 后台预览与嘉宾页面保持共用渲染组件 |
| 构建 | PASS | API、后台及独立邀请页；保留既有依赖注释与大包提示 |
| 微信真机与正式上线 | NOT_RUN | 本轮没有部署生产，不将 localhost 演示当作正式品牌域名；未重新运行小程序/H5 构建 |

主要视觉证据位于 `output/playwright/invitation-cover-editor.png`、`invitation-cover-editor-mobile.png`、`invitation-modules-editor.png`、`invitation-artwork-live-390.png` 和 `invitation-artwork-live-1440.png`。

测试过程中修正了 WangEditor 字体引号序列化兼容、选区更新等待及即时失焦同步；真实演示会议设为本地已发布、会议日期保持原图日期，因此报名显示截止。真实 API 测试与人工/浏览器演示使用同一隔离库时，浏览器必须明确选择演示会议，不依赖最新创建记录；测试清理仅按当次自建会议 ID 删除其夹具。
