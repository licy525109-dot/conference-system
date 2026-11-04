import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type CertificateProject, type CertificateRecipient } from "@prisma/client";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { certificateEligible, certificateValue, defaultCertificateConfig, normalizeCertificateLookup, validateCertificateConfig, type CertificateConfig, type CertificatePerson } from "@conference/shared";
import type { CurrentAdmin } from "../admin/current-admin";
import { requireConferenceGrant } from "../admin/conference-scope";
import { PrismaService } from "../prisma.service";
import { CertificateRenderer, imageDimensions, certificateFontFamily } from "./certificate-renderer";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const claimHash = (id: string, value: unknown) => hash(`${id}\0${normalizeCertificateLookup(value)}`);
export const certificateOk = <T>(data: T) => ({ code: "OK", message: "ok", data });
type Tx = Prisma.TransactionClient;
export function certificateObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("请求格式不正确");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = true) {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value) || required && !value.trim()) throw new BadRequestException(`文字格式不正确（最多 ${max} 字符，不能包含控制字符）`);
  return value.trim();
}
function revision(value: unknown) { if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 2147483646) throw new BadRequestException("缺少有效草稿版本，请刷新页面"); return Number(value); }
function config(value: unknown): CertificateConfig { try { return validateCertificateConfig(value); } catch (e) { throw new BadRequestException(e instanceof Error ? e.message : "证书配置不正确"); } }
const dto = (r: CertificateRecipient) => ({ id: r.id, templateId: r.templateId, ...(r.dataJson as unknown as CertificatePerson), eligible: r.eligible, hasClaimCode: Boolean(r.claimCodeHash) });

