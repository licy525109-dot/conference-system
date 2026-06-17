<template>
  <view :class="rootClass" :style="rootStyle">
    <ThemeDynamicBackground v-if="showRootDynamicBackground" :theme="props.theme" placement="absolute" />
    <view
      v-for="(component, index) in visibleComponents"
      :key="component.id"
      :class="blockClass(component, index)"
      :style="blockStyle(index)"
    >
      <ThemeDynamicBackground v-if="showHeaderDynamicBackground(index)" :theme="props.theme" placement="absolute" />
      <video
        v-if="showHeaderVideo && index === 0"
        class="cms-header__video"
        :src="String(props.theme.backgroundVideoUrl)"
        autoplay
        loop
        muted
        object-fit="cover"
        :controls="false"
      />
      <view v-if="component.type === 'hero'" :class="heroClass(component)" :style="heroStyle(component)">
        <image
          v-if="stringConfig(component, 'imageUrl')"
          class="cms-hero__image"
          :src="stringConfig(component, 'imageUrl')"
          :mode="heroImageMode(component)"
        />
        <view v-else class="cms-hero__image cms-hero__image--generated" />
        <view v-if="showHeroShade(component)" class="cms-hero__shade" />
        <view v-if="showHeroContent(component)" class="cms-hero__content">
          <text v-if="heroKicker(component)" class="cms-hero__kicker">{{ heroKicker(component) }}</text>
          <text class="cms-hero__title" :style="titleStyle(component)">{{ heroTitle(component) }}</text>
          <text v-if="heroDescription(component)" class="cms-hero__desc" :style="textStyle(component)">{{ heroDescription(component) }}</text>
          <view v-if="heroMetaLines(component).length > 0" class="cms-hero__meta">
            <text v-for="line in heroMetaLines(component)" :key="line">{{ line }}</text>
          </view>
          <view v-if="booleanConfig(component, 'showButton', true)" class="cms-hero__button" @click="$emit('register')">
            <text>{{ stringConfig(component, "buttonText") || "立即报名" }}</text>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'conference-list'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "可报名会议" }}</text>
        <view v-if="conferences.length === 0" class="cms-empty">暂无可报名会议</view>
        <view v-for="(item, index) in limitedConferences(component)" :key="item.id" :class="conferenceCardClass(component, 'cms-card')" :style="conferenceCardStyle(component)">
          <image
            v-if="showConferenceCover(component, item)"
            :class="conferenceImageClass(component, 'cms-card__image')"
            :style="conferenceImageStyle(component)"
            :src="conferenceCoverUrl(item)"
            :mode="conferenceImageMode(component)"
            @error="markConferenceCoverFailed(item.id)"
          />
          <view
            v-else-if="booleanConfig(component, 'showCover', true)"
            :class="conferenceImageClass(component, 'cms-card__image cms-card__image--empty')"
            :style="conferenceImageStyle(component)"
          >
            <text>{{ conferenceCoverInitial(item) }}</text>
          </view>
          <view class="cms-card__body">
            <text class="cms-card__title" :style="conferenceTextStyle(component, 'title')">{{ item.title }}</text>
            <text v-if="booleanConfig(component, 'showSummary', true)" class="cms-card__text" :style="conferenceTextStyle(component, 'summary')">{{ item.summary || summaryFallback(component) }}</text>
            <text v-for="line in conferenceMetaLines(item, component, index)" :key="line" class="cms-card__meta" :style="conferenceTextStyle(component, 'meta')">{{ line }}</text>
            <view class="cms-card__button" @click.stop="$emit('openConference', item.id)">
              <text>{{ detailButtonText(component) }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'conference-tabs'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "会议分类切换" }}</text>
        <view class="cms-tabs">
          <text v-for="(tab, index) in conferenceTabs(component)" :key="tab" :class="['cms-tab', index === 0 ? 'active' : '']">{{ tab }}</text>
        </view>
        <view v-if="conferences.length === 0" class="cms-empty">暂无可报名会议</view>
        <view v-for="(item, index) in limitedConferences(component).slice(0, 3)" :key="item.id" :class="conferenceCardClass(component, 'cms-mini-card')" :style="conferenceCardStyle(component)">
          <image
            v-if="showConferenceCover(component, item)"
            :class="conferenceImageClass(component, 'cms-mini-card__image')"
            :style="conferenceImageStyle(component)"
            :src="conferenceCoverUrl(item)"
            :mode="conferenceImageMode(component)"
            @error="markConferenceCoverFailed(item.id)"
          />
          <view
            v-else-if="booleanConfig(component, 'showCover', true)"
            :class="conferenceImageClass(component, 'cms-mini-card__image cms-card__image--empty')"
            :style="conferenceImageStyle(component)"
          >
            <text>{{ conferenceCoverInitial(item) }}</text>
          </view>
          <view class="cms-card__body">
            <text class="cms-card__title" :style="conferenceTextStyle(component, 'title')">{{ item.title }}</text>
            <text v-if="booleanConfig(component, 'showSummary', false)" class="cms-card__text" :style="conferenceTextStyle(component, 'summary')">{{ item.summary || summaryFallback(component) }}</text>
            <text v-for="line in conferenceMetaLines(item, component, index)" :key="line" class="cms-card__meta" :style="conferenceTextStyle(component, 'meta')">{{ line }}</text>
            <view class="cms-card__button" @click.stop="$emit('openConference', item.id)">
              <text>{{ detailButtonText(component) }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'carousel'" :class="carouselClass(component)" :style="carouselStyle(component)">
        <swiper
          v-if="stringListConfig(component, 'images').length > 0"
          class="cms-swiper"
          :indicator-dots="booleanConfig(component, 'indicatorDots', true)"
          :circular="booleanConfig(component, 'circular', true)"
          :autoplay="booleanConfig(component, 'autoplay', true)"
        >
          <swiper-item v-for="image in stringListConfig(component, 'images')" :key="image">
            <view class="cms-swiper__slide">
              <image class="cms-swiper__image" :src="image" :mode="carouselImageMode(component)" />
            </view>
          </swiper-item>
        </swiper>
        <view v-else class="cms-empty cms-empty-card">暂无轮播图片</view>
      </view>

      <view v-else-if="component.type === 'registration-button'" class="cms-register">
        <button class="cms-button" :style="textStyle(component)" @click="$emit('register')">{{ stringConfig(component, "text") || "立即报名" }}</button>
      </view>

      <button v-else-if="component.type === 'floating-registration-button'" class="cms-floating" :style="textStyle(component)" @click="$emit('register')">
        {{ stringConfig(component, "text") || "立即报名" }}
      </button>

      <view v-else-if="component.type === 'rich-text' || component.type === 'safe-html'" class="cms-section" :style="textStyle(component)">
        <rich-text :nodes="stringConfig(component, 'html')" />
      </view>

      <view v-else-if="component.type === 'image-grid'" class="cms-grid">
        <image v-for="image in arrayConfig(component, 'images')" :key="String(image)" class="cms-grid__image" :src="String(image)" mode="aspectFill" />
        <view v-if="arrayConfig(component, 'images').length === 0" class="cms-empty cms-empty-card">暂无图片</view>
      </view>

      <view v-else-if="component.type === 'video'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "视频" }}</text>
        <video v-if="stringConfig(component, 'url')" class="cms-video" :src="stringConfig(component, 'url')" />
        <view v-else class="cms-empty">视频地址未配置</view>
      </view>

      <view v-else-if="component.type === 'speaker-cards'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "嘉宾阵容" }}</text>
        <view v-if="speakerItems(component).length === 0" class="cms-empty">嘉宾信息待公布</view>
        <view v-else class="cms-speakers">
          <view v-for="speaker in speakerItems(component)" :key="speaker.name + speaker.role" class="cms-speaker">
            <image v-if="speaker.avatarUrl" class="cms-speaker__avatar" :src="speaker.avatarUrl" mode="aspectFill" />
            <view v-else class="cms-speaker__avatar cms-speaker__avatar--text">{{ speaker.initial }}</view>
            <view class="cms-speaker__body">
              <text class="cms-speaker__name" :style="textStyle(component)">{{ speaker.name }}</text>
              <text v-if="speaker.role" class="cms-speaker__role">{{ speaker.role }}</text>
              <text v-if="speaker.bio" class="cms-speaker__bio">{{ speaker.bio }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'schedule-timeline'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "会议日程" }}</text>
        <view v-if="scheduleItems(component).length === 0" class="cms-empty">日程安排待公布</view>
        <view v-else class="cms-timeline">
          <view v-for="item in scheduleItems(component)" :key="item.time + item.title" class="cms-timeline__item">
            <text class="cms-timeline__time">{{ item.time || "待定" }}</text>
            <view class="cms-timeline__content">
              <text class="cms-timeline__title" :style="textStyle(component)">{{ item.title }}</text>
              <text v-if="item.description" class="cms-timeline__desc">{{ item.description }}</text>
            </view>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'countdown'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "距离开始" }}</text>
        <view v-if="countdownParts(component)" class="cms-countdown">
          <view v-for="part in countdownParts(component)" :key="part.label" class="cms-countdown__item">
            <text class="cms-countdown__value">{{ part.value }}</text>
            <text class="cms-countdown__label">{{ part.label }}</text>
          </view>
        </view>
        <view v-else class="cms-empty">倒计时时间待配置</view>
      </view>

      <view v-else-if="component.type === 'notice' || component.type === 'promotion-bar'" class="cms-notice" :style="textStyle(component)">
        {{ stringConfig(component, "text") || "报名开放中" }}
      </view>

      <view v-else-if="component.type === 'stats-grid'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "会议亮点" }}</text>
        <view class="cms-stats">
          <text v-for="item in arrayConfig(component, 'items')" :key="String(item)" class="cms-stat" :style="textStyle(component)">{{ item }}</text>
        </view>
      </view>

      <view v-else-if="component.type === 'ticket-price-list' || component.type === 'process-steps' || component.type === 'download-list' || component.type === 'testimonial-list' || component.type === 'tag-filter'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || titleFor(component.type) }}</text>
        <view class="cms-list-lines">
          <text v-for="item in arrayConfig(component, 'items')" :key="String(item)" class="cms-list-line" :style="textStyle(component)">{{ item }}</text>
        </view>
      </view>

      <view v-else-if="component.type === 'text-image'" class="cms-section">
        <image v-if="stringConfig(component, 'imageUrl')" class="cms-section__image" :src="stringConfig(component, 'imageUrl')" mode="aspectFill" />
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "大会介绍" }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "text") || "聚焦行业趋势、案例实践和高质量连接。" }}</text>
      </view>

      <view v-else-if="component.type === 'live-card'" class="cms-section cms-live">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "线上直播" }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "text") || "无法到场也可预约线上观看" }}</text>
      </view>

      <view v-else-if="component.type === 'traffic-guide'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "交通指南" }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "address") }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "text") }}</text>
      </view>

      <view v-else-if="component.type === 'map-contact'" class="cms-section cms-map-contact">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "会场与联系" }}</text>
        <view class="cms-map-contact__body">
          <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "address") || conference?.location || "会议地址待公布" }}</text>
          <button v-if="stringConfig(component, 'phone')" class="cms-button cms-button--outline" @click="callPhone(stringConfig(component, 'phone'))">
            联系会务组：{{ stringConfig(component, "phone") }}
          </button>
        </view>
      </view>

      <view v-else-if="component.type === 'sponsor-wall'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "合作伙伴" }}</text>
        <view v-if="sponsorItems(component).length === 0" class="cms-empty">合作伙伴待公布</view>
        <view v-else class="cms-sponsors">
          <view v-for="sponsor in sponsorItems(component)" :key="sponsor.name + sponsor.logoUrl" class="cms-sponsor">
            <image v-if="sponsor.logoUrl" class="cms-sponsor__logo" :src="sponsor.logoUrl" mode="aspectFit" />
            <text v-else class="cms-sponsor__name">{{ sponsor.name }}</text>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'faq'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "常见问题" }}</text>
        <view v-if="faqItems(component).length === 0" class="cms-empty">常见问题待补充</view>
        <view v-else class="cms-faq">
          <view v-for="item in faqItems(component)" :key="item.question" class="cms-faq__item">
            <text class="cms-faq__question" :style="textStyle(component)">{{ item.question }}</text>
            <text v-if="item.answer" class="cms-faq__answer">{{ item.answer }}</text>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'contact-card'" class="cms-section cms-contact">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "咨询报名" }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "text") || "如需团体报名，请联系会务组。" }}</text>
        <button v-if="stringConfig(component, 'phone')" class="cms-button">{{ stringConfig(component, "phone") }}</button>
      </view>

      <view v-else-if="component.type === 'title'" class="cms-title" :style="textStyle(component)">{{ stringConfig(component, "text") || "标题" }}</view>

      <view v-else-if="component.type === 'divider'" class="cms-divider" />

      <view v-else-if="component.type === 'spacer'" :style="{ height: `${numberConfig(component, 'height', 24)}rpx` }" />

      <view v-else class="cms-hidden" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import type { CmsComponent, ThemeConfig } from "@/services/cms";
