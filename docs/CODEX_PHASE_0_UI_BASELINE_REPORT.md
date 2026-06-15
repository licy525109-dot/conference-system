# Codex Phase 0 UI Baseline Report

审计日期：2026-06-15

审计分支：`codex/phase-0-ui-baseline-audit`

审计范围：仅基于当前仓库代码进行 UI/UX 基线审计。本阶段不修改业务代码，不修改 `services/api`、`prisma`、支付逻辑、微信支付 `prepay`、`notify`、订单金额计算、数据库连接，也不创建或修改真实生产环境变量文件。

## 1. 当前用户端页面清单

来源：`apps/user/src/pages.json`、`apps/user/src/pages/**`、`apps/user/src/components/**`

| 页面 | 路径 | 当前定位 | UI 改造优先级 |
| --- | --- | --- | --- |
| 首页 | `pages/index/index` | 可报名会议列表；优先读取 CMS 发布页，失败或未发布时使用固定会议列表 | 高 |
| 会议详情 | `pages/conference/detail` | 会议详情、会议时间地点、票种、库存、报名入口；优先读取 CMS 发布页 | 高 |
| 报名表单 | `pages/registration/form` | 票种数量、优惠码、quote 展示、动态参会人表单、加入购物车、提交订单 | 高 |
| 支付结果 | `pages/payment/result` | 订单支付状态查询、模拟支付或微信支付入口、刷新状态、返回首页、我的报名 | 高 |
| 我的报名 | `pages/registrations/my` | 当前用户报名记录列表 | 高 |
| 购物车 | `pages/cart/index` | 会议报名项结算，商品项预留；当前不属于最小会议报名缴费主线 | 中，建议标注灰度/后续 |
| 会员中心 | `pages/member/center` | 用户资料、会员等级展示；当前文案说明会员价格不参与报名定价 | 低，建议标注预留/后续 |
| 商城列表 | `pages/mall/index` | 商品列表、分类、搜索 | 低，建议标注预留/后续 |
| 商品详情 | `pages/mall/detail` | 商品图、规格、数量、加购物车；商品支付链路后续开放 | 低，建议标注预留/后续 |
| 自定义页面 | `pages/custom/index` | 根据 `pageKey` 渲染 CMS 发布页 | 中 |

当前用户端公共组件：

| 组件 | 路径 | 当前定位 |
| --- | --- | --- |
| `CustomTabbar` | `apps/user/src/components/CustomTabbar.vue` | 后台动态底部导航，支持图标、选中图标、登录限制、角标和排序 |
| `PageRenderer` | `apps/user/src/components/PageRenderer.vue` | 小程序 CMS 页面渲染器，承接首页、会议详情、自定义页装修 |
| `WechatProfilePrompt` | `apps/user/src/components/WechatProfilePrompt.vue` | 微信小程序头像和昵称补全弹窗，仅 `MP-WEIXIN` 环境启用 |

## 2. 当前后台页面清单

来源：`apps/admin/src/router/index.ts`、`apps/admin/src/pages/**`

| 菜单分组 | 页面 | 路径 | 当前定位 | UI 改造优先级 |
| --- | --- | --- | --- | --- |
| 运营概览 | 数据看板 | `/dashboard` | 收入、订单、报名、库存、最近订单/报名概览 | 高 |
| 会议运营 | 会议管理 | `/conferences` | 会议列表、新建、编辑、状态切换、封面素材选择 | 高 |
| 会议运营 | 会议配置详情 | `/conferences/config` | 基础信息、票种、报名字段、优惠券、满减、页面装修入口 | 高 |
| 会议运营 | 订单列表 | `/orders` | 订单和支付信息查询，含订单详情弹窗 | 高 |
| 会议运营 | 报名名单 | `/registrations` | 报名记录、参会人、备注、手动核销 | 高 |
| 营销工具 | 优惠券 | `/coupons` | 优惠券配置，订单创建时后端重新计算优惠 | 中，建议灰度 |
| 营销工具 | 满减规则 | `/promotions` | 满金额或满张数优惠配置 | 中，建议灰度 |
| 页面装修 | 小程序页面装修 | `/pages` | 页面版本、组件添加、配置、发布和手机预览 | 高 |
| 页面装修 | 主题配置 | `/themes` | 小程序主题色、圆角、按钮、卡片样式配置 | 高 |
| 页面装修 | 底部导航配置 | `/tabbar` | 小程序底部导航项配置 | 高 |
| 页面装修 | 素材管理 | `/materials` | 图片、图标、视频、字体素材管理 | 中 |
| 用户资产 | 用户与会员 | `/members/users` | 用户查看、手动授予会员 | 低，建议预留 |
| 用户资产 | 会员等级 | `/members/levels` | 会员等级、价格、权益配置 | 低，建议预留 |
| 交易财务 | 财务与对账 | `/finance` | 本地订单与支付流水汇总、差异扫描 | 中，建议后台内测 |
| 交易财务 | 商城商品 | `/mall/products` | 商品、分类、商品 SKU 管理 | 低，建议预留 |
| 交易财务 | 商城订单 | `/mall/orders` | 商城订单查看 | 低，建议预留 |
| 系统设置 | 账号管理 | `/system/accounts` | 后台账号和角色分配 | 中 |
| 系统设置 | 角色权限 | `/system/roles` | 角色和权限配置 | 中 |

