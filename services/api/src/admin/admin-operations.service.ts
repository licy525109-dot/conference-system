import { inflateSync } from "node:zlib";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditAction,
  CheckInStatus,
  CheckinActionType,
  CustomerGroupMessageStatus,
  InvoiceStatus,
  OrderStatus,
  PaymentProvider,
  Prisma,
  RefundStatus
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { decryptSecret, encryptSecret, maskSecret } from "../wecom/wecom.crypto";
import { CurrentAdmin } from "./current-admin";

@Injectable()
export class AdminOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getInventoryAlertRule(conferenceId: string) {
    await this.ensureConference(conferenceId);
    const rule = await this.prisma.inventoryAlertRule.upsert({
      where: { conferenceId },
      update: {},
      create: { conferenceId }
    });
    return ok(formatDateFields(rule));
  }

  async updateInventoryAlertRule(conferenceId: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    await this.ensureConference(conferenceId);
    const rule = await this.prisma.inventoryAlertRule.upsert({
      where: { conferenceId },
      update: {
        ...(typeof body.enabled !== "undefined" ? { enabled: readBoolean(body.enabled, "enabled") } : {}),
        ...(typeof body.thresholdRemaining !== "undefined" ? { thresholdRemaining: readNonNegativeInt(body.thresholdRemaining, "thresholdRemaining") } : {}),
        ...(typeof body.notifyMode !== "undefined" ? { notifyMode: readRequiredString(body, "notifyMode") } : {})
      },
      create: {
        conferenceId,
        enabled: typeof body.enabled === "boolean" ? body.enabled : false,
        thresholdRemaining: typeof body.thresholdRemaining === "undefined" ? 10 : readNonNegativeInt(body.thresholdRemaining, "thresholdRemaining"),
        notifyMode: readOptionalString(body.notifyMode) ?? "ADMIN_ONLY"
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "InventoryAlertRule", rule.id, "Update inventory alert rule", { conferenceId });
    return ok(formatDateFields(rule));
  }

  async scanInventoryAlerts(admin: CurrentAdmin) {
    if (!isEnabled("INVENTORY_ALERT_ENABLED")) {
      return ok({ scanned: 0, created: 0, skippedReason: "INVENTORY_ALERT_ENABLED=false" });
    }
    const rules = await this.prisma.inventoryAlertRule.findMany({ where: { enabled: true }, include: { conference: { include: { skus: true } } } });
    let created = 0;
    for (const rule of rules) {
      for (const sku of rule.conference.skus) {
        const remainingStock = Math.max(0, sku.stock - sku.soldCount);
        if (remainingStock <= rule.thresholdRemaining) {
          await this.prisma.inventoryAlertLog.create({
            data: {
              conferenceId: rule.conferenceId,
              skuId: sku.id,
              remainingStock,
              thresholdRemaining: rule.thresholdRemaining,
              message: `${rule.conference.title} / ${sku.name} 剩余库存 ${remainingStock}`
            }
          });
          created += 1;
        }
      }
      await this.prisma.inventoryAlertRule.update({ where: { id: rule.id }, data: { lastScannedAt: new Date() } });
    }
    await this.writeAudit(admin, AuditAction.SYSTEM, "InventoryAlertLog", null, "Scan inventory alerts", { scanned: rules.length, created });
    return ok({ scanned: rules.length, created });
  }

  async listInventoryAlertLogs(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const where: Prisma.InventoryAlertLogWhereInput = {
      ...(readOptionalString(query.conferenceId) ? { conferenceId: readOptionalString(query.conferenceId) } : {}),
      ...(readOptionalString(query.status) ? { status: readOptionalString(query.status) } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventoryAlertLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { conference: { select: { title: true } } } }),
      this.prisma.inventoryAlertLog.count({ where })
    ]);
    return ok({ items: items.map((item) => ({ ...formatDateFields(item), conferenceTitle: item.conference.title })), total, page, pageSize });
  }

  async listCustomerGroups(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const keyword = readOptionalString(query.keyword);
    const where: Prisma.CustomerGroupWhereInput = keyword ? { name: { contains: keyword, mode: "insensitive" } } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customerGroup.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      this.prisma.customerGroup.count({ where })
    ]);
    return ok({ items: items.map(formatDateFields), total, page, pageSize });
  }

  async createCustomerGroup(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const group = await this.prisma.customerGroup.create({
      data: {
        wecomChatId: readNullableString(body.wecomChatId),
        name: readRequiredString(body, "name"),
        ownerUserId: readNullableString(body.ownerUserId),
        ownerName: readNullableString(body.ownerName),
        memberCount: readOptionalNonNegativeInt(body.memberCount) ?? 0,
        status: readOptionalString(body.status) ?? "ACTIVE",
        remark: readNullableString(body.remark)
      }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "CustomerGroup", group.id, "Create customer group");
    return ok(formatDateFields(group));
  }

  async updateCustomerGroup(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    await this.ensureCustomerGroup(id);
    const group = await this.prisma.customerGroup.update({
      where: { id },
      data: {
        ...(typeof body.wecomChatId !== "undefined" ? { wecomChatId: readNullableString(body.wecomChatId) } : {}),
        ...(typeof body.name !== "undefined" ? { name: readRequiredString(body, "name") } : {}),
        ...(typeof body.ownerUserId !== "undefined" ? { ownerUserId: readNullableString(body.ownerUserId) } : {}),
        ...(typeof body.ownerName !== "undefined" ? { ownerName: readNullableString(body.ownerName) } : {}),
        ...(typeof body.memberCount !== "undefined" ? { memberCount: readNonNegativeInt(body.memberCount, "memberCount") } : {}),
        ...(typeof body.status !== "undefined" ? { status: readRequiredString(body, "status") } : {}),
        ...(typeof body.remark !== "undefined" ? { remark: readNullableString(body.remark) } : {})
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "CustomerGroup", group.id, "Update customer group");
    return ok(formatDateFields(group));
  }

  async syncCustomerGroupsFromWecom(admin: CurrentAdmin) {
    if (!isEnabled("WECOM_CUSTOMER_GROUP_ENABLED")) {
      return ok({ synced: 0, skippedReason: "WECOM_CUSTOMER_GROUP_ENABLED=false" });
    }
    await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroup", null, "Sync WeCom customer groups requested");
    return ok({ synced: 0, skippedReason: "WeCom customer group official API adapter reserved" });
  }

  async listGroupWelcomeTemplates() {
    const items = await this.prisma.groupWelcomeTemplate.findMany({ orderBy: { createdAt: "desc" } });
    return ok({ items: items.map(formatDateFields) });
  }

  async createGroupWelcomeTemplate(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const item = await this.prisma.groupWelcomeTemplate.create({
      data: { name: readRequiredString(body, "name"), contentJson: readJsonObject(body.contentJson, "contentJson"), enabled: readOptionalBoolean(body.enabled) ?? true }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "GroupWelcomeTemplate", item.id, "Create group welcome template");
    return ok(formatDateFields(item));
  }

  async updateGroupWelcomeTemplate(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const item = await this.prisma.groupWelcomeTemplate.update({
      where: { id },
      data: {
        ...(typeof body.name !== "undefined" ? { name: readRequiredString(body, "name") } : {}),
        ...(typeof body.contentJson !== "undefined" ? { contentJson: readJsonObject(body.contentJson, "contentJson") } : {}),
        ...(typeof body.enabled !== "undefined" ? { enabled: readBoolean(body.enabled, "enabled") } : {})
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "GroupWelcomeTemplate", item.id, "Update group welcome template");
    return ok(formatDateFields(item));
  }

  async listCustomerGroupMessageTasks(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customerGroupMessageTask.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { logs: true, conference: { select: { title: true } } } }),
      this.prisma.customerGroupMessageTask.count()
    ]);
    return ok({ items: items.map((item) => ({ ...formatDateFields(item), conferenceTitle: item.conference?.title ?? null, logCount: item.logs.length })), total, page, pageSize });
  }

  async createCustomerGroupMessageTask(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const item = await this.prisma.customerGroupMessageTask.create({
      data: {
        name: readRequiredString(body, "name"),
        conferenceId: readNullableString(body.conferenceId),
        contentJson: readJsonObject(body.contentJson, "contentJson"),
        targetGroupIds: readOptionalJsonArray(body.targetGroupIds),
        status: CustomerGroupMessageStatus.DRAFT,
        needConfirm: readOptionalBoolean(body.needConfirm) ?? true,
        confirmDeadline: readOptionalDate(body.confirmDeadline),
        createdById: admin.id
      }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "CustomerGroupMessageTask", item.id, "Create customer group message task");
    return ok(formatDateFields(item));
  }

  async createWecomCustomerGroupTask(id: string, admin: CurrentAdmin) {
    const task = await this.prisma.customerGroupMessageTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("Customer group message task not found");
    if (!isEnabled("WECOM_CUSTOMER_GROUP_ENABLED")) {
      const updated = await this.prisma.customerGroupMessageTask.update({ where: { id }, data: { status: CustomerGroupMessageStatus.FAILED } });
      return ok({ task: formatDateFields(updated), result: { created: false, reason: "WECOM_CUSTOMER_GROUP_ENABLED=false" } });
    }
    const groupIds = readStringArray(task.targetGroupIds);
    const groups = groupIds.length ? await this.prisma.customerGroup.findMany({ where: { id: { in: groupIds } } }) : await this.prisma.customerGroup.findMany({ take: 100 });
    const updated = await this.prisma.customerGroupMessageTask.update({
      where: { id },
      data: {
        status: CustomerGroupMessageStatus.WAITING_CONFIRM,
        wecomTaskId: `reserved_${id}`,
        logs: {
          create: groups.map((group) => ({
            groupId: group.id,
            ownerUserId: group.ownerUserId,
            status: "WAITING_MEMBER_CONFIRM",
            resultJson: { officialApi: "externalcontact/add_msg_template reserved" }
          }))
        }
      }
    });
    await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", id, "Create WeCom customer group task");
    return ok({ task: formatDateFields(updated), result: { created: true, groupCount: groups.length } });
  }

  async cancelCustomerGroupMessageTask(id: string, admin: CurrentAdmin) {
    const updated = await this.prisma.customerGroupMessageTask.update({ where: { id }, data: { status: CustomerGroupMessageStatus.CANCELLED } });
    await this.writeAudit(admin, AuditAction.UPDATE, "CustomerGroupMessageTask", id, "Cancel customer group message task");
    return ok(formatDateFields(updated));
  }

  async getCustomerGroupMessageTaskResult(id: string) {
    const task = await this.prisma.customerGroupMessageTask.findUnique({ where: { id }, include: { logs: { include: { group: true } } } });
    if (!task) throw new NotFoundException("Customer group message task not found");
    return ok({
      task: formatDateFields(task),
      logs: task.logs.map((log) => ({ ...formatDateFields(log), groupName: log.group?.name ?? null })),
      summary: summarizeStatuses(task.logs.map((log) => log.status))
    });
  }

  async getKnowledgeBase(conferenceId: string) {
    await this.ensureConference(conferenceId);
    const kb = await this.prisma.knowledgeBase.upsert({
      where: { conferenceId },
      update: {},
      create: { conferenceId, title: "会议知识库", enabled: false, fallbackText: defaultAiFallbackText() },
      include: knowledgeBaseInclude
    });
    return ok(formatKnowledgeBase(kb));
  }

  async listKnowledgeBases(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const keyword = readOptionalString(query.keyword);
    const conferenceId = readOptionalString(query.conferenceId);
    const where: Prisma.KnowledgeBaseWhereInput = {
      ...(conferenceId ? { conferenceId } : {}),
      ...(keyword ? { OR: [{ title: { contains: keyword, mode: "insensitive" } }, { conference: { title: { contains: keyword, mode: "insensitive" } } }] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.knowledgeBase.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
        include: knowledgeBaseInclude
      }),
      this.prisma.knowledgeBase.count({ where })
    ]);
    return ok({ items: items.map(formatKnowledgeBase), total, page, pageSize });
  }

  async createKnowledgeBase(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const conferenceId = readRequiredString(body, "conferenceId");
    await this.ensureConference(conferenceId);
    const existing = await this.prisma.knowledgeBase.findUnique({ where: { conferenceId } });
    if (existing) throw new ConflictException("该会议已存在知识库");
    const kb = await this.prisma.knowledgeBase.create({
      data: {
        conferenceId,
        title: readOptionalString(body.title) ?? "会议知识库",
        enabled: readOptionalBoolean(body.enabled) ?? false,
        scopeDescription: readNullableString(body.scopeDescription),
        fallbackText: readOptionalString(body.fallbackText) ?? defaultAiFallbackText(),
        citationsEnabled: readOptionalBoolean(body.citationsEnabled) ?? true,
        loggingEnabled: readOptionalBoolean(body.loggingEnabled) ?? true
      },
      include: knowledgeBaseInclude
    });
    await this.writeAudit(admin, AuditAction.CREATE, "KnowledgeBase", kb.id, "Create AI knowledge base", { conferenceId });
    return ok(formatKnowledgeBase(kb));
  }

  async updateKnowledgeBase(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const kb = await this.prisma.knowledgeBase.update({
      where: { id },
      data: {
        ...(typeof body.title !== "undefined" ? { title: readRequiredString(body, "title") } : {}),
        ...(typeof body.enabled !== "undefined" ? { enabled: readBoolean(body.enabled, "enabled") } : {}),
        ...(typeof body.scopeDescription !== "undefined" ? { scopeDescription: readNullableString(body.scopeDescription) } : {}),
        ...(typeof body.fallbackText !== "undefined" ? { fallbackText: readNullableString(body.fallbackText) } : {}),
        ...(typeof body.citationsEnabled !== "undefined" ? { citationsEnabled: readBoolean(body.citationsEnabled, "citationsEnabled") } : {}),
        ...(typeof body.loggingEnabled !== "undefined" ? { loggingEnabled: readBoolean(body.loggingEnabled, "loggingEnabled") } : {})
      },
      include: knowledgeBaseInclude
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "KnowledgeBase", id, "Update AI knowledge base", { conferenceId: kb.conferenceId });
    return ok(formatKnowledgeBase(kb));
  }

  async updateConferenceKnowledgeBase(conferenceId: string, input: unknown, admin: CurrentAdmin) {
    const current = await this.ensureKnowledgeBase(conferenceId);
    return this.updateKnowledgeBase(current.id, input, admin);
  }

  async listKnowledgeDocuments(conferenceId: string, query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const kb = await this.ensureKnowledgeBase(conferenceId);
    const keyword = readOptionalString(query.keyword);
    const status = readOptionalString(query.status);
    const where: Prisma.KnowledgeDocumentWhereInput = {
      knowledgeBaseId: kb.id,
      ...(status ? { status } : {}),
      ...(keyword ? { OR: [{ title: { contains: keyword, mode: "insensitive" } }, { contentText: { contains: keyword, mode: "insensitive" } }] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.knowledgeDocument.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: pageSize, include: { chunks: { select: { id: true } } } }),
      this.prisma.knowledgeDocument.count({ where })
    ]);
    return ok({ items: items.map(formatKnowledgeDocument), total, page, pageSize, knowledgeBase: formatKnowledgeBaseSummary(kb) });
  }

  async createKnowledgeDocument(conferenceId: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const kb = await this.ensureKnowledgeBase(conferenceId);
    const prepared = prepareKnowledgeDocumentContent(body);
    const chunks = prepared.lastError ? [] : chunkText(prepared.contentText);
    const doc = await this.prisma.knowledgeDocument.create({
      data: {
        knowledgeBaseId: kb.id,
        title: readRequiredString(body, "title"),
        sourceType: prepared.sourceType,
        contentText: prepared.contentText,
        status: prepared.lastError ? "DISABLED" : normalizeDocumentStatus(readOptionalString(body.status) ?? "ACTIVE"),
        chunkCount: chunks.length,
        lastError: prepared.lastError,
        indexedAt: prepared.lastError ? null : new Date(),
        chunks: { create: chunks.map((content, chunkIndex) => ({ chunkIndex, content, keywords: extractKeywords(content) })) }
      }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "KnowledgeDocument", doc.id, "Create AI knowledge document", { conferenceId, chunkCount: chunks.length, sourceType: prepared.sourceType, lastError: prepared.lastError });
    return ok(formatKnowledgeDocument({ ...doc, chunks: chunks.map((_, index) => ({ id: `${doc.id}-${index}` })) }));
  }

  async updateKnowledgeDocument(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const prepared = hasAny(body, ["contentText", "fileBase64", "sourceType"]) ? prepareKnowledgeDocumentContent(body) : undefined;
    const doc = await this.prisma.$transaction(async (tx) => {
      if (prepared) await tx.knowledgeChunk.deleteMany({ where: { documentId: id } });
      const chunks = prepared && !prepared.lastError ? chunkText(prepared.contentText) : [];
      return tx.knowledgeDocument.update({
        where: { id },
        data: {
          ...(typeof body.title !== "undefined" ? { title: readRequiredString(body, "title") } : {}),
          ...(prepared ? { sourceType: prepared.sourceType } : {}),
          ...(typeof body.status !== "undefined" ? { status: normalizeDocumentStatus(readRequiredString(body, "status")) } : {}),
          ...(prepared
            ? {
                contentText: prepared.contentText,
                chunkCount: chunks.length,
                indexedAt: prepared.lastError ? null : new Date(),
                lastError: prepared.lastError,
                ...(prepared.lastError ? { status: "DISABLED" } : {}),
                chunks: { create: chunks.map((content, chunkIndex) => ({ chunkIndex, content, keywords: extractKeywords(content) })) }
              }
            : {})
        }
      });
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "KnowledgeDocument", id, "Update AI knowledge document");
    return ok(formatDateFields(doc));
  }

  async deleteKnowledgeDocument(id: string, admin: CurrentAdmin) {
    const doc = await this.prisma.knowledgeDocument.delete({ where: { id } });
    await this.writeAudit(admin, AuditAction.DELETE, "KnowledgeDocument", id, "Delete AI knowledge document");
    return ok(formatDateFields(doc));
  }

  async reindexKnowledgeDocument(id: string, admin: CurrentAdmin) {
    const doc = await this.prisma.knowledgeDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException("Knowledge document not found");
    const chunks = chunkText(doc.contentText);
    await this.prisma.$transaction([
      this.prisma.knowledgeChunk.deleteMany({ where: { documentId: id } }),
      this.prisma.knowledgeDocument.update({ where: { id }, data: { status: "ACTIVE", chunkCount: chunks.length, indexedAt: new Date(), lastError: null, chunks: { create: chunks.map((content, chunkIndex) => ({ chunkIndex, content, keywords: extractKeywords(content) })) } } })
    ]);
    await this.writeAudit(admin, AuditAction.SYSTEM, "KnowledgeDocument", id, "Rebuild AI knowledge document chunks", { chunkCount: chunks.length });
    return ok({ id, chunkCount: chunks.length });
  }

  async listAiQuestionLogs(conferenceId: string, query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const keyword = readOptionalString(query.keyword);
    const fallback = typeof query.fallback === "undefined" || query.fallback === "" ? undefined : String(query.fallback) === "true";
    const where: Prisma.AiQuestionLogWhereInput = {
      conferenceId,
      ...(typeof fallback === "boolean" ? { fallback } : {}),
      ...(keyword ? { OR: [{ question: { contains: keyword, mode: "insensitive" } }, { answer: { contains: keyword, mode: "insensitive" } }, { userId: { contains: keyword, mode: "insensitive" } }] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.aiQuestionLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { matchedDocument: { select: { title: true } }, matchedChunk: { select: { chunkIndex: true } }, knowledgeBase: { select: { title: true } } } }),
      this.prisma.aiQuestionLog.count({ where })
    ]);
    return ok({ items: items.map(formatAiQuestionLog), total, page, pageSize });
  }

  async listAiSuggestions(conferenceId: string) {
    await this.ensureConference(conferenceId);
    const items = await this.prisma.aiSuggestion.findMany({ where: { conferenceId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return ok({ items: items.map(formatDateFields) });
  }

  async createAiSuggestions(conferenceId: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    await this.ensureConference(conferenceId);
    const questions = Array.isArray(body.questions) ? body.questions.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [readRequiredString(body, "question")];
    const startSort = readOptionalNonNegativeInt(body.sortOrder) ?? 0;
    const created = [];
    for (const [index, question] of questions.entries()) {
      created.push(
        await this.prisma.aiSuggestion.create({
          data: {
            conferenceId,
            question,
            sortOrder: startSort + index,
            enabled: readOptionalBoolean(body.enabled) ?? true
          }
        })
      );
    }
    await this.writeAudit(admin, AuditAction.CREATE, "AiSuggestion", null, "Create AI suggestions", { conferenceId, count: created.length });
    return ok({ items: created.map(formatDateFields) });
  }

  async updateAiSuggestion(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const item = await this.prisma.aiSuggestion.update({
      where: { id },
      data: {
        ...(typeof body.question !== "undefined" ? { question: readRequiredString(body, "question") } : {}),
        ...(typeof body.sortOrder !== "undefined" ? { sortOrder: readNonNegativeInt(body.sortOrder, "sortOrder") } : {}),
        ...(typeof body.enabled !== "undefined" ? { enabled: readBoolean(body.enabled, "enabled") } : {})
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "AiSuggestion", id, "Update AI suggestion", { conferenceId: item.conferenceId });
    return ok(formatDateFields(item));
  }

  async getAiConfig() {
    const config = await this.ensureAiConfig();
    return ok(formatAiConfig(config));
  }

  async updateAiConfig(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const updated = await this.prisma.aiConfig.upsert({
      where: { name: "default" },
      create: {
        name: "default",
        enabled: readOptionalBoolean(body.enabled) ?? false,
        provider: normalizeAiProvider(readOptionalString(body.provider) ?? "LOCAL_FALLBACK"),
        baseUrl: readNullableString(body.baseUrl),
        model: readOptionalString(body.model) ?? "local-keyword",
        apiKeyEnc: readSensitive(body.apiKey) ? encryptSecret(readSensitive(body.apiKey)) : null,
        temperature: readOptionalNonNegativeInt(body.temperature) ?? 0,
        maxOutputTokens: readOptionalNonNegativeInt(body.maxOutputTokens) ?? 800,
        fallbackEnabled: readOptionalBoolean(body.fallbackEnabled) ?? true,
        citationsEnabled: readOptionalBoolean(body.citationsEnabled) ?? true,
        questionLogEnabled: readOptionalBoolean(body.questionLogEnabled) ?? true
      },
      update: {
        ...(typeof body.enabled !== "undefined" ? { enabled: readBoolean(body.enabled, "enabled") } : {}),
        ...(typeof body.provider !== "undefined" ? { provider: normalizeAiProvider(readRequiredString(body, "provider")) } : {}),
        ...(typeof body.baseUrl !== "undefined" ? { baseUrl: readNullableString(body.baseUrl) } : {}),
        ...(typeof body.model !== "undefined" ? { model: readRequiredString(body, "model") } : {}),
        ...(readSensitive(body.apiKey) ? { apiKeyEnc: encryptSecret(readSensitive(body.apiKey)) } : {}),
        ...(typeof body.temperature !== "undefined" ? { temperature: readNonNegativeInt(body.temperature, "temperature") } : {}),
        ...(typeof body.maxOutputTokens !== "undefined" ? { maxOutputTokens: readNonNegativeInt(body.maxOutputTokens, "maxOutputTokens") } : {}),
        ...(typeof body.fallbackEnabled !== "undefined" ? { fallbackEnabled: readBoolean(body.fallbackEnabled, "fallbackEnabled") } : {}),
        ...(typeof body.citationsEnabled !== "undefined" ? { citationsEnabled: readBoolean(body.citationsEnabled, "citationsEnabled") } : {}),
        ...(typeof body.questionLogEnabled !== "undefined" ? { questionLogEnabled: readBoolean(body.questionLogEnabled, "questionLogEnabled") } : {})
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "AiConfig", updated.id, "Update AI config", { provider: updated.provider, keyConfigured: Boolean(process.env.AI_API_KEY || decryptSecret(updated.apiKeyEnc)) });
    return ok(formatAiConfig(updated));
  }

  async testAiConfig(input: unknown, admin: CurrentAdmin) {
    const body = isRecord(input) ? input : {};
    const current = await this.ensureAiConfig();
    const provider = normalizeAiProvider(readOptionalString(body.provider) ?? process.env.AI_PROVIDER ?? current.provider ?? "LOCAL_FALLBACK");
    const model = readOptionalString(body.model) ?? process.env.AI_MODEL ?? current.model ?? "local-keyword";
    const apiKey = readSensitive(body.apiKey) ?? process.env.AI_API_KEY ?? decryptSecret(current.apiKeyEnc);
    const baseUrl = normalizeBaseUrl(readNullableString(body.baseUrl) ?? process.env.AI_BASE_URL ?? current.baseUrl ?? defaultAiBaseUrl(provider));

    let result: Record<string, unknown>;
    if (provider === "LOCAL_FALLBACK") {
      result = {
        success: true,
        provider,
        model: "local-keyword",
        source: "LOCAL_FALLBACK",
        realLlm: false,
        message: "LOCAL_FALLBACK 为本地关键词检索，不调用外部 LLM。"
      };
    } else if (!baseUrl) {
      result = { success: false, provider, model, realLlm: true, reason: "Base URL 未配置" };
    } else if (!apiKey) {
      result = { success: false, provider, model, baseUrl, realLlm: true, reason: "API Key 未配置" };
    } else {
      result = await probeAiProvider(baseUrl, apiKey, provider, model);
    }
    await this.writeAudit(admin, AuditAction.SYSTEM, "AiConfig", current.id, "Test AI provider connection", {
      provider,
      model,
      success: Boolean(result.success),
      reason: typeof result.reason === "string" ? result.reason : null
    });
    return ok(result);
  }

  async listAutoReplyRules() {
    const items = await this.prisma.autoReplyRule.findMany({ orderBy: [{ priority: "desc" }, { createdAt: "desc" }] });
    return ok({ items: items.map(formatDateFields) });
  }

  async createAutoReplyRule(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const rule = await this.prisma.autoReplyRule.create({
      data: {
        knowledgeBaseId: readNullableString(body.knowledgeBaseId),
        keyword: readRequiredString(body, "keyword"),
        answer: readRequiredString(body, "answer"),
        enabled: readOptionalBoolean(body.enabled) ?? true,
        priority: readOptionalNonNegativeInt(body.priority) ?? 0
      }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "AutoReplyRule", rule.id, "Create auto reply rule");
    return ok(formatDateFields(rule));
  }

  async updateAutoReplyRule(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const rule = await this.prisma.autoReplyRule.update({
      where: { id },
      data: {
        ...(typeof body.keyword !== "undefined" ? { keyword: readRequiredString(body, "keyword") } : {}),
        ...(typeof body.answer !== "undefined" ? { answer: readRequiredString(body, "answer") } : {}),
        ...(typeof body.enabled !== "undefined" ? { enabled: readBoolean(body.enabled, "enabled") } : {}),
        ...(typeof body.priority !== "undefined" ? { priority: readNonNegativeInt(body.priority, "priority") } : {})
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "AutoReplyRule", id, "Update auto reply rule");
    return ok(formatDateFields(rule));
  }

  async createCouponCampaign(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const couponIds = readRequiredStringArray(body.couponIds, "couponIds");
    const claimCode = readOptionalString(body.claimCode) ?? generateCode("CP");
    const campaign = await this.prisma.couponCampaign.create({
      data: {
        conferenceId: readNullableString(body.conferenceId),
        name: readRequiredString(body, "name"),
        claimCode,
        qrScene: readOptionalString(body.qrScene) ?? `coupon:${claimCode}`,
        enabled: readOptionalBoolean(body.enabled) ?? true,
        totalLimit: readOptionalNonNegativeInt(body.totalLimit),
        startAt: readOptionalDate(body.startAt),
        endAt: readOptionalDate(body.endAt),
        coupons: { create: couponIds.map((couponId) => ({ couponId })) }
      },
      include: { coupons: { include: { coupon: true } } }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "CouponCampaign", campaign.id, "Create coupon campaign");
    return ok(formatCouponCampaign(campaign));
  }

  async listCouponCampaigns(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const keyword = readOptionalString(query.keyword);
    const where: Prisma.CouponCampaignWhereInput = keyword ? { name: { contains: keyword, mode: "insensitive" } } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.couponCampaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: { coupons: { include: { coupon: true } }, conference: { select: { title: true } } }
      }),
      this.prisma.couponCampaign.count({ where })
    ]);
    return ok({ items: items.map(formatCouponCampaignListItem), total, page, pageSize });
  }

  async getCouponCampaign(id: string) {
    const campaign = await this.prisma.couponCampaign.findUnique({ where: { id }, include: { coupons: { include: { coupon: true } } } });
    if (!campaign) throw new NotFoundException("Coupon campaign not found");
    return ok(formatCouponCampaign(campaign));
  }

  async updateCouponCampaign(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const campaign = await this.prisma.couponCampaign.update({
      where: { id },
      data: {
        ...(typeof body.name !== "undefined" ? { name: readRequiredString(body, "name") } : {}),
        ...(typeof body.enabled !== "undefined" ? { enabled: readBoolean(body.enabled, "enabled") } : {}),
        ...(typeof body.totalLimit !== "undefined" ? { totalLimit: readOptionalNonNegativeInt(body.totalLimit) } : {}),
        ...(typeof body.startAt !== "undefined" ? { startAt: readOptionalDate(body.startAt) } : {}),
        ...(typeof body.endAt !== "undefined" ? { endAt: readOptionalDate(body.endAt) } : {})
      },
      include: { coupons: { include: { coupon: true } } }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "CouponCampaign", id, "Update coupon campaign");
    return ok(formatCouponCampaign(campaign));
  }

  async generateCouponCampaignQr(id: string) {
    const campaign = await this.prisma.couponCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException("Coupon campaign not found");
    return ok({
      id,
      claimCode: campaign.claimCode,
      qrScene: campaign.qrScene,
      path: `/pages/coupon/claim?claimCode=${encodeURIComponent(campaign.claimCode)}`,
      qrPayload: `coupon:${campaign.claimCode}`
    });
  }

  async verifyCheckin(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const credentialCode = readRequiredString(body, "credentialCode");
    const registrationNo = credentialCode.startsWith("CONF_REG:") ? credentialCode.split(":")[2] : credentialCode;
    const registration = await this.prisma.registration.findUnique({ where: { registrationNo }, include: { attendees: true, conference: true } });
    if (!registration) throw new NotFoundException("Registration not found");
    if (!registration.conference.checkInEnabled) throw new ConflictException("当前会议无需现场核销");
    const attendee = registration.attendees.find((item) => item.checkInStatus === CheckInStatus.PENDING) ?? registration.attendees[0];
    if (!attendee) throw new NotFoundException("Registration attendee not found");
    return this.applyCheckin(attendee.id, CheckinActionType.VERIFY, admin, readOptionalString(body.remark));
  }

  async manualCheckin(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    return this.applyCheckin(readRequiredString(body, "attendeeId"), CheckinActionType.MANUAL, admin, readOptionalString(body.remark));
  }

  async revokeCheckin(id: string, admin: CurrentAdmin) {
    return this.applyCheckin(id, CheckinActionType.REVOKE, admin);
  }

  async listCheckinLogs(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.checkinLog.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { registration: { select: { registrationNo: true, attendeeName: true } }, attendee: { select: { name: true, phone: true } } } }),
      this.prisma.checkinLog.count()
    ]);
    return ok({ items: items.map(formatDateFields), total, page, pageSize });
  }

  async checkinStats(query: Record<string, unknown>) {
    const conferenceId = readOptionalString(query.conferenceId);
    const where = conferenceId ? { registration: { conferenceId } } : {};
    const [total, checkedIn, pending, notRequired] = await this.prisma.$transaction([
      this.prisma.registrationAttendee.count({ where }),
      this.prisma.registrationAttendee.count({ where: { ...where, checkInStatus: CheckInStatus.CHECKED_IN } }),
      this.prisma.registrationAttendee.count({ where: { ...where, checkInStatus: CheckInStatus.PENDING } }),
      this.prisma.registrationAttendee.count({ where: { ...where, checkInStatus: CheckInStatus.NOT_REQUIRED } })
    ]);
    return ok({ total, checkedIn, pending, notRequired });
  }

  async createRefund(input: unknown, admin: CurrentAdmin) {
    if (!isEnabled("REFUND_ENABLED")) return ok({ skippedReason: "REFUND_ENABLED=false" });
    const body = readObject(input);
    const order = await this.prisma.order.findUnique({ where: { orderNo: readRequiredString(body, "orderNo") } });
    if (!order || order.status !== OrderStatus.PAID) throw new ConflictException("Only paid registration orders can be refunded");
    const amountCent = readNonNegativeInt(body.amountCent, "amountCent");
    if (amountCent <= 0 || amountCent > (order.paidAmountCent ?? order.payableAmountCent)) throw new BadRequestException("退款金额不合法");
    const existing = await this.prisma.refund.findFirst({ where: { orderNo: order.orderNo, status: { in: [RefundStatus.REQUESTED, RefundStatus.APPROVED, RefundStatus.PROCESSING] } } });
    if (existing) {
      if (existing.amountCent !== amountCent) throw new ConflictException("该订单已有处理中退款申请");
      return ok(formatDateFields(existing));
    }
    const refund = await this.prisma.refund.create({ data: { refundNo: generateCode("RF"), orderNo: order.orderNo, orderId: order.id, userId: order.userId, amountCent, reason: readNullableString(body.reason), status: RefundStatus.REQUESTED } });
    await this.writeAudit(admin, AuditAction.CREATE, "Refund", refund.id, "Create refund request");
    return ok(formatDateFields(refund));
  }

  async listRefunds(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.refund.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      this.prisma.refund.count()
    ]);
    return ok({ items: items.map(formatDateFields), total, page, pageSize });
  }

  async approveRefund(id: string, admin: CurrentAdmin) {
    const current = await this.prisma.refund.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Refund not found");
    const idempotentStatuses: RefundStatus[] = [RefundStatus.APPROVED, RefundStatus.PROCESSING];
    if (idempotentStatuses.includes(current.status)) return ok(formatDateFields(current));
    if (current.status !== RefundStatus.REQUESTED) throw new ConflictException("当前退款状态不可批准");
    const refund = await this.prisma.refund.update({ where: { id }, data: { status: RefundStatus.APPROVED, approvedAt: new Date(), provider: PaymentProvider.WECHAT } });
    await this.writeAudit(admin, AuditAction.UPDATE, "Refund", id, "Approve refund");
    return ok(formatDateFields(refund));
  }

  async rejectRefund(id: string, input: unknown, admin: CurrentAdmin) {
    const current = await this.prisma.refund.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Refund not found");
    if (current.status === RefundStatus.REJECTED) return ok(formatDateFields(current));
    if (current.status !== RefundStatus.REQUESTED) throw new ConflictException("当前退款状态不可驳回");
    const refund = await this.prisma.refund.update({ where: { id }, data: { status: RefundStatus.REJECTED, rejectReason: readOptionalString(readObject(input).reason) } });
    await this.writeAudit(admin, AuditAction.UPDATE, "Refund", id, "Reject refund");
    return ok(formatDateFields(refund));
  }

  async queryRefund(id: string) {
    const refund = await this.prisma.refund.findUnique({ where: { id } });
    if (!refund) throw new NotFoundException("Refund not found");
    return ok(formatDateFields(refund));
  }

  async listInvoices(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoiceApplication.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      this.prisma.invoiceApplication.count()
    ]);
    return ok({ items: items.map(formatDateFields), total, page, pageSize });
  }

  async approveInvoice(id: string, admin: CurrentAdmin) {
    const item = await this.prisma.invoiceApplication.update({ where: { id }, data: { status: InvoiceStatus.APPROVED } });
    await this.writeAudit(admin, AuditAction.UPDATE, "InvoiceApplication", id, "Approve invoice");
    return ok(formatDateFields(item));
  }

  async rejectInvoice(id: string, input: unknown, admin: CurrentAdmin) {
    const item = await this.prisma.invoiceApplication.update({ where: { id }, data: { status: InvoiceStatus.REJECTED, rejectReason: readOptionalString(readObject(input).reason) } });
    await this.writeAudit(admin, AuditAction.UPDATE, "InvoiceApplication", id, "Reject invoice");
    return ok(formatDateFields(item));
  }

  async markInvoiceIssued(id: string, admin: CurrentAdmin) {
    const item = await this.prisma.invoiceApplication.update({ where: { id }, data: { status: InvoiceStatus.ISSUED, issuedAt: new Date() } });
    await this.writeAudit(admin, AuditAction.UPDATE, "InvoiceApplication", id, "Mark invoice issued");
    return ok(formatDateFields(item));
  }

  async createWechatBill(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const billDate = readRequiredDate(body.billDate, "billDate");
    const billType = readOptionalString(body.billType) ?? "TRADE";
    const bill = await this.prisma.wechatBill.upsert({
      where: { billDate_billType: { billDate, billType } },
      update: {},
      create: { billDate, billType, createdBy: admin.id, status: "CREATED" }
    });
    return ok(formatDateFields(bill));
  }

  async listWechatBills() {
    const items = await this.prisma.wechatBill.findMany({ orderBy: { createdAt: "desc" } });
    return ok({ items: items.map(formatDateFields) });
  }

  async importWechatBill(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const billDate = readRequiredDate(body.billDate, "billDate");
    const billType = readOptionalString(body.billType) ?? "TRADE";
    const storagePath = readOptionalString(body.storagePath) ?? `manual-import:${billType}:${billDate.toISOString().slice(0, 10)}`;
    const bill = await this.prisma.wechatBill.upsert({
      where: { billDate_billType: { billDate, billType } },
      update: { status: "DOWNLOADED", storagePath, summaryJson: { source: "manual-import" } },
      create: { billDate, billType, createdBy: admin.id, status: "DOWNLOADED", storagePath, summaryJson: { source: "manual-import" } }
    });
    await this.writeAudit(admin, AuditAction.SYSTEM, "WechatBill", bill.id, "Import WeChat bill metadata", { billType, storagePath });
    return ok(formatDateFields(bill));
  }

  async downloadWechatBill(id: string) {
    const bill = await this.prisma.wechatBill.update({ where: { id }, data: { status: "DOWNLOADED", storagePath: `${process.env.WECHAT_PAY_BILL_STORAGE_PATH || "storage/wechat-bills"}/${id}.csv` } });
    return ok(formatDateFields(bill));
  }

  async reconcileWechatBill(id: string, admin: CurrentAdmin) {
    const bill = await this.prisma.wechatBill.findUnique({ where: { id } });
    if (!bill) throw new NotFoundException("Wechat bill not found");
    const payments = await this.prisma.payment.findMany({ where: { status: "SUCCESS" }, include: { order: true }, take: 1000 });
    const resultData = payments
      .filter((payment) => payment.amountCent !== payment.order.payableAmountCent)
      .map((payment) => ({ billId: id, orderNo: payment.order.orderNo, outTradeNo: payment.outTradeNo, transactionId: payment.transactionId, localAmountCent: payment.order.payableAmountCent, remoteAmountCent: payment.amountCent, type: "AMOUNT_MISMATCH", detailJson: { source: "local-lightweight" } }));
    await this.prisma.reconciliationResult.createMany({ data: resultData });
    const updated = await this.prisma.wechatBill.update({ where: { id }, data: { status: "RECONCILED", summaryJson: { checkedPayments: payments.length, differenceCount: resultData.length } } });
    await this.writeAudit(admin, AuditAction.SYSTEM, "WechatBill", id, "Reconcile WeChat bill", { differenceCount: resultData.length });
    return ok(formatDateFields(updated));
  }

  async listReconciliationResults(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.reconciliationResult.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      this.prisma.reconciliationResult.count()
    ]);
    return ok({ items: items.map(formatDateFields), total, page, pageSize });
  }

  private async applyCheckin(attendeeId: string, action: CheckinActionType, admin: CurrentAdmin, remark?: string) {
    const attendee = await this.prisma.registrationAttendee.findUnique({ where: { id: attendeeId }, include: { registration: { include: { conference: true } } } });
    if (!attendee) throw new NotFoundException("Registration attendee not found");
    if (!attendee.registration.conference.checkInEnabled) throw new ConflictException("当前会议无需现场核销");
    const afterStatus = action === CheckinActionType.REVOKE ? CheckInStatus.PENDING : CheckInStatus.CHECKED_IN;
    if (action !== CheckinActionType.REVOKE && attendee.checkInStatus === CheckInStatus.CHECKED_IN) throw new ConflictException("参会人已核销，不能重复核销");
    if (action === CheckinActionType.REVOKE && attendee.checkInStatus !== CheckInStatus.CHECKED_IN) throw new ConflictException("仅已核销记录可撤销");
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.registrationAttendee.update({ where: { id: attendeeId }, data: { checkInStatus: afterStatus, checkedInAt: afterStatus === CheckInStatus.CHECKED_IN ? new Date() : null, checkedInBy: afterStatus === CheckInStatus.CHECKED_IN ? admin.id : null } });
      await tx.checkinLog.create({ data: { attendeeId, registrationId: attendee.registrationId, action, beforeStatus: attendee.checkInStatus, afterStatus, operatorId: admin.id, remark } });
      return next;
    });
    return ok(formatDateFields(updated));
  }

  private async ensureConference(id: string) {
    const conference = await this.prisma.conference.findUnique({ where: { id }, select: { id: true } });
    if (!conference) throw new NotFoundException("Conference not found");
  }

  private async ensureCustomerGroup(id: string) {
    const group = await this.prisma.customerGroup.findUnique({ where: { id }, select: { id: true } });
    if (!group) throw new NotFoundException("Customer group not found");
  }

  private async findOrCreateKnowledgeBaseId(conferenceId: string) {
    const existing = await this.prisma.knowledgeBase.findUnique({ where: { conferenceId }, select: { id: true } });
    if (existing) return existing.id;
    await this.ensureConference(conferenceId);
    const created = await this.prisma.knowledgeBase.create({ data: { conferenceId, title: "会议知识库", enabled: false, fallbackText: defaultAiFallbackText() }, select: { id: true } });
    return created.id;
  }

  private async ensureKnowledgeBase(conferenceId: string) {
    const id = await this.findOrCreateKnowledgeBaseId(conferenceId);
    return this.prisma.knowledgeBase.findUniqueOrThrow({ where: { id } });
  }

  private async ensureAiConfig() {
    return this.prisma.aiConfig.upsert({
      where: { name: "default" },
      update: {},
      create: { name: "default", enabled: isEnabled("AI_KB_ENABLED"), provider: process.env.AI_PROVIDER || "LOCAL_FALLBACK", model: process.env.AI_MODEL || "local-keyword" }
    });
  }

  private writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string | null, summary: string, metadataJson?: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({ data: { adminUserId: admin.id, action, entityType, entityId, summary, metadataJson } });
  }
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok" as const, data };
}

