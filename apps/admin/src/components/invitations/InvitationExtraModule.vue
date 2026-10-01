<template>
  <div class="invitation-extra-module">
    <video
      v-if="module.type === 'video'"
      :key="settings.mediaUrl"
      :src="assetUrl(settings.mediaUrl)"
      :poster="assetUrl(settings.posterUrl)"
      controls
      playsinline
      preload="metadata"
      :aria-label="module.title || '会议视频'"
      :style="{ aspectRatio: settings.ratio, objectFit: settings.fit }"
      @error="mediaFailed = true"
      @loadedmetadata="mediaFailed = false"
    />
    <audio
      v-else-if="module.type === 'audio'"
      :key="settings.mediaUrl"
      :src="assetUrl(settings.mediaUrl)"
      controls
      preload="metadata"
      :aria-label="module.title || '会议音频'"
      @error="mediaFailed = true"
      @loadedmetadata="mediaFailed = false"
    />
    <InvitationCarousel
      v-else-if="module.type === 'carousel'"
      :asset-origin="assetOrigin"
      :items="items"
      :settings="settings"
    />
    <InvitationMap
      v-else-if="module.type === 'map'"
      :settings="settings"
      :title="module.title"
    />
    <div v-else-if="module.type === 'tabs'" class="invitation-content-tabs">
      <div
        role="tablist"
        :aria-label="module.title || '内容标签'"
        class="content-tabs-nav"
        @keydown="navigateTab"
      >
        <button
          v-for="(item, index) in items"
          :id="`${scope}-tab-${index}`"
          :key="item.id"
          role="tab"
          :aria-selected="tab === index"
          :aria-controls="`${scope}-panel-${index}`"
          :tabindex="tab === index ? 0 : -1"
          @click="tab = index"
        >
          {{ item.title || `标签 ${index + 1}` }}
        </button>
      </div>
      <section
        v-if="items[tab]"
        :id="`${scope}-panel-${tab}`"
        role="tabpanel"
        :aria-labelledby="`${scope}-tab-${tab}`"
        tabindex="0"
        class="content-tab-panel"
      >
        <img
          v-if="items[tab].imageUrl"
          :src="assetUrl(items[tab].imageUrl)"
          :alt="items[tab].title"
          loading="lazy"
        />
        <div
          class="extra-rich-body"
          v-html="invitationRichTextHtml(items[tab].body, assetOrigin)"
        />
        <a
          v-if="items[tab].href"
          :href="items[tab].href"
          target="_blank"
          rel="noopener noreferrer"
          >了解更多<ArrowRight
        /></a>
      </section>
    </div>
    <div
      v-else-if="module.type === 'links'"
      class="invitation-link-list"
      :class="settings.layout"
    >
      <a
        v-for="item in items.filter((item) => item.href)"
        :key="item.id"
        :href="item.href"
        :target="item.href.startsWith('https:') ? '_blank' : undefined"
        rel="noopener noreferrer"
        ><component :is="icons[item.icon] || Link" />
        <div>
          <strong>{{ item.title }}</strong>
          <p v-if="item.description">{{ item.description }}</p>
        </div>
        <ArrowRight
      /></a>
    </div>
    <div v-else-if="module.type === 'search'" class="invitation-content-search">
      <label
        ><Search /><input
          v-model="query"
          type="search"
          aria-label="搜索邀请函内容"
          placeholder="搜索议程、嘉宾或单位"
      /></label>
      <div v-if="query.trim()" class="content-search-results">
        <p role="status">找到 {{ results.length }} 条结果</p>
        <button
          v-for="item in results.slice(0, 30)"
          :key="`${item.type}-${item.id}`"
          @click="$emit('navigate', item)"
        >
          <span>{{ item.label }}</span>
          <div>
            <strong>{{ item.title }}</strong
            ><small>{{ item.description }}</small>
          </div>
          <ArrowRight />
        </button>
      </div>
    </div>
    <p
      v-if="mediaFailed && (module.type === 'audio' || module.type === 'video')"
      class="media-error"
      role="status"
    >
      媒体暂时无法播放，请稍后重试。
    </p>
  </div>
</template>
<script setup lang="ts">
import { computed, defineAsyncComponent, ref, useId, watch } from "vue";
import {
  Link,
  Location,
  Calendar,
  Phone,
  Ticket,
  VideoPlay,
  Document,
  Star,
  ArrowRight,
  Search,
} from "@element-plus/icons-vue";
import {
  invitationRichTextHtml,
  normalizeInvitationModuleSettings,
  type InvitationContent,
  type InvitationModule,
} from "@conference/shared";
const InvitationCarousel = defineAsyncComponent(
  () => import("./InvitationCarousel.vue"),
);
const InvitationMap = defineAsyncComponent(() => import("./InvitationMap.vue"));
const props = defineProps<{
  module: InvitationModule;
  content: InvitationContent;
  assetOrigin: string;
}>();
defineEmits<{
  navigate: [item: { type: string; id: string; date?: string }];
}>();
const settings = computed(() =>
    normalizeInvitationModuleSettings(props.module.settings),
  ),
  items = computed(() => props.module.items || []),
  tab = ref(0),
  query = ref("");