import type { ConferenceDetail, ConferenceListItem } from "@/services/conference";
import { createCmsBackgroundStyle, createCmsThemeVars } from "@/theme/cmsTheme";
import { isCmsComponentUserRenderable, isCmsRegistrationCta } from "@/utils/cmsComponents";
import { formatDateTime } from "@/utils/date";

defineEmits<{
  openConference: [id: string];
  register: [];
}>();

const props = defineProps<{
  components: CmsComponent[];
  theme: ThemeConfig;
  conferences?: ConferenceListItem[];
  conference?: ConferenceDetail | null;
  suppressRegistrationCta?: boolean;
}>();

const nowTimestamp = ref(Date.now());
const failedConferenceCoverIds = ref<Set<string>>(new Set());
let countdownTimer: ReturnType<typeof setInterval> | undefined;

const visibleComponents = computed(() =>
  props.components
    .filter((item) => item.enabled)
    .filter((item) => isCmsComponentUserRenderable(item.type))
    .filter((item) => !(props.suppressRegistrationCta && isCmsRegistrationCta(item.type)))
    .sort((a, b) => a.sortOrder - b.sortOrder)
);
const conferences = computed(() => props.conferences ?? []);
const rootStyle = computed(() => ({
  ...createCmsThemeVars(props.theme),
  ...createCmsBackgroundStyle(props.theme, "body")
}));
const rootClass = computed(() => ["cms-page"]);
const showRootDynamicBackground = computed(() => props.theme.backgroundApplyTo !== "header" && props.theme.backgroundMode === "dynamic-gradient");
const showHeaderVideo = computed(() => props.theme.backgroundMode === "video" && Boolean(props.theme.backgroundVideoUrl) && props.theme.backgroundApplyTo === "header");

