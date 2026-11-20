import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Controller, NotFoundException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";

test("font multipart upload streams to disk, persists to materials and cleans up failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "font-upload-http-"));
  const previousRoot = process.env.UPLOADS_DIR;
  process.env.UPLOADS_DIR = directory;
  const { AdminMaterialsService } = await import("../admin/admin-materials.service");
  const { InvitationAssetsService } = await import("./invitation-assets.service");
  const { AdminInvitationsController } = await import("./invitations.controller");
  const records: any[] = [];
  let failPersistence = false;
  const prisma = {
    materialAsset: {
      create: async ({ data }: any) => {
        if (failPersistence) throw new Error("Synthetic persistence failure");
        const record = { ...data, id: "font", createdAt: new Date(), updatedAt: new Date() };
        records.push(record);
        return record;
      },
    },
    auditLog: { create: async () => ({}) },
  };
  const materials = new AdminMaterialsService(prisma as never);
  const assets = new InvitationAssetsService(prisma as never, materials);
  const campaignService = {
    campaign: async (id: string) => {
      if (id !== "owned") throw new NotFoundException();
    },
  };
  @Controller("admin/invitations")
  class FontUploadController extends AdminInvitationsController {
    constructor() { super(campaignService as never, materials, assets); }
  }
  const module = await Test.createTestingModule({ controllers: [FontUploadController] })
    .overrideGuard(AdminJwtAuthGuard)
    .useValue(new AdminJwtAuthGuard({
      getCurrentAdminFromToken: async (token: string) => ({
        id: "test-font-admin", username: "test-font-admin",
        conferenceScopeMode: "ALL",
        permissions: token === "editor" ? ["invitation:view", "invitation:content"] : ["invitation:view"],
      }),
    } as never))
    .overrideGuard(AdminPermissionGuard)
    .useValue(new AdminPermissionGuard(new Reflector()))
    .compile();
  const app = module.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  const origin = await app.getUrl();
  const pendingDirectory = join(tmpdir(), "conference-invitation-fonts");
  const pendingBefore = await readdir(pendingDirectory);
  async function upload(name: string, bytes: Buffer, token = "editor", campaign = "owned") {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), name);
    return fetch(`${origin}/admin/invitations/campaigns/${campaign}/assets/font`, {
      method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form,
    });
  }
  try {
    const font = Buffer.alloc(25 * 1024 * 1024);
    font.write("wOF2");
    assert.equal((await upload("font.woff2", font.subarray(0, 4), "")).status, 401);
    assert.equal((await upload("font.woff2", font.subarray(0, 4), "viewer")).status, 403);
    const response = await upload("large-font.woff2", font);
    assert.equal(response.status, 201, await response.clone().text());
    const { data } = await response.json();
    assert.equal(data.fileType, "font/woff2");
    assert.equal(data.sizeBytes, font.length);
    assert.equal(records[0].usage, "conference_invitation:owned");
    assert.equal(records[0].createdBy, "test-font-admin");
    const stored = await readFile(join(directory, new URL(data.url, origin).pathname.replace(/^\/uploads\//, "")));
    assert.deepEqual(stored, font);
    assert.equal((await upload("empty.ttf", Buffer.alloc(0))).status, 400);
    assert.equal((await upload("fake.ttf", Buffer.from("not-a-font"))).status, 400);
    assert.equal((await upload("image.png", font.subarray(0, 4))).status, 400);
    assert.equal((await upload("font.woff2", font.subarray(0, 4), "editor", "foreign")).status, 404);
    assert.equal(records.length, 1);
    const storedBefore = await readdir(join(directory, "materials"));
    failPersistence = true;
    assert.equal((await upload("font.woff2", font.subarray(0, 4))).status, 500);
    assert.deepEqual(await readdir(join(directory, "materials")), storedBefore);
    assert.deepEqual(await readdir(pendingDirectory), pendingBefore);
  } finally {
    await app.close();
    if (previousRoot === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = previousRoot;
    await rm(directory, { recursive: true, force: true });
  }
});
