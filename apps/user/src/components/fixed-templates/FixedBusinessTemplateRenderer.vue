<template>
  <view class="fixed-template" :class="`is-${templateKind}`">
    <view v-if="templateKind === 'home'" class="fixed-stack">
      <view class="fixed-hero is-home" :style="heroStyle('hero_home_bg.png')">
        <text class="fixed-hero__kicker">观潮会集</text>
        <text v-if="visibleConfig('heroShowTitle', true) && textConfig('heroTitle', '潮起谋局  潮落定势')" class="fixed-hero__title">{{ textConfig("heroTitle", "潮起谋局  潮落定势") }}</text>
        <text v-if="visibleConfig('heroShowSubtitle', true) && textConfig('heroSubtitle', '行业会议与创始人社群平台')" class="fixed-hero__desc">{{ textConfig("heroSubtitle", "行业会议与创始人社群平台") }}</text>
      </view>
      <view v-if="visibleConfig('noticeBar', true)" class="fixed-notice">
        <image :src="asset('icons/speaker.svg')" mode="aspectFit" />
        <text>{{ textConfig("noticeText", "欢迎来到观潮会集，查看年度排期、会议报名与会员权益。") }}</text>
      </view>
      <view v-if="visibleConfig('loginCard', true)" class="fixed-login-card">
        <image class="fixed-login-card__avatar" :src="loginAvatar" mode="aspectFill" />
        <view>
          <text class="fixed-card-title">{{ loginTitle }}</text>
          <text class="fixed-muted">{{ loginSubtitle }}</text>
        </view>
        <button class="fixed-pill" @click="loginOrMember">{{ loginButtonText }}</button>
      </view>
      <view v-if="visibleConfig('quickGrid', true)" class="fixed-quick-grid">
        <view v-for="item in homeEntries" :key="item.id" class="fixed-quick-card" @click="navigateEntry(item)">
          <image :src="entryIcon(item)" mode="aspectFit" />
          <text>{{ item.title }}</text>
          <text>{{ item.subtitle }}</text>
        </view>
      </view>
      <view v-if="visibleConfig('highlightStrip', true)" class="fixed-strip" @click="navigatePage('custom:ecosystem')">
        <text>五大增量生态 × 五大垂类赛道</text>
        <button>查看详情</button>
      </view>
      <view v-if="visibleConfig('statsCard', true)" class="fixed-stats-card">
        <view>
          <text class="fixed-card-title">观潮会集</text>
          <text class="fixed-muted">行业会议与创始人社群平台</text>
        </view>
        <view>
          <text>1500+</text>
          <text>头部创始人</text>
        </view>
        <view>
          <text>20+</text>
          <text>覆盖城市业态</text>
        </view>
      </view>
      <view v-if="visibleConfig('conferenceModels', true)" class="fixed-models">
        <text class="fixed-section-title">核心会议模型</text>
        <view class="fixed-models__grid">
          <text v-for="item in conferenceModels" :key="item">{{ item }}</text>
        </view>
      </view>
      <view v-if="visibleConfig('tagRows', true)" class="fixed-tags-card">
        <view v-for="row in tagRows" :key="row.title" class="fixed-tags-row">
          <text>{{ row.title }}</text>
          <view>
            <text v-for="tag in row.items" :key="tag">{{ tag }}</text>
          </view>
        </view>
      </view>
    </view>

    <view v-else-if="templateKind === 'schedule'" class="fixed-stack">
      <view class="fixed-hero" :style="heroStyle('hero_schedule_bg.png')">
        <text v-if="visibleConfig('heroShowTitle', true) && textConfig('heroTitle', '年度排期')" class="fixed-hero__title">{{ textConfig("heroTitle", "年度排期") }}</text>
        <text v-if="visibleConfig('heroShowSubtitle', true) && textConfig('heroSubtitle', '查看观潮会集全年会议安排')" class="fixed-hero__desc">{{ textConfig("heroSubtitle", "查看观潮会集全年会议安排") }}</text>
        <button @click="openFirstConference">立即报名</button>
      </view>
      <scroll-view scroll-x class="fixed-months" :show-scrollbar="false">
        <text
          v-for="month in scheduleMonthOptions"
          :key="month.key"
          :class="{ active: month.key === activeScheduleMonth }"
          @click="selectScheduleMonth(month.key)"
        >{{ month.label }}</text>
      </scroll-view>
      <scroll-view scroll-x class="fixed-tabs" :show-scrollbar="false">
        <text
          v-for="tab in scheduleTabs"
          :key="tab"
          :class="{ active: tab === activeScheduleCategory }"
          @click="selectScheduleCategory(tab)"
        >{{ tab }}</text>
      </scroll-view>
      <view v-if="scheduleConferences.length === 0" class="fixed-empty-state">
        <text>该月份暂无会议</text>
        <text>可切换其他月份或分类查看全年安排</text>
      </view>
      <view v-for="item in scheduleConferences" :key="item.id" class="fixed-schedule-card" @click="openConference(item.id)">
        <view class="fixed-schedule-card__date">
          <text>{{ dayOf(item.startsAt) }}</text>
          <text>{{ weekdayOf(item.startsAt) }}</text>
          <text>{{ item.location || "城市待定" }}</text>
        </view>
        <view class="fixed-schedule-card__body">
          <text class="fixed-tag">推荐</text>
          <text class="fixed-card-title">{{ item.title }}</text>
          <text class="fixed-muted">{{ item.summary || "点击查看会议详情和报名信息。" }}</text>
          <button>查看详情</button>
        </view>
      </view>
    </view>

    <view v-else-if="templateKind === 'registration'" class="fixed-stack">
      <view class="fixed-hero" :style="heroStyle('hero_registration_bg.png')">
        <text v-if="visibleConfig('heroShowTitle', true) && textConfig('heroTitle', '会议报名')" class="fixed-hero__title">{{ textConfig("heroTitle", "会议报名") }}</text>
        <text v-if="visibleConfig('heroShowSubtitle', true) && textConfig('heroSubtitle', '选择感兴趣的会议，快速报名参与')" class="fixed-hero__desc">{{ textConfig("heroSubtitle", "选择感兴趣的会议，快速报名参与") }}</text>
      </view>
      <scroll-view scroll-x class="fixed-tabs" :show-scrollbar="false">
        <text v-for="tab in registrationTabs" :key="tab" :class="{ active: tab === activeRegistrationCategory }" @click="activeRegistrationCategory = tab">{{ tab }}</text>
      </scroll-view>
      <view v-if="registrationConferences.length === 0" class="fixed-empty-state">
        <text>暂无匹配会议</text>
        <text>切换分类查看其他可报名场次</text>
      </view>
      <view v-for="item in registrationConferences" :key="item.id" class="fixed-conference-card" @click="openConference(item.id)">
        <image v-if="item.coverImageUrl" :src="item.coverImageUrl" mode="aspectFill" />
        <view v-else class="fixed-conference-card__cover">会</view>
        <view class="fixed-conference-card__body">
          <text class="fixed-tag">推荐</text>
          <text class="fixed-card-title">{{ item.title }}</text>
          <text class="fixed-muted">{{ dateLine(item.startsAt) }} · {{ item.location || "地点待定" }}</text>
          <text class="fixed-muted">{{ item.summary || "适合关注行业趋势、经营增长与资源链接的伙伴。" }}</text>
          <button>立即报名</button>
        </view>
      </view>
    </view>

    <view v-else-if="templateKind === 'mall'" class="fixed-stack">
      <view class="fixed-hero" :style="heroStyle('hero_mall_bg.png')">
        <text v-if="visibleConfig('heroShowTitle', true) && textConfig('heroTitle', '会议周边商城')" class="fixed-hero__title">{{ textConfig("heroTitle", "会议周边商城") }}</text>
        <text v-if="visibleConfig('heroShowSubtitle', true) && textConfig('heroSubtitle', '精选会议周边与品牌物料')" class="fixed-hero__desc">{{ textConfig("heroSubtitle", "精选会议周边与品牌物料") }}</text>
      </view>
      <scroll-view scroll-x class="fixed-tabs" :show-scrollbar="false">
        <text v-for="tab in mallTabs" :key="tab" :class="{ active: tab === activeMallCategory }" @click="activeMallCategory = tab">{{ tab }}</text>
      </scroll-view>
      <view class="fixed-product-grid">
        <view v-for="item in visibleProducts" :key="item.id" class="fixed-product-card" @click="openProduct(item.id)">
          <image class="fixed-product-card__image" :src="item.imageUrl" mode="aspectFill" />
          <text>{{ item.title }}</text>
          <view>
            <text>¥{{ item.price }}</text>
            <button>＋</button>
          </view>
        </view>
      </view>
      <view v-if="visibleProducts.length === 0" class="fixed-empty-state">
        <text>该分类暂无商品</text>
        <text>可切换其他分类继续浏览</text>
      </view>
    </view>

    <view v-else-if="templateKind === 'cart'" class="fixed-stack">
      <view class="fixed-hero is-cart" :style="heroStyle('hero_cart_bg.png')">
        <text v-if="visibleConfig('heroShowTitle', true) && textConfig('heroTitle', '购物车')" class="fixed-hero__title">{{ textConfig("heroTitle", "购物车") }}</text>
        <text v-if="visibleConfig('heroShowSubtitle', true) && textConfig('heroSubtitle', '已选商品、优惠券和结算信息都可按模块显隐控制')" class="fixed-hero__desc">{{ textConfig("heroSubtitle", "已选商品、优惠券和结算信息都可按模块显隐控制") }}</text>
      </view>
      <view class="fixed-strip">
        <text>已选 3 件商品</text>
        <button>编辑</button>
      </view>
      <view v-for="item in fallbackProducts.slice(0, 2)" :key="item.id" class="fixed-cart-item">
        <text class="fixed-select-dot">✓</text>
        <image :src="item.imageUrl" mode="aspectFill" />
        <view>
          <text class="fixed-card-title">{{ item.title }}</text>
          <text class="fixed-muted">默认规格 · 会员价</text>
          <text class="fixed-price">¥{{ item.price }}</text>
        </view>
        <text class="fixed-stepper">− 1 ＋</text>
      </view>
      <view class="fixed-coupon-row">
        <image :src="asset('icons/ticket.svg')" mode="aspectFit" />
        <text>优惠券</text>
        <text>已减 ¥20</text>
      </view>
    </view>

    <view v-else class="fixed-stack">
      <view class="fixed-member-card" :style="{ backgroundImage: `url(${asset('brand/member_card_bg.png')})` }">
        <image class="fixed-member-card__avatar" :src="memberAvatar" mode="aspectFill" />
        <view>
          <text class="fixed-member-card__name">{{ memberName }}</text>
          <text>{{ memberLevel }} · {{ memberStatus }}</text>
          <text>成长值 {{ textConfig("growthValue", "2568") }}</text>
        </view>
        <button @click="navigatePage('member-center')">编辑资料</button>
      </view>
      <view class="fixed-member-stats">
        <view v-for="item in memberStats" :key="item.label">
          <text>{{ item.value }}</text>
          <text>{{ item.label }}</text>
        </view>
      </view>
      <view class="fixed-benefit-card" :style="{ backgroundImage: `url(${asset('brand/member_benefit_bg.png')})` }">
        <text>观潮会集会员权益</text>
        <text>尊享会员专属特权，助力思想与机遇的深度链接</text>
        <button>查看权益</button>
        <view>
          <text>查看排期</text>
          <text>会议报名</text>
          <text>专属权益</text>
        </view>
      </view>
      <view class="fixed-menu-card">
        <view v-for="item in memberMenu" :key="item.title" @click="navigatePage(item.pageKey)">
          <image :src="asset(item.icon)" mode="aspectFit" />
          <text>{{ item.title }}</text>
          <text>›</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ensureLogin } from "@/services/auth";
