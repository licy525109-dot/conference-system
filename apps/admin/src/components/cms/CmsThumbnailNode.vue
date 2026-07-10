<template>
  <section v-if="component.enabled !== false" class="thumbnail-node">
    <template v-if="isFixedTemplate">
      <div class="fixed-template-preview">
        <img class="fixed-template-preview__hero" :src="fixedHeroImage" alt="" />
        <div v-if="fixedKind === 'member-center'" class="fixed-template-preview__member">
          <img src="/static/fixed-templates/brand/member_avatar_placeholder.png" alt="" />
          <span><strong>示例会员</strong><small>黄金会员 · 138****8888</small></span>
        </div>
        <div v-else class="fixed-template-preview__entries">
          <span v-for="entry in fixedEntries" :key="entry.title">
            <img :src="entry.icon" alt="" />
            <small>{{ entry.title }}</small>
          </span>
        </div>
        <div class="fixed-template-preview__section">
          <strong>{{ fixedSectionTitle }}</strong>
          <article v-for="item in fixedCards" :key="item">
            <span>{{ item }}</span>
            <small>查看详情</small>
          </article>
        </div>
      </div>
    </template>

    <template v-else-if="isHero">
      <div class="thumbnail-hero" :class="{ 'is-image-only': imageOnly }">
        <img v-if="imageUrl" :src="imageUrl" alt="" />
        <div v-if="!imageOnly && (showTitle || showDescription)" class="thumbnail-hero__copy">
          <strong v-if="showTitle && title">{{ title }}</strong>
          <small v-if="showDescription && description">{{ description }}</small>
          <button v-if="buttonText">{{ buttonText }}</button>
        </div>
      </div>
    </template>

    <template v-else-if="isGrid">
      <div class="thumbnail-section-title" v-if="title">{{ title }}</div>
      <div class="thumbnail-grid" :style="gridStyle">
        <span v-for="(item, index) in displayItems" :key="item.id || `${item.title}-${index}`">
          <img v-if="item.iconUrl || item.imageUrl" :src="item.iconUrl || item.imageUrl" alt="" />
          <b v-else>{{ (item.title || item.label || '会').slice(0, 1) }}</b>
          <small>{{ item.title || item.label || "会议服务" }}</small>
        </span>
      </div>
    </template>

    <template v-else-if="isProductGrid">
      <div class="thumbnail-section-title">{{ title || "精选推荐" }}</div>
      <div class="thumbnail-products">
        <article v-for="(item, index) in displayItems.slice(0, 4)" :key="item.id || index">
          <img :src="item.imageUrl || item.coverImageUrl || productFallback(index)" alt="" />
          <strong>{{ item.title || item.name || `会务好物 ${index + 1}` }}</strong>
          <small>{{ item.subtitle || "会员专享" }}</small>
        </article>
      </div>
    </template>

    <template v-else-if="isRichText">
      <div class="thumbnail-rich-text">
        <strong v-if="title">{{ title }}</strong>
        <p>{{ plainText || "在这里配置会议介绍、参会指南和运营内容。" }}</p>
      </div>
    </template>

    <template v-else>
      <div class="thumbnail-list-section">
        <div class="thumbnail-section-title">{{ title || fallbackTitle }}</div>
        <article v-for="(item, index) in displayItems.slice(0, 3)" :key="item.id || index">
          <img v-if="item.imageUrl || item.coverImageUrl" :src="item.imageUrl || item.coverImageUrl" alt="" />
          <span>
            <strong>{{ item.title || item.name || fallbackItemTitle(index) }}</strong>
            <small>{{ item.subtitle || item.description || description || "查看详情" }}</small>
          </span>
        </article>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";

interface ThumbnailComponent {
  id?: string;
  type: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
  props?: Record<string, unknown>;
}

interface DisplayItem {
  id?: string;
  title?: string;
  label?: string;
  name?: string;
  subtitle?: string;
  description?: string;
  iconUrl?: string;
  imageUrl?: string;
  coverImageUrl?: string;
}

