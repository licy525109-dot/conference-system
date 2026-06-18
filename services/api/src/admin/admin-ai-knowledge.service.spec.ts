import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { ADMIN_PERMISSION_CODES } from "./admin-permissions";
import { AdminOperationsService } from "./admin-operations.service";
import { CurrentAdmin } from "./current-admin";

const currentAdmin: CurrentAdmin = {
  id: "admin-1",
  username: "admin",
  displayName: "管理员",
  permissions: ["*"]
};

describe("AdminOperationsService AI knowledge workflows", () => {
  it("creates, disables and rebuilds a knowledge document with audit logs", async () => {
    const { prisma, documents, chunks, auditLogs } = createAdminAiPrismaMock();
    const service = new AdminOperationsService(prisma);

    const created = await service.createKnowledgeDocument(
      "conference-a",
      { title: "会议资料", sourceType: "MD", status: "ACTIVE", contentText: "会议将在上海中心举行。\n上午九点开幕。" },
      currentAdmin
    );
    assert.equal(created.data.chunkCount, 1);
    assert.equal(documents[0]?.status, "ACTIVE");
    assert.equal(chunks.length, 1);

    const disabled = await service.updateKnowledgeDocument("doc-1", { status: "DISABLED" }, currentAdmin);
    assert.equal(disabled.data.status, "DISABLED");

    const rebuilt = await service.reindexKnowledgeDocument("doc-1", currentAdmin);
    assert.equal(rebuilt.data.chunkCount, 1);
    assert.equal(documents[0]?.status, "ACTIVE");
    assert.equal(auditLogs.some((item) => item.summary === "Create AI knowledge document"), true);
    assert.equal(auditLogs.some((item) => item.summary === "Update AI knowledge document"), true);
    assert.equal(auditLogs.some((item) => item.summary === "Rebuild AI knowledge document chunks"), true);
  });

  it("does not return the plaintext AI API key", async () => {
    const restore = withEnv({ AI_API_KEY: "sk-production-secret-value", AI_PROVIDER: "OPENAI", AI_MODEL: "gpt-prod" });
    const { prisma } = createAdminAiPrismaMock();
    const service = new AdminOperationsService(prisma);

    try {
      const response = await service.getAiConfig();
      const payload = JSON.stringify(response.data);

      assert.equal((response.data.secret as { apiKey: { configured: boolean } }).apiKey.configured, true);
      assert.match((response.data.secret as { apiKey: { masked: string } }).apiKey.masked, /^sk-p\*\*\*\*alue$/);
      assert.equal(payload.includes("sk-production-secret-value"), false);
      assert.equal((response.data.env as { providerFromEnv: string }).providerFromEnv, "OPENAI");
    } finally {
      restore();
    }
  });

  it("exposes AI knowledge permission codes for RBAC", () => {
    assert.equal(ADMIN_PERMISSION_CODES.includes("ai-kb:view"), true);
    assert.equal(ADMIN_PERMISSION_CODES.includes("ai-kb:write"), true);
    assert.equal(ADMIN_PERMISSION_CODES.includes("knowledge:view"), true);
    assert.equal(ADMIN_PERMISSION_CODES.includes("knowledge:write"), true);
  });
});

