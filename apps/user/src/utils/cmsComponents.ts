export type CmsComponentSupportStatus = "supported" | "basic" | "unsupported" | "planned";

export interface CmsComponentSupportDefinition {
  label: string;
  status: CmsComponentSupportStatus;
  description: string;
}

export const CMS_COMPONENT_SUPPORT_MATRIX: Record<string, CmsComponentSupportDefinition> = {
  "fixed-business-template": { label: "固定业务模板", status: "supported", description: "用户端支持首页、排期、报名、商城、购物车和会员中心固定模板" },
  hero: { label: "主视觉横幅", status: "supported", description: "用户端完整支持图片横幅展示" },
  "hero-banner": { label: "顶部主视觉 Banner", status: "supported", description: "用户端支持首页主视觉、双按钮、背景图和统一跳转配置" },
  "login-card": { label: "登录欢迎卡", status: "supported", description: "用户端支持微信头像昵称登录引导和登录后头像昵称展示" },
  "quick-icon-grid": { label: "图标入口宫格", status: "supported", description: "用户端支持 2 到 4 列图标入口、动态图标图片和统一跳转配置" },
  "member-promo-banner": { label: "会员 / 优惠横幅", status: "supported", description: "用户端支持会员、优惠券或活动横幅和统一跳转配置" },
  "event-card-carousel": { label: "活动 / 会议横滑", status: "supported", description: "用户端支持会议卡片横向滑动和详情跳转" },
  "service-shortcut-card": { label: "订单中心 / 快捷服务", status: "supported", description: "用户端支持订单、发票、售后、客服等快捷入口" },
  "task-progress-card": { label: "积分 / 任务进度", status: "supported", description: "用户端支持任务进度展示和统一跳转配置" },
  "image-promo-card": { label: "自定义图片卡片", status: "supported", description: "用户端支持图片推广卡片和统一跳转配置" },
  "rich-content-block": { label: "自定义图文模块", status: "supported", description: "用户端支持标题、正文、图片和按钮展示" },
  "conference-list": { label: "会议卡片列表", status: "supported", description: "用户端完整支持会议列表展示和详情跳转" },
  "conference-schedule": { label: "年度排期", status: "supported", description: "用户端支持按真实会议日期展示排期和添加系统日历" },
  "conference-tabs": { label: "会议分类切换", status: "supported", description: "用户端支持分类标签筛选和会议卡片展示" },
  "registration-button": { label: "报名按钮", status: "supported", description: "用户端支持普通报名入口，会议详情页会避免重复 CTA" },
  "floating-registration-button": { label: "悬浮报名按钮", status: "supported", description: "用户端支持悬浮报名入口，会议详情页会避免重复 CTA" },
  "promotion-bar": { label: "运营引导条", status: "supported", description: "用户端支持图标、标题、按钮和统一跳转的一行引导条" },
  "rich-text": { label: "图文富文本", status: "supported", description: "用户端支持富文本片段展示" },
  "safe-html": { label: "安全图文片段", status: "supported", description: "用户端支持安全图文片段展示" },
  "image-grid": { label: "图片宫格", status: "supported", description: "用户端支持图片宫格展示" },
  video: { label: "视频组件", status: "supported", description: "用户端支持视频播放和封面展示" },
  notice: { label: "公告栏", status: "supported", description: "用户端支持公告提示展示" },
  "stats-grid": { label: "数字亮点", status: "supported", description: "用户端支持数字亮点展示" },
  "dual-track-tags": { label: "双赛道标签条", status: "supported", description: "用户端支持双行标签、右侧按钮和统一跳转配置" },
  "ticket-price-list": { label: "票种价格", status: "supported", description: "用户端支持票种价格文案展示" },
  "process-steps": { label: "报名流程", status: "supported", description: "用户端支持流程步骤展示" },
  "text-image": { label: "图文介绍", status: "supported", description: "用户端支持图文介绍展示" },
  "download-list": { label: "资料下载", status: "supported", description: "用户端支持资料链接打开或复制" },
  "live-card": { label: "直播入口", status: "supported", description: "用户端支持直播信息和链接打开或复制" },
  "testimonial-list": { label: "参会评价", status: "supported", description: "用户端支持评价列表展示" },
  "traffic-guide": { label: "交通指南", status: "supported", description: "用户端支持交通说明、复制地址和拨打电话" },
  "contact-card": { label: "客服咨询", status: "supported", description: "用户端支持联系卡片展示" },
  "tag-filter": { label: "快捷标签", status: "supported", description: "用户端支持标签点击筛选会议" },
  title: { label: "标题栏", status: "supported", description: "用户端支持标题展示" },
  divider: { label: "分割线", status: "supported", description: "用户端支持分割线展示" },
  spacer: { label: "留白", status: "supported", description: "用户端支持留白展示" },
  carousel: { label: "轮播图", status: "supported", description: "用户端支持图片轮播展示" },
  "speaker-cards": { label: "嘉宾卡片", status: "supported", description: "用户端支持嘉宾卡片展示" },
  "schedule-timeline": { label: "日程时间轴", status: "supported", description: "用户端支持会议日程展示" },
  "coupon-card": { label: "优惠券领取卡片", status: "supported", description: "用户端支持优惠券领取和错误反馈" },
  countdown: { label: "倒计时", status: "supported", description: "用户端支持目标时间倒计时和结束文案" },
  search: { label: "搜索框", status: "supported", description: "用户端支持关键词输入和会议筛选跳转" },
  "map-contact": { label: "地图与联系信息", status: "supported", description: "用户端支持地址和电话操作" },
  "sponsor-wall": { label: "赞助商 Logo 墙", status: "supported", description: "用户端支持赞助商 Logo 展示和链接复制" },
  faq: { label: "常见问答", status: "supported", description: "用户端支持问答展开折叠" },
  "membership-benefits": { label: "会员权益卡", status: "supported", description: "用户端支持会员权益展示和会员中心入口" },
  "user-profile-card": { label: "用户资料卡", status: "supported", description: "用户端支持登录资料和未登录引导" },
  "my-order-list": { label: "我的订单列表", status: "supported", description: "用户端支持报名和商城订单入口" },
  "mall-product-grid": { label: "商城商品宫格", status: "supported", description: "用户端支持真实商品展示和详情跳转" },
  "credential-header": { label: "凭证头部", status: "supported", description: "报名凭证页支持报名状态、会议名称和报名号展示" },
  "credential-qr": { label: "二维码卡片", status: "supported", description: "报名凭证页支持真实二维码展示" },
  "credential-conference-info": { label: "凭证会议信息", status: "supported", description: "报名凭证页支持会议时间、地点和票种展示" },
  "credential-attendee-info": { label: "凭证参会人信息", status: "supported", description: "报名凭证页支持参会人和微信用户信息展示" },
  "credential-payment-info": { label: "凭证支付信息", status: "supported", description: "报名凭证页支持支付信息展示" },
  "credential-form-summary": { label: "凭证表单摘要", status: "supported", description: "报名凭证页支持报名字段摘要展示" },
  "credential-checkin-info": { label: "凭证签到信息", status: "supported", description: "报名凭证页支持签到状态展示" },
  "credential-actions": { label: "凭证操作按钮区", status: "supported", description: "报名凭证页支持签到和常用操作入口" }
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
