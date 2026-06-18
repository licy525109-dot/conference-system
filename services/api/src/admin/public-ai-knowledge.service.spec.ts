import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { PublicOperationsService } from "./public-operations.service";

const currentUser: CurrentUser = { id: "user-1", openid: "openid-1", nickname: "用户" };

describe("PublicOperationsService AI knowledge base", () => {
  it("returns a clear degradation when external provider key is missing", async () => {
    const restore = withEnv({ AI_PROVIDER: undefined, AI_API_KEY: undefined, AI_KB_ENABLED: undefined });
    const { prisma, logs } = createAiPrismaMock({ config: aiConfig({ enabled: true, provider: "OPENAI", model: "gpt-test" }) });
    const service = new PublicOperationsService(prisma);

    try {
      const response = await service.askAi("conference-a", { question: "会议地点在哪里？" }, currentUser);

      assert.equal(response.data.status, "PROVIDER_NOT_CONFIGURED");
      assert.equal(response.data.provider, "OPENAI");
      assert.equal(response.data.hit, false);
      assert.equal(logs[0]?.errorReason, "PROVIDER_KEY_MISSING");
    } finally {
      restore();
    }
  });

  it("answers from the current conference document and writes an audit log", async () => {
    const restore = withEnv({ AI_PROVIDER: undefined, AI_API_KEY: undefined, AI_KB_ENABLED: undefined });
    const { prisma, logs } = createAiPrismaMock();
    const service = new PublicOperationsService(prisma);

    try {
      const response = await service.askAi("conference-a", { question: "开幕地点在哪里？" }, currentUser);

      assert.equal(response.data.status, "ANSWERED");
      assert.equal(response.data.provider, "LOCAL_FALLBACK");
      assert.match(response.data.answer, /上海中心/);
      assert.equal(response.data.sources.length, 1);
      assert.equal(response.data.sources[0]?.documentTitle, "会议议程");
      assert.equal(logs[0]?.knowledgeBaseId, "kb-a");
      assert.equal(logs[0]?.hit, true);
      assert.equal(logs[0]?.fallback, false);
    } finally {
      restore();
    }
  });

  it("does not answer conference A with conference B documents", async () => {
    const { prisma, logs } = createAiPrismaMock();
    const service = new PublicOperationsService(prisma);

    const response = await service.askAi("conference-a", { question: "深圳湾晚宴在哪里？" }, currentUser);

    assert.equal(response.data.status, "FALLBACK");
    assert.equal(response.data.sources.length, 0);
    assert.doesNotMatch(response.data.answer, /深圳湾/);
    assert.equal(logs[0]?.errorReason, "NO_MATCHED_CHUNK");
  });

  it("returns the configured fallback when no chunk matches", async () => {
    const { prisma } = createAiPrismaMock();
    const service = new PublicOperationsService(prisma);

    const response = await service.askAi("conference-a", { question: "停车券怎么领取？" }, currentUser);

    assert.equal(response.data.status, "FALLBACK");
    assert.equal(response.data.answer, "当前会议资料中未找到相关信息，请联系会务人员确认。");
  });

  it("lists suggestions only for the requested conference", async () => {
    const { prisma } = createAiPrismaMock();
    const service = new PublicOperationsService(prisma);

    const response = await service.aiSuggestions("conference-a");

    assert.deepEqual(response.data.items, ["会议什么时候开始？"]);
  });
});