import type { ConferenceListItem } from "@/services/conference";
import type { Product } from "@/services/mall";

type FixedTemplateKind = "home" | "schedule" | "registration" | "mall" | "cart" | "member-center";
interface FixedEntry {
  id: string;
  title: string;
  subtitle: string;
  iconUrl: string;
  dynamicIconUrl: string;
  builtinIcon: string;
  actionTargetType: string;
  targetPageKey: string;
  targetConferenceId: string;
  targetProductId: string;
}

const props = withDefaults(defineProps<{
  kind?: string;
  template?: unknown;
  config?: Record<string, unknown>;
  context?: Record<string, unknown> | null;
  conferences?: ConferenceListItem[];
  products?: Product[];
  userContext?: Record<string, unknown> | null;
}>(), {
  kind: "home",
  config: () => ({}),
  context: null,
  conferences: () => [],
  products: () => [],
  userContext: null
});

const emit = defineEmits<{
  openConference: [id: string];
}>();

const templateConfig = computed(() => {
  const template = isRecord(props.template) ? props.template : {};
  const templateProps = isRecord(template.props) ? template.props : {};
  const templateConfig = isRecord(template.config) ? template.config : {};
  return {
    ...templateProps,
    ...templateConfig,
    ...pickTemplateTopLevel(template),
    ...props.config
  };
});
const runtimeUserContext = computed(() => {
  const context = props.context;
  return props.userContext ?? (isRecord(context) && isRecord(context.userContext) ? context.userContext : null);
});
const assetRoot = computed(() => readString(templateConfig.value.assetRoot) || "/static/fixed-templates");

