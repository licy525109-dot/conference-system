import { applyInvitationPreset, type InvitationContent } from "./invitations";
import {
  createInvitationModule,
  normalizeInvitationNavigation,
  normalizeInvitationPageDesign,
  type InvitationModule,
  type InvitationModuleType,
  type InvitationRichNode,
} from "./invitation-design";

const paragraph = (text: string): InvitationRichNode[] => [
  { tag: "p", attrs: {}, children: [{ text }] },
];
const topics = [
  [
    "AI实操应用与组织提效",
    "你和团队已经真正用AI解决了哪些经营、内容、流程和效率问题？下一步最值得改造的工作流是什么？",
  ],
  [
    "少儿舞剧 / 创新产品",
    "机构如何判断一个创新产品值得做？从课程、IP到演出交付，怎样避免重投入、低复购？",
  ],
  [
    "招新获客 · 小年龄段基本盘修复与增长",
    "启蒙产品、生源池、家长需求、续费和转介绍怎样重新设计？",
  ],
  ["组织变革", "机制、利益、岗位和核心高管协作，应该先改哪一件？"],
  [
    "第二曲线",
    "成人、银发、新空间、新客群、新服务，什么才是真正值得投入的第二曲线？",
  ],
  [
    "区域机构整合",
    "针对计划退出市场的机构，如何协商未结转收入、生源接收与各方落地机制？",
  ],
  [
    "未来教育如何落到课程产品",
    "AI、项目式学习、跨艺术融合和新学习方式，怎样真正变成可卖、可教、可复制的课程？",
  ],
  [
    "会 · 赛 · 展 · 研资源协同与区域合作",
    "机构、区域平台、赛事/IP、研学与展演资源怎样合作，才能有清晰权益、交付和长期收益？",
  ],
];

// Applying a template arranges a draft; it never replaces authored facts or publishes it.
export function applyInvitationBooklet(
  content: InvitationContent,
): InvitationContent {
  if (content.visualPreset === "booklet") return content;
  const used = new Set<string>();
  const singleton = (type: InvitationModuleType, title: string) => {
    const existing = content.modules.find((module) => module.type === type);
    const module = existing || extra(type, type, title);
    used.add(module.id);
    return {
      ...module,
      title:
        existing && existing.title !== createInvitationModule(type, "").title
          ? existing.title
          : title,
    };
  };
  const extra = (type: InvitationModuleType, key: string, title: string) => {
    let id = `booklet-${key}`;
    let index = 0;
    while (
      content.modules.some((module) => module.id === id && module.type !== type)
    )
      id = `booklet-${key}-${++index}`;
    const existing = content.modules.find((module) => module.id === id);
    used.add(id);
    return existing || { ...createInvitationModule(type, id), title };
  };
  const keywords = extra("richtext", "keywords", "会议关键词");
  const organizations = extra("organizations", "organizations", "组织架构");
  const discussion = extra("tabs", "discussion", "小组讨论话题");
  const participation = extra("richtext", "participation", "参会方式");
  const modules: InvitationModule[] = [
    singleton("letter", "会议背景"),
    content.modules.includes(keywords)
      ? keywords
      : {
          ...keywords,
          body: paragraph("新舞蹈 | 新教育 | 新筑基 | 新组织 | 新增长"),
          style: { ...keywords.style!, align: "center" },
        },
    singleton("highlights", "会议亮点"),
    singleton("venue", "时间地点"),
    content.modules.includes(organizations)
      ? organizations
      : {
          ...organizations,
          items: [
            ...[
              "指导单位",
              "主办单位",
              "承办单位",
              "联合主办",
              "平台协同",
              "组委会协同",
              "会务协同",
              "生态协同",
              "区域协同",
            ].map((title, index) => ({
              id: `${organizations.id}-item-${index}`,
              title,
              description: title === "主办单位" ? content.host : "",
              imageUrl: "",
              href: "",
              icon: "link",
              body: [],
            })),
            ...content.organizers.slice(0, 11).map((description, index) => ({
              id: `${organizations.id}-item-${index + 9}`,
              title: "协作单位",
              description,
              imageUrl: "",
              href: "",
              icon: "link",
              body: [],
            })),
          ],
        },
    singleton("agenda", "会议议程"),
    content.modules.includes(discussion)
      ? discussion
      : {
          ...discussion,
          settings: { ...discussion.settings!, layout: "list" },
          items: topics.map(([title, text], index) => ({
            id: `${discussion.id}-item-${index}`,
            title,
            body: paragraph(text),
            description: "",
            imageUrl: "",
            href: "",
            icon: "document",
          })),
        },
    singleton("invitees", "拟邀嘉宾"),
    content.modules.includes(participation)
      ? participation
      : {
          ...participation,
          body: paragraph(
            "为保障闭门会交流效果及内容有效聚焦，嘉宾由主办方定向邀请，谢绝任何形式空降，限一位决策人参会。",
          ),
        },
    ...content.modules.filter((module) => !used.has(module.id)),
  ];
  if (modules.length > 24)
    throw new RangeError(
      "当前内容模块较多，请先将模块减少后再应用长卷模板。现有内容未修改。",
    );
  return {
    ...applyInvitationPreset(content, "booklet"),
    modules,
    navigation: normalizeInvitationNavigation(content.navigation, modules),
    design: {
      ...normalizeInvitationPageDesign(content.design),
      textColor: "#292a2c",
      backgroundImage: "/invitation-art/booklet-pattern.jpg",
      backgroundOpacity: 12,
      backgroundMotion: "none",
      bodySize: 15,
    },
    effects: {
      ...content.effects,
      entrance: "rise",
      cover: "fade",
      scroll: "continuous",
    },
    highlights: content.highlights.length
      ? content.highlights
      : [
          ["焕新 · 教育重构", "面向新的学习需求，重构课程产品与教育价值。"],
          ["筑基 · 底盘重建", "聚焦招生、留生与经营基本盘，分享真实实践。"],
          ["智变 · 组织提效", "以AI与组织变革，推动团队协作和流程提效。"],
          ["增长 · 模型验证", "从创新产品到第二曲线，验证可持续的增长模型。"],
        ].map(([title, description], index) => ({
          id: `booklet-highlight-${index}`,
          title,
          description,
        })),
    agenda: content.agenda.length
      ? content.agenda
      : [
          ["第一天", "上午", "现场签到 · 办理入住"],
          ["第一天", "下午", "嘉宾自我介绍 · 标杆案例分享"],
          ["第一天", "晚间", "欢迎晚宴 · 自由交流"],
          ["第二天", "上午", "机构基本盘 · 组织与经营主题分享"],
          ["第二天", "下午", "未来教育 · 创新产品 · 参访交流"],
          ["第二天", "晚间", "社交晚宴 · 互动体验"],
          ["第三天", "上午", "小组共创 · 主题讨论"],
          ["第三天", "下午", "艺术疗愈工作坊 · 闭幕合影"],
        ].map(([date, time, title], index) => ({
          id: `booklet-agenda-${index}`,
          date,
          time,
          title,
          speaker: "",
          location: "",
        })),
  };
}