function formatDateFields(item: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...item };
  for (const key of Object.keys(output)) {
    const value = output[key];
    if (value instanceof Date) output[key] = value.toISOString();
  }
  return output;
}

type CouponCampaignWithCoupons = Prisma.CouponCampaignGetPayload<{ include: { coupons: { include: { coupon: true } } } }>;

function formatCouponCampaign(campaign: CouponCampaignWithCoupons) {
  return {
    ...formatDateFields(campaign),
    coupons: campaign.coupons.map((item) => ({ id: item.coupon.id, code: item.coupon.code, name: item.coupon.name }))
  };
}

function formatCouponCampaignListItem(campaign: CouponCampaignWithCoupons & { conference: { title: string } | null }) {
  return {
    ...formatCouponCampaign(campaign),
    conferenceTitle: campaign.conference?.title ?? null
  };
}

const knowledgeBaseInclude = {
  conference: { select: { title: true } },
  documents: { orderBy: { createdAt: "desc" }, take: 20, include: { chunks: { select: { id: true } } } },
  _count: { select: { documents: true, questionLogs: true } }
} satisfies Prisma.KnowledgeBaseInclude;

type KnowledgeBaseWithInclude = Prisma.KnowledgeBaseGetPayload<{ include: typeof knowledgeBaseInclude }>;