const templateKind = computed<FixedTemplateKind>(() =>
  normalizeKind(
    props.kind ||
      readString(templateConfig.value.templateKey) ||
      readString(templateConfig.value.kind) ||
      readString(templateConfig.value.pageType) ||
      readString(templateConfig.value.template)
  )
);
const visibleConferences = computed(() => props.conferences.slice(0, 8));
const allMallProducts = computed(() => {
  if (props.products.length > 0) {
    return props.products.slice(0, 8).map((item, index) => ({
      id: item.id,
      title: item.title,
      imageUrl: item.coverImageUrl || fallbackProducts[index % fallbackProducts.length].imageUrl,
      price: priceText(item),
      category: item.category?.name || productTypeLabel(item.productType)
    }));
  }
  return fallbackProducts;
});
const mallTabs = computed(() => [
  "全部",
  ...Array.from(new Set(allMallProducts.value.map((item) => item.category).filter(Boolean))).slice(0, 4)
]);
const visibleProducts = computed(() =>
  activeMallCategory.value === "全部"
    ? allMallProducts.value
    : allMallProducts.value.filter((item) => item.category === activeMallCategory.value)
);
const loginAvatar = computed(() => readString(runtimeUserContext.value?.avatarUrl) || asset("brand/member_avatar_placeholder.png"));
const loginTitle = computed(() => runtimeUserContext.value ? `欢迎回来，${memberName.value}` : "欢迎光临，请登录成为会员");
const loginSubtitle = computed(() => runtimeUserContext.value ? "可查看会议排期、报名权益和会员资料。" : "查看会议排期与报名权益");
const loginButtonText = computed(() => runtimeUserContext.value ? "个人中心" : "立即登录");
const memberName = computed(() => readString(runtimeUserContext.value?.nickname) || "微信用户");
const memberAvatar = computed(() => readString(runtimeUserContext.value?.avatarUrl) || asset("brand/member_avatar_placeholder.png"));
const memberStatus = computed(() => readString(runtimeUserContext.value?.memberStatus) || "普通用户");
const memberLevel = computed(() => readString(runtimeUserContext.value?.memberLevel) || "普通用户");
const memberStats = computed(() => [
  { label: "我的报名", value: readNumber(runtimeUserContext.value?.registrationCount, 0) },
  { label: "我的订单", value: readNumber(runtimeUserContext.value?.orderCount, 0) },
  { label: "待参会", value: readNumber(runtimeUserContext.value?.pendingConferenceCount, 0) },
  { label: "优惠券", value: readNumber(runtimeUserContext.value?.couponCount, 0) }
]);

