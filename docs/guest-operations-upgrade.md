# Guest operations upgrade

## Scope and safety boundaries

- Account identity, attendee identity and payment history are separate.
- Existing paid registrations remain usable; no bulk deletion or phone-based merging.
- Browser-only visitors do not create accounts. Existing sessions may refresh silently.
- New checkout requires real name and a platform-verified phone after coordinated rollout.
- An avatar is optional; a name avatar is the fallback.
- Submitted registration forms remain immutable snapshots. Corrections are audited separately.
- Guest schedule access follows an explicit attendee binding, never a guessed name match.
- Notifications require durable delivery records, retries and recipient permissions.
- Production deployment, WeChat review and recipient delivery are separate acceptance gates.

## Checklist

- [x] Account/registration bidirectional lookup, pagination and submitted-form detail
- [x] Explicit login, verified profile gate and persistent profile reuse
- [x] Guest profile, audited binding/claim/replacement and business order ownership
- [x] Private coupon experience, eligible coupon selection and scoped pending use
- [x] Cached public home, skeleton/error states and prioritized image loading
- [x] Mobile admin workspace and administrator paid-registration alert implementation
- [x] Additive migration authored and Prisma schema/diff checked
- [x] Regression tests, builds and mocked browser acceptance
- [ ] PostgreSQL migration execution and real transactional integration acceptance
- [ ] Production credentials/recipients confirmed and real-device acceptance

## Rollout

Apply additive migrations first. Keep REGISTRATION_PROFILE_REQUIRED disabled until
the compatible mini program is available to users. Enable administrator delivery
only after choosing real recipients and verifying the selected WeCom application.
Do not record tokens, raw OpenIDs or phone numbers in operational logs.

Legacy unverified phone values are not promoted to verified identities. Historical
records without a proven attendee-account link remain explicitly unbound. New
bindings must not rewrite the original order owner or payment/refund transaction.

## 本轮交付与使用入口

以下为开发阶段的功能记录。2026-09-22 已获授权进入提交、合并、生产部署和小程序上传流程；发布前验证与兼容开关见 `release-20260922.md`。未删除、合并或改绑任何生产嘉宾，未发送真实管理员通知。

| 需求 | 操作入口与行为 |
| --- | --- |
| 找到非实名账号 | 报名名单、订单增加“查看账号”；用户列表按参会人姓名、手机、报名号、订单号搜索。已报名账号即使无昵称也保留可查。 |
| 游客不混入用户列表 | 新版公共首页不自动登录建号；旧版留下的空资料且无业务记录账号默认隐藏，可用“包含历史游客”查看，未物理删除。 |
| 用户历史资料 | 用户详情显示原始下单、已绑定参会人、业务联系人三种关联；报名详情展示原始提交表单和当前资料。 |
| 代报名与手工调整 | 报名详情“账号与参会归属”可关联账号、更换参会人、解除关联、生成24小时领取口令和指定订单业务联系人；必须填写原因。 |
| 本人验证领取 | 小程序个人中心“领取参会资格”；验证手机号与该参会人一致后确认领取，只获得个人资格，不获得同单他人资料或支付退款权限。 |
| 报名前资料 | 本人姓名、微信验证手机号是报名/付款前置条件；微信昵称与本人姓名分开，头像可选且有默认头像。单纯浏览和既有已付款记录不受阻。 |
| 资料复用 | 本人和历史代填资料分别选择；跨会议仅复用通用字段，同会议复用已配置的表单字段。不会把代填内容写入付款账号资料。 |
| 隐藏优惠提示 | 无适用已领券且无私发优惠时隐藏入口；符合会议、票种、门槛、有效期的已领券可选择，金额仍由服务端重算。 |
| 首页加载 | 公共内容缓存、骨架屏、独立渐进请求、首图优先和后续图片懒加载。未承诺运营商网络或服务端响应耗时已降低。 |
| 手机管理 | 后台 `#/mobile` 会务工作台，查询、看报名/联系人、备注、归属调整，以及订单/退款管理入口；仍需管理员登录及对应权限。 |
| 企业微信提醒 | 后台“管理员缴费提醒”设置管理员、自建应用、单个成员 UserID；只通知开启后的新缴费，默认不补发历史记录。 |

### 现有三位嘉宾

不根据报名手机号自动覆盖账号手机号或替换订单归属。部署后从对应报名记录点“查看账号”，即可按真实关联查到提交账号；姓名/手机号不完整的历史账号保留原样，需本人验证或管理员核实后再关联实际参会资格。