const mediaFailed = ref(false);
watch(
  () => settings.value.mediaUrl,
  () => {
    mediaFailed.value = false;
  },
);
const icons: Record<string, unknown> = {
  link: Link,
  location: Location,
  calendar: Calendar,
  phone: Phone,
  ticket: Ticket,
  video: VideoPlay,
  document: Document,
  star: Star,
};
const scope = `invite-tabs-${useId()}`;
const assetUrl = (url: string) =>
  url.startsWith("/uploads/") ? props.assetOrigin + url : url;
watch(items, () => {
  tab.value = Math.max(0, Math.min(tab.value, items.value.length - 1));
});
function navigateTab(event: KeyboardEvent) {
  const moves: Record<string, number> = {
    ArrowRight: (tab.value + 1) % items.value.length,
    ArrowLeft: (tab.value - 1 + items.value.length) % items.value.length,
    Home: 0,
    End: items.value.length - 1,
  };
  if (event.key in moves && items.value.length) {
    event.preventDefault();
    tab.value = moves[event.key];
    (event.currentTarget as HTMLElement)
      .querySelectorAll<HTMLButtonElement>("[role=tab]")
      [tab.value]?.focus();
  }
}
const results = computed(() => {
  const enabled = new Set(
    props.content.modules
      .filter((module) => module.enabled)
      .map((module) => module.type),
  );
  const entries = [
    ...(enabled.has("agenda")
      ? props.content.agenda.map((item) => ({
          type: "agenda",
          id: item.id,
          title: item.title,
          description: item.speaker,
          date: item.date,
          label: "议程",
        }))
      : []),
    ...(enabled.has("guests")
      ? props.content.guests.map((item) => ({
          type: "guests",
          id: item.id,
          title: item.name,
          description: [item.organization, item.role, item.biography]
            .filter(Boolean)
            .join(" · "),
          label: "嘉宾",
        }))
      : []),
    ...(enabled.has("invitees")
      ? props.content.invitees.map((item) => ({
          type: "invitees",
          id: item.id,
          title: item.name,
          description: [item.organization, item.role]
            .filter(Boolean)
            .join(" · "),
          label: "拟邀",
        }))
      : []),
  ];
  return entries.filter((item) =>
    `${item.title} ${item.description}`
      .toLocaleLowerCase()
      .includes(query.value.trim().toLocaleLowerCase()),
  );
});
</script>
<style scoped>
.invitation-extra-module {
  min-width: 0;
}
.invitation-extra-module > video {
  width: 100%;
  display: block;
  background: #1f2528;
  border-radius: 4px;
}
.invitation-extra-module > audio {
  width: 100%;
  display: block;
}
.media-error {
  font-size: 13px;
  line-height: 1.7;
  color: inherit;
}
.content-tabs-nav {
  display: flex;
  overflow-x: auto;
  border-bottom: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  gap: 6px;
}
.content-tabs-nav button {
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 12px 18px;
  font: inherit;
  font-size: 15px;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}
.content-tabs-nav button[aria-selected="true"] {
  color: var(--invite-primary);
  border-bottom-color: var(--invite-primary);
  font-weight: 600;
}
.content-tab-panel {
  padding-top: 24px;
}
.content-tab-panel > img {
  max-width: 100%;
  height: auto;
  display: block;
  margin-bottom: 20px;
}
.content-tab-panel a {
  color: var(--invite-primary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
.extra-rich-body {
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.extra-rich-body :deep(img) {
  max-width: 100%;
  height: auto;
}
.extra-rich-body :deep(p) {
  margin: 0 0 1em;
}
.invitation-link-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 32px;
}
.invitation-link-list.list {
  grid-template-columns: 1fr;
}
.invitation-link-list a {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 0;
  border-bottom: 1px solid color-mix(in srgb, currentColor 16%, transparent);
  color: inherit;
  text-decoration: none;
  min-width: 0;
}
.invitation-link-list a > svg {
  color: var(--invite-primary);
  flex-shrink: 0;
  width: 24px;
  height: 24px;
}
.invitation-link-list a > svg:last-child {
  width: 16px;
  margin-left: auto;
}
.invitation-link-list strong {
  font-size: 17px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.invitation-link-list p {
  font-size: 13px;
  line-height: 1.7;
  margin: 5px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.invitation-content-search > label {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, var(--invite-paper) 85%, transparent);
}
.invitation-content-search input {
  border: 0;
  background: transparent;
  color: inherit;
  outline: 0;
  min-width: 0;
  flex: 1;
  font: inherit;
  font-size: 16px;
}
.invitation-content-search label:focus-within {
  outline: 2px solid var(--invite-primary);
  outline-offset: 2px;
}
.invitation-extra-module svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.content-search-results > p {
  font-size: 12px;
  margin: 18px 0 6px;
}
.content-search-results > button {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  text-align: left;
  padding: 16px 0;
  border: 0;
  border-bottom: 1px solid #dce4e1;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}
.content-search-results > button > span {
  font-size: 11px;
  color: var(--invite-primary);
  flex-shrink: 0;
}
.content-search-results > button > div {
  min-width: 0;
  flex: 1;
}
.content-search-results strong {
  font-size: 15px;
  font-weight: 500;
  display: block;
  overflow-wrap: anywhere;
}
.content-search-results small {
  font-size: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.content-search-results svg {
  width: 16px;
}
@media (max-width: 600px) {
  .invitation-link-list {
    grid-template-columns: 1fr;
  }
}
</style>