const homeEntries = computed(() => {
  const configured = normalizeEntries(templateConfig.value.items);
  return configured.length > 0 ? configured.slice(0, 3) : defaultHomeEntries();
});
const conferenceModels = ["行业论坛", "闭门会", "城市沙龙", "案例参访", "私董会"];
const tagRows = [
  { title: "五大增量生态", items: ["自然", "银发", "赛事", "研学", "情绪"] },
  { title: "五大垂类赛道", items: ["学前", "科创", "舞蹈", "美术", "自主学习"] }
];
const scheduleTabs = ["全部", "闭门会", "论坛", "沙龙", "参访", "私董会"];
const registrationTabs = ["全部", "推荐", "即将开始", "闭门会", "论坛", "沙龙"];
const selectedScheduleMonth = ref("");
const selectedScheduleCategory = ref("全部");
const activeRegistrationCategory = ref("全部");
const activeMallCategory = ref("全部");

const scheduleMonthOptions = computed(() => {
  const months = new Map<string, { key: string; label: string; timestamp: number }>();
  props.conferences.forEach((item) => {
    const date = parseConferenceDate(item.startsAt);
    if (!date) return;
    const key = monthKey(date);
    if (!months.has(key)) {
      months.set(key, {
        key,
        label: `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`,
        timestamp: date.getTime()
      });
    }
  });
  return Array.from(months.values()).sort((a, b) => a.timestamp - b.timestamp);
});
const activeScheduleMonth = computed(() => selectedScheduleMonth.value || scheduleMonthOptions.value[0]?.key || "");
const activeScheduleCategory = computed(() => selectedScheduleCategory.value || "全部");
const scheduleConferences = computed(() =>
  visibleConferences.value.filter((item) => {
    const date = parseConferenceDate(item.startsAt);
    const matchesMonth = !activeScheduleMonth.value || (date && monthKey(date) === activeScheduleMonth.value);
    return Boolean(matchesMonth && matchesConferenceCategory(item, activeScheduleCategory.value));
  })
);
const registrationConferences = computed(() =>
  visibleConferences.value.filter((item) => matchesConferenceCategory(item, activeRegistrationCategory.value))
);
const memberMenu = [
  { title: "我的会议", icon: "icons/registration.svg", pageKey: "my-registrations" },
  { title: "收货地址", icon: "icons/address.svg", pageKey: "member-center" },
  { title: "发票信息", icon: "icons/order.svg", pageKey: "invoice" },
  { title: "客服帮助", icon: "icons/service.svg", pageKey: "member-center" },
  { title: "设置", icon: "icons/settings.svg", pageKey: "member-center" }
];
const fallbackProducts = [
  { id: "fixed-notebook", title: "观潮笔记本", imageUrl: asset("products/product_notebook.png"), price: "68.00", category: "文创周边" },
  { id: "fixed-tote", title: "观潮帆布袋", imageUrl: asset("products/product_tote_bag.png"), price: "88.00", category: "文创周边" },
  { id: "fixed-mug", title: "会议马克杯", imageUrl: asset("products/product_mug.png"), price: "59.00", category: "办公用品" },
  { id: "fixed-badge", title: "嘉宾徽章", imageUrl: asset("products/product_guest_badge.png"), price: "39.00", category: "文创周边" },
  { id: "fixed-gift", title: "会议礼盒", imageUrl: asset("products/product_gift_box.png"), price: "198.00", category: "伴手礼" },
  { id: "fixed-pen", title: "签字笔", imageUrl: asset("products/product_pen.png"), price: "19.00", category: "办公用品" },
  { id: "fixed-umbrella", title: "商务伞", imageUrl: asset("products/product_umbrella.png"), price: "99.00", category: "伴手礼" },
  { id: "fixed-bookmark", title: "金属书签", imageUrl: asset("products/product_bookmark.png"), price: "29.00", category: "办公用品" }
];