function formatKnowledgeBase(kb: KnowledgeBaseWithInclude) {
  const chunkCount = kb.documents.reduce((sum, doc) => sum + doc.chunkCount, 0);
  return {
    ...formatDateFields(kb),
    conferenceTitle: kb.conference.title,
    documentCount: kb._count.documents,
    chunkCount,
    questionCount: kb._count.questionLogs,
    documents: kb.documents.map(formatKnowledgeDocument)
  };
}

function formatKnowledgeBaseSummary(kb: Prisma.KnowledgeBaseGetPayload<Record<string, never>>) {
  return {
    id: kb.id,
    conferenceId: kb.conferenceId,
    title: kb.title,
    enabled: kb.enabled,
    scopeDescription: kb.scopeDescription,
    fallbackText: kb.fallbackText,
    citationsEnabled: kb.citationsEnabled,
    loggingEnabled: kb.loggingEnabled
  };
}

function formatKnowledgeDocument(doc: Record<string, unknown> & { chunks?: Array<{ id: string }> }) {
  const { chunks: _chunks, ...rest } = doc;
  return {
    ...formatDateFields(rest),
    chunkCount: typeof doc.chunkCount === "number" ? doc.chunkCount : _chunks?.length ?? 0
  };
}

function formatAiQuestionLog(log: Record<string, unknown> & { matchedDocument?: { title: string } | null; matchedChunk?: { chunkIndex: number } | null; knowledgeBase?: { title: string } | null }) {
  const { matchedDocument, matchedChunk, knowledgeBase, ...rest } = log;
  return {
    ...formatDateFields(rest),
    knowledgeBaseTitle: knowledgeBase?.title ?? null,
    matchedDocumentTitle: matchedDocument?.title ?? null,
    matchedChunkIndex: matchedChunk?.chunkIndex ?? null
  };
}

