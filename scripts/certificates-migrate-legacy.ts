import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { createHash } from "node:crypto";
import { convertLegacyCertificates, validateCertificateConfig } from "../packages/shared/src";

async function main() {
  const args = process.argv.slice(2), value = (key: string) => { const i = args.indexOf(key); return i < 0 ? "" : args[i + 1] || ""; };
  const input = value("--input"); if (!input) throw new Error("请用 --input 指定旧站 state.json；默认仅预检，--apply 才写入草稿");
  const bytes = await readFile(resolve(input)), converted = convertLegacyCertificates(JSON.parse(bytes.toString("utf8")));
  const inline = (url: string) => { const match = url.match(/^data:(image\/(?:png|jpeg));base64,([a-zA-Z0-9+/=\r\n]+)$/); if (!match) throw new Error("旧模板须为内嵌 PNG/JPG"); return { mime: match[1], buffer: Buffer.from(match[2], "base64") }; };
  const template = inline(converted.templateDataUrl);
  console.log(JSON.stringify({ mode: args.includes("--apply") ? "draft-import" : "dry-run", sourceSha256: createHash("sha256").update(bytes).digest("hex"), projectName: converted.config.name, ...converted.report, templateBytes: template.buffer.length, queryFields: converted.config.queryFields.map(f => f.key), automaticallyPublishes: false }, null, 2));
  if (!args.includes("--apply")) return;
  const origin = new URL(value("--api-origin")); if (origin.username || origin.password || origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("请使用有效 HTTPS API 地址或本机测试地址");
  const token = process.env.CERTIFICATE_ADMIN_TOKEN; if (!token) throw new Error("请通过 CERTIFICATE_ADMIN_TOKEN 环境变量提供管理员会话，不要放入参数或文件");
  async function api(path: string, body?: unknown, method = "POST") { const r = await fetch(`${origin.origin}/api/admin/certificates${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body) }); const p = await r.json(); if (!r.ok || p.code !== "OK") throw new Error(typeof p.message === "string" ? p.message : "迁移请求失败"); return p.data; }
  let project = value("--project-id") ? await api(`/${encodeURIComponent(value("--project-id"))}`, undefined, "GET") : await api("", { name: converted.config.name, conferenceId: value("--conference-id") || undefined });
  if (project.publishedRevision !== null) throw new Error("迁移目标必须为未发布项目；请先创建单独的迁移草稿");
  async function upload(buffer: Buffer, mime: string, name: string) { const form = new FormData(); form.append("file", new File([new Uint8Array(buffer)], name, { type: mime })); return api(`/${project.id}/assets`, form); }
  const asset = await upload(template.buffer, template.mime, converted.templateName); if (!asset.width || !asset.height || asset.width > 4000 || asset.height > 4000 || asset.width < 400 || asset.height < 300) throw new Error("旧模板尺寸超出支持范围，请先准备 400~4000px 宽、300~4000px 高的底图");
  converted.config.templates[0].assetId = asset.id; converted.config.templates[0].width = asset.width; converted.config.templates[0].height = asset.height;
  if (converted.background.startsWith("data:")) { const bg = inline(converted.background); converted.config.backgroundAssetId = (await upload(bg.buffer, bg.mime, "历史查询页主视觉")).id; }
  else if (converted.background && value("--asset-root")) { const root = resolve(value("--asset-root")), file = resolve(root, converted.background.replace(/^\/+/, "")); if (!file.startsWith(root + sep)) throw new Error("背景图片路径超出素材目录"); const suffix = extname(file).toLowerCase(), mime = suffix === ".png" ? "image/png" : [".jpg", ".jpeg"].includes(suffix) ? "image/jpeg" : ""; if (!mime) throw new Error("背景图仅支持 PNG/JPG"); converted.config.backgroundAssetId = (await upload(await readFile(file), mime, "历史查询页主视觉")).id; }
  project = await api(`/${project.id}`, { config: validateCertificateConfig(converted.config), draftRevision: project.draftRevision }, "PATCH");
  for (let offset = 0; offset < converted.rows.length; offset += 2000) { const body = { rows: converted.rows.slice(offset, offset + 2000), mode: "upsert", draftRevision: project.draftRevision }; const plan = await api(`/${project.id}/import/preview`, body); if (plan.errors.length) throw new Error(`名单预检有 ${plan.errors.length} 处问题，未发布；请在后台核对`); project = await api(`/${project.id}/import`, { ...body, digest: plan.digest }); }
  console.log(JSON.stringify({ projectId: project.id, draftRevision: project.draftRevision, published: false, next: "在后台核对完整名单、模板和规则后再发布" }, null, 2));
}
main().catch(error => { const reason = error instanceof SyntaxError ? "输入或接口响应不是有效 JSON" : String(error?.message || "请检查输入、素材、目标项目和权限").replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]").slice(0, 200); console.error(`证书迁移未完成，内容未自动发布：${reason}`); process.exitCode = 1; });