function productTypeLabel(type: string): string {
  if (type === "VIRTUAL") return "数字内容";
  if (type === "SERVICE") return "会议服务";
  return "文创周边";
}

function asset(path: string): string {
  return `${assetRoot.value}/${path}`;
}

function heroStyle(file: string) {
  const imageUrl = readString(templateConfig.value.heroImageUrl) || asset(`heroes/${file}`);
  const mode = readString(templateConfig.value.heroImageMode) || "contain";
  return {
    backgroundImage: `url(${imageUrl})`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: mode === "cover" ? "cover" : mode === "width" ? "100% auto" : "contain"
  };
}

function textConfig(key: string, fallback: string): string {
  const value = templateConfig.value[key];
  return typeof value === "string" ? value.trim() : fallback;
}

function visibleConfig(key: string, fallback: boolean): boolean {
  return typeof templateConfig.value[key] === "boolean" ? Boolean(templateConfig.value[key]) : fallback;
}

function normalizeKind(value: string): FixedTemplateKind {
  if (value.includes("schedule")) return "schedule";
  if (value.includes("registration") || value.includes("conference-list")) return "registration";
  if (value.includes("mall")) return "mall";
  if (value.includes("cart")) return "cart";
  if (value.includes("member")) return "member-center";
  return "home";
}

function openFirstConference() {
  const id = scheduleConferences.value[0]?.id || visibleConferences.value[0]?.id;
  if (id) openConference(id);
}

function selectScheduleMonth(key: string): void {
  selectedScheduleMonth.value = key;
}

function selectScheduleCategory(category: string): void {
  selectedScheduleCategory.value = category;
}

function parseConferenceDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function matchesConferenceCategory(item: ConferenceListItem, category: string): boolean {
  if (!category || category === "全部" || category === "推荐") return true;
  if (category === "即将开始") return Date.parse(item.startsAt) > Date.now();
  return [item.title, item.summary, item.location].some((value) => value?.includes(category));
}

function openConference(id: string) {
  emit("openConference", id);
}

function openProduct(id: string) {
  if (id.startsWith("fixed-")) {
    navigatePage("mall");
    return;
  }
  uni.navigateTo({ url: `/pages/mall/detail?id=${encodeURIComponent(id)}` });
}

async function loginOrMember() {
  if (!runtimeUserContext.value) {
    try {
      await ensureLogin();
      uni.$emit("wechat-profile:open");
    } catch {
      uni.showToast({ title: "登录失败，请稍后重试", icon: "none" });
    }
    return;
  }
  navigatePage("member-center");
}

function navigateEntry(entry: FixedEntry) {
  if (entry.actionTargetType === "conference" || entry.actionTargetType === "registration") {
    if (entry.targetConferenceId) openConference(entry.targetConferenceId);
    return;
  }
  if (entry.actionTargetType === "product") {
    if (entry.targetProductId) openProduct(entry.targetProductId);
    return;
  }
  navigatePage(entry.targetPageKey || "home");
}

function navigatePage(pageKey: string) {
  const pathMap: Record<string, string> = {
    home: "/pages/index/index",
    "conference-list": "/pages/custom/index?pageKey=conference-list",
    "custom:about-paiqi": "/pages/custom/index?pageKey=about-paiqi",
    "custom:ecosystem": "/pages/custom/index?pageKey=ecosystem",
    "my-registrations": "/pages/registrations/my",
    cart: "/pages/cart/index",
    mall: "/pages/mall/index",
    "member-center": "/pages/member/center",
    invoice: "/pages/invoice/index"
  };
  const path = pathMap[pageKey] || "/pages/index/index";
  uni.navigateTo({ url: path, fail: () => uni.switchTab({ url: path, fail: () => undefined }) });
}

