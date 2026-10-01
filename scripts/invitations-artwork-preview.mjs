import { PrismaClient } from "@prisma/client";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import shared from "../packages/shared/dist/index.js";

const databaseUrl = process.env.INVITATION_TEST_DATABASE_URL;
const origin =
  process.env.INVITATION_TEST_API_ORIGIN || "http://localhost:3001";
const imagePath = process.env.INVITATION_ARTWORK_PATH;
if (
  !databaseUrl ||
  !imagePath ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(origin).hostname) ||
  process.env.NODE_ENV === "production"
)
  throw new Error(
    "Use an isolated local database and provide INVITATION_ARTWORK_PATH",
  );
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
try {
  const credentials = JSON.parse(
    await readFile(".tmp/invitation-preview-access.json", "utf8"),
  );
  let token;
  async function call(path, method = "GET", body) {
    const response = await fetch(origin + "/api" + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(body
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(`${response.status}: ${json.message}`);
    return json.data;
  }
  token = (
    await call("/admin/auth/login", "POST", {
      username: credentials.username,
      password: credentials.password,
    })
  ).token;
  const conference = await db.conference.upsert({
    where: { slug: "invitation-artwork-local-demo" },
    update: {},
    create: {
      slug: "invitation-artwork-local-demo",
      title: "成品海报 · 邀请函编辑演示",
      status: "PUBLISHED",
      startsAt: new Date("2026-07-24T01:00:00Z"),
      endsAt: new Date("2026-07-25T10:00:00Z"),
      location: "北京",
    },
  });
  let campaign = await db.invitationCampaign.findUnique({
    where: { conferenceId: conference.id },
  });
  if (!campaign)
    campaign = await call("/admin/invitations/campaigns", "POST", {
      conferenceId: conference.id,
    });
  let detail = await call(`/admin/invitations/campaigns/${campaign.id}`);
  // Never overwrite an existing staff-edited demonstration.
  if (!detail.publishedRevision) {
    const data = new FormData();
    data.append(
      "file",
      new Blob([await readFile(imagePath)], { type: "image/png" }),
      "invitation-cover.png",
    );
    const upload = await call(
      `/admin/invitations/campaigns/${campaign.id}/image`,
      "POST",
      data,
    );
    const content = shared.createInvitationContent();
    Object.assign(content, {
      title: "观潮·学前教育行业决策人闭门会【北京站】",
      dateLabel: "",
      location: "",
      introduction: "",
      coverImageUrl: upload.url,
      primaryColor: "#765925",
      accentColor: "#923f49",
      backgroundColor: "#f8f9f7",
      cover: {
        mode: "artwork",
        width: 1080,
        height: 1920,
        layers: [
          {
            ...shared.createInvitationLayer("recipient"),
            text: "{姓名}",
            color: "#765925",
            y: 42.2,
          },
        ],
      },
      effects: {
        entrance: "rise",
        cover: "fade",
        scroll: "continuous",
        duration: 650,
      },
      modules: [
        {
          id: "welcome",
          type: "richtext",
          title: "诚挚相邀",
          enabled: true,
          imageUrl: "",
          body: [
            {
              tag: "p",
              attrs: {},
              children: [{ text: "期待与您相聚，共话行业新方向。" }],
            },
            {
              tag: "p",
              attrs: {},
              children: [
                {
                  tag: "strong",
                  attrs: {},
                  children: [
                    { text: "让交流回到真实的问题，让相聚带来新的启发。" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    detail = await call(
      `/admin/invitations/campaigns/${campaign.id}`,
      "PATCH",
      { content, draftRevision: detail.draftRevision },
    );
    detail = await call(
      `/admin/invitations/campaigns/${campaign.id}/publish`,
      "POST",
      { draftRevision: detail.draftRevision },
    );
  }
  const existing = await call(
    `/admin/invitations/campaigns/${campaign.id}/recipients?page=1&pageSize=20`,
  );
  const links = [];
  for (const name of ["演示嘉宾甲", "演示嘉宾乙"]) {
    const found = existing.items.find((item) => item.name === name);
    const recipient =
      found ||
      (await call(
        `/admin/invitations/campaigns/${campaign.id}/recipients`,
        "POST",
        { name, salutation: "老师" },
      ));
    links.push({ name, url: recipient.shareUrl });
  }
  await mkdir("output/invitations", { recursive: true });
  await writeFile(
    "output/invitations/artwork-preview.json",
    JSON.stringify({ campaignId: campaign.id, links }, null, 2),
  );
  console.log(JSON.stringify({ campaignId: campaign.id, links }));
} finally {
  await db.$disconnect();
}
