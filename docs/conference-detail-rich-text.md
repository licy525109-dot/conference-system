# 会议详情可视化编辑协议

## 目标

会议详情使用单一可视化编辑器维护。管理员不需要编写 HTML、JSON 或逐个配置内容块；H5 和微信小程序读取同一份受控内容协议。

## 保存结构

会议 `contentJson` 使用 `detailRichText` 作为明确字段：

```ts
type ConferenceDetailRichTextContent = {
  version: 1;
  html: string;
  nodes: ConferenceDetailRichTextNode[];
  updatedAt: string;
};
```

- `html` 用于后台编辑器回读和后台手机预览。
- `nodes` 是发布到 H5 / 小程序的白名单节点，不依赖浏览器执行任意 HTML。
- 支持标题、段落、引用、列表、粗体、斜体、下划线、删除线、颜色、背景色、对齐、链接、图片、分隔线和代码文本。
- 脚本、事件属性、危险链接和不稳定样式在保存时被过滤。

## 管理端

`ConferenceDetailRichTextEditor.vue` 使用 wangEditor 5 的正式编辑器内核，提供：

- 文档式连续编辑；
- 常用文字和段落工具栏；
- 本地图片上传到素材库并插入；
- 从素材库插入图片；
- 手机实时预览；
- 全屏编辑；
- 保存后的服务端回读。

管理员看到的是业务编辑界面，不暴露 Raw HTML 或 JSON。

## 用户端

`ConferenceDetailRichText.vue` 使用 uni-app `rich-text` 渲染 `nodes`：

- H5 和小程序共享内容、顺序、图片、对齐和主要文字样式；
- 平台只负责基础显示适配，不重新解释业务内容；
- 详情长图仍可配置，并排在富文本内容之后；
- 报名按钮和价格等业务逻辑保持在详情页原有固定操作区。

## 旧页面兼容

- 没有 `detailRichText` 的旧会议继续读取 `detailContent.blocks`。
- 后台第一次打开旧会议时，会把旧内容块转换为可编辑 HTML。
- 第一次保存后写入 `detailRichText`，用户端改用新协议。
- 一个存在但内容为空的 `detailRichText` 表示管理员主动清空详情，不会重新显示旧内容块。

## 边界

本功能只调整会议详情内容的编辑、预览和展示，不修改订单金额、报名计价、微信支付回调、退款、签到或会员计价。