后台公共结构：

- `apps/admin/src/App.vue`：登录页和后台布局入口。
- `apps/admin/src/layouts/AdminLayout.vue`：侧边栏、顶部栏、权限拦截和页面承载。
- `apps/admin/src/styles.css`、`apps/admin/src/styles/tokens.css`、`apps/admin/src/styles/admin-theme.css`：后台全局样式、设计 token 和通用面板样式。

## 3. 当前 CMS PageRenderer 支持的组件清单

来源：`apps/user/src/components/PageRenderer.vue`

前端实际支持并有专门渲染分支的组件：

| 组件类型 | 当前渲染能力 |
| --- | --- |
| `hero` | 顶部横幅图片，未配置时显示占位 |
| `conference-list` | 会议卡片列表，支持封面、标题、摘要、时间、地点、报名人数和按钮 |
| `conference-tabs` | 分类标签展示和前三条会议卡片展示，目前标签只展示，不做真实筛选 |
| `registration-button` | 普通报名按钮 |
| `floating-registration-button` | 底部悬浮报名按钮 |
| `rich-text` | 富文本片段 |
| `safe-html` | 与 `rich-text` 同一渲染分支 |
| `image-grid` | 图片宫格 |
| `video` | 视频组件 |
| `notice` | 公告条 |
| `promotion-bar` | 与 `notice` 同一渲染分支 |
| `stats-grid` | 数字亮点 |
| `ticket-price-list` | 列表型展示 |
| `process-steps` | 列表型展示 |
| `download-list` | 列表型展示 |
| `testimonial-list` | 列表型展示 |
| `tag-filter` | 列表型展示，目前仅展示标签文本，不做筛选 |
| `text-image` | 图文介绍 |
| `live-card` | 直播入口展示 |
| `traffic-guide` | 交通指南文本展示 |
| `contact-card` | 咨询卡片，支持电话按钮展示 |
| `title` | 标题文本 |
| `divider` | 分割线 |
| `spacer` | 留白 |

统一兜底：未命中的组件类型会显示“当前组件暂未支持预览”。

## 4. 后端 CMS 预设组件和前端实际支持组件的差异

来源：`services/api/src/cms/cms-defaults.ts` 与 `apps/user/src/components/PageRenderer.vue`

### 4.1 后端已启用且前端已支持

`hero`、`conference-list`、`conference-tabs`、`registration-button`、`floating-registration-button`、`promotion-bar`、`rich-text`、`safe-html`、`image-grid`、`video`、`notice`、`stats-grid`、`ticket-price-list`、`process-steps`、`text-image`、`download-list`、`live-card`、`testimonial-list`、`traffic-guide`、`contact-card`、`tag-filter`、`title`、`divider`、`spacer`

### 4.2 后端已启用但前端当前未实现专门渲染

| 后端预设类型 | 后端名称 | 当前前端表现 | Phase 1 建议 |
| --- | --- | --- | --- |
| `carousel` | 轮播图 | 进入未知组件兜底 | 若首页需要轮播，应补齐；否则后台先隐藏 |
| `speaker-cards` | 嘉宾卡片 | 进入未知组件兜底 | 会议详情页常用，建议补齐或先隐藏 |
| `schedule-timeline` | 日程时间轴 | 进入未知组件兜底 | 会议详情页常用，建议补齐或先隐藏 |
| `coupon-card` | 优惠券领取卡片 | 进入未知组件兜底 | 当前优惠属于扩展/灰度，建议先隐藏 |
| `countdown` | 倒计时 | 进入未知组件兜底 | 可补齐为转化组件，或先隐藏 |
| `search` | 搜索框 | 进入未知组件兜底 | 如果首页会议数量少，可先隐藏 |
| `map-contact` | 地图与联系信息 | 进入未知组件兜底 | 可并入交通指南，或先隐藏 |
| `sponsor-wall` | 赞助商 Logo 墙 | 进入未知组件兜底 | 非报名支付主线，建议后续 |
| `faq` | 常见问答 | 进入未知组件兜底 | 可补齐为纯展示组件，优先级中 |