onMounted(() => {
  loadCustomFonts();
  countdownTimer = setInterval(() => {
    nowTimestamp.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }
});
watch(() => props.components, loadCustomFonts, { deep: true });
watch(
  () => conferences.value.map((item) => `${item.id}:${item.coverImageUrl ?? ""}`).join("|"),
  () => {
    failedConferenceCoverIds.value = new Set();
  }
);

function stringConfig(component: CmsComponent, key: string): string {
  const value = component.config?.[key];
  return typeof value === "string" ? value : "";
}

function numberConfig(component: CmsComponent, key: string, fallback: number): number {
  const value = component.config?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanConfig(component: CmsComponent, key: string, fallback = false): boolean {
  const value = component.config?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function headerBackgroundStyle(): Record<string, string> {
  return createCmsBackgroundStyle(props.theme, "header");
}

function blockClass(component: CmsComponent, index: number): string[] {
  return [
    "cms-block",
    props.theme.backgroundApplyTo === "header" && index === 0 ? "is-header-block" : "",
    isGenericFullBleed(component) ? "is-component-full-bleed" : ""
  ].filter(Boolean);
}

function blockStyle(index: number): Record<string, string> {
  if (index !== 0 || props.theme.backgroundApplyTo !== "header") return {};
  return headerBackgroundStyle();
}

function showHeaderDynamicBackground(index: number): boolean {
  return index === 0 && props.theme.backgroundApplyTo === "header" && props.theme.backgroundMode === "dynamic-gradient";
}

function isGenericFullBleed(component: CmsComponent): boolean {
  if (!booleanConfig(component, "fullBleed", false)) return false;
  return !["hero", "carousel", "floating-registration-button"].includes(component.type);
}

function arrayConfig(component: CmsComponent, key: string): unknown[] {
  const value = component.config?.[key];
  return Array.isArray(value) ? value : [];
}

interface SpeakerItem {
  name: string;
  role: string;
  bio: string;
  avatarUrl: string;
  initial: string;
}

interface ScheduleItem {
  time: string;
  title: string;
  description: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface SponsorItem {
  name: string;
  logoUrl: string;
}

interface CountdownPart {
  label: string;
  value: string;
}

function stringListConfig(component: CmsComponent, key: string): string[] {
  return arrayConfig(component, key).map((item) => String(item).trim()).filter(Boolean);
}

function speakerItems(component: CmsComponent): SpeakerItem[] {
  return arrayConfig(component, "speakers").map((item) => {
    if (isRecord(item)) {
      const name = firstString(item, ["name", "title", "speakerName"]) || "嘉宾";
      return {
        name,
        role: firstString(item, ["role", "position", "subtitle", "company", "title"]) || "",
        bio: firstString(item, ["bio", "description", "text", "summary"]) || "",
        avatarUrl: firstString(item, ["avatarUrl", "avatar", "imageUrl", "photoUrl"]) || "",
        initial: name.slice(0, 1)
      };
    }

    const parts = splitConfigLine(String(item));
    const name = parts[0] || "嘉宾";
    return {
      name,
      role: parts[1] || "",
      bio: parts.slice(2).join(" "),
      avatarUrl: firstImageUrl(parts),
      initial: name.slice(0, 1)
    };
  });
}

function scheduleItems(component: CmsComponent): ScheduleItem[] {
  return arrayConfig(component, "items").map((item) => {
    if (isRecord(item)) {
      return {
        time: firstString(item, ["time", "startAt", "period"]) || "",
        title: firstString(item, ["title", "topic", "name", "text"]) || "日程安排",
        description: firstString(item, ["description", "desc", "speaker", "location"]) || ""
      };
    }

    const parts = splitConfigLine(String(item));
    return {
      time: parts[0] || "",
      title: parts[1] || parts[0] || "日程安排",
      description: parts.slice(2).join(" ")
    };
  });
}

function faqItems(component: CmsComponent): FaqItem[] {
  return arrayConfig(component, "items").map((item) => {
    if (isRecord(item)) {
      return {
        question: firstString(item, ["question", "title", "q"]) || "常见问题",
        answer: firstString(item, ["answer", "content", "text", "a"]) || ""
      };
    }

    const parts = splitConfigLine(String(item));
    return {
      question: parts[0] || "常见问题",
      answer: parts.slice(1).join(" ")
    };
  });
}

function sponsorItems(component: CmsComponent): SponsorItem[] {
  return arrayConfig(component, "sponsors").map((item) => {
    if (isRecord(item)) {
      return {
        name: firstString(item, ["name", "title"]) || "合作伙伴",
        logoUrl: firstString(item, ["logoUrl", "imageUrl", "logo"]) || ""
      };
    }

    const text = String(item).trim();
    return looksLikeImageUrl(text) ? { name: "合作伙伴", logoUrl: text } : { name: text || "合作伙伴", logoUrl: "" };
  });
}

function countdownParts(component: CmsComponent): CountdownPart[] | null {
  const target = parseTargetTime(stringConfig(component, "targetAt"));
  if (!target) return null;
  const remainingSeconds = Math.max(0, Math.floor((target - nowTimestamp.value) / 1000));
  const days = Math.floor(remainingSeconds / 86400);
  const hours = Math.floor((remainingSeconds % 86400) / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;
  return [
    { label: "天", value: String(days).padStart(2, "0") },
    { label: "时", value: String(hours).padStart(2, "0") },
    { label: "分", value: String(minutes).padStart(2, "0") },
    { label: "秒", value: String(seconds).padStart(2, "0") }
  ];
}

function callPhone(phone: string) {
  if (!phone) return;
  uni.makePhoneCall({
    phoneNumber: phone,
    fail: () => undefined
  });
}

function limitedConferences(component: CmsComponent): ConferenceListItem[] {
  return conferences.value.slice(0, Math.max(1, numberConfig(component, "limit", 10)));
}

function showConferenceCover(component: CmsComponent, item: ConferenceListItem): boolean {
  return Boolean(booleanConfig(component, "showCover", true) && conferenceCoverUrl(item) && !failedConferenceCoverIds.value.has(item.id));
}

function conferenceCoverUrl(item: ConferenceListItem): string {
  return item.coverImageUrl?.trim() || "";
}

function conferenceCoverInitial(item: ConferenceListItem): string {
  return item.title.slice(0, 1) || "会";
}

function markConferenceCoverFailed(id: string): void {
  if (failedConferenceCoverIds.value.has(id)) {
    return;
  }
  failedConferenceCoverIds.value = new Set([...failedConferenceCoverIds.value, id]);
}

function conferenceTabs(component: CmsComponent): string[] {
  const configured = arrayConfig(component, "tabs").map(String).filter(Boolean);
  if (configured.length > 0) {
    return configured;
  }
  const locations = conferences.value.map((item) => item.location || "其他会议").filter(Boolean);
  const unique = Array.from(new Set(locations));
  return unique.length > 0 ? unique.slice(0, 5) : ["全部"];
}

function summaryFallback(component: CmsComponent): string {
  return stringConfig(component, "summaryFallback") || "点击查看会议详情和报名信息。";
}

function detailButtonText(component: CmsComponent): string {
  return stringConfig(component, "detailButtonText") || "查看详情";
}

function heroKicker(component: CmsComponent): string {
  return stringConfig(component, "kicker") || stringConfig(component, "eyebrow") || "会议报名";
}

function heroTitle(component: CmsComponent): string {
  return stringConfig(component, "title") || props.conference?.title || "选择会议，完成报名缴费";
}

function heroDescription(component: CmsComponent): string {
  return stringConfig(component, "description") || stringConfig(component, "subtitle") || props.conference?.summary || "查看会议安排、选择报名规格，支付成功后自动生成参会记录。";
}

function heroMetaLines(component: CmsComponent): string[] {
  const configured = arrayConfig(component, "meta").map(String).filter(Boolean);
  if (configured.length > 0) return configured.slice(0, 3);
  if (!props.conference) return [];
  return [
    props.conference.startsAt ? `时间 ${formatDateTime(props.conference.startsAt)}` : "",
    props.conference.location ? `地点 ${props.conference.location}` : ""
  ].filter(Boolean);
}

function heroClass(component: CmsComponent): string[] {
  return [
    "cms-hero",
    booleanConfig(component, "fullBleed", true) ? "is-full-bleed" : "",
    booleanConfig(component, "imageOnly", false) ? "is-image-only" : ""
  ].filter(Boolean);
}

function heroStyle(component: CmsComponent): Record<string, string> {
  const height = Math.max(260, numberConfig(component, "height", 430));
  return {
    "--cms-hero-height": `${height}rpx`
  };
}

function heroImageMode(component: CmsComponent): string {
  return imageCoverMode(component, "imageMode");
}

function showHeroContent(component: CmsComponent): boolean {
  if (booleanConfig(component, "imageOnly", false)) return false;
  return booleanConfig(component, "showContent", true);
}

function showHeroShade(component: CmsComponent): boolean {
  return showHeroContent(component) && booleanConfig(component, "showOverlay", true);
}

function carouselClass(component: CmsComponent): string[] {
  return ["cms-carousel", booleanConfig(component, "fullBleed", true) ? "is-full-bleed" : ""].filter(Boolean);
}

function carouselStyle(component: CmsComponent): Record<string, string> {
  const height = Math.max(160, numberConfig(component, "height", 320));
  return {
    "--cms-carousel-height": `${height}rpx`
  };
}

function carouselImageMode(component: CmsComponent): string {
  return imageCoverMode(component, "imageMode");
}

function conferenceImageMode(component: CmsComponent): string {
  return imageCoverMode(component, "cardImageMode");
}

function imageCoverMode(component: CmsComponent, key: string): string {
  const mode = stringConfig(component, key);
  if (mode === "contain") return "aspectFit";
  if (mode === "widthFix") return "widthFix";
  if (mode === "aspectFill") return "aspectFill";
  return "scaleToFill";
}

function textStyle(component: CmsComponent): Record<string, string> {
  const fontSize = numberConfig(component, "fontSize", 0);
  const fontFamily = stringConfig(component, "fontFamily");
  const textAlign = stringConfig(component, "textAlign");
  const textColor = stringConfig(component, "textColor");
  return {
    ...(fontSize > 0 ? { fontSize: `${fontSize}rpx` } : {}),
    ...(textColor ? { color: textColor } : {}),
    ...(textAlign ? { textAlign } : {}),
    ...(fontFamily ? { fontFamily: fontFamilyValue(fontFamily, component, "fontAssetUrl") } : {}),
    ...(fontFamily === "bold-sans" ? { fontWeight: "800" } : {})
  };
}

function titleStyle(component: CmsComponent): Record<string, string> {
  const fontSize = numberConfig(component, "titleFontSize", 0);
  const fontFamily = stringConfig(component, "titleFontFamily") || stringConfig(component, "fontFamily");
  const textAlign = stringConfig(component, "titleTextAlign") || stringConfig(component, "textAlign");
  const textColor = stringConfig(component, "titleTextColor") || stringConfig(component, "textColor");
  const customFontKey = stringConfig(component, "titleFontAssetUrl") ? "titleFontAssetUrl" : "fontAssetUrl";
  return {
    ...(fontSize > 0 ? { fontSize: `${fontSize}rpx` } : {}),
    ...(textColor ? { color: textColor } : {}),
    ...(textAlign ? { textAlign } : {}),
    ...(fontFamily ? { fontFamily: fontFamilyValue(fontFamily, component, customFontKey) } : {}),
    ...(fontFamily === "bold-sans" ? { fontWeight: "800" } : {})
  };
}

function conferenceTextStyle(component: CmsComponent, part: "title" | "summary" | "meta"): Record<string, string> {
  const prefix = part === "title" ? "cardTitle" : part === "summary" ? "cardSummary" : "cardMeta";
  const fallbackSize = part === "title" ? 28 : part === "summary" ? 22 : 21;
  return {
    fontSize: `${numberConfig(component, `${prefix}FontSize`, fallbackSize)}rpx`,
    color: stringConfig(component, `${prefix}Color`) || (part === "title" ? "#172033" : "#637083"),
    textAlign: stringConfig(component, `${prefix}Align`) || "left",
    fontFamily: fontFamilyValue(stringConfig(component, "fontFamily"), component, "fontAssetUrl"),
    ...(part === "title" ? { fontWeight: "800" } : {})
  };
}

function conferenceCardClass(component: CmsComponent, baseClass: string): string[] {
  return [baseClass, "is-conference-card", stringConfig(component, "cardImageLayout") === "full" ? "is-cover-full" : ""].filter(Boolean);
}

function conferenceImageClass(component: CmsComponent, baseClass: string): string[] {
  return [baseClass, stringConfig(component, "cardImageLayout") === "full" ? "is-cover-full__image" : ""].filter(Boolean);
}

function conferenceCardStyle(component: CmsComponent): Record<string, string> {
  return {
    marginTop: `${numberConfig(component, "cardMarginTop", 22)}rpx`,
    marginBottom: `${numberConfig(component, "cardMarginBottom", 0)}rpx`,
    marginLeft: `${numberConfig(component, "cardMarginX", 0)}rpx`,
    marginRight: `${numberConfig(component, "cardMarginX", 0)}rpx`,
    padding: `${numberConfig(component, "cardPadding", 26)}rpx`,
    borderRadius: `${numberConfig(component, "cardRadius", 8)}px`,
    gap: `${numberConfig(component, "cardGap", 18)}rpx`
  };
}

function conferenceImageStyle(component: CmsComponent): Record<string, string> {
  const size = conferenceThumbSize(component);
  if (stringConfig(component, "cardImageLayout") !== "full") {
    return {
      width: `${size.width}rpx`,
      height: `${size.height}rpx`,
      flexBasis: `${size.width}rpx`
    };
  }
  return {
    height: `${numberConfig(component, "cardImageHeight", 240)}rpx`,
    borderRadius: `${numberConfig(component, "cardRadius", 8)}px`
  };
}

function conferenceThumbSize(component: CmsComponent): { width: number; height: number } {
  const titleSize = numberConfig(component, "cardTitleFontSize", 28);
  const configuredWidth = numberConfig(component, "cardThumbWidth", 0);
  const width = configuredWidth > 0 ? configuredWidth : Math.min(Math.max(Math.round(titleSize * 7), 180), 260);
  const configuredHeight = numberConfig(component, "cardThumbHeight", 0);
  return {
    width,
    height: configuredHeight > 0 ? configuredHeight : Math.round(width * 0.72)
  };
}

function fontFamilyValue(value: string, component?: CmsComponent, key?: string): string {
  if (value === "custom" && component && key && stringConfig(component, key)) return fontFamilyFor(component, key);
  if (value === "serif") return "Songti SC, SimSun, serif";
  if (value === "sans") return "PingFang SC, Microsoft YaHei, sans-serif";
  if (value === "bold-sans") return "Heiti SC, Microsoft YaHei, sans-serif";
  return "inherit";
}

function fontFamilyFor(component: CmsComponent, key: string): string {
  return `cms-font-${component.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${key}`;
}

function loadCustomFonts() {
  for (const component of props.components) {
    for (const key of ["fontAssetUrl", "titleFontAssetUrl"]) {
      const url = stringConfig(component, key);
      if (!url) continue;
      uni.loadFontFace({
        family: fontFamilyFor(component, key),
        source: `url("${url}")`,
        global: true,
        success: () => undefined,
        fail: () => undefined
      });
    }
  }
}

function conferenceMetaLines(item: ConferenceListItem, component: CmsComponent, index: number): string[] {
  const parts: string[] = [];
  if (booleanConfig(component, "showTime", true)) parts.push(`会议时间：${formatDateTime(item.startsAt)}`);
  if (booleanConfig(component, "showLocation", true) && item.location) parts.push(`会议地点：${item.location}`);
  if (booleanConfig(component, "showRegistrationCount", false)) parts.push(`${registrationCountFor(item, component, index)} 人已报名`);
  return parts;
}

function registrationCountFor(item: ConferenceListItem, component: CmsComponent, index: number): number {
  const actual = typeof item.registrationCount === "number" ? item.registrationCount : 0;
  const virtual = numberConfig(component, "virtualRegistrationBase", 0) + index * numberConfig(component, "virtualRegistrationStep", 0);
  const mode = stringConfig(component, "registrationCountMode") || "actual";
  if (mode === "virtual") return virtual;
  if (mode === "actual-plus-virtual") return actual + virtual;
  return actual;
}

function titleFor(type: string): string {
  const map: Record<string, string> = {
    "ticket-price-list": "报名票种",
    "process-steps": "报名流程",
    "download-list": "资料下载",
    "testimonial-list": "参会评价",
    "tag-filter": "热门主题"
  };
  return map[type] ?? "内容";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function splitConfigLine(value: string): string[] {
  return value.split(/[\n|｜,，;；]+/).map((item) => item.trim()).filter(Boolean);
}

function firstImageUrl(items: string[]): string {
  return items.find(looksLikeImageUrl) || "";
}

function looksLikeImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(value);
}

function parseTargetTime(value: string): number | null {
  if (!value.trim()) return null;
  const normalized = value.includes("T") ? value : value.replace(/-/g, "/");
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}
</script>

<style scoped>
.cms-page {
  position: relative;
  overflow: hidden;
  min-height: auto;
  padding: 0;
  box-sizing: border-box;
  background: var(--cms-bg);
}

.cms-block {
  position: relative;
  z-index: 1;
}

.cms-block.is-header-block {
  overflow: hidden;
  padding: 18rpx 18rpx 10rpx;
  border-radius: var(--cms-radius);
}

.cms-header__video {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
}

.cms-hero,
.cms-section,
.cms-card,
.cms-notice,
.cms-title {
  position: relative;
  z-index: 1;
  border-radius: var(--cms-radius);
}

.cms-hero {
  overflow: hidden;
  padding: 0;
  background: var(--ui-color-bg-soft);
  color: var(--ui-color-muted);
}

.cms-hero.is-full-bleed {
  margin-right: -28rpx;
  margin-left: -28rpx;
  border-radius: 0;
}

.cms-hero__image {
  width: 100%;
  height: 360rpx;
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
}

.cms-section__title,
.cms-card__title,
.cms-title {
  display: block;
  font-weight: 800;
}

.cms-hero__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 360rpx;
  font-size: 26rpx;
}

.cms-section,
.cms-card,
.cms-notice,
.cms-title {
  margin-top: 22rpx;
  padding: 26rpx;
  background: var(--cms-card);
  border: 1px solid var(--ui-color-border);
  box-shadow: var(--ui-shadow-card);
}

.cms-section__title,
.cms-title {
  color: var(--ui-color-text);
  font-size: 32rpx;
}

.cms-section__text {
  display: block;
  margin-top: 12rpx;
  color: var(--ui-color-muted);
  font-size: 26rpx;
  line-height: 1.55;
}

.cms-section__image {
  width: 100%;
  height: 260rpx;
  margin-bottom: 18rpx;
  border-radius: var(--cms-radius);
}

.cms-card {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  border: 1px solid var(--ui-color-border);
}

.cms-card.is-conference-card,
.cms-mini-card.is-conference-card {
  overflow: hidden;
  border: 1px solid rgba(36, 82, 168, 0.08);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 250, 255, 0.96));
  box-shadow: 0 16rpx 36rpx rgba(15, 23, 42, 0.08);
}

.cms-mini-card {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  padding: 18rpx;
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
}

.cms-card.is-cover-full,
.cms-mini-card.is-cover-full {
  flex-direction: column;
  align-items: stretch;
}

.cms-card__image {
  width: 180rpx;
  height: 136rpx;
  flex: 0 0 180rpx;
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
}

.cms-card__image.is-cover-full__image,
.cms-mini-card__image.is-cover-full__image {
  width: 100%;
  flex: none;
  background: var(--ui-color-surface-muted);
}

.cms-mini-card__image {
  width: 150rpx;
  height: 112rpx;
  flex: 0 0 150rpx;
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
}

.cms-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8rpx;
}

.cms-card__title {
  color: var(--ui-color-text);
  font-size: 28rpx;
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.cms-card__text,
.cms-card__meta,
.cms-empty {
  color: var(--ui-color-muted);
  font-size: 23rpx;
  line-height: 1.45;
}

.cms-card__text,
.cms-card__meta {
  display: block;
  margin-top: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.cms-card__meta {
  display: inline-flex;
  align-self: flex-start;
  max-width: 100%;
  padding: 10rpx 14rpx;
  border-radius: 999rpx;
  background: rgba(36, 82, 168, 0.06);
}

.cms-card__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  min-width: 148rpx;
  min-height: 58rpx;
  line-height: 58rpx;
  margin: 10rpx 0 0;
  padding: 0 24rpx;
  border: 0;
  border-radius: 999rpx;
  background: linear-gradient(135deg, var(--cms-primary), var(--cms-secondary));
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 800;
  box-shadow: 0 14rpx 28rpx rgba(36, 82, 168, 0.18);
}

.cms-button,
.cms-floating {
  border-radius: var(--cms-radius);
  background: var(--cms-primary);
  color: #ffffff;
  font-weight: 800;
  min-height: 78rpx;
  line-height: 78rpx;
}

.cms-button--outline {
  border: 1px solid var(--ui-color-border);
  background: var(--ui-color-surface);
  color: var(--cms-primary);
}

.cms-tabs {
  display: flex;
  gap: 12rpx;
  margin-top: 18rpx;
  overflow-x: auto;
  white-space: nowrap;
}

.cms-tab {
  flex: 0 0 auto;
  padding: 12rpx 22rpx;
  border-radius: 999rpx;
  background: var(--ui-color-primary-soft);
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 700;
}

.cms-tab.active {
  background: var(--cms-primary);
  color: #ffffff;
}

.cms-register {
  margin-top: 24rpx;
}

.cms-floating {
  position: fixed;
  left: 32rpx;
  right: 32rpx;
  bottom: 128rpx;
  z-index: 20;
}

.cms-carousel {
  margin-top: 22rpx;
}

.cms-carousel.is-full-bleed {
  margin-right: -28rpx;
  margin-left: -28rpx;
}

.cms-swiper {
  height: var(--cms-carousel-height, 320rpx);
  overflow: hidden;
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
}

.cms-carousel.is-full-bleed .cms-swiper {
  border-radius: 0;
}

.cms-swiper__slide {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: var(--cms-carousel-height, 320rpx);
  background: var(--cms-surface-muted);
}

.cms-swiper__image {
  position: relative;
  z-index: 1;
  width: 100%;
  height: var(--cms-carousel-height, 320rpx);
  background: var(--cms-surface-muted);
}

.cms-empty-card {
  margin-top: 22rpx;
  padding: 28rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--cms-radius);
  background: var(--cms-card);
}

.cms-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 22rpx;
}