更换参会人会轮换旧签到凭证并归档原会务安排，原始支付和原始表单快照不改。已签到、已取消或退款进行中的参会记录禁止直接更换/改绑。个人签到码具有参会人作用域，不能核销同单其他人。

## 企业微信配置与发布顺序

1. 确认后台管理员账号、对应企业微信成员 UserID、使用的自建应用。不要在文档、聊天或代码中保存 AppSecret。
2. 在现有企业微信集成中保存应用配置；核实成员在应用可见范围内、应用能够向该成员发消息。该步骤需要实际企业微信后台权限。
3. 接收管理员必须启用并有 `registration:view` 权限。配置读取需要 `notification:view`、`system:account`、`registration:view`；修改还需 `notification:write` 与 `wecom:send`。
4. 数据库备份后在测试环境实跑迁移 `20260921100000_guest_identity_and_account_profile`，验证报名、改绑、核销与退款并发。通过后再部署生产API和后台。
5. 服务端 `.env.production` 设 `ADMIN_PUBLIC_URL=https://admin.guanchaohuiji.com/`，先保持 `ADMIN_PAID_ALERT_WORKER_ENABLED=false`。现有发布脚本读取该文件，本轮没有修改线上值。
6. 收件人逐个核对后启用接收，开启 `ADMIN_PAID_ALERT_WORKER_ENABLED=true` 并重启API；由受控测试报名验收真实送达及手机详情链接。不要用真实嘉宾群发做测试。
7. 小程序新包经真机测试和正常发布后，再启用 `REGISTRATION_PROFILE_REQUIRED=true` 并重启API，防止旧版本没有资料入口却被强制拦截。小程序页面和交互更新不能只靠后端部署生效。
8. 企业微信失败自动重试有次数和时间限制；`REVIEW` 表示需要核实，不能当作已送达。远端已接受的消息不能保证撤回或严格恰好一次送达。

## 验证记录（2026-09-21）

| 验证层 | 结果 |
| --- | --- |
| 全工作区 TypeScript | PASS |
| 全工作区单元测试 | PASS：API 442、用户端 46、shared 13，共501；其他部分包没有测试，不能计为覆盖 |
| API / Admin / H5 / mp-weixin 构建 | PASS；小程序主包约1597 KiB |
| Prisma validate / schema diff | PASS；迁移为新增字段、表、约束与索引，未包含历史资料批量更新 |
| 后台浏览器 | PASS：390px手机与1440px桌面，模拟数据；用户历史、手机列表、详情弹层，无水平溢出 |
| 用户端浏览器 | PASS：游客不登录、缓存回退、取消资料填写、保留两人草稿、本人声明、有券/无券、购物车声明、领取及个人二维码 |
| PostgreSQL迁移与真实并发 | NOT_RUN：本机Docker不可用且未安装可用PostgreSQL实例；事务测试是隔离模拟 |
| 企业微信实际送达 | NOT_RUN：接收成员尚未确认，未开启发送 |
| 微信真机手机号/支付/订阅/核销 | NOT_RUN：构建和H5模拟不能替代真机联调 |
| 生产提交、部署及小程序发布 | NOT_RUN |

截图位于 `output/playwright/guest-*.png` 和 `apps/user/output/playwright/guest-experience/`。
测试日志位于 `.tmp/guest-upgrade-*.log`，本地临时文件不应提交Git。

## 主要修改位置

- 账号与身份：`services/api/src/auth/`、`registration/guest-identity.*`、`registration/registration.service.ts`、`payments/payment-success.service.ts`、`cart/cart.service.ts`。
- 后台查找与详情：`services/api/src/admin/admin-members.*`、`admin-user-activity.service.ts`，`apps/admin/src/pages/members/`、`pages/registrations/`、`pages/orders/`、`components/GuestIdentityPanel.vue`。
- 管理员提醒与手机端：`services/api/src/wecom/admin-registration-alert.controller.ts`、`wecom/services/admin-registration-alert.*`、`apps/admin/src/pages/mobile/`、`pages/notifications/paid-alerts.vue`。
- 用户体验：`apps/user/src/pages/account/`、`pages/registration/form.vue`、`pages/index/index.vue`、`components/WechatProfilePrompt.vue`，相关身份/优惠/缓存工具和测试。
- 并发与访问边界：`services/api/src/checkin/`、`guest-schedule/guest-schedule.service.ts`、`registrations/registrations.service.ts`。
- 数据与配置：`prisma/schema.prisma`、新增迁移、`.env.example`、`scripts/smoke/check-production-config.sh`。