function createAiPrismaMock(options: { config?: AiConfigRecord } = {}) {
  const logs: AiLogRecord[] = [];
  const config = options.config ?? aiConfig({ enabled: true });
  const knowledgeBases: Record<string, KnowledgeBaseRecord> = {
    "conference-a": knowledgeBaseRecord({
      id: "kb-a",
      conferenceId: "conference-a",
      fallbackText: "当前会议资料中未找到相关信息，请联系会务人员确认。",
      documents: [
        {
          id: "doc-a",
          title: "会议议程",
          status: "ACTIVE",
          chunks: [{ id: "chunk-a", chunkIndex: 0, content: "会议将在上海中心举行，上午九点开幕。" }]
        }
      ]
    }),
    "conference-b": knowledgeBaseRecord({
      id: "kb-b",
      conferenceId: "conference-b",
      documents: [
        {
          id: "doc-b",
          title: "晚宴安排",
          status: "ACTIVE",
          chunks: [{ id: "chunk-b", chunkIndex: 0, content: "深圳湾晚宴晚上七点开始。" }]
        }
      ]
    })
  };
  const suggestions = [
    { id: "suggestion-a", conferenceId: "conference-a", question: "会议什么时候开始？", enabled: true, sortOrder: 0, createdAt: new Date("2026-06-18T00:00:00.000Z") },
    { id: "suggestion-b", conferenceId: "conference-b", question: "晚宴在哪里？", enabled: true, sortOrder: 0, createdAt: new Date("2026-06-18T00:00:00.000Z") }
  ];
  const mock = {
    aiConfig: {
      upsert: async () => config
    },
    knowledgeBase: {
      findUnique: async ({ where }: { where: { conferenceId: string } }) => knowledgeBases[where.conferenceId] ?? null
    },
    aiQuestionLog: {
      create: async ({ data }: { data: Omit<AiLogRecord, "id" | "createdAt"> }) => {
        const log = { id: `log-${logs.length + 1}`, createdAt: new Date("2026-06-18T00:00:00.000Z"), ...data };
        logs.push(log);
        return log;
      }
    },
    aiSuggestion: {
      findMany: async ({ where }: { where: { conferenceId: string; enabled: boolean } }) =>
        suggestions.filter((item) => item.conferenceId === where.conferenceId && item.enabled === where.enabled)
    }
  };
  return { prisma: mock as unknown as PrismaService, logs };
}

function aiConfig(overrides: Partial<AiConfigRecord> = {}): AiConfigRecord {
  return {
    id: "ai-config-1",
    name: "default",
    enabled: false,
    provider: "LOCAL_FALLBACK",
    model: "local-keyword",
    temperature: 0,
    maxOutputTokens: 800,
    fallbackEnabled: true,
    citationsEnabled: true,
    questionLogEnabled: true,
    settingsJson: null,
    createdAt: new Date("2026-06-18T00:00:00.000Z"),
    updatedAt: new Date("2026-06-18T00:00:00.000Z"),
    ...overrides
  };
}

function knowledgeBaseRecord(overrides: Partial<KnowledgeBaseRecord> = {}): KnowledgeBaseRecord {
  return {
    id: "kb-1",
    conferenceId: "conference-a",
    title: "会议知识库",
    enabled: true,
    fallbackText: "当前会议资料中未找到相关信息，请联系会务人员确认。",
    citationsEnabled: true,
    loggingEnabled: true,
    documents: [],
    autoRules: [],
    ...overrides
  };
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

interface AiConfigRecord {
  id: string;
  name: string;
  enabled: boolean;
  provider: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  fallbackEnabled: boolean;
  citationsEnabled: boolean;
  questionLogEnabled: boolean;
  settingsJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface KnowledgeBaseRecord {
  id: string;
  conferenceId: string;
  title: string;
  enabled: boolean;
  fallbackText: string;
  citationsEnabled: boolean;
  loggingEnabled: boolean;
  documents: Array<{
    id: string;
    title: string;
    status: string;
    chunks: Array<{ id: string; chunkIndex: number; content: string }>;
  }>;
  autoRules: Array<{ enabled: boolean; keyword: string; answer: string; priority: number }>;
}

interface AiLogRecord {
  id: string;
  conferenceId: string;
  userId?: string;
  question: string;
  answer: string;
  knowledgeBaseId?: string;
  matchedDocumentId?: string;
  matchedChunkId?: string;
  matchedJson?: unknown;
  referencesJson?: unknown;
  hit: boolean;
  fallback: boolean;
  provider: string;
  model: string;
  errorReason?: string;
  createdAt: Date;
}