.cms-grid .cms-empty-card {
  width: 100%;
  box-sizing: border-box;
}

.cms-grid__image {
  width: 31%;
  height: 160rpx;
  border-radius: var(--cms-radius);
}

.cms-video {
  width: 100%;
  margin-top: 16rpx;
}

.cms-notice {
  color: var(--ui-color-warning);
  background: #fff7e8;
}

.cms-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 18rpx;
}

.cms-stat,
.cms-list-line {
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
  color: var(--ui-color-text);
  font-size: 25rpx;
  line-height: 1.45;
}

.cms-stat {
  width: 31%;
  min-height: 86rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12rpx;
  text-align: center;
  font-weight: 800;
}

.cms-list-lines {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 18rpx;
}

.cms-list-line {
  padding: 18rpx;
}

.cms-live {
  border: 1px solid rgba(31, 95, 191, 0.22);
}

.cms-speakers,
.cms-timeline,
.cms-faq,
.cms-map-contact__body {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  margin-top: 18rpx;
}

.cms-speaker,
.cms-faq__item,
.cms-timeline__item {
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
}

.cms-speaker {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  padding: 20rpx;
}

.cms-speaker__avatar {
  width: 88rpx;
  height: 88rpx;
  flex: 0 0 88rpx;
  border-radius: 50%;
  background: var(--ui-color-primary-soft);
}

