import { PrismaClient } from "@prisma/client";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import shared from "../packages/shared/dist/index.js";

const databaseUrl = process.env.INVITATION_TEST_DATABASE_URL;
const origin =
  process.env.INVITATION_TEST_API_ORIGIN || "http://localhost:3001";
if (
  !databaseUrl ||
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(origin).hostname)
)
  throw new Error("Only an isolated local preview is supported");
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
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
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
    where: { slug: "invitation-studio-local-demo" },
    update: {},
    create: {
      slug: "invitation-studio-local-demo",
      title: "交互模块 · 功能预览",
      status: "PUBLISHED",
      startsAt: new Date("2026-09-01T01:00:00Z"),
      endsAt: new Date("2026-09-01T10:00:00Z"),
      location: "本地功能演示",
    },
  });
  const existing = await db.invitationCampaign.findUnique({
    where: { conferenceId: conference.id },
  });
  const campaign =
    existing ||
    (await call("/admin/invitations/campaigns", "POST", {
      conferenceId: conference.id,
    }));
  let detail = await call(`/admin/invitations/campaigns/${campaign.id}`);
  // The preview is seeded once; future operator edits and published links are retained.
  if (!detail.publishedRevision) {
    const source = await db.invitationCampaign.findFirst({
      where: { conference: { slug: "invitation-artwork-local-demo" } },
    });
    const poster =
      source?.publishedJson?.coverImageUrl || "/invitation-art/tide-paper.jpg";
    const content = shared.applyInvitationPreset(
      shared.createInvitationContent(),
      "jade",
    );
    Object.assign(content, {
      title: "观潮会集",
      subtitle: "交互模块 · 本地功能预览",
      dateLabel: "",
      location: "",
      host: "观潮会集",
      introduction:
        "以下内容仅用于验证邀请函的排版与交互，不代表正式会议信息。",
      shareTitle: "{姓名}的交互预览",
      agenda: [
        {
          id: "demo-session",
          date: "演示日程",
          time: "09:00",
          title: "议程与嘉宾信息展示",
          speaker: "演示嘉宾",
          location: "示例会场",
          imageUrl: "",
        },
      ],
      guests: [
        {
          id: "demo-guest",
          name: "嘉宾介绍示例",
          organization: "示例机构",
          role: "",
          imageUrl: "",
          status: "INVITED",
          biography:
            "这里是一段可分段编辑的嘉宾介绍。\n\n可以填写经历、研究方向、代表项目与本次分享内容，不再只限于公司和职位。此处为功能测试文案。",
        },
      ],
      invitees: Array.from({ length: 28 }, (_, i) => ({
        id: `demo-person-${i + 1}`,
        name: `演示嘉宾${i + 1}`,
        organization: "功能测试机构",
        role: "测试资料",
      })),
      inviteeSort: { key: "name", direction: "desc" },
    });
    const gallery = shared.createInvitationModule("carousel", "gallery");
    gallery.title = "视觉素材";
    gallery.settings.effect = "coverflow";
    gallery.settings.ratio = "3/4";
    gallery.items = [
      poster,
      "/invitation-art/jade-paper.jpg",
      "/invitation-art/tide-paper.jpg",
    ].map((imageUrl, i) => ({
      id: `gallery-${i}`,
      imageUrl,
      title: ["原始海报", "青玉视觉", "潮汐视觉"][i],
      description: "",
      href: "",
      icon: "link",
      body: [],
    }));
    const tabs = shared.createInvitationModule("tabs", "details");
    tabs.title = "相聚之前";
    tabs.items = ["参会说明", "交通信息"].map((title, i) => ({
      id: `tab-${i}`,
      title,
      imageUrl: "",
      description: "",
      href: "",
      icon: "link",
      body: [
        {
          tag: "p",
          attrs: {},
          children: [
            {
              text:
                i === 0
                  ? "此处可以编辑完整的图文说明。以下仅为本地演示资料。"
                  : "此处可以填写真实会场的交通方式、停车信息与注意事项。",
            },
          ],
        },
      ],
    }));
    const links = shared.createInvitationModule("links", "contacts");
    links.title = "保持联系";
    links.items = [
      {
        id: "brand",
        title: "观潮会集",
        description: "品牌官网",
        imageUrl: "",
        href: "https://guanchaohuiji.com",
        icon: "link",
        body: [],
      },
    ];
    const map = shared.createInvitationModule("map", "map");
    map.title = "地图示例 · 非会场定位";
    map.settings.address = "北京市";
    map.settings.latitude = 39.9;
    map.settings.longitude = 116.4;
    content.modules = [
      content.modules[0],
      shared.createInvitationModule("search", "search"),
      content.modules[2],
      content.modules[3],
      gallery,
      tabs,
      content.modules[4],
      map,
      links,
    ];
    detail = await call(
      `/admin/invitations/campaigns/${campaign.id}`,
      "PATCH",
      { content, draftRevision: detail.draftRevision },
    );
    await call(`/admin/invitations/campaigns/${campaign.id}/publish`, "POST", {
      draftRevision: detail.draftRevision,
    });
  }
  const recipients = await call(
    `/admin/invitations/campaigns/${campaign.id}/recipients`,
  );
  const invitation =
    recipients.items.find((item) => item.name === "演示嘉宾1") ||
    (await call(
      `/admin/invitations/campaigns/${campaign.id}/recipients`,
      "POST",
      {
        name: "演示嘉宾1",
        salutation: "老师",
        publicInviteeId: "demo-person-1",
      },
    ));
  const result = { campaignId: campaign.id, url: invitation.shareUrl };
  await mkdir("output/invitations", { recursive: true });
  await writeFile(
    "output/invitations/studio-preview.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await db.$disconnect();
}
