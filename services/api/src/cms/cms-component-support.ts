import { BadRequestException } from "@nestjs/common";

export type CmsComponentSupportStatus = "supported" | "basic" | "unsupported" | "planned";

export interface CmsComponentSupportMeta {
  label: string;
  status: CmsComponentSupportStatus;
  description: string;
  replacement?: string;
}

export interface CmsPublishCheckItem extends CmsComponentSupportMeta {
  id: string;
  type: string;
  index: number;
  enabled: boolean;
}

export interface CmsPublishCheckReport {
  supportedCount: number;
  basicCount: number;
  blockingCount: number;
  basicComponents: CmsPublishCheckItem[];
  blockingComponents: CmsPublishCheckItem[];
  suggestions: string[];
}

export const CMS_COMPONENT_SUPPORT_MATRIX: Record<string, CmsComponentSupportMeta> = {
  hero: supported("主视觉横幅", "H5/小程序完整支持图片横幅、按钮和空图兜底。"),
  carousel: supported("轮播图", "H5/小程序完整支持图片轮播、指示点和空状态。"),
  "hero-banner": supported("顶部主视觉 Banner", "H5/小程序完整支持首页主视觉、双按钮、背景图和统一跳转配置。"),
  "quick-icon-grid": supported("图标入口宫格", "H5/小程序完整支持 2 到 4 列图标入口、动态图标图片和统一跳转配置。"),
  "member-promo-banner": supported("会员 / 优惠横幅", "H5/小程序完整支持会员、优惠券或活动横幅和统一跳转配置。"),
  "event-card-carousel": supported("活动 / 会议横滑", "H5/小程序完整支持会议卡片横滑和详情跳转。"),
  "service-shortcut-card": supported("订单中心 / 快捷服务", "H5/小程序完整支持订单、发票、售后、客服等快捷入口。"),
  "task-progress-card": supported("积分 / 任务进度", "H5/小程序完整支持任务进度展示和统一跳转配置。"),
  "image-promo-card": supported("自定义图片卡片", "H5/小程序完整支持图片推广卡片和统一跳转配置。"),
  "rich-content-block": supported("自定义图文模块", "H5/小程序完整支持标题、正文、图片和按钮展示。"),
  "conference-list": supported("会议卡片列表", "H5/小程序完整支持会议列表展示、封面兜底和详情跳转。"),
  "conference-tabs": supported("会议分类切换", "H5/小程序支持分类标签点击并按 location/category/tag 参数筛选会议。"),
  "speaker-cards": supported("嘉宾卡片", "H5/小程序支持嘉宾头像、姓名、角色和介绍展示。"),
  "schedule-timeline": supported("日程时间轴", "H5/小程序支持日程时间、主题和说明展示。"),
  "registration-button": supported("报名按钮", "H5/小程序支持报名入口；会议详情页会使用固定 CTA 防止重复。"),
  "floating-registration-button": supported("悬浮报名按钮", "H5/小程序支持悬浮报名入口；会议详情页会使用固定 CTA 防止重复。"),
  "coupon-card": supported("优惠券领取卡片", "H5/小程序支持活动批次领券、登录提示和后端错误反馈。"),
  "promotion-bar": supported("满减活动提示条", "H5/小程序支持运营提示展示。"),
  "rich-text": supported("图文富文本", "H5/小程序支持安全富文本节点渲染。"),
  "safe-html": supported("安全图文片段", "H5/小程序支持白名单富文本节点渲染并拒绝脚本。"),
  "image-grid": supported("图片宫格", "H5/小程序支持图片宫格展示和空状态。"),
  video: supported("视频组件", "H5/小程序支持视频播放、封面和禁用自动播放。"),
  countdown: supported("倒计时", "H5/小程序支持实时倒计时和结束文案。"),
  notice: supported("公告栏", "H5/小程序支持公告提示展示。"),
  search: supported("搜索框", "H5/小程序支持关键词输入并跳转会议列表筛选。"),
  "map-contact": supported("地图与联系信息", "H5/小程序支持地址复制和电话拨打。"),
  "sponsor-wall": supported("赞助商 Logo 墙", "H5/小程序支持 Logo 展示和链接复制。"),
  faq: supported("常见问答", "H5/小程序支持问题展开/折叠。"),
  "stats-grid": supported("数字亮点", "H5/小程序支持数字亮点展示。"),
  "ticket-price-list": supported("票种价格", "H5/小程序支持票种价格文案展示。"),
  "process-steps": supported("报名流程", "H5/小程序支持流程步骤展示。"),
  "text-image": supported("图文介绍", "H5/小程序支持图文配图展示。"),
  "download-list": supported("资料下载", "H5/小程序支持资料链接打开或复制。"),
  "live-card": supported("直播入口", "H5/小程序支持直播信息、状态和链接打开或复制。"),
  "testimonial-list": supported("参会评价", "H5/小程序支持评价、姓名、单位和头像展示。"),
  "traffic-guide": supported("交通指南", "H5/小程序支持交通说明、地址复制和电话拨打。"),
  "contact-card": supported("客服咨询", "H5/小程序支持联系卡片和电话拨打。"),
  "tag-filter": supported("快捷标签", "H5/小程序支持标签点击并按 tag/location/category 参数筛选会议。"),
  "membership-benefits": supported("会员权益卡", "H5/小程序支持权益展示、登录提示和会员中心入口。"),
  "user-profile-card": supported("用户资料卡", "H5/小程序支持登录用户资料和未登录引导。"),
  "my-order-list": supported("我的订单列表", "H5/小程序支持报名订单和商城订单入口。"),
  "mall-product-grid": supported("商城商品宫格", "H5/小程序支持真实 PUBLISHED 商品、库存状态和商品详情跳转。"),
  "credential-header": supported("凭证头部", "H5/小程序报名凭证页支持报名状态、会议名称和报名号展示。"),
  "credential-qr": supported("二维码卡片", "H5/小程序报名凭证页支持真实二维码展示。"),
  "credential-conference-info": supported("凭证会议信息", "H5/小程序报名凭证页支持会议时间、地点和票种展示。"),
  "credential-attendee-info": supported("凭证参会人信息", "H5/小程序报名凭证页支持参会人和微信用户信息展示。"),
  "credential-payment-info": supported("凭证支付信息", "H5/小程序报名凭证页支持支付状态、金额、渠道和订单号展示。"),
  "credential-form-summary": supported("凭证表单摘要", "H5/小程序报名凭证页支持报名字段摘要展示。"),
  "credential-checkin-info": supported("凭证签到信息", "H5/小程序报名凭证页支持签到状态和签到时间展示。"),
  "credential-actions": supported("凭证操作按钮区", "H5/小程序报名凭证页支持签到、客户群、议程、指南、客服和日历入口。"),
  title: supported("标题栏", "H5/小程序支持标题展示。"),
  divider: supported("分割线", "H5/小程序支持分割线展示。"),
  spacer: supported("留白", "H5/小程序支持留白高度。")
};