function createAdminAiPrismaMock() {
  const now = new Date("2026-06-18T00:00:00.000Z");
  const knowledgeBase: KnowledgeBaseRecord = {
    id: "kb-a",
    conferenceId: "conference-a",
    title: "会议知识库",
    enabled: true,
    scopeDescription: null,
    fallbackText: "当前会议资料中未找到相关信息，请联系会务人员确认。",
    citationsEnabled: true,
    loggingEnabled: true,
    createdAt: now,
    updatedAt: now
  };
  const documents: KnowledgeDocumentRecord[] = [];
  const chunks: KnowledgeChunkRecord[] = [];
  const auditLogs: AuditRecord[] = [];
  const config = {
    id: "ai-config-1",
    name: "default",
    enabled: true,
    provider: "LOCAL_FALLBACK",
    model: "local-keyword",
    temperature: 0,
    maxOutputTokens: 800,
    fallbackEnabled: true,
    citationsEnabled: true,
    questionLogEnabled: true,
    settingsJson: null,
    createdAt: now,
    updatedAt: now
  };

  const mock: any = {
    documents,
    chunks,
    auditLogs,
    conference: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === "conference-a" ? { id: "conference-a" } : null)
    },
    knowledgeBase: {
      findUnique: async ({ where, select }: { where: { conferenceId?: string; id?: string }; select?: { id: boolean } }) => {
        if (where.conferenceId === knowledgeBase.conferenceId) return select?.id ? { id: knowledgeBase.id } : knowledgeBase;
        if (where.id === knowledgeBase.id) return knowledgeBase;
        return null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        if (where.id !== knowledgeBase.id) throw new Error("knowledge base not found");
        return knowledgeBase;
      },
      create: async () => knowledgeBase,
      update: async ({ data }: { data: Partial<KnowledgeBaseRecord> }) => {
        Object.assign(knowledgeBase, data, { updatedAt: now });
        return { ...knowledgeBase, conference: { title: "大会" }, documents: [], _count: { documents: documents.length, questionLogs: 0 } };
      }
    },
    knowledgeDocument: {
      create: async ({ data }: { data: KnowledgeDocumentCreateInput }) => {
        const doc: KnowledgeDocumentRecord = {
          id: `doc-${documents.length + 1}`,
          knowledgeBaseId: data.knowledgeBaseId,
          title: data.title,
          sourceType: data.sourceType,
          contentText: data.contentText,
          status: data.status,
          chunkCount: data.chunkCount,
          lastError: null,
          indexedAt: data.indexedAt,
          createdAt: now,
          updatedAt: now
        };
        documents.push(doc);
        for (const [index, chunk] of data.chunks.create.entries()) {
          chunks.push({ id: `chunk-${index + 1}`, documentId: doc.id, chunkIndex: chunk.chunkIndex, content: chunk.content, keywords: chunk.keywords });
        }
        return doc;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<KnowledgeDocumentRecord> & { chunks?: { create: KnowledgeChunkCreateInput[] } } }) => {
        const doc = documents.find((item) => item.id === where.id);
        if (!doc) throw new Error("document not found");
        const { chunks: nestedChunks, ...rest } = data;
        Object.assign(doc, rest, { updatedAt: now });
        if (nestedChunks) {
          for (const [index, chunk] of nestedChunks.create.entries()) {
            chunks.push({ id: `chunk-${chunks.length + index + 1}`, documentId: doc.id, chunkIndex: chunk.chunkIndex, content: chunk.content, keywords: chunk.keywords });
          }
        }
        return { ...doc };
      },
      findUnique: async ({ where }: { where: { id: string } }) => documents.find((item) => item.id === where.id) ?? null
    },
    knowledgeChunk: {
      deleteMany: async ({ where }: { where: { documentId: string } }) => {
        for (let index = chunks.length - 1; index >= 0; index -= 1) {
          if (chunks[index]?.documentId === where.documentId) chunks.splice(index, 1);
        }
        return { count: 1 };
      }
    },
    aiConfig: {
      upsert: async () => config
    },
    auditLog: {
      create: async ({ data }: { data: AuditRecord }) => {
        auditLogs.push(data);
        return data;
      }
    },
    $transaction: async <T>(operation: ((tx: typeof mock) => Promise<T>) | Promise<T>[]) =>
      Array.isArray(operation) ? Promise.all(operation) : operation(mock)
  };

  return { prisma: mock as unknown as PrismaService, documents, chunks, auditLogs };
}

function withEnv(values: Record<string, string | undefined>) {
  const original = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "undefined") delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(original)) {
      if (typeof value === "undefined") delete process.env[key];
      else process.env[key] = value;
    }
  };
}

interface KnowledgeBaseRecord {
  id: string;
  conferenceId: string;
  title: string;
  enabled: boolean;
  scopeDescription: string | null;
  fallbackText: string | null;
  citationsEnabled: boolean;
  loggingEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface KnowledgeDocumentRecord {
  id: string;
  knowledgeBaseId: string;
  title: string;
  sourceType: string;
  contentText: string;
  status: string;
  chunkCount: number;
  lastError: string | null;
  indexedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface KnowledgeDocumentCreateInput {
  knowledgeBaseId: string;
  title: string;
  sourceType: string;
  contentText: string;
  status: string;
  chunkCount: number;
  indexedAt: Date;
  chunks: { create: KnowledgeChunkCreateInput[] };
}

interface KnowledgeChunkRecord {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  keywords: unknown;
}

interface KnowledgeChunkCreateInput {
  chunkIndex: number;
  content: string;
  keywords: unknown;
}

interface AuditRecord {
  adminUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadataJson?: unknown;
}