### 4.3 后端保留但默认禁用的预设

| 后端预设类型 | 后端名称 | 建议 |
| --- | --- | --- |
| `membership-benefits` | 会员权益卡 | 标注预留/后续 |
| `user-profile-card` | 用户资料卡 | 标注预留/后续 |
| `my-order-list` | 我的订单列表 | 标注预留/后续 |
| `mall-product-grid` | 商城商品宫格 | 标注预留/后续 |

## 5. 当前用户端 UI/UX 问题

1. 固定业务页与 CMS 页面渲染器的视觉体系不完全统一。固定页多在各自 scoped style 中重复定义按钮、卡片、字号和状态样式，CMS 页则依赖主题变量。
2. 首页、会议详情、报名页、支付结果、我的报名的核心链路可用，但页面层级偏“功能直出”，缺少统一的流程感和关键转化信息层级。
3. 报名页同时承载票种数量、优惠码、quote、多人动态表单、购物车、提交订单，移动端认知负担较重。第一版建议突出“选票 - 填信息 - 确认支付”的主线。
4. 报名页中优惠码和购物车属于扩展能力，容易稀释最小会议报名缴费主线。若第一版不主推优惠和购物车，建议隐藏、灰度或弱化。
5. 支付结果页当前偏状态和按钮堆叠，缺少“下一步”主行动优先级，例如已支付后应突出“查看我的报名”，待支付时突出“继续支付”。
6. 我的报名列表信息完整但视觉层级偏平，报名号、会议名、票种、参会人、金额、状态可以重组为更易扫描的凭证卡片。
7. `CustomTabbar` 支持后台动态配置，但默认可见项只有首页和我的报名。购物车、会员、商城虽然页面存在，但默认隐藏；UI 设计稿需要明确哪些 tab 在第一版上线。
8. `PageRenderer` 支持自定义字体加载和主题变量，但组件能力不完整，后台可配置但前端不支持的组件会破坏发布页体验。
9. 多数页面没有共享的空状态、错误态、加载态组件，后续统一视觉时应抽取或建立样式规范。
10. 小程序真实 API 默认指向生产域名，H5 默认指向 `http://localhost:3001/api`。调试说明必须明确服务器真实 API 端口是 `3001`，`3000` 是 `certificate-site`，不是会议 API。

## 6. 当前后台 UI/UX 问题

1. 后台已具备统一壳、侧边栏、顶部栏和权限判断，但业务页面仍以表格、弹窗、表单直接组合为主，信息架构需要收敛。
2. 当前菜单覆盖会议、营销、装修、用户、财务、商城、系统等多条业务线，已超过第一版会议报名缴费主线。第一版 UI 应明确主线菜单和预留菜单。
3. 会议配置详情页同时包含基础信息、票种、字段、优惠券、满减、页面装修入口，功能密度高。建议 Phase 1 强化“会议配置中心”层级，并弱化优惠/满减等扩展入口。
4. 页面装修后台可以添加组件，但前端不支持所有启用预设，后台缺少“该组件小程序端暂不支持”的显式提示。
5. 后台通用状态展示多为原始枚举或简单中文文本，订单、报名、支付、发布、启用状态建议统一为状态标签。
6. 表格操作区大量使用小按钮和弹窗，缺少统一的主操作、次操作和危险操作规范。
7. Dashboard、Finance、Materials、CMS 等页面已存在，但第一版上线价值不同。后台首页应优先服务会议订单、报名、支付状态和库存预警。
8. 账号和角色权限是后台安全基础，应保留，但 UI 上不应与日常会议运营功能同权重展示。
9. 后台样式 token 已有，但 Element Plus 组件尺寸、表格密度、弹窗宽度和表单布局仍需要统一规范。
10. `apps/admin/dist.zip` 存在于仓库根工作区文件列表中。Phase 1 UI 开发应避免提交构建产物压缩包，除非明确作为交付物。

## 7. 第一版 UI 改造主线建议

第一版建议围绕“会议报名缴费闭环”重构，而不是把所有扩展模块一起产品化。

建议主线：