function entryIcon(entry: FixedEntry): string {
  if (entry.dynamicIconUrl) return entry.dynamicIconUrl;
  if (entry.iconUrl) return entry.iconUrl;
  if (entry.builtinIcon === "registration") return asset("icons/registration.svg");
  if (entry.builtinIcon === "shop") return asset("icons/shop.svg");
  if (entry.builtinIcon === "member") return asset("icons/user.svg");
  return asset("icons/calendar.svg");
}

function defaultHomeEntries(): FixedEntry[] {
  return [
    fixedEntry("schedule", "年度排期", "SCHEDULE", "icons/calendar.svg", "custom:about-paiqi"),
    fixedEntry("registration", "会议报名", "REGISTRATION", "icons/registration.svg", "conference-list"),
    fixedEntry("ecosystem", "赛道生态", "ECOSYSTEM", "icons/user.svg", "custom:ecosystem")
  ];
}

function fixedEntry(id: string, title: string, subtitle: string, icon: string, pageKey: string): FixedEntry {
  return {
    id,
    title,
    subtitle,
    iconUrl: asset(icon),
    dynamicIconUrl: "",
    builtinIcon: "",
    actionTargetType: "page",
    targetPageKey: pageKey,
    targetConferenceId: "",
    targetProductId: ""
  };
}

function normalizeEntries(value: unknown): FixedEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const record = isRecord(item) ? item : {};
      if (record.enabled === false) return null;
      return {
        id: readString(record.id) || `entry-${index + 1}`,
        title: readString(record.title) || "入口",
        subtitle: readString(record.subtitle),
        iconUrl: readString(record.iconUrl),
        dynamicIconUrl: readString(record.dynamicIconUrl),
        builtinIcon: readString(record.builtinIcon),
        actionTargetType: readString(record.actionTargetType) || "page",
        targetPageKey: readString(record.targetPageKey),
        targetConferenceId: readString(record.targetConferenceId),
        targetProductId: readString(record.targetProductId)
      };
    })
    .filter((item): item is FixedEntry => Boolean(item));
}

function priceText(item: Product): string {
  const prices = item.skus.map((sku) => sku.priceCent).filter((price) => Number.isFinite(price));
  if (prices.length === 0) return "暂无价格";
  return (Math.min(...prices) / 100).toFixed(2);
}

function dayOf(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "08";
  return String(date.getDate()).padStart(2, "0");
}

function weekdayOf(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "周一";
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
}

function dateLine(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间待定";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pickTemplateTopLevel(value: Record<string, unknown>): Record<string, unknown> {
  const keys = ["templateKey", "kind", "pageType", "template", "assetRoot", "heroTitle", "heroSubtitle", "heroImageUrl", "heroShowTitle", "heroShowSubtitle", "heroImageMode", "noticeText", "growthValue", "items"];
  return Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
}
</script>

<style scoped>
.fixed-template,
.fixed-stack {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.fixed-template {
  color: #172033;
}

.fixed-muted {
  color: #697386;
  font-size: 24rpx;
  line-height: 1.5;
}

.fixed-hero {
  min-height: 394rpx;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 10rpx;
  overflow: hidden;
  padding: 32rpx;
  border-radius: 24rpx;
  background-color: #071426;
  background-position: center;
  background-size: cover;
  color: #fff;
  box-shadow: 0 12rpx 34rpx rgba(23, 32, 51, 0.12);
}

.fixed-hero__kicker {
  color: #c8a35a;
  font-size: 26rpx;
  font-weight: 900;
}

.fixed-hero__title {
  max-width: 520rpx;
  font-size: 42rpx;
  font-weight: 800;
  line-height: 1.2;
}

.fixed-hero__desc {
  max-width: 520rpx;
  font-size: 26rpx;
  line-height: 1.55;
}

.fixed-hero button,
.fixed-pill,
.fixed-strip button,
.fixed-schedule-card button,
.fixed-conference-card button,
.fixed-benefit-card button {
  height: 66rpx;
  padding: 0 30rpx;
  border: 0;
  border-radius: 16rpx;
  background: #a98231;
  color: #fff;
  font-size: 26rpx;
  font-weight: 700;
  line-height: 66rpx;
}

.fixed-notice,
.fixed-login-card,
.fixed-strip,
.fixed-stats-card,
.fixed-models,
.fixed-tags-card,
.fixed-schedule-card,
.fixed-conference-card,
.fixed-product-card,
.fixed-cart-item,
.fixed-coupon-row,
.fixed-member-stats,
.fixed-menu-card {
  border: 1rpx solid #e3e7ea;
  border-radius: 20rpx;
  background: #fff;
  box-shadow: 0 8rpx 24rpx rgba(23, 32, 51, 0.05);
}

.fixed-notice,
.fixed-strip,
.fixed-coupon-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx 24rpx;
}

