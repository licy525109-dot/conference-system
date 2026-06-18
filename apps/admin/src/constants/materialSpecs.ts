export interface MaterialSpec {
  label: string;
  size: string;
  formats: string;
  maxSize: string;
  maxBytes: number;
  accept: string[];
  tip: string;
}

const MB = 1024 * 1024;
const KB = 1024;

export const materialSpecs = {
  heroImage: spec("首页横幅 / Hero", "750x420 或 1125x630", "JPG/PNG/WebP", 2 * MB, "建议使用横向高清图，避免文字贴边。", ["image/jpeg", "image/png", "image/webp"]),
  carouselImage: spec("轮播图", "750x360 或 1125x540", "JPG/PNG/WebP", 2 * MB, "保持同一批图片比例一致，避免切换时跳动。", ["image/jpeg", "image/png", "image/webp"]),
  conferenceCover: spec("会议封面", "750x420", "JPG/PNG/WebP", 2 * MB, "优先选择会场、嘉宾或主题视觉图，适合列表卡片裁切。", ["image/jpeg", "image/png", "image/webp"]),
  conferenceHeader: spec("会议详情头图", "750x360 或 750x420", "JPG/PNG/WebP", 2 * MB, "顶部展示会被不同终端裁切，主体内容尽量居中。", ["image/jpeg", "image/png", "image/webp"]),
  contentImage: spec("图文组件配图", "建议宽度 750px", "JPG/PNG/WebP", 2 * MB, "正文配图建议压缩后上传，减少小程序首屏压力。", ["image/jpeg", "image/png", "image/webp"]),
  imageGrid: spec("图片宫格", "300x300 或 600x600", "JPG/PNG/WebP", 1 * MB, "建议使用正方形图片，避免宫格裁切不一致。", ["image/jpeg", "image/png", "image/webp"]),
  sponsorLogo: spec("赞助商 Logo", "宽度 300-600px", "透明 PNG/SVG", 500 * KB, "透明背景更适合深浅主题切换。", ["image/png", "image/svg+xml"]),
  shareCover: spec("分享封面", "500x400 或 5:4", "JPG/PNG", 1 * MB, "分享卡片图不宜包含过小文字。", ["image/jpeg", "image/png"]),
  tabbarIcon: spec("底部导航图标", "96x96", "PNG", 200 * KB, "普通和选中图标各一张，主体居中留白。", ["image/png", "image/svg+xml"]),
  adminBrandIcon: spec("后台品牌图标", "96x96", "PNG/SVG", 300 * KB, "建议使用简洁品牌符号，深色侧栏下需可识别。", ["image/png", "image/svg+xml"]),
  favicon: spec("浏览器 favicon", "32x32 或 64x64", "ICO/PNG/SVG", 100 * KB, "浏览器标签页展示，图形越简洁越清晰。", ["image/x-icon", "image/vnd.microsoft.icon", "image/png", "image/svg+xml"]),
  backgroundImage: spec("背景图片", "1920x1080 或 1440x900", "JPG/WebP", 3 * MB, "背景图建议弱化细节，避免干扰页面内容。", ["image/jpeg", "image/webp", "image/png"]),
  backgroundVideo: spec("背景视频", "720p 或 1080p，5-15 秒", "MP4/H.264", 20 * MB, "建议静音循环，控制体积，避免影响移动端加载。", ["video/mp4"]),
  videoFile: spec("视频组件", "720p 或 1080p", "MP4/H.264", 20 * MB, "自动播放默认关闭；小程序端建议使用 HTTPS MP4，控制首屏加载体积。", ["video/mp4"]),
  downloadFile: spec("下载资料", "按资料类型", "PDF/JPG/PNG/WebP", 10 * MB, "小程序对部分文件类型有打开限制，建议优先 PDF 或图片，并提供复制链接兜底。", ["application/pdf", "image/jpeg", "image/png", "image/webp"]),
  productCover: spec("商品封面", "800x800 或 750x750", "JPG/PNG/WebP", 2 * MB, "建议正方形商品图，主体居中。", ["image/jpeg", "image/png", "image/webp"]),
  productDetail: spec("商品详情图", "建议宽度 750px", "JPG/PNG/WebP", 2 * MB, "详情长图请切片上传，避免单图过大。", ["image/jpeg", "image/png", "image/webp"]),
  testimonialAvatar: spec("评价头像", "200x200 或 300x300", "JPG/PNG/WebP", 500 * KB, "头像建议正方形，主体居中，避免过大影响列表加载。", ["image/jpeg", "image/png", "image/webp"]),
  fontFile: spec("页面字体文件", "字体文件", "TTF/OTF/WOFF/WOFF2", 5 * MB, "上传前确认字体授权，避免商用版权风险。", ["font/ttf", "font/otf", "font/woff", "font/woff2", "application/x-font-ttf", "application/x-font-otf", "application/font-woff", "application/font-woff2"]),
  wecomQr: spec("企微群二维码 / 封面", "建议 600x600", "JPG/PNG/WebP", 1 * MB, "二维码需清晰可扫码，避免压缩过度或加复杂背景。", ["image/jpeg", "image/png", "image/webp"]),
  notificationCover: spec("通知图片 / 文件", "按通知渠道要求", "JPG/PNG/WebP/PDF", 2 * MB, "外部通道有模板限制时，以供应商后台审核规则为准。", ["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  materialUpload: spec("素材上传", "按使用位置选择", "JPG/PNG/WebP/GIF/SVG/MP4/TTF/OTF/WOFF/WOFF2", 10 * MB, "后端硬限制单文件 10MB；图片/视频建议按具体使用位置进一步压缩。", ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml", "video/mp4", "font/ttf", "font/otf", "font/woff", "font/woff2", "application/x-font-ttf", "application/x-font-otf", "application/font-woff", "application/font-woff2"])
} as const satisfies Record<string, MaterialSpec>;

export type MaterialSpecKey = keyof typeof materialSpecs;

export const materialUsageSpecMap: Record<string, MaterialSpecKey> = {
  home_banner: "heroImage",
  conference_cover: "conferenceCover",
  conference_header: "conferenceHeader",
  tabbar_icon: "tabbarIcon",
  page_font: "fontFile",
  product_cover: "productCover",
  product_detail: "productDetail",
  download_file: "downloadFile",
  video_file: "videoFile",
  wecom_qr: "wecomQr"
};

export function materialSpecText(spec: MaterialSpec): string {
  return `建议尺寸：${spec.size}；支持格式：${spec.formats}；最大大小：${spec.maxSize}。${spec.tip}`;
}

export function validateMaterialFile(file: File, spec: MaterialSpec): string {
  if (file.size > spec.maxBytes) return `${spec.label}文件过大，建议不超过 ${spec.maxSize}`;
  if (spec.accept.length && !matchesAcceptedType(file, spec.accept)) return `${spec.label}格式不支持，请使用 ${spec.formats}`;
  return "";
}

export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${Math.round((bytes / MB) * 10) / 10}MB`;
  return `${Math.round(bytes / KB)}KB`;
}

function spec(label: string, size: string, formats: string, maxBytes: number, tip: string, accept: string[]): MaterialSpec {
  return { label, size, formats, maxSize: formatBytes(maxBytes), maxBytes, accept, tip };
}

function matchesAcceptedType(file: File, accept: string[]): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return accept.some((type) => file.type === type || type.endsWith(`/${extension}`) || (type === "image/jpeg" && ["jpg", "jpeg"].includes(extension)));
}