1. 用户端首页：展示会议品牌、可报名会议、时间地点、报名状态和进入详情按钮。
2. 会议详情页：突出会议信息、票种价格、库存/报名截止、报名 CTA、会议内容模块。
3. 报名页：拆清选票、填写参会人、价格确认、提交订单四个层级；所有金额只用于展示，最终金额仍由后端重算。
4. 支付结果页：按待支付、支付中、已支付、失败/异常分别设计主操作。
5. 我的报名页：改造成报名凭证卡片，突出会议、参会人、票种、支付金额、报名状态。
6. 后台会议配置：围绕会议基础信息、票种、报名字段、订单和报名名单做运营闭环。
7. 页面装修：只开放前端实际支持的组件，或者在后台清楚标注“该组件小程序端暂不支持”。

设计方向：

- 用户端：建立统一移动端设计 token，包括颜色、字号、间距、按钮、卡片、表单、底部导航、状态页。
- 后台：延续 Element Plus，但统一后台密度、状态标签、表格工具栏、弹窗表单、详情抽屉/弹窗。
- CMS：组件能力先收敛再扩展，避免后台可配置但线上不可用。

## 8. 第一版会议报名缴费主线模块

用户端主线：

- 首页会议列表：`apps/user/src/pages/index/index.vue`
- 会议详情：`apps/user/src/pages/conference/detail.vue`
- 报名表单：`apps/user/src/pages/registration/form.vue`
- 支付结果：`apps/user/src/pages/payment/result.vue`
- 我的报名：`apps/user/src/pages/registrations/my.vue`
- 必要公共组件：`CustomTabbar`、`PageRenderer`、`WechatProfilePrompt`
- 必要服务封装：会议、报名、支付、认证、请求、金额格式化、日期格式化

后台主线：

- 后台登录和布局
- 数据看板中与会议订单、报名、收入、库存相关的部分
- 会议管理
- 会议配置详情中的基础信息、票种、报名字段
- 订单列表和订单详情
- 报名名单、参会人详情、备注、核销
- 页面装修中用于首页和会议详情的实际可用组件
- 主题配置、底部导航、素材管理中支撑会议页展示的最小部分
- 账号管理和角色权限作为后台安全基础保留

后端主线：

- 会议公开查询
- 报名表单定义
- quote 展示
- 创建订单，后端重新计价
- mock 支付和微信支付接入
- 支付成功后生成报名记录
- 我的报名
- 后台鉴权和会议/订单/报名管理接口

## 9. 扩展模块，应标注为预留/灰度/后续

建议标注为预留或后续：

- 会员中心、会员等级、会员权益、会员价格规则
- 商城商品、商城订单、商品购物车、商城支付和履约
- 购物车中的商品结算能力
- 优惠券和满减规则，除非第一版明确要灰度上线营销能力
- 财务对账批次、差异扫描、微信账单导入
- 退款、发票相关模型或页面能力
- CMS 中的会员权益卡、用户资料卡、我的订单列表、商城商品宫格
- CMS 中当前前端未支持的轮播、嘉宾、日程、倒计时、搜索、地图联系、赞助商、FAQ 等组件，除非 Phase 1 明确补齐

建议灰度处理：

- 购物车中的会议报名项结算。如果第一版需要团体/多票能力，可保留；如果只做直接报名支付，建议先隐藏入口。
- 优惠券和满减。如果当前生产配置已有依赖，可保留后台能力但用户端入口弱化；否则建议先不进入第一版主流程。
- 财务与对账。可保留后台内测入口，不作为普通运营人员第一版主导航。

## 10. Phase 1 允许修改的文件范围

建议 Phase 1 只允许修改 UI 和前端展示相关文件：

- `apps/user/src/pages/index/index.vue`
- `apps/user/src/pages/conference/detail.vue`
- `apps/user/src/pages/registration/form.vue`
- `apps/user/src/pages/payment/result.vue`
- `apps/user/src/pages/registrations/my.vue`
- `apps/user/src/pages/custom/index.vue`
- `apps/user/src/components/CustomTabbar.vue`
- `apps/user/src/components/PageRenderer.vue`
- `apps/user/src/components/WechatProfilePrompt.vue`
- `apps/user/src/App.vue`
- `apps/user/src/pages.json`，仅限页面标题、导航样式和 UI 展示相关配置
- `apps/user/src/utils/date.ts`、`apps/user/src/utils/money.ts`，仅限展示格式，不允许改变金额语义
- `apps/admin/src/App.vue`
- `apps/admin/src/layouts/AdminLayout.vue`
- `apps/admin/src/router/index.ts`，仅限菜单可见性、分组、文案和前端路由展示
- `apps/admin/src/pages/**`，仅限 UI 布局、展示文案、状态标签、表单排版、表格排版
- `apps/admin/src/styles.css`
- `apps/admin/src/styles/tokens.css`
- `apps/admin/src/styles/admin-theme.css`
- `apps/admin/src/services/types.ts`，仅限 UI 所需类型补充且不改变接口协议
- `docs/**`，用于设计说明、验收清单和操作说明
- `.env.example`，仅当确实新增环境变量时更新，并在 PR 说明中列出人工配置项

