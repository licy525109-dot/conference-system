import { BadRequestException, Injectable } from "@nestjs/common";
import { renderAsync } from "@resvg/resvg-js";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { certificateValue, type CertificateConfig, type CertificatePerson, type CertificateTemplate } from "@conference/shared";
import { PrismaService } from "../prisma.service";

export const xml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!)).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export function certificateFontFamily(bytes: Buffer): string {
  try {
    const start = bytes.subarray(0, 4).toString() === "ttcf" ? bytes.readUInt32BE(12) : 0;
    const tables = bytes.readUInt16BE(start + 4); if (tables > 256) throw new Error();
    for (let i = 0; i < tables; i++) {
      const table = start + 12 + i * 16; if (bytes.subarray(table, table + 4).toString() !== "name") continue;
      const offset = bytes.readUInt32BE(table + 8), count = bytes.readUInt16BE(offset + 2), strings = bytes.readUInt16BE(offset + 4);
      if (count > 10000) throw new Error(); const candidates: { name: string; score: number }[] = [];
      for (let j = 0; j < count; j++) {
        const record = offset + 6 + j * 12, platform = bytes.readUInt16BE(record), nameId = bytes.readUInt16BE(record + 6);
        if (![1, 16].includes(nameId)) continue;
        const length = bytes.readUInt16BE(record + 8), position = offset + strings + bytes.readUInt16BE(record + 10);
        if (position + length > bytes.length || length > 1024) throw new Error();
        const buffer = Buffer.from(bytes.subarray(position, position + length));
        const name = platform === 0 || platform === 3 ? (buffer.length % 2 ? "" : buffer.swap16().toString("utf16le")) : buffer.toString("latin1");
        if (name.trim()) candidates.push({ name: name.trim(), score: (nameId === 16 ? 2 : 0) + (platform === 3 ? 1 : 0) });
      }
      const best = candidates.sort((a, b) => b.score - a.score)[0]; if (best) return best.name;
    }
  } catch { /* reject malformed or unsupported fonts below */ }
  throw new BadRequestException("字体文件无效或无法识别字体家族，请选择有效的 TTF/OTF 字体");
}

export function imageDimensions(bytes: Buffer, mime: string) {
  let width = 0, height = 0;
  if (mime === "image/png" && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
  } else if (mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 255) break;
      const marker = bytes[i + 1]; i += 2;
      if (marker === 216 || marker === 217) continue;
      const size = bytes.readUInt16BE(i);
      if (size < 2 || i + size > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) { height = bytes.readUInt16BE(i + 3); width = bytes.readUInt16BE(i + 5); break; }
      i += size;
    }
  }
  if (width < 1 || height < 1 || width > 8000 || height > 8000 || width * height > 16_000_000) throw new BadRequestException("请选择有效的 JPG 或 PNG，图片不超过 1600 万像素");
  return { width, height };
}

export function wrapCertificateText(text: string, size: number, width: number, maxLines: number) {
  const estimated = (s: string) => Array.from(s).reduce((n, c) => n + (/[^\u0000-\u00ff]/u.test(c) ? size : size * .65), 0);
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const c of Array.from(paragraph)) {
      if (line && estimated(line + c) > width) { lines.push(line); line = c; } else line += c;
    }
    lines.push(line);
  }
  if (lines.length > maxLines && size > 8) return wrapCertificateText(text, Math.max(8, size - 2), width, maxLines);
  if (lines.length > maxLines) throw new BadRequestException("证书文字过长，请增加文字区域或减少内容后再预览");
  return { size, lines };
}

@Injectable()
export class CertificateRenderer {
  constructor(private readonly prisma: PrismaService) {}

