# 会议详情内容协议

## 页面边界

会议详情页是强约束业务页面，不组合通用 CMS 技术节点。用户端固定按以下顺序展示：

1. 会议报名状态、名称、时间、地点和报名截止时间。
2. 可配置详情内容块。
3. 可选的会议详情长图。
4. 底部报名费用与单一报名按钮。

票种选择、优惠试算、报名字段和订单创建继续在报名页处理。详情内容和长图不得作为价格、库存、报名状态或会议时间的可信数据来源。

## 内容块结构

运营在会议配置的“详情内容”页通过可视化表单添加、隐藏、复制和排序内容块，不接触 HTML、JSON 或 P9 DSL。后台实时预览、H5 和小程序共同读取 `contentJson.detailContent`：

```json
{
  "version": 1,
  "blocks": [
    {
      "id": "detail-heading-1",
      "enabled": true,
      "sort": 10,
      "type": "heading",
      "title": "费用包含",
      "align": "left",
      "tone": "accent"
    },
    {
      "id": "detail-list-1",
      "enabled": true,
      "sort": 20,
      "type": "list",
      "items": ["参会费与会期资料包", "会期交流活动"]
    }
  ],
  "updatedAt": "2026-08-31T00:00:00.000Z"
}
```

当前支持 `heading`、`paragraph`、`image`、`quote`、`list`、`divider` 和 `button`。按钮动作限定为会议报名、拨打电话、复制内容、打开外部 H5 或无动作。共享协议及归一化逻辑位于 `packages/shared/src/conference-detail.ts`，后台和用户端不得各自扩展不兼容字段。

## 长图结构

详情图保存在会议页面现有 `contentJson.detailLongImage`，不新增数据库字段：

```json
{
  "version": 1,
  "sourceUrl": "https://example.com/uploads/materials/detail-01.webp",
  "displayUrls": [
    "https://example.com/uploads/materials/detail-01.webp",
    "https://example.com/uploads/materials/detail-02.webp"
  ],
  "segments": [
    {
      "url": "https://example.com/uploads/materials/detail-01.webp",
      "materialId": "material-id",
      "width": 750,
      "height": 2400
    }
  ],
  "width": 750,
  "height": 4800,
  "sizeBytes": 1234567,
  "updatedAt": "2026-08-31T00:00:00.000Z"
}
```

后台上传一张 JPG、PNG 或 WebP 源图后，在浏览器端缩放至最多 750px 宽，并按最多 2400px 高生成 WebP 分片。每个分片走现有素材上传接口，单片不超过 2MB。小程序和 H5 使用同一份 `segments` 顺序无缝展示。内容块与长图可以同时配置，保存内容块时必须保留已有 `detailLongImage`。

## 后台回读

`GET /admin/conferences` 是轻量列表接口，不返回会议页面 `contentJson`。会议配置页选中会议后必须调用 `GET /admin/conferences/:id` 获取完整详情，保存后也以 PATCH 响应更新本地详情状态。禁止使用列表项覆盖刚保存的内容，否则后台会错误显示“未配置”。

## 固定栏安全区

会议详情页同时存在报名操作栏和自定义 tabbar。tabbar 总高度统一为 `124rpx + safe-area-inset-bottom`，报名栏的 `bottom` 必须使用同一高度；报名栏处于 tabbar 上方时不重复添加自身底部安全区。页面尾部预留两层固定栏的滚动空间，保证长图末尾和报名费用都能完整查看。

## 兼容规则

- 优先读取 `contentJson.detailLongImage`。
- 兼容旧字段 `detailLongImageUrl`、`detailImage` 和 `detailImages`。
- 内容块兼容 `conferenceDetailContent`、`detailRichContent` 和 `detailBlocks` 别名，发布时统一写入 `detailContent`。
- 旧 `detailPageDisplay`、`detailDisplay` 和 `conference-detail` CMS 数据暂不删除，但会议详情页不再渲染这些技术模块。
- 未配置内容块和长图时只展示会议基本信息与报名按钮，不向用户暴露空模块或技术组件名。