.cms-speaker__avatar--text {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cms-primary);
  font-size: 32rpx;
  font-weight: 900;
}

.cms-speaker__body {
  flex: 1;
  min-width: 0;
}

.cms-speaker__name,
.cms-timeline__title,
.cms-faq__question,
.cms-sponsor__name {
  display: block;
  color: var(--ui-color-text);
  font-weight: 800;
  line-height: 1.4;
}

.cms-speaker__role,
.cms-speaker__bio,
.cms-timeline__desc,
.cms-faq__answer {
  display: block;
  margin-top: 6rpx;
  color: var(--ui-color-muted);
  font-size: 24rpx;
  line-height: 1.5;
}

.cms-timeline {
  position: relative;
}

.cms-timeline__item {
  display: flex;
  gap: 18rpx;
  padding: 18rpx;
}

.cms-timeline__time {
  width: 120rpx;
  flex: 0 0 120rpx;
  color: var(--cms-primary);
  font-size: 24rpx;
  font-weight: 900;
  line-height: 1.45;
}

.cms-timeline__content {
  flex: 1;
  min-width: 0;
}

.cms-countdown {
  display: flex;
  gap: 12rpx;
  margin-top: 18rpx;
}

.cms-countdown__item {
  flex: 1;
  min-height: 104rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: var(--cms-radius);
  background: var(--ui-color-primary-soft);
}

