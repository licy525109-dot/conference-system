import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateInvitationAsset,
  invitationAssetScope,
  InvitationAssetsService,
  validateInvitationFont,
} from "./invitation-assets.service";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const admin = {
  id: "staff-a",
  username: "staff",
  displayName: null,
  permissions: ["invitation:view", "invitation:content"],
};
test("invitation assets are restricted to owned or current campaign materials unless material:view is granted", () => {
  assert.deepEqual(invitationAssetScope("campaign-a", admin), {
    OR: [
      { createdBy: "staff-a" },
      { usage: "conference_invitation:campaign-a" },
    ],
  });
  assert.deepEqual(
    invitationAssetScope("campaign-a", {
      ...admin,
      permissions: ["material:view"],
    }),
    {},
  );
});
test("media uploads verify extension, signature and size before entering the material library", () => {
  for (const [name, content, mime] of [
    ["voice.mp3", "ID3test", "audio/mpeg"],
    ["font.woff2", "wOF2test", "font/woff2"],
    ["clip.mp4", "\0\0\0\u0010ftypisom", "video/mp4"],
  ] as const) {
    const buffer = Buffer.from(content);
    assert.equal(
      validateInvitationAsset({
        originalname: name,
        buffer,
        size: buffer.length,
        mimetype: "application/octet-stream",
      }).mimetype,
      mime,
    );
  }
  const buffer = Buffer.from("<script>alert(1)</script>");
  for (const originalname of [
    "evil.png",
    "evil.mp3",
    "evil.woff2",
    "evil.html",
    "evil.svg",
  ]) {
    assert.throws(
      () =>
        validateInvitationAsset({ originalname, buffer, size: buffer.length }),
      /格式/,
    );
  }
  assert.throws(
    () =>
      validateInvitationAsset({
        originalname: "font.woff2",
        buffer: Buffer.alloc(6 * 1024 * 1024),
        size: 6 * 1024 * 1024,
      }),
    /格式/,
  );
});
test("fonts above both legacy limits validate from disk while other asset limits remain enforced", async () => {
  const directory = await mkdtemp(join(tmpdir(), "invitation-font-test-"));
  try {
    for (const [extension, signature] of [
      ["woff2", "wOF2"], ["woff", "wOFF"], ["otf", "OTTO"], ["ttf", "\0\x01\0\0"],
    ]) {
      const path = join(directory, `font.${extension}`);
      const handle = await open(path, "w");
      const size = 25 * 1024 * 1024;
      await handle.write(signature);
      await handle.truncate(size);
      await handle.close();
      const file = { originalname: `font.${extension}`, path, size };
      assert.equal((await validateInvitationFont(file)).mimetype, `font/${extension}`);
      await assert.rejects(validateInvitationFont({ ...file, size: size - 1 }), /不完整/);
      await assert.rejects(validateInvitationFont({ ...file, originalname: "renamed.png" }), /格式/);
    }
    const path = join(directory, "invalid.ttf");
    const handle = await open(path, "w");
    await handle.write("<html>not a font</html>");
    await handle.close();
    await assert.rejects(validateInvitationFont({ path, originalname: "invalid.ttf", size: 23 }), /格式/);
    for (const [originalname, size, limit] of [
      ["photo.png", 3 * 1024 * 1024, "2MB"],
      ["clip.mp4", 21 * 1024 * 1024, "20MB"],
    ] as const) {
      assert.throws(() => validateInvitationAsset({ originalname, size, buffer: Buffer.alloc(size) }), new RegExp(limit));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("asset listing clamps pagination and combines search with scope rather than replacing access restrictions", async () => {
  const calls: any[] = [];
  const prisma = {
    materialAsset: {
      findMany: (args: unknown) => {
        calls.push(args);
        return [];
      },
      count: (args: unknown) => {
        calls.push(args);
        return 0;
      },
    },
    materialCategory: { findMany: (args: unknown) => { calls.push(args); return []; } },
    $transaction: async (values: unknown[]) => values,
  };
  const service = new InvitationAssetsService(prisma as never, {} as never);
  const result = await service.list(
    "campaign-a",
    { page: "-4", kind: "font", keyword: "字体", category: "fonts" },
    admin,
  );
  assert.equal(result.data.page, 1);
  assert.equal(calls[0].take, 24);
  assert.deepEqual(calls[0].where.category, { code: "fonts" });
  assert.deepEqual(calls[2].where.assets.some.OR, invitationAssetScope("campaign-a", admin).OR);
  assert.equal(calls[2].where.assets.some.enabled, true);
  assert.deepEqual(
    calls[0].where.OR,
    invitationAssetScope("campaign-a", admin).OR,
  );
  assert.deepEqual(calls[0].where, calls[1].where);
  assert.ok(
    calls[0].where.fileType.in.every((mime: string) =>
      mime.startsWith("font/"),
    ),
  );
});

test("multipart Chinese names round-trip while native names stay readable", async () => {
  const { decodeMaterialFilename } = await import("../admin/admin-materials.service");
  const name = "观潮会集-logo.png";
  assert.equal(decodeMaterialFilename(Buffer.from(name).toString("latin1")), name);
  for (const original of [name, "Logo.png", "Café.png"]) assert.equal(decodeMaterialFilename(original), original);
});