function formatAiConfig(config: Record<string, unknown>) {
  const dbApiKey = decryptSecret(typeof config.apiKeyEnc === "string" ? config.apiKeyEnc : null);
  const envApiKey = process.env.AI_API_KEY;
  const providerFromEnv = process.env.AI_PROVIDER || null;
  const providerFromDb = normalizeAiProvider(typeof config.provider === "string" ? config.provider : "LOCAL_FALLBACK");
  const source = providerFromEnv ? "ENV" : providerFromDb && providerFromDb !== "LOCAL_FALLBACK" ? "DB" : "LOCAL_FALLBACK";
  return {
    ...formatDateFields(config),
    provider: providerFromDb,
    env: {
      aiKbEnabled: isEnabled("AI_KB_ENABLED"),
      providerFromEnv,
      modelFromEnv: process.env.AI_MODEL || null,
      keyConfigured: Boolean(envApiKey)
    },
    source,
    baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : null,
    secret: {
      apiKey: { configured: Boolean(envApiKey || dbApiKey), masked: maskSecret(envApiKey || dbApiKey) }
    },
    keyPolicy: "AI provider key 可通过后台加密保存或服务器环境变量配置；接口只返回 configured/masked，不返回明文密钥。",
    runtimeNotice: source === "LOCAL_FALLBACK" ? "LOCAL_FALLBACK 为本地关键词检索，不是真实 LLM。" : `${source} 配置会作为 AI provider 运行时来源。`
  };
}