.cms-countdown__value {
  color: var(--cms-primary);
  font-size: 34rpx;
  font-weight: 900;
}

.cms-countdown__label {
  margin-top: 4rpx;
  color: var(--ui-color-muted);
  font-size: 22rpx;
}

.cms-sponsors {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 18rpx;
}

.cms-sponsor {
  width: 48%;
  min-height: 96rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--cms-radius);
  background: var(--ui-color-surface-muted);
  box-sizing: border-box;
}

.cms-sponsor__logo {
  width: 100%;
  height: 64rpx;
}

.cms-sponsor__name {
  color: var(--ui-color-muted);
  font-size: 24rpx;
  text-align: center;
}

.cms-faq__item {
  padding: 20rpx;
}

.cms-contact .cms-button {
  margin-top: 18rpx;
}

.cms-divider {
  height: 1px;
  margin: 26rpx 0;
  background: var(--ui-color-border);
}

.cms-hidden {
  display: none;
}

/* Phase 10 visual system overrides */
.cms-page {
  overflow: visible;
  background: transparent;
}

.cms-block + .cms-block {
  margin-top: var(--cms-space-section-y);
}

.cms-block.is-header-block {
  margin-right: -28rpx;
  margin-left: -28rpx;
  padding: 22rpx var(--cms-space-page-x) 28rpx;
  border-radius: 0 0 var(--cms-radius-xxl) var(--cms-radius-xxl);
}

