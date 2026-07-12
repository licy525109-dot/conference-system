# CMS 跨端真实预览

## 唯一数据与渲染链路

页面装修保存 P9 DSL，视觉编辑配置位于 `dsl.meta.editorComponents`。后台预览不再维护独立的业务页面模拟器，而是通过版本化 `postMessage` 协议把当前草稿发送到用户端 H5 预览页：

```text
CMS Editor
  -> P9 DSL / editorComponents
  -> Render Governor
  -> PageRenderer
  -> CmsVisualRenderer or DS RenderTree
  -> Admin Preview / H5 / MiniApp
```

后台手机预览入口是 `CmsRuntimePreview.vue`，用户端接收页是 `pages/cms-preview/index.vue`。预览宽度固定为 375px，组件继续使用 rpx，因此后台与微信小程序按同一宽度换算尺寸。预览中的点击和拖拽事件只回传组件 id，不执行用户端跳转。

## 组件基础库

用户端使用 Wot Design Uni 提供搜索框、按钮、图标、标签和主题变量等跨端基础控件。会议卡、排期、会员资料卡和商品卡仍是会务领域组件，但组合自同一套基础控件与 CMS 主题变量，并同时编译到 H5 和 `mp-weixin`。

组件字段、顺序、显示状态、图片、文案、样式预设和点击动作仍由运营表单配置。Wot Design Uni 只负责稳定的交互原语，不会把页面固化成不可编辑模板。

## 发布可见性

新建的系统业务页会生成一个已发布版本和一个独立草稿。历史上从未被操作员修改的单一系统草稿会在初始化时安全提升为已发布版本。

管理员已经编辑过但尚未发布的草稿不会自动上线。编辑器顶部会显示“尚未发布，小程序暂不可见”，运营确认后必须点击“发布页面”。

本地开发需同时运行：

```bash
pnpm dev:user:h5
pnpm dev:admin
```

后台开发环境会根据当前访问后台的主机名自动连接 `5173`，因此使用局域网 IP 打开后台时不会错误连接访问设备自己的 `localhost`。连接超时会自动重试，其他环境也可通过 `VITE_CMS_RUNTIME_PREVIEW_URL` 指定已部署的用户端 H5 地址。

预览 iframe 会把会话和重连序号同时写入 URL 的真实查询参数（位于 `#` 之前）与页面路由参数。真实查询参数用于绕过浏览器对 H5 `index.html` 的旧缓存；只修改 hash 不会产生新的 HTTP 文档请求，不能作为生产重连的缓存失效机制。

生产发布必须同时构建并发布 Admin 与用户端 H5。`scripts/deploy/baota-deploy.sh` 会把 `apps/user/dist/build/h5` 发布到 `H5_ROOT`，并在重启服务前校验静态产物包含 `pages/cms-preview/index`。只发布 Admin 会导致后台编辑器已更新、但 `m.guanchaohuiji.com` 仍不认识预览协议，表现为持续显示“真实预览暂不可用”。

宝塔部署会通过 `USER_API_BASE_URL` 为 H5 与小程序生产构建注入公开 API 地址。该值默认是 `https://guanchaohuiji.com/api`，不属于密钥；若使用其他正式域名，应通过 GitHub Variable `BAOTA_USER_API_BASE_URL` 覆盖。生产构建仍会拒绝本地地址、私网地址或与正式地址不一致的配置。
