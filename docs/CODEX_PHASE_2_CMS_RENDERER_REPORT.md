# Codex Phase 2 CMS Renderer Report

日期：2026-06-15

分支：`codex/phase-2-cms-renderer-governance`

范围：本阶段只处理 CMS PageRenderer 组件治理、用户端装修组件基础展示、后台装修页支持状态提示和会议详情页重复报名 CTA 治理。不修改后端接口、Prisma、支付、金额、订单、报名状态、生产配置、真实 env、证书或构建产物。

## 1. 本次补齐的组件

用户端 `apps/user/src/components/PageRenderer.vue` 本次补齐了会议详情和自定义页面常用装修组件的基础展示：

| 组件 | 支持状态 | 用户端展示能力 |
| --- | --- | --- |
| `faq` | 基础支持 | 常见问题卡片列表，支持字符串列表和对象数组兜底 |
| `schedule-timeline` | 基础支持 | 日程时间轴，支持时间、标题、说明 |
| `speaker-cards` | 基础支持 | 嘉宾卡片，支持姓名、角色、简介、头像兜底 |
| `carousel` | 基础支持 | 小程序/H5 图片轮播，缺图时显示柔和空态 |
| `countdown` | 基础支持 | 目标时间倒计时，目标时间缺失时显示空态 |
| `map-contact` | 基础支持 | 地址和联系电话展示，电话可触发 `uni.makePhoneCall` |
| `sponsor-wall` | 基础支持 | 赞助商名称或 Logo 墙展示 |

同时新增用户端支持矩阵文件：

- `apps/user/src/utils/cmsComponents.ts`

该文件覆盖 `hero`、`conference-list`、`conference-tabs`、`registration-button`、`floating-registration-button`、`promotion-bar`、`rich-text`、`safe-html`、`image-grid`、`video`、`notice`、`stats-grid`、`ticket-price-list`、`process-steps`、`text-image`、`download-list`、`live-card`、`testimonial-list`、`traffic-guide`、`contact-card`、`tag-filter`、`title`、`divider`、`spacer`、`carousel`、`speaker-cards`、`schedule-timeline`、`coupon-card`、`countdown`、`search`、`map-contact`、`sponsor-wall`、`faq`、`membership-benefits`、`user-profile-card`、`my-order-list`、`mall-product-grid`。

## 2. 仍暂不支持的组件

以下组件在用户端正式页面不展示，后台装修页会提示运营暂勿发布：

| 组件 | 状态 | 原因 |
| --- | --- | --- |
| `coupon-card` | 暂不支持 | 优惠券属于扩展/灰度能力，暂不纳入第一版装修展示 |
| `search` | 暂不支持 | 搜索交互暂未接入用户端页面状态和数据筛选 |
| `membership-benefits` | 后续开放 | 会员模块不属于第一版会议报名缴费主线 |
| `user-profile-card` | 后续开放 | 用户中心增强后续处理 |
| `my-order-list` | 后续开放 | 订单中心后续开放 |
| `mall-product-grid` | 后续开放 | 商城模块后续开放 |

## 3. 用户端降级策略

用户端 `PageRenderer` 现在按支持矩阵处理组件：

- `supported` 和 `basic`：允许渲染。
- `unsupported`、`planned` 和未知组件：用户端正式页面静默隐藏。
- 不再向普通用户展示“当前组件暂未支持预览”等开发提示。
- 配置字段缺失时使用安全兜底文案，例如“嘉宾信息待公布”“日程安排待公布”“会议地址待公布”。
- 新增组件兼容后台当前的字符串列表配置，也尽量兼容未来对象数组配置。

## 4. 后台装修页提示策略

`apps/admin/src/pages/cms/pages.vue` 新增前端展示层支持状态提示：

- 组件库卡片展示“已支持”“基础支持”“暂不支持小程序/H5”“后续开放”。
- `unsupported` 和 `planned` 组件在组件库中禁用添加，不改变后端预设接口、不改变数据库结构。
- 已经存在于草稿中的未支持组件不会被删除，但组件卡片会提示“用户端正式页面会静默隐藏，建议暂勿发布”。
- 手机预览中，未支持组件显示柔和提示：“该组件暂不支持小程序/H5展示，建议暂勿发布”。
- 基础支持组件显示弱提示，提醒发布前在 H5 和小程序中核对字段。

后台仅补充 UI 类型：

- `apps/admin/src/services/types.ts` 新增 `CmsComponentSupportStatus` 类型，不改变接口协议。

## 5. 报名按钮重复治理策略

会议详情页已有固定底部 `FixedBottomActionBar` 报名按钮。本次采用最小改动策略：

- 在 `apps/user/src/pages/conference/detail.vue` 调用 `PageRenderer` 时传入 `suppress-registration-cta`。
- `PageRenderer` 在该场景隐藏 `registration-button` 和 `floating-registration-button`。
- 自定义页面、首页等其他 CMS 页面不传该参数，仍允许 CMS 报名按钮展示。
- 后台装修页在会议详情页场景中提示运营：详情页会使用固定底部报名按钮，CMS 报名按钮会被隐藏。

## 6. 未修改的后端/支付/金额/Prisma/生产配置内容

本阶段未修改：

- `services/api/**`
- `prisma/**`
- `packages/shared/**` 中金额、订单、支付、报名状态相关类型或逻辑
- `apps/user/src/services/payment.ts`
- `apps/user/src/services/registration.ts`
- `apps/user/src/services/request.ts`
- `apps/user/src/config/app.ts`
- `.env`、`.env.local`、`.env.production`、`apps/admin/.env.production`
- `uploads/**`、`services/api/uploads/**`
- `docker-compose.prod.yml`
- `start-api.sh`
- 任意证书、私钥、微信商户私钥、API v3 Key、AppSecret、JWT_SECRET
- 任意构建产物

## 7. 验证命令和结果

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @conference/user typecheck` | 通过 |
| `pnpm --filter @conference/admin typecheck` | 通过 |
| `pnpm build:user:h5` | 通过，uni-app 仅提示有新版本 |
| `pnpm build:admin` | 通过，Vite/Rollup 输出 PURE 注释和 chunk size 常规警告 |
| `pnpm build:user:mp-weixin` | 通过，uni-app 仅提示有新版本 |
| `git diff --check` | 通过 |

## 8. Phase 3 建议

1. 将 CMS 支持矩阵进一步抽为前后端共享的只读配置，避免用户端和后台前端各维护一份状态口径。
2. 为 `faq`、`schedule-timeline`、`speaker-cards` 等组件补结构化配置表单，减少运营用分隔符输入带来的歧义。
3. 增加后台发布前检查：如果草稿仍包含 `unsupported` 或 `planned` 组件，发布前给二次确认。
4. 增加 H5 与小程序截图验收用例，覆盖会议详情页 CMS CTA 隐藏、FAQ、日程、嘉宾、轮播、倒计时、地图联系和赞助商展示。
5. 后续如要开放 `coupon-card`、`search`、会员或商城组件，应另起业务任务，先明确数据来源、接口契约和上线范围。
