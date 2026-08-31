# 会议详情长图协议

## 页面边界

会议详情页是强约束业务页面，不再组合通用 CMS 模块。用户端固定按以下顺序展示：

1. 会议报名状态、名称、时间、地点和报名截止时间。
2. 会议详情长图。
3. 底部报名费用与单一报名按钮。

票种选择、优惠试算、报名字段和订单创建继续在报名页处理。会议详情长图不得作为价格、库存、报名状态或会议时间的可信数据来源。

## 存储结构

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

后台上传一张 JPG、PNG 或 WebP 源图后，在浏览器端缩放至最多 750px 宽，并按最多 2400px 高生成 WebP 分片。每个分片走现有素材上传接口，单片不超过 2MB。小程序和 H5 使用同一份 `segments` 顺序无缝展示。

## 兼容规则

- 优先读取 `contentJson.detailLongImage`。
- 兼容旧字段 `detailLongImageUrl`、`detailImage` 和 `detailImages`。
- 旧 `detailPageDisplay`、`detailDisplay` 和 `conference-detail` CMS 数据暂不删除，但会议详情页不再渲染这些模块。
- 未配置长图时只展示会议基本信息与报名按钮，不向用户暴露空模块或技术组件名。