.fixed-notice image,
.fixed-coupon-row image {
  width: 36rpx;
  height: 36rpx;
}

.fixed-notice text,
.fixed-strip text,
.fixed-coupon-row text {
  flex: 1;
  font-size: 26rpx;
  font-weight: 800;
}

.fixed-login-card {
  display: grid;
  grid-template-columns: 84rpx minmax(0, 1fr) auto;
  align-items: center;
  gap: 18rpx;
  padding: 24rpx;
}

.fixed-login-card__avatar,
.fixed-member-card__avatar {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
}

.fixed-card-title,
.fixed-section-title {
  display: block;
  color: #101b2d;
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.35;
}

.fixed-quick-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18rpx;
}

.fixed-quick-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  padding: 24rpx 12rpx;
  border: 1rpx solid #e6e9ec;
  border-radius: 18rpx;
  background: #fff;
}

.fixed-quick-card image {
  width: 62rpx;
  height: 62rpx;
}

.fixed-quick-card text:nth-child(2) {
  font-size: 28rpx;
  font-weight: 900;
}

.fixed-quick-card text:nth-child(3) {
  color: #697386;
  font-size: 21rpx;
}

.fixed-stats-card {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr 0.8fr;
  gap: 14rpx;
  padding: 24rpx;
}

.fixed-stats-card view:not(:first-child) text:first-child {
  display: block;
  color: #b99643;
  font-size: 40rpx;
  font-weight: 900;
}

.fixed-stats-card view:not(:first-child) text:last-child {
  color: #697386;
  font-size: 22rpx;
}

.fixed-models,
.fixed-tags-card {
  padding: 24rpx;
}

.fixed-models__grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10rpx;
  margin-top: 18rpx;
}

.fixed-models__grid text,
.fixed-tabs text,
.fixed-months text,
.fixed-tags-row view text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12rpx 16rpx;
  border-radius: 999rpx;
  background: #f1eadc;
  color: #7a5c20;
  font-size: 23rpx;
  font-weight: 800;
}

.fixed-tags-row {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  padding: 12rpx 0;
}

.fixed-tags-row > text {
  width: 160rpx;
  font-weight: 900;
}

.fixed-tags-row view {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.fixed-tabs,
.fixed-months {
  white-space: nowrap;
}

.fixed-tabs text,
.fixed-months text {
  min-height: 56rpx;
  margin-right: 10rpx;
  padding: 0 20rpx;
  border: 1rpx solid #e2e6e9;
  background: #fff;
  color: #6b7280;
  line-height: 56rpx;
}

.fixed-tabs text.active,
.fixed-months text.active {
  background: #071426;
  border-color: #071426;
  color: #fff;
}

.fixed-schedule-card {
  display: grid;
  grid-template-columns: 118rpx minmax(0, 1fr);
  gap: 18rpx;
  padding: 22rpx 20rpx;
}

.fixed-schedule-card__date {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding-right: 18rpx;
  border-right: 1rpx solid #e6dcc7;
}

.fixed-schedule-card__date text:first-child {
  color: #9b762d;
  font-size: 42rpx;
  font-weight: 800;
}

.fixed-schedule-card__date text:not(:first-child) {
  color: #697386;
  font-size: 23rpx;
}

.fixed-schedule-card__body,
.fixed-conference-card__body {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.fixed-tag {
  align-self: flex-start;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  background: #f5efe2;
  color: #8c6824;
  font-size: 22rpx;
  font-weight: 900;
}

.fixed-conference-card {
  display: grid;
  grid-template-columns: 186rpx minmax(0, 1fr);
  gap: 18rpx;
  padding: 18rpx;
}

.fixed-conference-card > image,
.fixed-conference-card__cover {
  width: 186rpx;
  height: 186rpx;
  border-radius: 24rpx;
  background: #071426;
  color: #fff;
}

.fixed-conference-card__cover {
  display: grid;
  place-items: center;
  font-size: 44rpx;
  font-weight: 900;
}

.fixed-product-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
}

.fixed-product-card {
  overflow: hidden;
}

.fixed-product-card__image {
  width: 100%;
  height: 230rpx;
  background: #f2ead9;
}

.fixed-product-card > text {
  display: block;
  min-height: 74rpx;
  padding: 18rpx 18rpx 4rpx;
  font-size: 27rpx;
  font-weight: 900;
  line-height: 1.35;
}

.fixed-product-card > view {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18rpx 18rpx;
}

.fixed-product-card > view text,
.fixed-price {
  color: #b45309;
  font-size: 30rpx;
  font-weight: 900;
}

.fixed-product-card button {
  width: 58rpx;
  height: 58rpx;
  border: 0;
  border-radius: 50%;
  background: #172033;
  color: #fff;
  font-size: 30rpx;
  line-height: 58rpx;
}

.fixed-cart-item {
  display: grid;
  grid-template-columns: 42rpx 132rpx minmax(0, 1fr) auto;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx;
}

.fixed-select-dot {
  display: grid;
  width: 38rpx;
  height: 38rpx;
  place-items: center;
  border-radius: 50%;
  background: #071426;
  color: #fff;
  font-size: 22rpx;
}

.fixed-cart-item image {
  width: 132rpx;
  height: 132rpx;
  border-radius: 20rpx;
}

.fixed-stepper {
  color: #101b2d;
  font-size: 24rpx;
  font-weight: 900;
}

.fixed-member-card,
.fixed-benefit-card {
  display: grid;
  grid-template-columns: 96rpx minmax(0, 1fr) auto;
  align-items: center;
  gap: 18rpx;
  overflow: hidden;
  padding: 30rpx;
  border-radius: 34rpx;
  background-color: #071426;
  background-position: center;
  background-size: cover;
  color: #fff;
}

.fixed-member-card__name {
  display: block;
  font-size: 34rpx;
  font-weight: 900;
}

.fixed-member-card view text:not(.fixed-member-card__name) {
  display: block;
  color: rgba(255, 255, 255, 0.82);
  font-size: 23rpx;
  line-height: 1.5;
}

.fixed-member-card button,
.fixed-benefit-card button {
  background: rgba(255, 255, 255, 0.92);
  color: #071426;
}

.fixed-member-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 20rpx;
}