@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService, private readonly renderer: CertificateRenderer) {}

  private scope(admin: CurrentAdmin): Prisma.CertificateProjectWhereInput {
    return admin.conferenceScopeMode === "ALL" ? {} : { conferenceId: { in: admin.conferenceIds ?? [] } };
  }
  private async project(db: Tx | PrismaService, id: string, admin: CurrentAdmin) {
    const p = await db.certificateProject.findFirst({ where: { id, ...this.scope(admin) } });
    if (!p) throw new NotFoundException("证书项目不存在或无权访问");
    return p;
  }
  private async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(fn, { isolationLevel: "Serializable", timeout: 30000 }); }
      catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034" && attempt < 2) continue; if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ConflictException("记录或编号已存在，请刷新并核对"); throw e; }
    }
  }
  private async change(tx: Tx, p: CertificateProject, expected: unknown) {
    const result = await tx.certificateProject.updateMany({ where: { id: p.id, draftRevision: revision(expected) }, data: { draftRevision: { increment: 1 } } });
    if (!result.count) throw new ConflictException("草稿已被修改，请刷新后重试");
  }
  private async audit(tx: Tx, admin: CurrentAdmin, id: string, summary: string, metadata?: unknown) {
    await tx.auditLog.create({ data: { adminUserId: admin.id, action: "UPDATE", entityType: "certificate_project", entityId: id, summary, ...(metadata ? { metadataJson: json(metadata) } : {}) } });
  }
  async options(admin: CurrentAdmin) {
    const conferences = await this.prisma.conference.findMany({ where: admin.conferenceScopeMode === "ALL" ? {} : { id: { in: admin.conferenceIds ?? [] } }, select: { id: true, title: true }, orderBy: { startsAt: "desc" }, take: 1000 });
    return { conferences };
  }
  async list(admin: CurrentAdmin) {
    const items = await this.prisma.certificateProject.findMany({ where: this.scope(admin), select: { id: true, publicId: true, name: true, conferenceId: true, draftRevision: true, publishedRevision: true, paused: true, archived: true, updatedAt: true, _count: { select: { recipients: true, issues: true } } }, orderBy: { updatedAt: "desc" }, take: 1000 });
    return { items: items.map(p => ({ ...p, publicUrl: this.publicUrl(p.publicId) })) };
  }
  private publicUrl(publicId: string) { return `${(process.env.CERTIFICATE_PUBLIC_ORIGIN || "https://cert.guanchaohuiji.com").replace(/\/$/, "")}/c/${publicId}`; }
  async detail(id: string, admin: CurrentAdmin) {
    const p = await this.project(this.prisma, id, admin);
    const versions = await this.prisma.certificateVersion.findMany({ where: { projectId: id }, select: { revision: true, createdAt: true, createdById: true, _count: { select: { recipients: true } } }, orderBy: { revision: "desc" }, take: 50 });
    return { id: p.id, publicId: p.publicId, publicUrl: this.publicUrl(p.publicId), conferenceId: p.conferenceId, draft: p.draftJson as unknown as CertificateConfig, draftRevision: p.draftRevision, publishedRevision: p.publishedRevision, paused: p.paused, archived: p.archived, versions };
  }
  async create(raw: unknown, admin: CurrentAdmin) {
    const body = certificateObject(raw); const name = text(body.name, 200);
    const conferenceId = body.conferenceId ? text(body.conferenceId, 64) : null;
    if (conferenceId) {
      requireConferenceGrant(admin, conferenceId);
      if (!await this.prisma.conference.findUnique({ where: { id: conferenceId }, select: { id: true } })) throw new BadRequestException("会议不存在");
    } else if (admin.conferenceScopeMode !== "ALL") throw new ForbiddenException("请关联已授权会议");
    let draft = defaultCertificateConfig(name);
    if (body.copyFromId) {
      const source = await this.project(this.prisma, text(body.copyFromId, 64), admin);
      draft = config(source.draftJson); draft.name = name;
      // Immutable assets are copied to the new project below, never linked across scopes.
    }
    const id = await this.transaction(async tx => {
      const p = await tx.certificateProject.create({ data: { publicId: randomBytes(12).toString("base64url"), name, conferenceId, ownerAdminId: admin.id, draftJson: json(draft) } });
      if (body.copyFromId) {
        const referenced = [draft.backgroundAssetId, ...draft.templates.flatMap(t => [t.assetId, t.fontAssetId])].filter((id): id is string => Boolean(id));
        const assets = await tx.certificateAsset.findMany({ where: { projectId: String(body.copyFromId), id: { in: referenced } } });
        const mapping = new Map<string, string>();
        for (const a of assets) { const copy = await tx.certificateAsset.create({ data: { projectId: p.id, name: a.name, kind: a.kind, mime: a.mime, width: a.width, height: a.height, bytes: a.bytes, sha256: a.sha256 } }); mapping.set(a.id, copy.id); }
        draft.backgroundAssetId = draft.backgroundAssetId ? mapping.get(draft.backgroundAssetId) ?? null : null;
        for (const t of draft.templates) { t.assetId = t.assetId ? mapping.get(t.assetId) ?? null : null; t.fontAssetId = t.fontAssetId ? mapping.get(t.fontAssetId) ?? null : null; }
        await tx.certificateProject.update({ where: { id: p.id }, data: { draftJson: json(draft) } });
      }
      await this.audit(tx, admin, p.id, "创建证书项目", { copied: Boolean(body.copyFromId) }); return p.id;
    });
    return this.detail(id, admin);
  }
  private async validateAssets(db: Tx | PrismaService, id: string, draft: CertificateConfig) {
    const refs = [...draft.templates.flatMap(t => [{ id: t.assetId, kind: "image" }, { id: t.fontAssetId, kind: "font" }]), { id: draft.backgroundAssetId, kind: "image" }].filter(r => r.id);
    const assets = await db.certificateAsset.findMany({ where: { projectId: id, id: { in: refs.map(r => r.id!) } }, select: { id: true, kind: true } });
    if (refs.some(r => !assets.some(a => a.id === r.id && a.kind === r.kind))) throw new BadRequestException("素材不存在、类型错误或不属于当前会议");
  }
  async save(id: string, raw: unknown, admin: CurrentAdmin) {
    const body = certificateObject(raw), draft = config(body.config);
    await this.transaction(async tx => { const p = await this.project(tx, id, admin); await this.validateAssets(tx, id, draft); await this.change(tx, p, body.draftRevision); await tx.certificateProject.update({ where: { id }, data: { name: draft.name, draftJson: json(draft) } }); await this.audit(tx, admin, id, "保存证书项目草稿"); });
    return this.detail(id, admin);
  }
  async recipients(id: string, admin: CurrentAdmin, query: Record<string, string>) {
    await this.project(this.prisma, id, admin);
    const page = Math.floor(Math.max(1, Math.min(1000, Number(query.page) || 1))), pageSize = Math.floor(Math.max(1, Math.min(200, Number(query.pageSize) || 50)));
    const keyword = query.keyword === undefined ? "" : text(query.keyword, 200, false);
    const where: Prisma.CertificateRecipientWhereInput = { projectId: id, ...(keyword ? { OR: [{ certificateNo: { contains: keyword } }, { dataJson: { path: ["name"], string_contains: keyword } }] } : {}) };
    const [rows, total] = await this.prisma.$transaction([this.prisma.certificateRecipient.findMany({ where, orderBy: { createdAt: "asc" }, skip: (page - 1) * pageSize, take: pageSize }), this.prisma.certificateRecipient.count({ where })]);
    return { items: rows.map(dto), total, page, pageSize };
  }
  private prepareRow(raw: unknown, draft: CertificateConfig, projectId: string) {
    const row = certificateObject(raw); const templateId = text(row.templateId ?? draft.templates[0].id, 64);
    if (!draft.templates.some(t => t.id === templateId)) throw new BadRequestException("证书类型不存在");
    const customRaw = row.custom == null ? {} : certificateObject(row.custom);
    const custom = Object.fromEntries(draft.customFields.map(f => [f.key, text(customRaw[f.key] ?? "", 1000, false)]));
    const name = text(row.name, 200), organization = text(row.organization ?? "", 500, false), role = text(row.role ?? "", 200, false);
    const identity = row.externalId ? text(row.externalId, 200) : JSON.stringify({ name, organization, role, custom });
    const certificateNo = row.certificateNo ? text(row.certificateNo, 100) : `${draft.numberPrefix}${hash(projectId + templateId + identity).slice(0, 12).toUpperCase()}`;
    if (row.eligible !== undefined && typeof row.eligible !== "boolean") throw new BadRequestException("发证资格必须为是或否");
    const claim = row.claimCode === undefined || row.claimCode === "" ? undefined : claimHash(projectId, text(row.claimCode, 128));
    return { templateId, certificateNo, dataJson: json({ name, organization, role, certificateNo, custom }), eligible: row.eligible === true, claimCodeHash: claim };
  }
  private async importPlan(db: Tx | PrismaService, p: CertificateProject, body: Record<string, unknown>) {
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 2000) throw new BadRequestException("每批导入 1 至 2000 条记录");
    if (!["append", "upsert", "replace"].includes(String(body.mode))) throw new BadRequestException("导入方式不正确");
    if (revision(body.draftRevision) !== p.draftRevision) throw new ConflictException("草稿已被修改，请刷新并重新预检");
    const draft = config(p.draftJson), existing = await db.certificateRecipient.findMany({ where: { projectId: p.id } });
    const keys = new Map(existing.map(r => [`${r.templateId}\0${r.certificateNo}`, r]));
    const seen = new Set<string>(), errors: { row: number; message: string }[] = [];
    const rows: ReturnType<CertificatesService["prepareRow"]>[] = []; let added = 0, updated = 0;
    body.rows.forEach((raw, index) => {
      try {
        const r = this.prepareRow(raw, draft, p.id), key = `${r.templateId}\0${r.certificateNo}`;
        if (seen.has(key)) throw new BadRequestException("本批次编号重复；同名人员请提供不同编号或唯一外部标识");
        seen.add(key); const old = body.mode === "replace" ? undefined : keys.get(key);
        if (old && body.mode === "append") throw new BadRequestException("编号已存在，请选择新增或更新模式");
        if (old && r.claimCodeHash === undefined) r.claimCodeHash = old.claimCodeHash ?? undefined;
        rows.push(r); if (old) updated++; else added++;
      } catch (e) { errors.push({ row: index + 1, message: e instanceof Error ? e.message : "格式不正确" }); }
    });
    if ((body.mode === "replace" ? rows.length : existing.length + added) > 10000) throw new BadRequestException("单个项目最多 10000 条名单");
    const digest = hash(JSON.stringify({ id: p.id, revision: p.draftRevision, mode: body.mode, rows }));
    return { rows, digest, added, updated, removed: body.mode === "replace" ? existing.length : 0, errors };
  }
  async previewImport(id: string, raw: unknown, admin: CurrentAdmin) {
    const body = certificateObject(raw), p = await this.project(this.prisma, id, admin), plan = await this.importPlan(this.prisma, p, body);
    return { digest: plan.digest, added: plan.added, updated: plan.updated, removed: plan.removed, errors: plan.errors, draftRevision: p.draftRevision };
  }
  async registrationSource(id: string, raw: unknown, admin: CurrentAdmin) {
    const body = certificateObject(raw), p = await this.project(this.prisma, id, admin);
    if (!p.conferenceId) throw new BadRequestException("请先将项目关联到会议");
    const draft = config(p.draftJson), templateId = text(body.templateId ?? draft.templates[0].id, 64);
    if (!draft.templates.some(t => t.id === templateId)) throw new BadRequestException("证书类型不存在");
    const page = Math.floor(Math.max(1, Math.min(1000, Number(body.page) || 1)));
    const where = { registration: { conferenceId: p.conferenceId, status: "CONFIRMED" as const } };
    const [attendees, total] = await this.prisma.$transaction([
      this.prisma.registrationAttendee.findMany({ where, orderBy: { id: "asc" }, skip: (page - 1) * 2000, take: 2000, select: { id: true, name: true, company: true, title: true, skuId: true, formDataJson: true, sku: { select: { name: true } } } }),
      this.prisma.registrationAttendee.count({ where }),
    ]);
    const rows = attendees.map(a => {
      const source = a.formDataJson && typeof a.formDataJson === "object" && !Array.isArray(a.formDataJson) ? a.formDataJson as Record<string, unknown> : {};
      const custom = Object.fromEntries(draft.customFields.map(f => { const v = f.key === "skuId" ? a.skuId : f.key === "skuName" ? a.sku.name : source[f.key]; return [f.key, typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : ""]; }));
      const row = { templateId, externalId: `registration-attendee:${a.id}`, name: a.name, organization: a.company || "", role: a.title || "", custom, eligible: false, claimCode: randomBytes(8).toString("hex") };
      return { ...row, certificateNo: this.prepareRow(row, draft, id).certificateNo };
    });
    return { rows, page, total, pageSize: 2000 };
  }
  async commitImport(id: string, raw: unknown, admin: CurrentAdmin) {
    const body = certificateObject(raw);
    await this.transaction(async tx => {
      const p = await this.project(tx, id, admin), plan = await this.importPlan(tx, p, body);
      if (plan.errors.length) throw new BadRequestException("请修正预检错误后再导入");
      const digest = text(body.digest, 64); if (digest.length !== 64 || !timingSafeEqual(Buffer.from(digest), Buffer.from(plan.digest))) throw new ConflictException("导入内容已改变，请重新预检");
      if (body.mode === "replace" && body.confirmReplace !== p.publicId) throw new BadRequestException("整批替换需要确认会议固定标识");
      await this.change(tx, p, body.draftRevision);
      if (body.mode === "replace") await tx.certificateRecipient.deleteMany({ where: { projectId: id } });
      for (const row of plan.rows) {
        await tx.certificateRecipient.upsert({ where: { projectId_templateId_certificateNo: { projectId: id, templateId: row.templateId, certificateNo: row.certificateNo } }, create: { projectId: id, ...row }, update: row });
      }
      await this.audit(tx, admin, id, "导入证书名单", { added: plan.added, updated: plan.updated, removed: plan.removed });
    });
    return this.detail(id, admin);
  }
  async addRecipient(id: string, raw: unknown, admin: CurrentAdmin) {
    const body = certificateObject(raw);
    await this.transaction(async tx => { const p = await this.project(tx, id, admin); if (await tx.certificateRecipient.count({ where: { projectId: id } }) >= 10000) throw new BadRequestException("单个项目最多 10000 条名单"); const row = this.prepareRow(body.record, config(p.draftJson), id); await this.change(tx, p, body.draftRevision); await tx.certificateRecipient.create({ data: { projectId: id, ...row } }); await this.audit(tx, admin, id, "新增证书获证人员"); });
    return this.detail(id, admin);
  }
  async updateRecipient(id: string, recipientId: string, raw: unknown, admin: CurrentAdmin) {
    const body = certificateObject(raw);
    await this.transaction(async tx => { const p = await this.project(tx, id, admin); const old = await tx.certificateRecipient.findFirst({ where: { id: recipientId, projectId: id } }); if (!old) throw new NotFoundException("名单记录不存在"); const row = this.prepareRow(body.record, config(p.draftJson), id); await this.change(tx, p, body.draftRevision); await tx.certificateRecipient.update({ where: { id: old.id }, data: row }); await this.audit(tx, admin, id, "更正证书名单记录"); });
    return this.detail(id, admin);
  }
  async removeRecipient(id: string, recipientId: string, raw: unknown, admin: CurrentAdmin) {
    const body = certificateObject(raw);
    await this.transaction(async tx => { const p = await this.project(tx, id, admin); await this.change(tx, p, body.draftRevision); const result = await tx.certificateRecipient.deleteMany({ where: { id: recipientId, projectId: id } }); if (!result.count) throw new NotFoundException("名单记录不存在"); await this.audit(tx, admin, id, "移除草稿名单记录"); });
    return this.detail(id, admin);
  }
  async publish(id: string, raw: unknown, admin: CurrentAdmin) {
    const body = certificateObject(raw);
    await this.transaction(async tx => {
      const p = await this.project(tx, id, admin); if (revision(body.draftRevision) !== p.draftRevision) throw new ConflictException("草稿版本已变化");
      const draft = config(p.draftJson); await this.validateAssets(tx, id, draft);
      const recipients = await tx.certificateRecipient.findMany({ where: { projectId: id } });
      const templates = new Set(draft.templates.map(t => t.id));
      if (recipients.some(r => !templates.has(r.templateId))) throw new BadRequestException("名单引用了已移除的证书类型，请先处理");
      const eligible = recipients.filter(r => certificateEligible(draft, r.dataJson as unknown as CertificatePerson, r.eligible));
      if (!eligible.length) throw new BadRequestException("没有符合获证条件的名单");
      if (draft.queryFields.some(f => f.key === "claimCode" && f.required) && eligible.some(r => !r.claimCodeHash)) throw new BadRequestException("存在未设置领取码的获证人员");
      if (eligible.some(r => draft.queryFields.some(f => f.required && f.key !== "claimCode" && !normalizeCertificateLookup(certificateValue(r.dataJson as unknown as CertificatePerson, f.key))))) throw new BadRequestException("存在缺少必填查询信息的获证人员");
      // Render every eligible template once before committing publication.
      for (const t of draft.templates) { const r = eligible.find(r => r.templateId === t.id); if (r) await this.renderer.render(id, draft, t, r.dataJson as unknown as CertificatePerson); }
      const old = await tx.certificateVersion.findUnique({ where: { projectId_revision: { projectId: id, revision: p.draftRevision } } });
      if (!old) {
        const version = await tx.certificateVersion.create({ data: { projectId: id, revision: p.draftRevision, configJson: json(draft), createdById: admin.id } });
        await tx.certificatePublishedRecipient.createMany({ data: recipients.map(r => {
          const data = r.dataJson as unknown as CertificatePerson;
          return { versionId: version.id, sourceRecipientId: r.id, templateId: r.templateId, certificateNo: r.certificateNo, dataJson: r.dataJson as Prisma.InputJsonValue, eligible: certificateEligible(draft, data, r.eligible), approved: r.eligible, claimCodeHash: r.claimCodeHash, lookupJson: json(Object.fromEntries([...draft.queryFields.map(f => [f.key, f.key === "claimCode" ? r.claimCodeHash ?? "" : normalizeCertificateLookup(certificateValue(data, f.key))])])) };
        }) });
      }
      await tx.certificateProject.update({ where: { id }, data: { publishedRevision: p.draftRevision, paused: false, archived: false } });
      await this.audit(tx, admin, id, "发布证书项目", { revision: p.draftRevision, recipients: recipients.length });
    });
    return this.detail(id, admin);
  }
  async state(id: string, raw: unknown, admin: CurrentAdmin) {
    const body = certificateObject(raw); if (typeof body.paused !== "boolean" || body.archived !== undefined && typeof body.archived !== "boolean") throw new BadRequestException("状态不正确");
    await this.transaction(async tx => { const p = await this.project(tx, id, admin); await this.change(tx, p, body.draftRevision); await tx.certificateProject.update({ where: { id }, data: { paused: body.paused as boolean, ...(body.archived !== undefined ? { archived: body.archived as boolean } : {}) } }); await this.audit(tx, admin, id, body.archived !== undefined && body.archived !== p.archived ? body.archived ? "归档证书项目" : "取消证书项目归档" : body.paused ? "暂停证书领取" : "恢复证书领取"); });
    return this.detail(id, admin);
  }
  async restoreVersion(id: string, raw: unknown, admin: CurrentAdmin) {
    const body = certificateObject(raw), target = revision(body.version);
    await this.transaction(async tx => { const p = await this.project(tx, id, admin); const v = await tx.certificateVersion.findUnique({ where: { projectId_revision: { projectId: id, revision: target } }, include: { recipients: true } }); if (!v) throw new NotFoundException("版本不存在"); await this.change(tx, p, body.draftRevision); await tx.certificateProject.update({ where: { id }, data: { name: config(v.configJson).name, draftJson: v.configJson as Prisma.InputJsonValue } }); await tx.certificateRecipient.deleteMany({ where: { projectId: id } }); for (const r of v.recipients) { const lookup = r.lookupJson as Record<string, string>; await tx.certificateRecipient.create({ data: { id: r.sourceRecipientId, projectId: id, templateId: r.templateId, certificateNo: r.certificateNo, dataJson: r.dataJson as Prisma.InputJsonValue, claimCodeHash: r.claimCodeHash, eligible: r.approved } }); } await this.audit(tx, admin, id, "将历史证书版本复制到草稿", { revision: target }); });
    return this.detail(id, admin);
  }
  async preview(id: string, raw: unknown, admin: CurrentAdmin) {
    const body = certificateObject(raw), p = await this.project(this.prisma, id, admin); let draft = config(p.draftJson);
    let person: CertificatePerson = { name: "预览姓名", organization: "预览单位", role: "", certificateNo: "PREVIEW-001", custom: {} };
    if (body.version) { const v = await this.prisma.certificateVersion.findUnique({ where: { projectId_revision: { projectId: id, revision: revision(body.version) } } }); if (!v) throw new NotFoundException("发布版本不存在"); draft = config(v.configJson); }
    else if (body.config) { draft = config(body.config); await this.validateAssets(this.prisma, id, draft); }
    if (body.recipientId) { const row = body.version ? await this.prisma.certificatePublishedRecipient.findFirst({ where: { sourceRecipientId: String(body.recipientId), version: { projectId: id, revision: Number(body.version) } } }) : await this.prisma.certificateRecipient.findFirst({ where: { id: String(body.recipientId), projectId: id } }); if (!row) throw new NotFoundException("名单记录不存在"); person = row.dataJson as unknown as CertificatePerson; }
    const template = draft.templates.find(t => t.id === (body.templateId || draft.templates[0].id)); if (!template) throw new BadRequestException("证书类型不存在");
    return this.renderer.render(id, draft, template, person);
  }
  async upload(id: string, file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined, admin: CurrentAdmin) {
    await this.project(this.prisma, id, admin); if (!file || !file.size || file.size > 20 * 1024 * 1024) throw new BadRequestException("素材不能为空，且不超过 20MB");
    let kind = "image", mime = file.mimetype, width: number | null = null, height: number | null = null;
    const magic = file.buffer.subarray(0, 4).toString("hex");
    if (magic === "00010000" || magic === "4f54544f" || magic === "74746366") { certificateFontFamily(file.buffer); kind = "font"; mime = magic === "4f54544f" ? "font/otf" : "font/ttf"; }
    else { if (file.size > 10 * 1024 * 1024) throw new BadRequestException("图片不能超过 10MB"); const dims = imageDimensions(file.buffer, mime); width = dims.width; height = dims.height; }
    const asset = await this.prisma.certificateAsset.create({ data: { projectId: id, name: file.originalname.slice(0, 200), kind, mime, width, height, bytes: new Uint8Array(file.buffer), sha256: hash(file.buffer) }, select: { id: true, name: true, kind: true, mime: true, width: true, height: true } });
    return asset;
  }
  async assets(id: string, admin: CurrentAdmin) { await this.project(this.prisma, id, admin); return { items: await this.prisma.certificateAsset.findMany({ where: { projectId: id }, select: { id: true, name: true, kind: true, mime: true, width: true, height: true }, orderBy: { createdAt: "desc" } }) }; }
  async asset(id: string, assetId: string, admin: CurrentAdmin) { await this.project(this.prisma, id, admin); const a = await this.prisma.certificateAsset.findFirst({ where: { id: assetId, projectId: id } }); if (!a) throw new NotFoundException(); return a; }
  async export(id: string, admin: CurrentAdmin) { await this.project(this.prisma, id, admin); const rows = await this.prisma.certificateRecipient.findMany({ where: { projectId: id }, orderBy: { createdAt: "asc" } }); await this.prisma.auditLog.create({ data: { adminUserId: admin.id, action: "SYSTEM", entityType: "certificate_project", entityId: id, summary: "导出证书名单", metadataJson: { count: rows.length } } }); return { items: rows.map(dto) }; }
  async issues(id: string, admin: CurrentAdmin) { await this.project(this.prisma, id, admin); return { items: await this.prisma.certificateIssue.findMany({ where: { projectId: id }, select: { id: true, name: true, certificateNo: true, createdAt: true, downloadCount: true, revokedAt: true, version: { select: { revision: true } } }, orderBy: { createdAt: "desc" }, take: 500 }) }; }
  async revoke(id: string, issueId: string, raw: unknown, admin: CurrentAdmin) { const body = certificateObject(raw); if (typeof body.revoked !== "boolean") throw new BadRequestException("撤销状态不正确"); await this.transaction(async tx => { await this.project(tx, id, admin); const issue = await tx.certificateIssue.findFirst({ where: { id: issueId, projectId: id } }); if (!issue) throw new NotFoundException("发证记录不存在"); await tx.certificateIssue.updateMany({ where: { projectId: id, sourceRecipientId: issue.sourceRecipientId }, data: { revokedAt: body.revoked ? new Date() : null } }); await this.audit(tx, admin, id, body.revoked ? "撤销证书领取" : "恢复证书领取记录"); }); return this.issues(id, admin); }

  private async published(publicId: string) {
    const p = await this.prisma.certificateProject.findUnique({ where: { publicId } }); if (!p || p.publishedRevision == null) throw new NotFoundException("证书项目尚未开放");
    const v = await this.prisma.certificateVersion.findUnique({ where: { projectId_revision: { projectId: p.id, revision: p.publishedRevision } } }); if (!v) throw new NotFoundException("证书项目尚未开放");
    return { p, v, draft: config(v.configJson) };
  }
  private assertOpen(p: { paused: boolean }, draft: CertificateConfig) { const now = Date.now(); if (p.paused) throw new GoneException("本会议证书领取已暂停"); if (draft.startsAt && now < Date.parse(draft.startsAt) || draft.endsAt && now > Date.parse(draft.endsAt)) throw new GoneException("当前不在证书领取开放时间内"); }
  async publicMeta(publicId: string) { const { p, draft } = await this.published(publicId); return { publicId, name: draft.name, title: draft.title, description: draft.description, contact: draft.contact, primaryColor: draft.primaryColor, hasBackground: Boolean(draft.backgroundAssetId), queryFields: draft.queryFields, templates: draft.templates.map(t => ({ id: t.id, name: t.name })), paused: p.paused, startsAt: draft.startsAt, endsAt: draft.endsAt }; }
  async publicBackground(publicId: string) { const { p, draft } = await this.published(publicId); const asset = draft.backgroundAssetId ? await this.prisma.certificateAsset.findFirst({ where: { id: draft.backgroundAssetId, projectId: p.id, kind: "image" } }) : null; if (!asset) throw new NotFoundException(); return asset; }
  async search(publicId: string, raw: unknown) {
    const body = certificateObject(raw), values = certificateObject(body.values), { p, v, draft } = await this.published(publicId); this.assertOpen(p, draft);
    if (draft.queryFields.some(f => values[f.key] !== undefined && (typeof values[f.key] !== "string" || String(values[f.key]).length > 1000))) throw new BadRequestException("查询条件过长或格式不正确");
    const supplied = draft.queryFields.filter(f => normalizeCertificateLookup(values[f.key]));
    if (!supplied.length || draft.queryFields.some(f => f.required && !normalizeCertificateLookup(values[f.key]))) throw new BadRequestException("请填写全部必填查询条件");
    if (supplied.some(f => typeof values[f.key] !== "string" || String(values[f.key]).length > 1000)) throw new BadRequestException("查询条件过长或格式不正确");
    const templateId = body.templateId ? text(body.templateId, 64) : draft.templates.length === 1 ? draft.templates[0].id : "";
    if (!draft.templates.some(t => t.id === templateId)) throw new BadRequestException("请选择证书类型");
    const matches = await this.prisma.certificatePublishedRecipient.findMany({ where: { versionId: v.id, templateId, AND: supplied.map(f => ({ lookupJson: { path: [f.key], equals: f.key === "claimCode" ? claimHash(p.id, values[f.key]) : normalizeCertificateLookup(values[f.key]) } })) }, take: 2 });
    if (matches.length > 1) throw new ConflictException("匹配到多条记录，请补充单位、证书编号或领取码");
    const row = matches[0]; if (!row || !row.eligible) throw new NotFoundException(draft.notFoundMessage);
    if (await this.prisma.certificateIssue.count({ where: { projectId: p.id, sourceRecipientId: row.sourceRecipientId, revokedAt: { not: null } } })) throw new GoneException("证书暂不可领取，请联系会务组");
    const data = row.dataJson as unknown as CertificatePerson;
    const existing = await this.prisma.certificateIssue.findUnique({ where: { versionId_sourceRecipientId: { versionId: v.id, sourceRecipientId: row.sourceRecipientId } }, select: { id: true } });
    let issueId = existing?.id;
    if (!issueId) {
      const template = draft.templates.find(t => t.id === row.templateId)!; const image = await this.renderer.render(p.id, draft, template, data);
      const issue = await this.prisma.certificateIssue.upsert({ where: { versionId_sourceRecipientId: { versionId: v.id, sourceRecipientId: row.sourceRecipientId } }, create: { projectId: p.id, versionId: v.id, sourceRecipientId: row.sourceRecipientId, certificateNo: row.certificateNo, name: data.name, image: new Uint8Array(image) }, update: {}, select: { id: true } }); issueId = issue.id;
    }
    const token = randomBytes(32).toString("base64url"), expiresAt = new Date(Date.now() + 15 * 60_000);
    await this.prisma.certificateGrant.create({ data: { tokenHash: hash(token), issueId, expiresAt } });
    await this.prisma.certificateGrant.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400_000) } } });
    return { name: data.name, certificateNo: data.certificateNo, type: draft.templates.find(t => t.id === row.templateId)!.name, token, expiresAt, allowRepeatDownload: draft.allowRepeatDownload };
  }
  async image(publicId: string, raw: unknown) {
    const body = certificateObject(raw), token = text(body.token, 100);
    if (body.download !== undefined && typeof body.download !== "boolean") throw new BadRequestException("下载标记不正确");
    return this.transaction(async tx => {
      const grant = await tx.certificateGrant.findUnique({ where: { tokenHash: hash(token) }, include: { issue: { include: { project: true, version: true } } } });
      if (!grant || grant.expiresAt.getTime() < Date.now() || grant.issue.project.publicId !== publicId) throw new NotFoundException("领取凭证无效或已过期，请重新查询");
      const issue = grant.issue, draft = config(issue.version.configJson); this.assertOpen(issue.project, draft);
      if (issue.revokedAt || await tx.certificateIssue.count({ where: { projectId: issue.projectId, sourceRecipientId: issue.sourceRecipientId, revokedAt: { not: null } } })) throw new GoneException("证书已暂停领取");
      if (body.download) { const result = await tx.certificateIssue.updateMany({ where: { id: issue.id, revokedAt: null, ...(draft.allowRepeatDownload ? {} : { downloadCount: 0 }) }, data: { downloadCount: { increment: 1 } } }); if (!result.count) throw new GoneException("此证书已下载，请联系会务组处理"); }
      return { bytes: !body.download && !draft.allowRepeatDownload ? await this.renderer.watermarkedPreview(Buffer.from(issue.image)) : Buffer.from(issue.image), name: issue.name, certificateNo: issue.certificateNo };
    });
  }
}
