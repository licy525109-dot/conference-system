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

后台默认连接 `http://localhost:5173/#/pages/cms-preview/index`。其他环境可通过 `VITE_CMS_RUNTIME_PREVIEW_URL` 指定已部署的用户端 H5 地址。