function normalizeAiProvider(value: string): string {
  const provider = value.trim().toUpperCase();
  if (provider === "OPENAI") return "OPENAI_COMPATIBLE";
  if (["LOCAL_FALLBACK", "DEEPSEEK", "OPENAI_COMPATIBLE", "CUSTOM"].includes(provider)) return provider;
  throw new BadRequestException("AI provider 只能选择 LOCAL_FALLBACK / DEEPSEEK / OPENAI_COMPATIBLE / CUSTOM");
}

function defaultAiBaseUrl(provider: string): string | null {
  return provider === "DEEPSEEK" ? "https://api.deepseek.com/v1" : null;
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

async function probeAiProvider(baseUrl: string, apiKey: string, provider: string, model: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        success: false,
        provider,
        model,
        baseUrl,
        realLlm: true,
        status: response.status,
        reason: `Provider 返回 ${response.status}${text ? `：${text.slice(0, 160)}` : ""}`
      };
    }
    return { success: true, provider, model, baseUrl, realLlm: true, message: "Provider /models 接口可访问，API Key 已通过最小连接检查。" };
  } catch (error) {
    return {
      success: false,
      provider,
      model,
      baseUrl,
      realLlm: true,
      reason: error instanceof Error ? error.message : "AI provider 连接失败"
    };
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeStatuses(statuses: string[]) {
  return statuses.reduce<Record<string, number>>((summary, status) => ({ ...summary, [status]: (summary[status] ?? 0) + 1 }), {});
}

function chunkText(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  for (let index = 0; index < normalized.length; index += 500) chunks.push(normalized.slice(index, index + 500));
  return chunks;
}

function extractKeywords(text: string): Prisma.InputJsonArray {
  return Array.from(new Set(text.split(/[\s,，。！？；;:：]+/).filter((word) => word.length >= 2).slice(0, 20)));
}

function normalizeDocumentStatus(value: string): string {
  const upper = value.trim().toUpperCase();
  if (["DRAFT", "ACTIVE", "DISABLED"].includes(upper)) return upper;
  if (upper === "INDEXED") return "ACTIVE";
  throw new BadRequestException("文档状态必须是 DRAFT / ACTIVE / DISABLED");
}

function normalizeDocumentSourceType(value: string | undefined): string {
  const upper = (value || "TEXT").trim().toUpperCase();
  if (["TEXT", "TXT"].includes(upper)) return "TEXT";
  if (["MD", "MARKDOWN"].includes(upper)) return "MD";
  if (upper === "PDF") return "PDF";
  throw new BadRequestException("文档来源只支持 TEXT / MD / PDF");
}

function prepareKnowledgeDocumentContent(body: Record<string, unknown>): { sourceType: string; contentText: string; lastError: string | null } {
  const sourceType = normalizeDocumentSourceType(readOptionalString(body.sourceType));
  if (sourceType !== "PDF") {
    return { sourceType, contentText: readRequiredString(body, "contentText"), lastError: null };
  }
  try {
    return { sourceType, contentText: parsePdfTextFromBase64(readRequiredString(body, "fileBase64")), lastError: null };
  } catch (error) {
    return { sourceType, contentText: "", lastError: error instanceof Error ? error.message : "PDF 解析失败" };
  }
}

function parsePdfTextFromBase64(input: string): string {
  const base64 = input.replace(/^data:application\/pdf;base64,/i, "").trim();
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0 || !buffer.subarray(0, 1024).toString("latin1").includes("%PDF")) throw new BadRequestException("文件格式不支持，请上传 PDF 文件");
  if (buffer.length > 10 * 1024 * 1024) throw new BadRequestException("PDF 文件过大，单个不超过 10MB");
  const latin = buffer.toString("latin1");
  const streamTexts: string[] = [];
  for (const match of latin.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    const raw = Buffer.from(match[1] ?? "", "latin1");
    try {
      streamTexts.push(inflateSync(raw).toString("latin1"));
    } catch {
      streamTexts.push(raw.toString("latin1"));
    }
  }
  const text = decodePdfText([latin, ...streamTexts].join("\n"));
  if (text.length < 2) throw new BadRequestException("PDF 未解析到可用文本，请确认文件不是扫描图片或加密 PDF");
  return text;
}