如 Phase 1 需要调整 CMS 预设可见性，应优先通过前端后台展示策略处理；若必须改后端 CMS 默认预设，应另起后端配置任务，并避开支付、订单、Prisma 和生产连接逻辑。

## 11. Phase 1 禁止修改的文件范围

严格禁止在 Phase 1 UI 改造中修改：

- `services/api/**`
- `prisma/**`
- `packages/shared/**` 中任何会影响金额、订单、支付、报名状态的共享类型或逻辑
- `apps/user/src/services/payment.ts`
- `apps/user/src/services/registration.ts` 中下单、quote、金额请求协议相关逻辑
- `apps/user/src/services/request.ts` 中生产 API 基础行为，除非另行审批
- `apps/user/src/config/app.ts` 中生产 API 域名、支付模式默认值，除非另行审批
- 微信支付 `prepay`、`notify`、签名、验签、解密、金额校验和幂等处理相关文件
- 订单金额计算、优惠计算、支付成功生成报名记录相关逻辑
- 数据库连接、迁移、seed、Prisma schema
- `start-api.sh`
- `docker-compose.prod.yml`
- `uploads/**`
- `services/api/uploads/**`
- `apps/admin/dist.zip`
- 任意构建产物目录，如 `dist/**`
- `.env`
- `.env.local`
- `.env.production`
- `apps/admin/.env.production`
- 任意证书、私钥、微信商户私钥、API v3 Key、AppSecret、JWT_SECRET、生产配置快照

服务器约束：

- 服务器真实 API 端口是 `3001`。
- `3000` 是 `certificate-site`，不是会议 API。
- 生产服务器通过 `start-api.sh` 加载 `/www/wwwroot/conference-system/.env.production`。
- 真实生产 `.env.production` 不在 GitHub 中，Phase 1 不允许创建、修改或提交。

## 12. 风险点和验证命令

### 12.1 主要风险点

1. CMS 后端启用预设与前端渲染能力不一致，发布页面可能出现“当前组件暂未支持预览”。
2. 第一版主线和扩展模块混在导航与页面中，容易让用户误以为会员、商城、优惠、财务对账都已完整上线。
3. 报名页承载过多能力，可能影响移动端转化和表单填写效率。
4. UI 改造若误改报名、quote、支付、订单金额服务，会触碰支付和金额安全边界。
5. UI 改造若误提交真实 env、证书、私钥、上传文件或生产脚本，会造成部署与安全风险。
6. 本地开发和服务器端口容易混淆。会议 API 使用 `3001`，不要把 `3000` 当作会议 API。
7. 小程序和 H5 共享代码，但支付能力存在平台差异。H5 默认 mock，微信小程序默认真实微信支付路径。

### 12.2 Phase 0 验证命令

本阶段为文档审计，建议验证命令：

```bash
git status --short
git diff --check
```

### 12.3 Phase 1 建议验证命令

Phase 1 进行 UI 改造后建议运行：

```bash
pnpm --filter @conference/user typecheck
pnpm --filter @conference/admin typecheck
pnpm build:user:h5
pnpm build:user:mp-weixin
pnpm build:admin
```

如 Phase 1 仅修改文档，可只运行：

```bash
git diff --check
```

如 Phase 1 误触支付、订单、报名或后端逻辑，应立即停止并改为单独后端审计任务，至少运行：

```bash
pnpm --filter @conference/api test
pnpm --filter @conference/api typecheck
```

### 12.4 人工验收建议

1. H5 使用 `pnpm dev:user:h5` 打开首页、会议详情、报名、支付结果、我的报名。
2. 微信小程序使用 `pnpm dev:user:mp-weixin` 构建后在微信开发者工具验证首页、详情、报名、微信资料弹窗和支付入口。
3. 后台使用 `pnpm dev:admin` 验证登录、菜单、会议配置、页面装修、订单和报名名单。
4. 接口联调时确认 API 指向 `http://localhost:3001/api` 或生产会议 API 域名，不要指向服务器 `3000`。
5. UI 改造后检查所有金额展示仍为分转元展示，不出现前端可信最终金额写入。
6. PR 提交前检查没有真实 env、证书、私钥、上传文件、构建压缩包或生产脚本变更。
