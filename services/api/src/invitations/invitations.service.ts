import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import {
  createInvitationContent,
  normalizeInvitationContent,
  matchInvitationInvitee,
  invitationNameKey,
  applyInvitationPreset,
  normalizeInvitationRegistration,
  invitationRegistrationUrl,
  type PublicInvitation,
} from "@conference/shared";
import type { CurrentAdmin } from "../admin/current-admin";
import { PrismaService } from "../prisma.service";
import {
  assertInvitationOwner,
  hasInvitationPermission,
  invitationCampaignScope,
  invitationOrigin,
  invitationUrl,
  readInvitationToken,
} from "./invitation-policy";

const ok = <T>(data: T) => ({
  code: "OK" as const,
  message: "ok" as const,
  data,
});
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export function readObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new BadRequestException("请求格式不正确");
  return input as Record<string, unknown>;
}
function boundedText(
  input: unknown,
  label: string,
  length: number,
  required = true,
): string {
  if (
    typeof input !== "string" ||
    input.trim().length > length ||
    (required && !input.trim())
  )
    throw new BadRequestException(`${label}格式不正确`);
  return input.trim();
}
function revision(input: unknown): number {
  if (!Number.isSafeInteger(input) || Number(input) < 1)
    throw new BadRequestException("缺少草稿版本，请刷新页面");
  return Number(input);
}
@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCampaigns(admin: CurrentAdmin) {
    const campaigns = await this.prisma.invitationCampaign.findMany({
      where: invitationCampaignScope(admin),
      include: { conference: { select: { title: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return ok({
      items: campaigns.map((item) => ({
        id: item.id,
        conferenceId: item.conferenceId,
        title:
          normalizeInvitationContent(item.draftJson).title ||
          item.conference?.title ||
          "未命名邀请函",
        draftRevision: item.draftRevision,
        publishedRevision: item.publishedRevision,
        publishedAt: item.publishedAt,
        hasChanges: item.draftRevision !== item.publishedDraftRevision,
      })),
    });
  }
  async options() {
    const [conferences, admins] = await Promise.all([
      this.prisma.conference.findMany({
        where: { status: { not: "ARCHIVED" } },
        select: { id: true, title: true },
        orderBy: { startsAt: "desc" },
        take: 500,
      }),
      this.prisma.adminUser.findMany({
        where: { enabled: true },
        select: { id: true, username: true, displayName: true },
        orderBy: { username: "asc" },
      }),
    ]);
    return ok({ conferences, admins });
  }
  async registrationOptions() {
    return ok({
      conferences: await this.prisma.conference.findMany({
        where: { status: "PUBLISHED" },
        select: { id: true, title: true },
        orderBy: { startsAt: "desc" },
        take: 500,
      }),
    });
  }
  async createCampaign(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    if (
      body.source !== undefined &&
      !["internal", "external"].includes(String(body.source))
    )
      throw new BadRequestException("会议来源无效");
    const external = body.source === "external";
    const conferenceId = external
      ? null
      : boundedText(body.conferenceId, "会议", 100);
    const conference = conferenceId
      ? await this.prisma.conference.findUnique({ where: { id: conferenceId } })
      : null;
    if (!external && !conference) throw new NotFoundException("会议不存在");
    if (
      conferenceId &&
      (await this.prisma.invitationCampaign.findUnique({
        where: { conferenceId },
      }))
    )
      throw new ConflictException("该会议已有邀请函，请在列表中打开");
    let content = createInvitationContent(conference || undefined);
    if (!conference?.coverImageUrl)
      content = applyInvitationPreset(content, "tide");
    if (external) {
      content.title = boundedText(body.title, "会议名称", 200);
      content.dateLabel = boundedText(
        body.dateLabel ?? "",
        "会议时间",
        200,
        false,
      );
      content.location = boundedText(
        body.location ?? "",
        "会议地点",
        200,
        false,
      );
      content.registration = normalizeInvitationRegistration(
        body.registration ?? { mode: "none" },
      );
      await this.validateRegistration(content, null, false, body.registration);
    }
    const campaign = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invitationCampaign.create({
        data: {
          conferenceId,
          draftJson: json(content),
          members: { create: { adminId: admin.id } },
        },
      });
      await this.audit(tx, admin, created.id, "创建会议邀请函");
      return created;
    });
    return ok({ id: campaign.id });
  }
  async campaign(id: string, admin: CurrentAdmin) {
    const campaign = await this.requireCampaign(id, admin);
    const canReadDraft =
      hasInvitationPermission(admin, "invitation:content") ||
      hasInvitationPermission(admin, "invitation:publish");
    return ok({
      id: campaign.id,
      conferenceId: campaign.conferenceId,
      draft: normalizeInvitationContent(
        canReadDraft ? campaign.draftJson : campaign.publishedJson,
      ),
      published: campaign.publishedJson
        ? normalizeInvitationContent(campaign.publishedJson)
        : null,
      draftRevision: campaign.draftRevision,
      publishedRevision: campaign.publishedRevision,
      publishedAt: campaign.publishedAt,
      hasChanges: campaign.draftRevision !== campaign.publishedDraftRevision,
    });
  }
  async save(id: string, input: unknown, admin: CurrentAdmin) {
    const campaign = await this.requireCampaign(id, admin);
    const body = readObject(input);
    const source = readObject(body.content);
    if (JSON.stringify(source).length > 250000)
      throw new BadRequestException("邀请函内容过长");
    if (Array.isArray(source.invitees) && source.invitees.length > 500)
      throw new BadRequestException("公开名单最多 500 位，未保存超限内容");
    if (Array.isArray(source.modules) && source.modules.length > 24)
      throw new BadRequestException("内容模块最多 24 个，未保存超限内容");
    const cover = readObject(source.cover || {});
    if (Array.isArray(cover.layers) && cover.layers.length > 12)
      throw new BadRequestException("封面文字最多 12 层，未保存超限内容");
    const content = normalizeInvitationContent(source);
    await this.validateRegistration(
      content,
      campaign.conferenceId,
      false,
      source.registration,
    );
    if (
      new Set(content.invitees.map((item) => item.id)).size !==
      content.invitees.length
    )
      throw new BadRequestException("公开名单行标识重复，请重新导入");
    for (const field of [
      "coverImageUrl",
      "logoUrl",
      "shareImageUrl",
    ] as const) {
      if ((body.content as Record<string, unknown>)[field] && !content[field])
        throw new BadRequestException("图片须使用 HTTPS 地址或本站上传素材");
    }
    const expected = revision(body.draftRevision);
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.invitationCampaign.updateMany({
        where: { id, draftRevision: expected },
        data: { draftJson: json(content), draftRevision: { increment: 1 } },
      });
      if (!result.count)
        throw new ConflictException("内容已被其他工作人员修改，请刷新后再编辑");
      await this.audit(tx, admin, id, "保存邀请函草稿");
    });
    return this.campaign(id, admin);
  }
  async publish(id: string, input: unknown, admin: CurrentAdmin) {
    const campaign = await this.requireCampaign(id, admin);
    const expected = revision(readObject(input).draftRevision);
    const content = normalizeInvitationContent(campaign.draftJson);
    if (content.invitees.some((item) => !item.name))
      throw new BadRequestException("公开名单中存在未填写姓名的行");
    if (!content.coverImageUrl)
      throw new BadRequestException("发布前请上传封面图片或选择视觉模板");
    await this.validateRegistration(content, campaign.conferenceId, true);
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.invitationCampaign.updateMany({
        where: {
          id,
          draftRevision: expected,
          publishedRevision: campaign.publishedRevision,
        },
        data: {
          publishedJson: json(content),
          publishedDraftRevision: expected,
          publishedRevision: { increment: 1 },
          publishedAt: new Date(),
        },
      });
      if (!result.count || expected !== campaign.draftRevision)
        throw new ConflictException("草稿或发布版本已变化，请刷新并重新确认");
      await this.audit(tx, admin, id, "发布会议邀请函，所有专属链接同步更新");
    });
    return this.campaign(id, admin);
  }
  async members(id: string, admin: CurrentAdmin) {
    await this.requireCampaign(id, admin);
    const members = await this.prisma.invitationCampaignMember.findMany({
      where: { campaignId: id },
      select: { adminId: true },
    });
    return ok({ adminIds: members.map((item) => item.adminId) });
  }
  async setMembers(id: string, input: unknown, admin: CurrentAdmin) {
    await this.requireCampaign(id, admin);
    const ids = readObject(input).adminIds;
    if (
      !Array.isArray(ids) ||
      ids.length > 200 ||
      ids.some((id) => typeof id !== "string" || id.length > 100)
    )
      throw new BadRequestException("会议授权列表不正确");
    const adminIds = [...new Set(ids as string[])];
    if (
      (await this.prisma.adminUser.count({
        where: { id: { in: adminIds }, enabled: true },
      })) !== adminIds.length
    )
      throw new BadRequestException("授权人员不存在或已停用");
    await this.prisma.$transaction(async (tx) => {
      await tx.invitationCampaignMember.deleteMany({
        where: { campaignId: id },
      });
      if (adminIds.length)
        await tx.invitationCampaignMember.createMany({
          data: adminIds.map((adminId) => ({ campaignId: id, adminId })),
        });
      await this.audit(tx, admin, id, "更新会议邀请函授权范围");
    });
    return ok({ adminIds });
  }
  async list(
    id: string,
    admin: CurrentAdmin,
    query: { keyword?: string; page?: string; pageSize?: string },
  ) {
    await this.requireCampaign(id, admin);
    const page = Math.max(
      1,
      Math.min(100000, Number.parseInt(query.page || "1", 10) || 1),
    );
    const pageSize = Math.max(
      1,
      Math.min(100, Number.parseInt(query.pageSize || "20", 10) || 20),
    );
    const where: Prisma.ConferenceInvitationWhereInput = {
      campaignId: id,
      ...(!hasInvitationPermission(admin, "invitation:all")
        ? { createdBy: admin.id }
        : {}),
      ...(query.keyword?.trim()
        ? {
            name: {
              contains: query.keyword.trim().slice(0, 80),
              mode: "insensitive",
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.conferenceInvitation.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          creator: { select: { displayName: true, username: true } },
          orders: {
            where: {
              status: "PAID",
              registration: { is: { status: "CONFIRMED" } },
            },
            select: { id: true },
          },
        },
      }),
      this.prisma.conferenceInvitation.count({ where }),
    ]);
    return ok({
      items: items.map(({ token, orders, campaignId: _, ...item }) => ({
        ...item,
        shareUrl: invitationUrl(token),
        registrationCount: orders.length,
      })),
      total,
      page,
      pageSize,
    });
  }
  async create(id: string, input: unknown, admin: CurrentAdmin) {
    const campaign = await this.requireCampaign(id, admin);
    if (!campaign.publishedRevision)
      throw new ConflictException("请先发布会议邀请内容，再生成专属邀请函");
    const body = readObject(input);
    const name = boundedText(body.name, "姓名", 80);
    const publicInviteeId = this.rosterBinding(
      campaign.publishedJson,
      name,
      body.publicInviteeId,
    );
    const salutation = boundedText(
      body.salutation ?? "老师",
      "称谓",
      40,
      false,
    );
    const invitation = await this.prisma.$transaction(async (tx) => {
      const item = await tx.conferenceInvitation.create({
        data: {
          campaignId: id,
          name,
          publicInviteeId,
          salutation,
          token: randomBytes(32).toString("base64url"),
          createdBy: admin.id,
        },
      });
      await this.audit(tx, admin, item.id, "创建专属邀请函");
      return item;
    });
    return ok({ id: invitation.id, shareUrl: invitationUrl(invitation.token) });
  }
  async createBatch(id: string, input: unknown, admin: CurrentAdmin) {
    const campaign = await this.requireCampaign(id, admin);
    if (!campaign.publishedRevision)
      throw new ConflictException("请先发布会议邀请内容，再生成专属邀请函");
    const body = readObject(input);
    if (
      typeof body.requestKey !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.requestKey)
    )
      throw new BadRequestException("批次标识不正确");
    if (
      !Array.isArray(body.recipients) ||
      !body.recipients.length ||
      body.recipients.length > 200
    )
      throw new BadRequestException("每批请选择 1–200 位受邀人");
    const seen = new Set<string>();
    const rows = body.recipients.map((input, index) => {
      const row = readObject(input);
      const name = boundedText(row.name, `第 ${index + 1} 行姓名`, 80);
      const salutation = boundedText(
        row.salutation ?? "老师",
        `第 ${index + 1} 行称谓`,
        40,
        false,
      );
      if (/[\u0000-\u001f\u007f]/.test(name + salutation))
        throw new BadRequestException(`第 ${index + 1} 行含有控制字符`);
      const publicInviteeId = this.rosterBinding(
        campaign.publishedJson,
        name,
        row.publicInviteeId,
      );
      const identity = JSON.stringify([
        invitationNameKey(name),
        publicInviteeId,
      ]);
      if (seen.has(identity))
        throw new BadRequestException(
          `第 ${index + 1} 行受邀人重复，请保留一条`,
        );
      seen.add(identity);
      // A random client batch key makes retry tokens stable without storing a separate batch table.
      const token = createHash("sha256")
        .update(
          JSON.stringify([
            "invitation-batch",
            id,
            admin.id,
            body.requestKey,
            index,
          ]),
        )
        .digest("base64url");
      return {
        campaignId: id,
        createdBy: admin.id,
        name,
        salutation,
        publicInviteeId,
        token,
      };
    });
    const result = await this.prisma.$transaction(
      async (tx) => {
        // Serialize this operator's batches so repeated imports can reuse existing invitations.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invitation-batch:${id}:${admin.id}`}))`;
        const current = await tx.invitationCampaign.findFirst({
          where: { id, ...invitationCampaignScope(admin) },
        });
        if (!current) throw new NotFoundException("会议邀请函不存在或无权访问");
        if (current.publishedRevision !== campaign.publishedRevision)
          throw new ConflictException("会议内容已更新，请刷新后重新确认受邀人");
        const existing = await tx.conferenceInvitation.findMany({
          where: {
            campaignId: id,
            createdBy: admin.id,
            OR: [
              { token: { in: rows.map((row) => row.token) } },
              ...rows.map(({ name, salutation, publicInviteeId }) => ({
                name,
                salutation,
                publicInviteeId,
                enabled: true,
              })),
            ],
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        });
        const reused = new Map<number, (typeof existing)[number]>();
        const incoming: typeof rows = [];
        rows.forEach((row, index) => {
          const retry = existing.find((item) => item.token === row.token);
          if (
            retry &&
            (!retry.enabled ||
              retry.name !== row.name ||
              retry.salutation !== row.salutation ||
              retry.publicInviteeId !== row.publicInviteeId)
          )
            throw new ConflictException(
              `第 ${index + 1} 行对应邀请已修改或停用，请重新准备批次`,
            );
          const prior =
            retry ||
            existing.find(
              (item) =>
                item.enabled &&
                item.name === row.name &&
                item.salutation === row.salutation &&
                item.publicInviteeId === row.publicInviteeId,
            );
          if (prior) reused.set(index, prior);
          else incoming.push(row);
        });
        if (incoming.length) {
          await tx.conferenceInvitation.createMany({ data: incoming });
          await this.audit(
            tx,
            admin,
            id,
            `批量创建 ${incoming.length} 份专属邀请函，复用 ${reused.size} 份已有邀请`,
          );
        }
        const created = incoming.length
          ? await tx.conferenceInvitation.findMany({
              where: {
                campaignId: id,
                createdBy: admin.id,
                token: { in: incoming.map((row) => row.token) },
              },
            })
          : [];
        return {
          created: incoming.length,
          reused: reused.size,
          items: rows.map((row, index) => {
            const item =
              reused.get(index) ||
              created.find((item) => item.token === row.token);
            if (!item)
              throw new ConflictException("邀请批次未完整生成，请重试");
            return {
              id: item.id,
              name: item.name,
              salutation: item.salutation,
              shareUrl: invitationUrl(item.token),
              reused: reused.has(index),
            };
          }),
        };
      },
      { timeout: 15000 },
    );
    return ok(result);
  }
  async update(id: string, input: unknown, admin: CurrentAdmin) {
    const invitation = await this.prisma.conferenceInvitation.findFirst({
      where: { id, campaign: invitationCampaignScope(admin) },
    });
    if (!invitation) throw new NotFoundException("邀请函不存在或无权访问");
    assertInvitationOwner(admin, invitation.createdBy);
    const body = readObject(input);
    const data: Prisma.ConferenceInvitationUpdateInput = {};
    if ("name" in body) data.name = boundedText(body.name, "姓名", 80);
    if ("name" in body || "publicInviteeId" in body) {
      const campaign = await this.requireCampaign(invitation.campaignId, admin);
      const name = String(data.name || invitation.name);
      const requested =
        "publicInviteeId" in body
          ? body.publicInviteeId
          : name === invitation.name
            ? invitation.publicInviteeId
            : undefined;
      data.publicInviteeId = this.rosterBinding(
        campaign.publishedJson,
        name,
        requested,
      );
    }
    if ("salutation" in body)
      data.salutation = boundedText(body.salutation, "称谓", 40, false);
    if ("enabled" in body) {
      if (typeof body.enabled !== "boolean")
        throw new BadRequestException("状态不正确");
      data.enabled = body.enabled;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.conferenceInvitation.update({ where: { id }, data });
      await this.audit(tx, admin, id, "更新专属邀请函");
    });
    return ok({ id });
  }
  async publicInvitation(
    token: string,
  ): Promise<ReturnType<typeof ok<PublicInvitation>>> {
    if (!readInvitationToken(token))
      throw new NotFoundException("邀请函不存在");
    const invitation = await this.prisma.conferenceInvitation.findUnique({
      where: { token },
      include: {
        campaign: {
          include: {
            conference: {
              select: {
                status: true,
                endsAt: true,
                registrationStartsAt: true,
                registrationEndsAt: true,
              },
            },
          },
        },
      },
    });
    if (
      !invitation?.enabled ||
      !invitation.campaign.publishedJson ||
      (invitation.campaign.conference &&
        invitation.campaign.conference.status !== "PUBLISHED")
    )
      throw new GoneException("邀请函暂不可用，请联系邀请您的工作人员");
    const { campaign } = invitation;
    const content = normalizeInvitationContent(campaign.publishedJson);
    const registration = normalizeInvitationRegistration(content.registration);
    const registrationConferenceId =
      registration.conferenceId || campaign.conferenceId;
    const conference =
      registration.mode === "miniapp" && registrationConferenceId
        ? registrationConferenceId === campaign.conferenceId
          ? campaign.conference
          : await this.prisma.conference.findUnique({
              where: { id: registrationConferenceId },
            })
        : null;
    const now = new Date();
    const started =
      !conference?.registrationStartsAt ||
      conference.registrationStartsAt <= now;
    const ended =
      !conference ||
      conference.status !== "PUBLISHED" ||
      conference.endsAt < now ||
      Boolean(
        conference.registrationEndsAt && conference.registrationEndsAt < now,
      );
    for (const key of ["coverImageUrl", "logoUrl", "shareImageUrl"] as const)
      if (content[key].startsWith("/"))
        content[key] = `${invitationOrigin()}${content[key]}`;
    content.guests = content.guests.map((guest) => ({
      ...guest,
      imageUrl: guest.imageUrl.startsWith("/")
        ? `${invitationOrigin()}${guest.imageUrl}`
        : guest.imageUrl,
    }));
    return ok({
      recipient: {
        name: invitation.name,
        salutation: invitation.salutation,
        publicInviteeId: invitation.publicInviteeId,
      },
      conferenceId: campaign.conferenceId,
      revision: campaign.publishedRevision,
      publishedAt: campaign.publishedAt!.toISOString(),
      content,
      shareUrl: invitationUrl(token),
      registrationMode: registration.mode,
      registrationUrl: registration.mode === "external" ? registration.url : "",
      registrationPath:
        registration.mode === "miniapp" && registrationConferenceId
          ? `pages/registration/form?conferenceId=${encodeURIComponent(registrationConferenceId)}&invitationToken=${token}`
          : "",
      registrationOpen:
        registration.mode === "external"
          ? Boolean(registration.url)
          : registration.mode === "miniapp" && started && !ended,
      registrationMessage:
        registration.mode === "none"
          ? ""
          : registration.mode === "external"
            ? registration.label || "前往报名"
            : ended
              ? "报名已截止"
              : started
                ? registration.label || "前往小程序报名"
                : "报名尚未开始",
      miniAppId:
        registration.mode === "miniapp" ? process.env.WECHAT_APP_ID || "" : "",
    });
  }
  private async validateRegistration(
    content: ReturnType<typeof normalizeInvitationContent>,
    linkedId: string | null,
    publishing: boolean,
    raw?: unknown,
  ) {
    const registration = normalizeInvitationRegistration(content.registration);
    const source = raw === undefined ? {} : readObject(raw);
    if (
      source.mode !== undefined &&
      !["miniapp", "external", "none"].includes(String(source.mode))
    )
      throw new BadRequestException("报名方式无效");
    if (
      registration.mode === "external" &&
      !invitationRegistrationUrl(source.url ?? registration.url)
    )
      throw new BadRequestException(
        "请填写有效的 HTTPS 外部报名链接，链接不能包含账号密码",
      );
    if (registration.mode !== "miniapp") return;
    const id = registration.conferenceId || linkedId;
    if (!id) {
      if (publishing)
        throw new BadRequestException("发布前请选择小程序报名会议");
      return;
    }
    if (registration.conferenceId || publishing) {
      const conference = await this.prisma.conference.findUnique({
        where: { id },
      });
      if (!conference || conference.status === "ARCHIVED")
        throw new BadRequestException("报名会议不存在或已归档");
      if (publishing && conference.status !== "PUBLISHED")
        throw new BadRequestException("请先发布所选小程序报名会议");
    }
  }
  private async requireCampaign(id: string, admin: CurrentAdmin) {
    const campaign = await this.prisma.invitationCampaign.findFirst({
      where: { id, ...invitationCampaignScope(admin) },
    });
    if (!campaign) throw new NotFoundException("会议邀请函不存在或未授权");
    return campaign;
  }
  private rosterBinding(
    published: unknown,
    name: string,
    requested: unknown,
  ): string | null {
    if (
      requested !== undefined &&
      requested !== null &&
      (typeof requested !== "string" || requested.length > 80)
    )
      throw new BadRequestException("名单位置无效");
    const match = matchInvitationInvitee(
      normalizeInvitationContent(published).invitees,
      {
        name,
        salutation: "",
        publicInviteeId: requested as string | null | undefined,
      },
    );
    if (requested && match.status !== "matched")
      throw new BadRequestException("所选名单位置与受邀人不匹配，请重新确认");
    if (match.status === "ambiguous")
      throw new ConflictException(
        "公开名单存在同名嘉宾，请选择对应单位确认位置",
      );
    return match.item?.id || null;
  }
  private audit(
    tx: Prisma.TransactionClient,
    admin: CurrentAdmin,
    id: string,
    summary: string,
  ) {
    return tx.auditLog.create({
      data: {
        adminUserId: admin.id,
        action: AuditAction.UPDATE,
        entityType: "conference_invitation",
        entityId: id,
        summary,
      },
    });
  }
}