  async watermarkedPreview(image: Buffer) {
    const width = image.readUInt32BE(16), height = image.readUInt32BE(20), scale = Math.min(1, 800 / width);
    const w = Math.round(width * scale), h = Math.round(height * scale);
    const output = await renderAsync(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><image href="data:image/png;base64,${image.toString("base64")}" width="${w}" height="${h}"/><rect x="0" y="${h*.4}" width="${w}" height="${h*.2}" fill="white" fill-opacity=".72"/><text x="${w/2}" y="${h*.52}" font-size="${w*.04}" font-family="sans-serif" text-anchor="middle" fill="#687487">预览 · 领取原图后保存</text></svg>`, { logLevel: "off" });
    return output.asPng();
  }

  async render(projectId: string, config: CertificateConfig, template: CertificateTemplate, person: CertificatePerson): Promise<Buffer> {
    const ids = [template.assetId, template.fontAssetId].filter((id): id is string => Boolean(id));
    const assets = await this.prisma.certificateAsset.findMany({ where: { projectId, id: { in: ids } } });
    const image = assets.find(a => a.id === template.assetId && a.kind === "image");
    const font = assets.find(a => a.id === template.fontAssetId && a.kind === "font");
    if (template.assetId && !image || template.fontAssetId && !font) throw new BadRequestException("模板素材不存在或不属于当前会议");
    const sansFamily = process.env.CERTIFICATE_DEFAULT_FONT_FAMILY || (process.platform === "darwin" ? "PingFang SC" : "Noto Sans CJK SC");
    const serifFamily = process.platform === "darwin" ? "Songti SC" : "Noto Serif CJK SC";
    let fontFiles: string[] = [], family = template.fontFamily.split(",").map(f => f.trim() === "sans-serif" ? sansFamily : f.trim() === "serif" ? serifFamily : f.trim()).join(", ");
    if (font) {
      family = certificateFontFamily(Buffer.from(font.bytes));
      const cwd = process.cwd(); const projectRoot = cwd.endsWith("/services/api") ? resolve(cwd, "../..") : cwd;
      const dir = join(projectRoot, ".cache", "certificate-fonts"); await mkdir(dir, { recursive: true });
      const path = join(dir, createHash("sha256").update(font.bytes).digest("hex") + (font.mime === "font/otf" ? ".otf" : ".ttf"));
      await writeFile(path, font.bytes, { flag: "wx", mode: 0o600 }).catch(error => { if (error.code !== "EEXIST") throw error; });
      fontFiles = [path];
    }
    const w = template.width, h = template.height;
    const background = image ? `<image href="data:${image.mime};base64,${Buffer.from(image.bytes).toString("base64")}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>` : `<rect width="${w}" height="${h}" fill="#fffdf5"/><rect x="30" y="30" width="${w-60}" height="${h-60}" fill="none" stroke="#a18447" stroke-width="3"/>`;
    const texts = template.fields.map(f => {
      const value = f.key === "literal" ? f.text : f.key === "issueDate" ? config.issueDate : certificateValue(person, f.key);
      const raw = f.key === "literal" ? value : value ? f.text + value : "";
      if (!raw) return "";
      const fitted = wrapCertificateText(raw, f.size, w * f.maxWidth / 100, f.maxLines);
      const startY = h * f.y / 100 - (fitted.lines.length - 1) * fitted.size * f.lineHeight / 2;
      return `<text dominant-baseline="central" text-anchor="${f.align}" font-family="${xml(family)}" font-size="${fitted.size}" font-weight="${f.weight}" fill="${f.color}">${fitted.lines.map((line, i) => `<tspan x="${w*f.x/100}" y="${startY+i*fitted.size*f.lineHeight}">${xml(line)}</tspan>`).join("")}</text>`;
    }).join("");
    try {
      const result = await renderAsync(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${background}${texts}</svg>`, { font: { loadSystemFonts: true, fontFiles, defaultFontFamily: font ? family : sansFamily, sansSerifFamily: sansFamily, serifFamily }, logLevel: "off" });
      const bytes = result.asPng();
      if (bytes.length > 16 * 1024 * 1024) throw new Error("oversize");
      return bytes;
    } catch { throw new BadRequestException("证书生成失败，请检查模板图片、字体和文字设置"); }
  }
}