export function getCmsComponentSupport(type: string): CmsComponentSupportMeta {
  return (
    CMS_COMPONENT_SUPPORT_MATRIX[type] ?? {
      label: type || "未知组件",
      status: "unsupported",
      description: "该组件未纳入 H5/小程序渲染支持矩阵，发布会被阻止。",
      replacement: "请替换为已支持组件。"
    }
  );
}

export function assertCmsPresetsArePublishable(types: Iterable<string>): void {
  const invalid = Array.from(types).filter((type) => {
    const status = getCmsComponentSupport(type).status;
    return status === "unsupported" || status === "planned";
  });
  if (invalid.length > 0) {
    throw new BadRequestException(`组件库包含不可发布组件：${invalid.join("、")}`);
  }
}

export function buildCmsPublishCheck(components: unknown): CmsPublishCheckReport {
  const items = Array.isArray(components) ? components : [];
  const enabled = items.map(readPublishComponentItem).filter((item) => item.enabled);
  const basicComponents = enabled.filter((item) => item.status === "basic");
  const blockingComponents = enabled.filter((item) => item.status === "unsupported" || item.status === "planned");
  const supportedCount = enabled.filter((item) => item.status === "supported").length;
  const suggestions = Array.from(
    new Set(
      [...basicComponents, ...blockingComponents]
        .map((item) => item.replacement || item.description)
        .filter(Boolean)
    )
  );
  return {
    supportedCount,
    basicCount: basicComponents.length,
    blockingCount: blockingComponents.length,
    basicComponents,
    blockingComponents,
    suggestions
  };
}

export function assertCmsPublishable(components: unknown, input: { confirmBasic?: boolean } = {}): CmsPublishCheckReport {
  const report = buildCmsPublishCheck(components);
  if (report.blockingCount > 0) {
    throw new BadRequestException({
      code: "CMS_PUBLISH_BLOCKED",
      message: "页面包含 H5/小程序不支持或后续开放组件，不能发布。",
      report
    });
  }
  if (report.basicCount > 0 && !input.confirmBasic) {
    throw new BadRequestException({
      code: "CMS_PUBLISH_NEEDS_CONFIRMATION",
      message: "页面包含基础支持组件，请确认 H5/小程序预览后再发布。",
      report
    });
  }
  return report;
}

function supported(label: string, description: string): CmsComponentSupportMeta {
  return { label, status: "supported", description };
}

function readPublishComponentItem(item: unknown, index: number): CmsPublishCheckItem {
  const record = isRecord(item) ? item : {};
  const type = typeof record.type === "string" ? record.type : "";
  const support = getCmsComponentSupport(type);
  return {
    id: typeof record.id === "string" ? record.id : `${type || "unknown"}-${index + 1}`,
    type,
    index,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    ...support
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