const props = defineProps<{ component: ThumbnailComponent }>();
const config = computed(() => ({ ...(props.component.props ?? {}), ...(props.component.config ?? {}) }));
const type = computed(() => props.component.type.toLowerCase());
const title = computed(() => readString(config.value.title || config.value.heading));
const description = computed(() => readString(config.value.description || config.value.subtitle || config.value.text));
const buttonText = computed(() => readString(config.value.buttonText || config.value.ctaText));
const imageUrl = computed(() => readString(config.value.imageUrl || config.value.heroImageUrl || config.value.coverImageUrl));
const imageOnly = computed(() => readBoolean(config.value.imageOnly, false));
const showTitle = computed(() => readBoolean(config.value.showTitle, true));
const showDescription = computed(() => readBoolean(config.value.showDescription, true));
const isFixedTemplate = computed(() => type.value === "fixed-business-template");
const isHero = computed(() => /(hero|banner|carousel|image-banner)/.test(type.value));
const isGrid = computed(() => /(quick-icon-grid|icon-grid|navigation-grid|entry-grid|button-group)/.test(type.value));
const isProductGrid = computed(() => /(product-grid|product-recommend|mall-product)/.test(type.value));
const isRichText = computed(() => /(rich-text|safe-rich-text|text-image|article)/.test(type.value));
const displayItems = computed<DisplayItem[]>(() => {
  const value = config.value.items || config.value.entries || config.value.products || config.value.data;
  return Array.isArray(value) && value.length > 0 ? value.filter(isRecord).map(toDisplayItem) : defaultItems.value;
});
const defaultItems = computed<DisplayItem[]>(() => [
  { title: title.value || "会议服务", subtitle: description.value || "查看详情" },
  { title: "最新活动", subtitle: "立即了解" },
  { title: "会员权益", subtitle: "专属服务" }
]);
const gridStyle = computed(() => ({ gridTemplateColumns: `repeat(${Math.min(Math.max(readNumber(config.value.columns, 4), 2), 5)}, minmax(0, 1fr))` }));
const plainText = computed(() => stripHtml(readString(config.value.html || config.value.content || config.value.text || config.value.description)));
const fallbackTitle = computed(() => {
  if (/(conference|event|schedule)/.test(type.value)) return "会议活动";
  if (/(member|benefit)/.test(type.value)) return "会员服务";
  if (/(cart|order)/.test(type.value)) return "订单信息";
  return title.value || "页面内容";
});

const fixedKind = computed(() => normalizeFixedKind(readString(config.value.templateKey || config.value.kind || config.value.pageType || config.value.template)));
const fixedHeroImage = computed(() => `/static/fixed-templates/heroes/hero_${fixedKind.value === "member-center" ? "member" : fixedKind.value === "registration" ? "registration" : fixedKind.value}_bg.png`);
const fixedEntries = computed(() => {
  if (fixedKind.value === "mall") {
    return [
      { title: "会务礼盒", icon: "/static/fixed-templates/products/product_gift_box.png" },
      { title: "品牌手册", icon: "/static/fixed-templates/products/product_notebook.png" },
      { title: "嘉宾证", icon: "/static/fixed-templates/products/product_guest_badge.png" },
      { title: "纪念品", icon: "/static/fixed-templates/products/product_mug.png" }
    ];
  }
  return [
    { title: "年度排期", icon: "/static/fixed-templates/icons/calendar.svg" },
    { title: "会议报名", icon: "/static/fixed-templates/icons/registration.svg" },
    { title: "嘉宾阵容", icon: "/static/fixed-templates/icons/speaker.svg" },
    { title: "会员中心", icon: "/static/fixed-templates/icons/user.svg" }
  ];
});
const fixedSectionTitle = computed(() => ({
  home: "近期会议",
  schedule: "年度会议安排",
  registration: "开放报名",
  mall: "精选会务商品",
  cart: "购物车商品",
  "member-center": "我的服务"
}[fixedKind.value] || "页面内容"));
const fixedCards = computed(() => {
  if (fixedKind.value === "mall") return ["观潮会务礼盒", "品牌会议手册"];
  if (fixedKind.value === "cart") return ["会议报名席位", "会务周边商品"];
  if (fixedKind.value === "member-center") return ["我的报名", "我的订单", "会员权益"];
  return ["行业趋势峰会", "创始人闭门会", "年度品牌大会"];
});

function normalizeFixedKind(value: string): "home" | "schedule" | "registration" | "mall" | "cart" | "member-center" {
  if (value.includes("schedule")) return "schedule";
  if (value.includes("registration") || value.includes("conference-list")) return "registration";
  if (value.includes("member")) return "member-center";
  if (value.includes("cart")) return "cart";
  if (value.includes("mall")) return "mall";
  return "home";
}

function toDisplayItem(value: Record<string, unknown>): DisplayItem {
  return {
    id: readString(value.id),
    title: readString(value.title),
    label: readString(value.label),
    name: readString(value.name),
    subtitle: readString(value.subtitle),
    description: readString(value.description),
    iconUrl: readString(value.iconUrl),
    imageUrl: readString(value.imageUrl),
    coverImageUrl: readString(value.coverImageUrl)
  };
}