function decodePdfText(content: string): string {
  const parts: string[] = [];
  for (const match of content.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) parts.push(unescapePdfLiteral(match[0].replace(/\)\s*Tj$/, "").slice(1)));
  for (const match of content.matchAll(/\[(.*?)\]\s*TJ/g)) {
    for (const item of (match[1] ?? "").matchAll(/\((?:\\.|[^\\)])*\)/g)) parts.push(unescapePdfLiteral(item[0].slice(1, -1)));
  }
  for (const match of content.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)) {
    const hex = (match[1] ?? "").replace(/\s+/g, "");
    if (hex.length >= 4) {
      try {
        parts.push(Buffer.from(hex, "hex").toString(hex.startsWith("FEFF") || hex.startsWith("feff") ? "utf16le" : "utf8"));
      } catch {
        // Ignore invalid hex fragments and keep parsing other text operators.
      }
    }
  }
  return parts.join(" ").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
}

function unescapePdfLiteral(value: string): string {
  const unescaped = value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\b/g, "\b")
    .replace(/\\f/g, "\f")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)));
  return decodeLatin1Utf8(unescaped);
}

function decodeLatin1Utf8(value: string): string {
  const decoded = Buffer.from(value, "latin1").toString("utf8");
  return decoded.includes("�") ? value : decoded;
}