.cms-hero,
.cms-section,
.cms-card,
.cms-mini-card,
.cms-notice,
.cms-title {
  border-radius: var(--cms-radius-lg);
}

.cms-hero {
  min-height: var(--cms-hero-height, 430rpx);
  background: var(--cms-gradient-hero);
  box-shadow: var(--cms-shadow-lg);
}

.cms-hero.is-full-bleed {
  margin-right: -28rpx;
  margin-left: -28rpx;
  border-radius: 0;
}

.cms-hero__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--cms-gradient-hero);
}

.cms-hero__image--generated {
  z-index: 0;
  background:
    radial-gradient(circle at 12% 16%, rgba(255, 255, 255, 0.38) 0, transparent 26%),
    radial-gradient(circle at 86% 18%, rgba(255, 255, 255, 0.18) 0, transparent 24%),
    var(--cms-gradient-hero);
}

.cms-hero__shade {
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(10, 16, 28, 0.74), rgba(10, 16, 28, 0.34) 56%, rgba(10, 16, 28, 0.08));
}

.cms-hero__content {
  position: relative;
  z-index: 2;
  display: flex;
  min-height: var(--cms-hero-height, 430rpx);
  flex-direction: column;
  justify-content: flex-end;
  gap: 14rpx;
  padding: 42rpx var(--cms-space-page-x);
  box-sizing: border-box;
}