function productFallback(index: number): string {
  const names = ["product_gift_box.png", "product_notebook.png", "product_guest_badge.png", "product_mug.png"];
  return `/static/fixed-templates/products/${names[index % names.length]}`;
}

function fallbackItemTitle(index: number): string {
  return ["会议介绍", "嘉宾与议程", "参会服务"][index] || "查看内容";
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
</script>

<style scoped>
.thumbnail-node + .thumbnail-node {
  margin-top: 10px;
}

.fixed-template-preview,
.thumbnail-hero,
.thumbnail-rich-text,
.thumbnail-list-section {
  overflow: hidden;
  border-radius: 10px;
  background: var(--cms-thumb-card);
}

.fixed-template-preview__hero,
.thumbnail-hero > img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 230px;
  object-fit: cover;
}

.fixed-template-preview__entries,
.thumbnail-grid {
  display: grid;
  gap: 8px;
  padding: 14px;
}

.fixed-template-preview__entries {
  grid-template-columns: repeat(4, 1fr);
}

.fixed-template-preview__entries span,
.thumbnail-grid span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}

.fixed-template-preview__entries img,
.thumbnail-grid img,
.thumbnail-grid b {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  object-fit: cover;
}

.thumbnail-grid b {
  display: grid;
  place-items: center;
  background: var(--admin-color-primary-soft);
  color: var(--admin-color-primary);
}

.fixed-template-preview__entries small,
.thumbnail-grid small {
  overflow: hidden;
  color: var(--admin-color-text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fixed-template-preview__section,
.thumbnail-rich-text,
.thumbnail-list-section {
  padding: 14px;
}

.fixed-template-preview__section > strong,
.thumbnail-section-title {
  display: block;
  margin-bottom: 10px;
  color: var(--admin-color-text);
  font-size: 15px;
  font-weight: 700;
}

.fixed-template-preview__section article,
.thumbnail-list-section article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--admin-color-border);
}

.fixed-template-preview__section article small,
.thumbnail-list-section article small {
  color: var(--admin-color-muted);
}

.fixed-template-preview__member {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: -22px 14px 0;
  padding: 14px;
  border-radius: 10px;
  background: var(--cms-thumb-card);
  box-shadow: var(--admin-shadow-soft);
}

.fixed-template-preview__member img {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}

.fixed-template-preview__member strong,
.fixed-template-preview__member small {
  display: block;
}

.fixed-template-preview__member small {
  margin-top: 3px;
  color: var(--admin-color-muted);
}

.thumbnail-hero {
  position: relative;
  min-height: 150px;
}

.thumbnail-hero > img {
  min-height: 150px;
}

.thumbnail-hero__copy {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 28px 16px 16px;
  background: linear-gradient(180deg, transparent, rgb(23 32 47 / 72%));
  color: var(--admin-color-panel);
}

.thumbnail-hero__copy strong,
.thumbnail-hero__copy small {
  display: block;
}

.thumbnail-hero__copy small {
  margin-top: 5px;
}

.thumbnail-hero__copy button {
  min-height: 30px;
  margin-top: 10px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: var(--cms-thumb-primary);
  color: var(--admin-color-panel);
}

.thumbnail-section-title {
  padding: 2px 2px 0;
}

.thumbnail-products {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.thumbnail-products article {
  overflow: hidden;
  border-radius: 8px;
  background: var(--cms-thumb-card);
}

.thumbnail-products img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

.thumbnail-products strong,
.thumbnail-products small {
  display: block;
  padding-inline: 10px;
}

.thumbnail-products strong {
  margin-top: 8px;
  font-size: 13px;
}

.thumbnail-products small {
  padding-block: 4px 10px;
  color: var(--admin-color-muted);
}

.thumbnail-rich-text strong {
  display: block;
  margin-bottom: 6px;
}

.thumbnail-rich-text p {
  margin: 0;
  color: var(--admin-color-muted);
  line-height: 1.6;
}

.thumbnail-list-section article {
  justify-content: flex-start;
}

.thumbnail-list-section article img {
  width: 80px;
  height: 58px;
  flex: 0 0 80px;
  border-radius: 6px;
  object-fit: cover;
}

.thumbnail-list-section article span {
  min-width: 0;
}

.thumbnail-list-section article strong,
.thumbnail-list-section article small {
  display: block;
}
</style>