function defaultAiFallbackText() {
  return "当前会议资料中未找到相关信息，请联系会务人员确认。";
}

function maskEnvSecret(value: string | undefined): string {
  if (!value) return "";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function generateCode(prefix: string): string {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function isEnabled(name: string): boolean {
  return process.env[name] === "true";
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("请求体格式不正确");
  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${key} 不能为空`);
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readSensitive(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^\*+$/.test(trimmed)) return null;
  return trimmed;
}

function hasAny(body: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") throw new BadRequestException(`${key} 必须是布尔值`);
  return value;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNonNegativeInt(value: unknown, key: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 0) throw new BadRequestException(`${key} 必须是非负整数`);
  return parsed;
}

function readOptionalNonNegativeInt(value: unknown): number | undefined {
  return typeof value === "undefined" || value === null || value === "" ? undefined : readNonNegativeInt(value, "value");
}

function readJsonObject(value: unknown, key: string): Prisma.InputJsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException(`${key} 必须是 JSON 对象`);
  return value as Prisma.InputJsonObject;
}

function readOptionalJsonArray(value: unknown): Prisma.InputJsonArray | undefined {
  if (typeof value === "undefined" || value === null) return undefined;
  if (!Array.isArray(value)) throw new BadRequestException("字段必须是数组");
  return value as Prisma.InputJsonArray;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readRequiredStringArray(value: unknown, key: string): string[] {
  const items = readStringArray(value);
  if (items.length === 0) throw new BadRequestException(`${key} 不能为空`);
  return items;
}

function readOptionalDate(value: unknown): Date | undefined {
  if (typeof value === "undefined" || value === null || value === "") return undefined;
  return readRequiredDate(value, "date");
}

function readRequiredDate(value: unknown, key: string): Date {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${key} 日期格式不正确`);
  return date;
}

function readPage(query: Record<string, unknown>) {
  const page = Math.max(1, readOptionalNonNegativeInt(query.page) ?? 1);
  const pageSize = Math.min(100, Math.max(1, readOptionalNonNegativeInt(query.pageSize) ?? 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