.cms-hero__kicker {
  align-self: flex-start;
  padding: 8rpx 16rpx;
  border-radius: var(--cms-radius-full);
  background: rgba(255, 255, 255, 0.18);
  color: var(--cms-text-inverse);
  font-size: 23rpx;
  font-weight: 900;
}

.cms-hero__title {
  display: block;
  max-width: 640rpx;
  color: var(--cms-text-inverse);
  font-size: var(--cms-title-size);
  font-weight: 900;
  line-height: 1.18;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.cms-hero__desc {
  display: block;
  max-width: 650rpx;
  color: rgba(255, 255, 255, 0.84);
  font-size: 27rpx;
  line-height: 1.52;
  overflow-wrap: anywhere;
}

.cms-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}

.cms-hero__meta text {
  padding: 8rpx 14rpx;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: var(--cms-radius-full);
  color: rgba(255, 255, 255, 0.88);
  font-size: 22rpx;
}

.cms-hero__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  min-width: 190rpx;
  min-height: 72rpx;
  margin: 8rpx 0 0;
  padding: 0 30rpx;
  border: 0;
  border-radius: var(--cms-radius-full);
  background: var(--cms-text-inverse);
  color: var(--cms-primary-strong);
  font-size: 26rpx;
  font-weight: 900;
  line-height: 72rpx;
  box-shadow: 0 18rpx 40rpx rgba(0, 0, 0, 0.18);
}

.cms-hero__button text {
  line-height: 1;
}

.cms-section,
.cms-card,
.cms-notice,
.cms-title {
  padding: var(--cms-space-card-padding);
  border: 1px solid var(--cms-border);
  background: var(--cms-gradient-card);
  box-shadow: var(--cms-shadow-md);
}

.cms-block.is-component-full-bleed > .cms-section,
.cms-block.is-component-full-bleed > .cms-card,
.cms-block.is-component-full-bleed > .cms-mini-card,
.cms-block.is-component-full-bleed > .cms-grid,
.cms-block.is-component-full-bleed > .cms-notice,
.cms-block.is-component-full-bleed > .cms-title,
.cms-block.is-component-full-bleed > .cms-register {
  margin-right: -28rpx;
  margin-left: -28rpx;
  border-right-width: 0;
  border-left-width: 0;
  border-radius: 0;
}

.cms-section__title,
.cms-title {
  color: var(--cms-text-primary);
  font-size: 34rpx;
  line-height: 1.28;
}

.cms-section__text,
.cms-card__text,
.cms-card__meta,
.cms-empty {
  color: var(--cms-text-secondary);
}

.cms-section__image,
.cms-swiper,
.cms-swiper__image,
.cms-grid__image {
  border-radius: var(--cms-radius-lg);
}

.cms-carousel.is-full-bleed .cms-swiper,
.cms-carousel.is-full-bleed .cms-swiper__image {
  border-radius: 0;
}

.cms-card.is-conference-card,
.cms-mini-card.is-conference-card {
  gap: 22rpx;
  border: 1px solid var(--cms-border);
  background: var(--cms-surface-elevated);
  box-shadow: var(--cms-shadow-md);
}

.cms-card__image,
.cms-mini-card__image {
  overflow: hidden;
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-muted);
}

.cms-card__image--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cms-gradient-soft);
  color: var(--cms-primary-strong);
  font-size: 34rpx;
  font-weight: 900;
}

.cms-card__title {
  color: var(--cms-text-primary);
  font-size: 30rpx;
  line-height: 1.32;
  overflow-wrap: anywhere;
}

.cms-card__body {
  gap: 10rpx;
}

.cms-card__meta {
  padding: 8rpx 13rpx;
  background: var(--cms-primary-soft);
  color: var(--cms-primary-strong);
  overflow-wrap: anywhere;
}

.cms-card__button,
.cms-button,
.cms-floating {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--cms-radius-full);
  background: var(--cms-gradient-cta);
  color: var(--cms-text-inverse);
  box-shadow: 0 16rpx 32rpx rgba(31, 77, 122, 0.18);
}

.cms-card__button text {
  line-height: 1;
}

.cms-tabs {
  padding-bottom: 4rpx;
}

.cms-tab {
  background: var(--cms-primary-soft);
  color: var(--cms-primary-strong);
}

.cms-tab.active {
  background: var(--cms-gradient-cta);
  color: var(--cms-text-inverse);
}

.cms-notice {
  border-color: var(--cms-warning-soft);
  background: var(--cms-warning-soft);
  color: var(--cms-warning);
  font-weight: 800;
}

.cms-stat,
.cms-list-line,
.cms-speaker,
.cms-faq__item,
.cms-timeline__item,
.cms-countdown__item,
.cms-sponsor {
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-soft);
}

.cms-stat {
  color: var(--cms-primary-strong);
}

.cms-timeline__time,
.cms-countdown__value,
.cms-speaker__avatar--text {
  color: var(--cms-primary-strong);
}

.cms-speaker__avatar,
.cms-countdown__item {
  background: var(--cms-primary-soft);
}

.cms-faq__answer,
.cms-speaker__role,
.cms-speaker__bio,
.cms-timeline__desc,
.cms-sponsor__name {
  color: var(--cms-text-secondary);
}

.cms-divider {
  background: var(--cms-divider);
}
</style>
