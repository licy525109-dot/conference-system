import { defaultCertificateConfig, type CertificateConfig, type CertificateTextField } from "./certificates";

export function convertLegacyCertificates(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("旧站数据格式不正确");
  const state = raw as Record<string, any>, settings = state.settings ?? {}, visual = state.visual ?? {};
  if (!Array.isArray(state.students)) throw new Error("旧站缺少名单数组");
  const config: CertificateConfig = defaultCertificateConfig(String(visual.eventName || settings.eventTitle || "历史会议证书"));
  config.title = String(visual.downloadTitle || "证书查询与领取"); config.issueDate = String(settings.issueDate || "");
  config.primaryColor = /^#[a-f\d]{6}$/i.test(visual.primaryColor) ? visual.primaryColor : config.primaryColor;
  config.queryFields = [{ key: "name", label: "姓名", required: true }];
  const t = config.templates[0]; t.name = String(settings.eventTitle || "历史会议证书"); t.fontFamily = String(settings.fontFamily || "serif");
  const defaults = { name: { x: 50, y: 50 }, organization: { x: 50, y: 58 }, role: { x: 50, y: 64 }, certificateNo: { x: 50, y: 70 }, issueDate: { x: 50, y: 76 } };
  t.fields = Object.entries(defaults).filter(([key]) => key === "name" || settings.displayFields?.[key]).map(([key, position]) => {
    const p = settings.fieldPositions?.[key] || (key === "name" ? { x: settings.nameX ?? position.x, y: settings.nameY ?? position.y } : position);
    return { id: key, key: key as CertificateTextField["key"], label: ({ name: "姓名", organization: "单位", role: "职务", certificateNo: "编号", issueDate: "日期" } as Record<string, string>)[key], text: key === "name" ? "" : `${settings.fieldLabels?.[key] || ({ organization: "单位", role: "职务", certificateNo: "编号", issueDate: "日期" } as Record<string, string>)[key]}：`, x: Number(p.x), y: Number(p.y), size: Number(key === "name" ? settings.nameFontSize || 54 : settings.bodyFontSize || 26), color: String(settings.fontColor || "#1f2937"), align: settings.textAlign === "left" ? "start" : settings.textAlign === "right" ? "end" : "middle", weight: key === "name" ? 700 : 400, maxWidth: 90, maxLines: 2, lineHeight: Number(settings.lineGap || 1.7) };
  });
  const rows = state.students.map((r: Record<string, unknown>, index: number) => ({ templateId: t.id, name: String(r.name || ""), organization: String(r.organization || ""), role: String(r.role || ""), certificateNo: String(r.certificateNo || ""), externalId: `legacy-row-${index + 1}`, eligible: true, custom: {} }));
  const names = new Map<string, number>(); for (const r of rows) names.set(r.name, (names.get(r.name) || 0) + 1);
  return { config, rows, templateDataUrl: String(state.templateDataUrl || ""), templateName: String(state.templateName || "历史证书底图"), background: String(visual.backgroundDataUrl || ""), report: { count: rows.length, duplicateNameGroups: [...names.values()].filter(n => n > 1).length, missingNumbers: rows.filter((r: { certificateNo: string }) => !r.certificateNo).length, sameNameRecordsPreserved: true } };
}