.fixed-member-stats view {
  display: grid;
  place-items: center;
  gap: 6rpx;
}

.fixed-member-stats text:first-child {
  color: #101b2d;
  font-size: 34rpx;
  font-weight: 900;
}

.fixed-member-stats text:last-child {
  color: #697386;
  font-size: 23rpx;
}

.fixed-benefit-card {
  grid-template-columns: minmax(0, 1fr) auto;
}

.fixed-benefit-card > text:first-child {
  font-size: 34rpx;
  font-weight: 900;
}

.fixed-benefit-card > text:nth-child(2) {
  color: rgba(255, 255, 255, 0.82);
  font-size: 24rpx;
}

.fixed-benefit-card > view {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
}

.fixed-benefit-card > view text {
  padding: 14rpx 10rpx;
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.12);
  text-align: center;
  font-size: 23rpx;
  font-weight: 800;
}

.fixed-menu-card {
  overflow: hidden;
}

.fixed-menu-card view {
  display: grid;
  grid-template-columns: 42rpx minmax(0, 1fr) auto;
  align-items: center;
  gap: 14rpx;
  padding: 22rpx 24rpx;
  border-bottom: 1rpx solid #eef0f3;
}

.fixed-empty-state {
  display: flex;
  min-height: 150rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 28rpx;
  border: 1rpx dashed #d6dce0;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.72);
  color: #6b7280;
  text-align: center;
}

.fixed-empty-state text:first-child {
  color: #172033;
  font-size: 28rpx;
  font-weight: 700;
}

.fixed-empty-state text:last-child {
  font-size: 23rpx;
  line-height: 1.5;
}

.fixed-menu-card view:last-child {
  border-bottom: 0;
}

.fixed-menu-card image {
  width: 38rpx;
  height: 38rpx;
}

.fixed-menu-card text:nth-child(2) {
  font-size: 28rpx;
  font-weight: 800;
}

/* Guanchao fixed template alignment */
.fixed-template {
  background: transparent;
  color: #071426;
}

.fixed-card,
.fixed-menu-card,
.fixed-product-card,
.fixed-cart-item,
.fixed-member-stats,
.fixed-section {
  border: 1rpx solid rgba(185, 150, 67, 0.18);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 14rpx 34rpx rgba(7, 20, 38, 0.08);
}

.fixed-hero,
.fixed-member-card,
.fixed-benefit-card {
  border: 1rpx solid rgba(248, 228, 178, 0.2);
  box-shadow: 0 24rpx 60rpx rgba(7, 20, 38, 0.16);
}

.fixed-quick-card,
.fixed-stat-card,
.fixed-ticket-card,
.fixed-order-card,
.fixed-form-card {
  border-color: rgba(185, 150, 67, 0.2);
  background: #fff;
  box-shadow: 0 8rpx 24rpx rgba(7, 20, 38, 0.05);
}

.fixed-quick-card__icon,
.fixed-select-dot,
.fixed-badge,
.fixed-tag {
  background: #edf4f7;
  color: #8f6b24;
}

.fixed-button,
.fixed-hero button,
.fixed-product-card button,
.fixed-checkout button,
.fixed-form-card button {
  background: #9b762d;
  color: #fff;
  box-shadow: 0 8rpx 20rpx rgba(143, 107, 36, 0.16);
}

.fixed-template button::after {
  border: 0;
}
</style>
