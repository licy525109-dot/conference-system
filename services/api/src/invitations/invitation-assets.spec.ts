import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateInvitationAsset,
  invitationAssetScope,
  InvitationAssetsService,
} from "./invitation-assets.service";
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
    /5MB/,
  );
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
    $transaction: async (values: unknown[]) => values,
  };
  const service = new InvitationAssetsService(prisma as never, {} as never);
  const result = await service.list(
    "campaign-a",
    { page: "-4", kind: "font", keyword: "字体" },
    admin,
  );
  assert.equal(result.data.page, 1);
  assert.equal(calls[0].take, 24);
  assert.deepEqual(
    calls[0].where.AND[0],
    invitationAssetScope("campaign-a", admin),
  );
  assert.deepEqual(calls[0].where, calls[1].where);
  assert.ok(
    calls[0].where.AND[1].fileType.in.every((mime: string) =>
      mime.startsWith("font/"),
    ),
  );
});
