export type CmsComponentSupportStatus = "supported" | "basic" | "unsupported" | "planned";

export interface CmsComponentSupportDefinition {
  label: string;
  status: CmsComponentSupportStatus;
  description: string;
}

export const CMS_COMPONENT_SUPPORT_MATRIX: Record<string, CmsComponentSupportDefinition> = {
  hero: { label: "主视觉横幅", status: "supported", description: "用户端完整支持图片横幅展示" },
  "conference-list": { label: "会议卡片列表", status: "supported", description: "用户端完整支持会议列表展示和详情跳转" },
  "conference-tabs": { label: "会议分类切换", status: "basic", description: "用户端基础支持分类标签和会议卡片展示，暂不做真实筛选" },
  "registration-button": { label: "报名按钮", status: "supported", description: "用户端支持普通报名入口，会议详情页会避免重复 CTA" },
  "floating-registration-button": { label: "悬浮报名按钮", status: "supported", description: "用户端支持悬浮报名入口，会议详情页会避免重复 CTA" },
  "promotion-bar": { label: "满减活动提示条", status: "basic", description: "用户端基础支持提示条展示" },
  "rich-text": { label: "图文富文本", status: "supported", description: "用户端支持富文本片段展示" },
  "safe-html": { label: "安全图文片段", status: "supported", description: "用户端支持安全图文片段展示" },
  "image-grid": { label: "图片宫格", status: "supported", description: "用户端支持图片宫格展示" },
  video: { label: "视频组件", status: "basic", description: "用户端基础支持视频播放入口" },
  notice: { label: "公告栏", status: "supported", description: "用户端支持公告提示展示" },
  "stats-grid": { label: "数字亮点", status: "supported", description: "用户端支持数字亮点展示" },
  "ticket-price-list": { label: "票种价格", status: "supported", description: "用户端支持票种价格文案展示" },
  "process-steps": { label: "报名流程", status: "supported", description: "用户端支持流程步骤展示" },
  "text-image": { label: "图文介绍", status: "supported", description: "用户端支持图文介绍展示" },
  "download-list": { label: "资料下载", status: "basic", description: "用户端基础支持资料名称列表展示" },
  "live-card": { label: "直播入口", status: "basic", description: "用户端基础支持直播信息展示" },
  "testimonial-list": { label: "参会评价", status: "basic", description: "用户端基础支持评价列表展示" },
  "traffic-guide": { label: "交通指南", status: "basic", description: "用户端基础支持交通文本展示" },
  "contact-card": { label: "客服咨询", status: "supported", description: "用户端支持联系卡片展示" },
  "tag-filter": { label: "快捷标签", status: "basic", description: "用户端基础支持标签展示，暂不做真实筛选" },
  title: { label: "标题栏", status: "supported", description: "用户端支持标题展示" },
  divider: { label: "分割线", status: "supported", description: "用户端支持分割线展示" },
  spacer: { label: "留白", status: "supported", description: "用户端支持留白展示" },
  carousel: { label: "轮播图", status: "basic", description: "用户端基础支持图片轮播展示" },
  "speaker-cards": { label: "嘉宾卡片", status: "basic", description: "用户端基础支持嘉宾卡片展示" },
  "schedule-timeline": { label: "日程时间轴", status: "basic", description: "用户端基础支持会议日程展示" },
  "coupon-card": { label: "优惠券领取卡片", status: "basic", description: "用户端支持优惠券领取入口展示" },
  countdown: { label: "倒计时", status: "basic", description: "用户端基础支持目标时间倒计时展示" },
  search: { label: "搜索框", status: "basic", description: "用户端支持搜索入口展示和关键词输入" },
  "map-contact": { label: "地图与联系信息", status: "basic", description: "用户端基础支持地址和电话展示" },
  "sponsor-wall": { label: "赞助商 Logo 墙", status: "basic", description: "用户端基础支持赞助商名称或 Logo 展示" },
  faq: { label: "常见问答", status: "basic", description: "用户端基础支持问答列表展示" },
  "membership-benefits": { label: "会员权益卡", status: "basic", description: "用户端支持会员权益展示和会员中心入口" },
  "user-profile-card": { label: "用户资料卡", status: "basic", description: "用户端支持用户资料入口展示" },
  "my-order-list": { label: "我的订单列表", status: "basic", description: "用户端支持报名和商城订单入口展示" },
  "mall-product-grid": { label: "商城商品宫格", status: "basic", description: "用户端支持商城商品宫格入口展示" }
};

const RENDERABLE_STATUSES: CmsComponentSupportStatus[] = ["supported", "basic"];
const REGISTRATION_CTA_TYPES = ["registration-button", "floating-registration-button"];

export function getCmsComponentSupport(type: string): CmsComponentSupportDefinition {
  return CMS_COMPONENT_SUPPORT_MATRIX[type] ?? {
    label: type || "未知组件",
    status: "unsupported",
    description: "该组件暂未纳入用户端小程序/H5渲染支持矩阵"
  };
}

export function isCmsComponentUserRenderable(type: string): boolean {
  return RENDERABLE_STATUSES.includes(getCmsComponentSupport(type).status);
}

export function isCmsRegistrationCta(type: string): boolean {
  return REGISTRATION_CTA_TYPES.includes(type);
}
