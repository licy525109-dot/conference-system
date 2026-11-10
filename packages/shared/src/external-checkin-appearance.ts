export interface ExternalCheckinAppearance {
  layout: "card" | "plain";
  titleAlign: "left" | "center";
  fontSize: "normal" | "large";
  cornerRadius: number;
  primaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  brandName: string;
  welcomeText: string;
  pageTitle: string;
  introText: string;
  formTitle: string;
  helperText: string;
  submitText: string;
  successTitle: string;
  successMessage: string;
  failureTitle: string;
  failureMessage: string;
  footerText: string;
  logoAssetId: string;
  coverAssetId: string;
}

export const DEFAULT_EXTERNAL_CHECKIN_APPEARANCE: ExternalCheckinAppearance = {
  layout: "card", titleAlign: "left", fontSize: "normal", cornerRadius: 16,
  primaryColor: "#205c42", backgroundColor: "#f2f5ef", surfaceColor: "#fdfefc", textColor: "#223c31",
  brandName: "会议现场签到", welcomeText: "欢迎到来", pageTitle: "", introText: "",
  formTitle: "填写签到信息", helperText: "请填写以下信息，核对名单后完成签到", submitText: "确认签到",
  successTitle: "签到成功", successMessage: "签到成功，欢迎参会",
  failureTitle: "签到失败", failureMessage: "未查询到匹配名单，请核对填写内容或联系现场工作人员",
  footerText: "信息未能匹配时，请联系现场工作人员。", logoAssetId: "", coverAssetId: ""
};

export const EXTERNAL_CHECKIN_COLOR_PRESETS = [
  { name: "松绿", primaryColor: "#205c42", backgroundColor: "#f2f5ef", surfaceColor: "#fdfefc", textColor: "#223c31" },
  { name: "海蓝", primaryColor: "#235f91", backgroundColor: "#eff4f8", surfaceColor: "#fcfdfe", textColor: "#20374b" },
  { name: "暖金", primaryColor: "#80601d", backgroundColor: "#f7f3eb", surfaceColor: "#fdfcf8", textColor: "#443a28" }
] as const;

export function checkinContrast(a: string, b: string): number {
  const luminance = (color: string) => {
    const values = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function parseExternalCheckinAppearance(input: unknown): ExternalCheckinAppearance {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("签到页外观配置无效");
  const source = input as Record<string, unknown>, result = { ...DEFAULT_EXTERNAL_CHECKIN_APPEARANCE };
  const textLimits = { brandName: 60, welcomeText: 40, pageTitle: 120, introText: 1000, formTitle: 60, helperText: 300, submitText: 30, successTitle: 60, successMessage: 300, failureTitle: 60, failureMessage: 300, footerText: 300 };
  for (const [key, limit] of Object.entries(textLimits)) {
    if (!Object.hasOwn(source, key)) continue;
    const value = source[key];
    if (typeof value !== "string" || value.trim().length > limit) throw new Error(`文案格式无效，最多 ${limit} 个字`);
    result[key as keyof typeof textLimits] = value.trim();
  }
  for (const key of ["formTitle", "submitText", "successTitle", "successMessage", "failureTitle", "failureMessage"] as const) if (!result[key]) throw new Error("表单标题、按钮及签到结果文案不能为空");
  for (const key of ["primaryColor", "backgroundColor", "surfaceColor", "textColor"] as const) {
    if (!Object.hasOwn(source, key)) continue;
    const value = source[key];
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error("颜色需要使用六位十六进制色值，如 #205c42");
    result[key] = value.toLowerCase();
  }
  for (const key of ["logoAssetId", "coverAssetId"] as const) {
    if (!Object.hasOwn(source, key)) continue;
    const value = source[key];
    if (typeof value !== "string" || !/^([a-z0-9]{1,64})?$/.test(value)) throw new Error("图片标识无效，请重新上传图片");
    result[key] = value;
  }
  if (source.layout !== undefined) { if (typeof source.layout !== "string" || !["card", "plain"].includes(source.layout)) throw new Error("页面布局无效"); result.layout = source.layout as ExternalCheckinAppearance["layout"]; }
  if (source.titleAlign !== undefined) { if (typeof source.titleAlign !== "string" || !["left", "center"].includes(source.titleAlign)) throw new Error("标题对齐方式无效"); result.titleAlign = source.titleAlign as ExternalCheckinAppearance["titleAlign"]; }
  if (source.fontSize !== undefined) { if (typeof source.fontSize !== "string" || !["normal", "large"].includes(source.fontSize)) throw new Error("字号设置无效"); result.fontSize = source.fontSize as ExternalCheckinAppearance["fontSize"]; }
  if (source.cornerRadius !== undefined) { if (!Number.isInteger(source.cornerRadius) || Number(source.cornerRadius) < 0 || Number(source.cornerRadius) > 28) throw new Error("圆角应为 0–28 的整数"); result.cornerRadius = Number(source.cornerRadius); }
  return result;
}

export function externalCheckinAppearanceStyle(ui: ExternalCheckinAppearance): Record<string, string> {
  const light = "#ffffff", dark = "#000000";
  return {
    "--checkin-primary": ui.primaryColor, "--checkin-bg": ui.backgroundColor,
    "--checkin-surface": ui.surfaceColor, "--checkin-text": ui.textColor,
    "--checkin-on-primary": checkinContrast(light, ui.primaryColor) >= checkinContrast(dark, ui.primaryColor) ? light : dark,
    "--checkin-border": `${ui.textColor}29`, "--checkin-radius": `${ui.cornerRadius}px`,
    "--checkin-control-radius": `${Math.min(12, ui.cornerRadius)}px`,
    "--checkin-input-size": ui.fontSize === "large" ? "18px" : "16px",
    "--checkin-body-size": ui.fontSize === "large" ? "16px" : "14px"
  };
}
