<template>
  <article
    ref="documentElement"
    class="invitation-document"
    :class="[
      `invitation-theme--${content.theme}`,
      `invitation-layout--${content.heroLayout}`,
      `invitation-preset--${content.visualPreset}`,
      { 'invitation-motion': effects.entrance !== 'none' },
      `invitation-entrance--${effects.entrance}`,
      `invitation-cover-effect--${effects.cover}`,
      { 'invitation-chapters': effects.scroll === 'chapters' },
      { 'invitation-preview': preview },
      {
        'invitation-unified-font':
          design.replaceAllFonts && !!pageFont.family.value,
      },
      { 'has-page-background': !!design.backgroundImage },
    ]"
    :style="themeStyle"
  >
    <div
      v-if="design.backgroundImage"
      class="invitation-page-background"
      :class="[
        `background-${design.backgroundMotion}`,
        {
          'background-wave-pattern':
            design.backgroundImage === '/invitation-art/booklet-pattern.jpg',
        },
      ]"
      :style="{
        backgroundImage: `url(${JSON.stringify(assetUrl(design.backgroundImage))})`,
        opacity: design.backgroundOpacity / 100,
      }"
      aria-hidden="true"
    />
    <span
      v-if="preview && pageFont.status.value === 'error'"
      class="invitation-font-warning"
      role="status"
      >自定义字体加载失败，已使用系统字体</span
    >
    <header v-if="cover.mode === 'artwork'" class="invitation-artwork-cover">
      <InvitationCoverCanvas
        :cover="cover"
        :src="assetUrl(content.coverImageUrl)"
        :title="content.title"
        :name="document.recipient.name"
        :salutation="document.recipient.salutation"
        :organization="rosterMatch.item?.organization"
        :role="rosterMatch.item?.role"
        :date="content.dateLabel"
        :location="content.location"
        :custom-font="pageFont.customFamily.value"
        :font-family="design.replaceAllFonts ? pageFont.family.value : ''"
      />
    </header>
    <header v-else class="invitation-hero">
      <img
        v-if="content.coverImageUrl"
        class="invitation-hero__image"
        :src="assetUrl(content.coverImageUrl)"
        :alt="content.title"
        fetchpriority="high"
        :style="{ objectPosition: content.heroPosition }"
      />
      <div class="invitation-hero__shade" />
      <div class="invitation-hero__brand">
        <img
          v-if="content.logoUrl"
          :src="assetUrl(content.logoUrl)"
          :alt="content.host"
        /><span v-else>{{ content.host || "观潮会集" }}</span
        ><span class="invitation-hero__label">专属邀请函</span>
      </div>
      <div class="invitation-hero__copy">
        <div class="invitation-hero__recipient">
          <span>{{ isBooklet ? "诚挚邀请" : "诚挚相邀" }}</span
          ><strong>{{ document.recipient.name || "嘉宾" }}</strong
          ><span>{{ document.recipient.salutation }}</span>
        </div>
        <p v-if="content.subtitle">{{ content.subtitle }}</p>
        <h1>{{ content.title || "会议邀请函" }}</h1>
        <div
          v-if="content.dateLabel || content.location"
          class="invitation-hero__facts"
        >
          <span v-if="content.dateLabel"
            ><Calendar />{{ content.dateLabel }}</span
          ><span v-if="content.location"
            ><Location />{{ content.location }}</span
          >
        </div>
      </div>
      <a
        class="invitation-hero__scroll"
        :href="modules[0] ? `#${moduleAnchor(modules[0])}` : '#'"
        aria-label="阅读邀请函"
        ><ArrowDown
      /></a>
    </header>
    <nav
      v-if="navigationLinks.length"
      class="invitation-nav"
      :class="{ 'invitation-nav--flow': !navigation.sticky }"
      aria-label="邀请函章节"
    >
      <a
        v-for="item in navigationLinks"
        :key="item.module.id"
        :href="`#${moduleAnchor(item.module)}`"
        >{{ item.label }}</a
      >
    </nav>
    <div
      v-for="module in modules"
      :key="module.id"
      class="invitation-module-wrap"
      :data-module-id="module.id"
      :class="{
        'custom-module-text': !!module.style?.textColor,
        'custom-module-background':
          !!module.style?.backgroundColor || !!module.style?.backgroundImage,
        'center-module-heading': module.style?.align === 'center',
      }"
      :style="moduleStyle(module)"
    >
      <section
        v-if="module.type === 'letter'"
        id="invitation-letter"
        class="invitation-section invitation-letter"
      >
        <span class="invitation-letter__eyebrow">{{
          module.title || "诚挚相邀"
        }}</span>
        <div v-if="isBooklet" class="invitation-section__heading">
          <span>{{ sectionNumbers.letter }}</span>
          <h2>{{ module.title }}</h2>
        </div>
        <h2 v-else>
          尊敬的<span>{{ document.recipient.name || "嘉宾" }}</span
          >{{ document.recipient.salutation }}：
        </h2>
        <div
          v-if="module.body.length"
          class="invitation-rich-body"
          v-html="richHtml(module)"
        />
        <template v-else
          ><p
            v-for="(paragraph, index) in paragraphs"
            :key="index"
            class="invitation-letter__paragraph"
          >
            {{ paragraph }}
          </p></template
        >
        <div v-if="!isBooklet" class="invitation-letter__signature">
          <span>期待与您相见</span
          ><strong>{{ content.host || "观潮会集" }}</strong>
        </div>
      </section>
      <section
        v-if="module.type === 'highlights'"
        id="invitation-highlights"
        class="invitation-band"
      >
        <div class="invitation-section">
          <div class="invitation-section__heading">
            <span>{{ sectionNumbers.highlights }}</span>
            <h2>{{ module.title }}</h2>
          </div>
          <div class="invitation-highlights">
            <div
              v-for="(item, index) in content.highlights"
              :key="item.id"
              class="invitation-highlight"
            >
              <span class="invitation-highlight__index">{{
                String(index + 1).padStart(2, "0")
              }}</span>
              <div>
                <h3>{{ item.title }}</h3>
                <p>{{ item.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section
        v-if="module.type === 'agenda'"
        id="invitation-agenda"
        class="invitation-section"
      >
        <div class="invitation-section__heading">
          <span>{{ sectionNumbers.agenda }}</span>
          <h2>{{ module.title }}</h2>
        </div>
        <div
          v-if="days.length > 1 && !continuousAgenda"
          class="invitation-days"
          role="tablist"
          aria-label="议程日期"
        >
          <button
            v-for="day in days"
            :key="day"
            role="tab"
            :aria-selected="selectedDay === day"
            :class="{ active: selectedDay === day }"
            @click="selectedDay = day"
          >
            {{ day || "会议当天" }}
          </button>
        </div>
        <div class="invitation-agenda" :style="agendaStyle">
          <template v-for="(item, index) in agenda" :key="item.id">
            <h3
              v-if="
                continuousAgenda &&
                (index === 0 || agenda[index - 1].date !== item.date)
              "
              class="invitation-agenda__day"
            >
              {{ item.date || "会议当天" }}
            </h3>
            <div :data-agenda-id="item.id" class="invitation-agenda__row">
              <time>{{ item.time }}</time>
              <div>
                <h3>{{ item.title }}</h3>
                <div
                  v-if="item.speaker || item.imageUrl"
                  class="invitation-agenda__speaker"
                >
                  <img
                    v-if="item.imageUrl"
                    :src="assetUrl(item.imageUrl)"
                    :alt="item.speaker || '嘉宾头像'"
                    loading="lazy"
                  />
                  <p v-if="item.speaker">{{ item.speaker }}</p>
                </div>
                <small v-if="item.location">{{ item.location }}</small>
              </div>
            </div>
          </template>
        </div>
        <p class="invitation-footnote">议程及嘉宾安排以最新公布为准</p>
      </section>
      <section
        v-if="module.type === 'guests'"
        id="invitation-guests"
        class="invitation-band"
      >
        <div class="invitation-section">
          <div class="invitation-section__heading">
            <span>{{ sectionNumbers.guests }}</span>
            <h2>{{ module.title }}</h2>
          </div>
          <div
            class="invitation-guests"
            :class="{
              'invitation-guests--list': module.settings?.layout === 'list',
            }"
          >
            <article
              v-for="guest in content.guests"
              :key="guest.id"
              :data-guest-id="guest.id"
              class="invitation-guest"
            >
              <div v-if="guest.imageUrl" class="invitation-guest__portrait">
                <img
                  :src="assetUrl(guest.imageUrl)"
                  :alt="guest.name"
                  loading="lazy"
                />
              </div>
              <div class="invitation-guest__info">
                <span class="invitation-guest__status">{{
                  guest.status === "CONFIRMED" ? "确认出席" : "拟邀嘉宾"
                }}</span>
                <h3>{{ guest.name }}</h3>
                <p>{{ guest.organization }}</p>
                <small>{{ guest.role }}</small>
                <p v-if="guest.biography" class="invitation-guest__biography">
                  {{ guest.biography }}
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>
      <section
        v-if="module.type === 'invitees'"
        id="invitation-list"
        class="invitation-section"
      >
        <div class="invitation-section__heading">
          <span>{{ sectionNumbers.invitees }}</span>
          <h2>{{ module.title }}</h2>
          <small>{{ content.invitees.length }} 位</small>
        </div>
        <div v-if="content.invitees.length" class="invitation-roster-tools">
          <label class="invitation-search"
            ><Search /><input
              v-model="keyword"
              type="search"
              aria-label="查找拟邀嘉宾或机构"
              placeholder="查找姓名或机构"
          /></label>
          <button
            v-if="rosterMatch.item"
            class="invitation-locate"
            @click="locateRecipient"
          >
            <Aim />查看我的位置
          </button>
        </div>
        <table v-if="content.invitees.length" class="invitation-roster">
          <caption class="invitation-sr-only">
            公开拟邀嘉宾名单
          </caption>
          <colgroup>
            <col class="roster-number" />
            <col class="roster-name" />
            <col />
            <col class="roster-role" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">序号</th>
              <th scope="col">姓名</th>
              <th scope="col">单位</th>
              <th scope="col">职务</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="person in visibleInvitees"
              :key="person.id"
              :data-roster-id="person.id"
              :class="{ 'is-recipient': rosterMatch.item?.id === person.id }"
              :aria-current="
                rosterMatch.item?.id === person.id ? 'true' : undefined
              "
            >
              <td>{{ rosterPositions.get(person.id) }}</td>
              <th scope="row">
                {{ person.name
                }}<small v-if="rosterMatch.item?.id === person.id">您</small>
              </th>
              <td>{{ person.organization || "—" }}</td>
              <td>{{ person.role || "—" }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!filteredInvitees.length" class="invitation-footnote">
          {{
            content.invitees.length
              ? "没有找到相关嘉宾"
              : "拟邀嘉宾名单持续更新中。"
          }}
        </p>
        <div v-if="rosterPages > 1" class="invitation-roster-pages">
          <span aria-live="polite"
            >{{ rosterPage }} / {{ rosterPages }} 页 ·
            {{ filteredInvitees.length }} 位</span
          ><button
            :disabled="rosterPage <= 1"
            aria-label="名单上一页"
            @click="rosterPage--"
          >
            <ArrowLeft /></button
          ><button
            :disabled="rosterPage >= rosterPages"
            aria-label="名单下一页"
            @click="rosterPage++"
          >
            <ArrowRight />
          </button>
        </div>
        <p class="invitation-footnote">拟邀名单，不代表已确认出席</p>
      </section>
      <section
        v-if="module.type === 'venue'"
        id="invitation-venue"
        class="invitation-band"
      >
        <div class="invitation-section">
          <div class="invitation-section__heading">
            <span>{{ sectionNumbers.venue }}</span>
            <h2>{{ module.title }}</h2>
          </div>
          <dl
            v-if="module.settings?.venueMode === 'custom'"
            class="invitation-facts invitation-facts--custom"
          >
            <div
              v-for="item in invitationVenueItems(content, module)"
              :key="item.id"
            >
              <dt>
                <component :is="venueIcons[item.icon] || Link" /><span>{{
                  item.title
                }}</span>
              </dt>
              <dd>
                <a
                  v-if="item.href"
                  :href="item.href"
                  :target="
                    item.href.startsWith('https://') ? '_blank' : undefined
                  "
                  rel="noopener noreferrer"
                  >{{ item.description || item.title || "查看详情" }}</a
                >
                <span v-else>{{ item.description }}</span>
              </dd>
            </div>
          </dl>
          <dl v-else class="invitation-facts">
            <div v-if="content.dateLabel">
              <dt><Calendar />时间</dt>
              <dd>{{ content.dateLabel }}</dd>
            </div>
            <div v-if="content.location || content.address">
              <dt><Location />地点</dt>
              <dd>
                <strong>{{ content.location }}</strong>
                <p v-if="content.address">{{ content.address }}</p>
              </dd>
            </div>
            <div v-if="content.contactName || content.contactPhone">
              <dt><Phone />会务</dt>
              <dd>
                {{ content.contactName
                }}<a v-if="content.contactPhone" :href="`tel:${safePhone}`">{{
                  content.contactPhone
                }}</a>
              </dd>
            </div>
          </dl>
          <div
            v-if="
              module.settings?.venueMode !== 'custom' && venueOrganizers.length
            "
            class="invitation-organizers"
          >
            <span>组织单位</span>
            <p v-for="organizer in venueOrganizers" :key="organizer">
              {{ organizer }}
            </p>
          </div>
        </div>
      </section>
      <section
        v-if="module.type === 'richtext' || module.type === 'image'"
        :id="moduleAnchor(module)"
        class="invitation-section invitation-custom-module"
      >
        <div v-if="module.title" class="invitation-section__heading">
          <span>{{
            sectionNumbers[
              module.type === "richtext" || module.type === "image"
                ? module.id
                : module.type
            ]
          }}</span>
          <h2>{{ module.title }}</h2>
        </div>
        <InvitationKeywords
          v-if="module.type === 'richtext' && keywordPresentation(module)"
          :body="module.body"
        />
        <div
          v-else-if="module.type === 'richtext'"
          class="invitation-rich-body"
          v-html="richHtml(module)"
        />
        <img
          v-else
          :src="assetUrl(module.imageUrl)"
          :alt="module.title"
          loading="lazy"
        />
      </section>
      <section
        v-if="
          [
            'video',
            'audio',
            'carousel',
            'tabs',
            'map',
            'links',
            'search',
            'organizations',
            'contacts',
          ].includes(module.type)
        "
        :id="moduleAnchor(module)"
        class="invitation-section invitation-custom-module"
      >
        <div v-if="module.title" class="invitation-section__heading">
          <span>{{ sectionNumbers[module.id] }}</span>
          <h2>{{ module.title }}</h2>
        </div>
        <InvitationExtraModule
          :asset-origin="assetOrigin"
          :custom-font-family="pageFont.customFamily.value"
          :module="module"
          :content="content"
          @navigate="navigateResult"
        />
      </section>
    </div>
    <footer class="invitation-footer">
      <strong>{{ content.host || "观潮会集" }}</strong
      ><span>每一次相聚，都让彼此更进一步。</span>
    </footer>
    <div class="invitation-actions">
      <button
        class="invitation-share"
        title="分享邀请函"
        aria-label="分享邀请函"
        @click="$emit('share')"
      >
        <Share /><span>分享</span>
      </button>
      <div
        v-if="document.registrationMode !== 'none'"
        class="invitation-register"
      >
        <button
          :disabled="!document.registrationOpen"
          @click="$emit('register')"
        >
          {{ document.registrationMessage
          }}<ArrowRight v-if="document.registrationOpen" /></button
        ><slot name="registration" />
      </div>
    </div>
  </article>
</template>
<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  ArrowDown,
  ArrowLeft,
  Aim,
  ArrowRight,
  Calendar,
  Location,
  Phone,
  Search,
  Share,
  Link,
  Ticket,
  VideoPlay,
  Document,
  Star,
} from "@element-plus/icons-vue";
import {
  matchInvitationInvitee,
  normalizeInvitationCover,
  normalizeInvitationModules,
  normalizeInvitationNavigation,
  invitationVisibleModules,
  invitationVenueItems,
  invitationNavigationLinks,
  normalizeInvitationEffects,
  invitationRichTextHtml,
  type InvitationModule,
  type PublicInvitation,
  normalizeInvitationPageDesign,
  normalizeInvitationModuleStyle,
  normalizeInvitationModuleSettings,
  invitationModuleRepeatable,
  sortInvitationInvitees,
} from "@conference/shared";
import InvitationCoverCanvas from "./InvitationCoverCanvas.vue";
import InvitationExtraModule from "./InvitationExtraModule.vue";
import InvitationKeywords from "./InvitationKeywords.vue";
import { useInvitationFont } from "../../utils/invitation-font";
import { API_BASE_URL } from "../../config";
const props = defineProps<{ document: PublicInvitation; preview?: boolean }>();
defineEmits<{ register: []; share: [] }>();
const content = computed(() => props.document.content);
const design = computed(() =>
  normalizeInvitationPageDesign(content.value.design),
);
const assetOrigin = computed(() =>
  props.preview || import.meta.env.DEV
    ? new URL(API_BASE_URL).origin
    : window.location.origin,
);
const customNeeded = computed(
  () =>
    content.value.cover.layers.some((layer) => layer.font === "custom") ||
    content.value.modules.some((module) =>
      module.organizationCanvas?.labels.some(
        (label) => label.font === "custom",
      ),
    ) ||
    JSON.stringify(content.value.modules).includes("var(--invite-custom-font)"),
);
const pageFont = useInvitationFont(design, assetOrigin, customNeeded);
const cover = computed(() => normalizeInvitationCover(content.value.cover));
const effects = computed(() => ({
  ...normalizeInvitationEffects(content.value.effects, content.value.motion),
  ...(content.value.motion === "none"
    ? { entrance: "none" as const, cover: "none" as const }
    : {}),
}));
const modules = computed(() => invitationVisibleModules(content.value));
const navigation = computed(() =>
  normalizeInvitationNavigation(
    content.value.navigation,
    normalizeInvitationModules(content.value.modules),
  ),
);
const navigationLinks = computed(() =>
  invitationNavigationLinks(content.value),
);
const moduleAnchor = (module: InvitationModule) =>
  `invitation-${module.type === "invitees" ? "list" : invitationModuleRepeatable(module.type) ? module.id : module.type}`;
const assetUrl = (url: string) =>
  url.startsWith("/uploads/") ? assetOrigin.value + url : url;
const richHtml = (module: InvitationModule) =>
  invitationRichTextHtml(module.body, assetOrigin.value);
function keywordPresentation(module: InvitationModule) {
  const settings = normalizeInvitationModuleSettings(module.settings);
  return (
    settings.textPresentation === "keywords" ||
    (settings.textPresentation === "auto" &&
      (module.id.startsWith("booklet-keywords") ||
        module.title.trim() === "会议关键词"))
  );
}
const isBooklet = computed(() => content.value.visualPreset === "booklet");
const venueIcons: Record<string, unknown> = {
  link: Link,
  location: Location,
  calendar: Calendar,
  phone: Phone,
  ticket: Ticket,
  video: VideoPlay,
  document: Document,
  star: Star,
};
const venueOrganizers = computed(() => {
  const presented = new Set(
    modules.value
      .filter((module) => module.type === "organizations")
      .flatMap((module) =>
        (module.items || []).map((item) => item.description),
      ),
  );
  return content.value.organizers.filter((name) => !presented.has(name));
});
const sectionNumbers = computed(() =>
  Object.fromEntries(
    modules.value
      .filter((module) => isBooklet.value || module.type !== "letter")
      .map((module, index) => [
        invitationModuleRepeatable(module.type) ? module.id : module.type,
        String(index + 1).padStart(2, "0"),
      ]),
  ),
);
const keyword = ref("");
const rosterPage = ref(1);
const documentElement = ref<HTMLElement>();
const rosterMatch = computed(() =>
  matchInvitationInvitee(content.value.invitees, props.document.recipient),
);
const rosterPositions = computed(
  () =>
    new Map(
      sortedInvitees.value.map((person, index) => [person.id, index + 1]),
    ),
);
const sortedInvitees = computed(() =>
  sortInvitationInvitees(content.value.invitees, content.value.inviteeSort),
);
const selectedDay = ref("");
const days = computed(() => [
  ...new Set(content.value.agenda.map((item) => item.date)),
]);
watch(
  days,
  (values) => {
    if (!values.includes(selectedDay.value))
      selectedDay.value = values[0] || "";
  },
  { immediate: true },
);
const agendaSettings = computed(() =>
  normalizeInvitationModuleSettings(
    content.value.modules.find((module) => module.type === "agenda")?.settings,
  ),
);
const continuousAgenda = computed(
  () =>
    agendaSettings.value.agendaLayout === "continuous" ||
    (agendaSettings.value.agendaLayout === "auto" && isBooklet.value),
);
const agendaStyle = computed(() => ({
  "--invite-agenda-title-size": `${agendaSettings.value.agendaTitleSize}px`,
  "--invite-agenda-meta-size": `${agendaSettings.value.agendaMetaSize}px`,
  "--invite-agenda-line-height": agendaSettings.value.agendaLineHeight,
  "--invite-agenda-weight": agendaSettings.value.agendaWeight,
  "--invite-agenda-padding": `${agendaSettings.value.agendaPadding}px`,
}));
const agenda = computed(() =>
  continuousAgenda.value
    ? days.value.flatMap((day) =>
        content.value.agenda.filter((item) => item.date === day),
      )
    : content.value.agenda.filter((item) => item.date === selectedDay.value),
);
const paragraphs = computed(() =>
  content.value.introduction.split(/\n+/).filter(Boolean),
);
const filteredInvitees = computed(() =>
  sortedInvitees.value.filter((item) =>
    `${item.name} ${item.organization} ${item.role || ""}`
      .toLowerCase()
      .includes(keyword.value.trim().toLowerCase()),
  ),
);
const visibleInvitees = computed(() =>
  filteredInvitees.value.slice(
    (rosterPage.value - 1) * 20,
    rosterPage.value * 20,
  ),
);
const rosterPages = computed(() =>
  Math.max(1, Math.ceil(filteredInvitees.value.length / 20)),
);
watch(keyword, () => {
  rosterPage.value = 1;
});
watch(rosterPages, (pages) => {
  rosterPage.value = Math.min(rosterPage.value, pages);
});
async function locateRecipient() {
  const id = rosterMatch.value.item?.id;
  if (!id) return;
  await locateRoster(id);
}
async function locateRoster(id: string) {
  keyword.value = "";
  await nextTick();
  rosterPage.value =
    Math.floor(
      sortedInvitees.value.findIndex((person) => person.id === id) / 20,
    ) + 1;
  await nextTick();
  const row = Array.from(
    documentElement.value?.querySelectorAll<HTMLElement>("[data-roster-id]") ||
      [],
  ).find((element) => element.dataset.rosterId === id);
  row?.scrollIntoView({
    behavior:
      content.value.motion === "none" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    block: "center",
  });
  row?.setAttribute("tabindex", "-1");
  row?.focus({ preventScroll: true });
}
async function navigateResult(item: {
  type: string;
  id: string;
  date?: string;
}) {
  if (item.type === "invitees") return locateRoster(item.id);
  if (item.type === "agenda") selectedDay.value = item.date || "";
  await nextTick();
  const attribute = item.type === "agenda" ? "data-agenda-id" : "data-guest-id";
  const target = Array.from(
    documentElement.value?.querySelectorAll<HTMLElement>(`[${attribute}]`) ||
      [],
  ).find((element) => element.getAttribute(attribute) === item.id);
  target?.scrollIntoView({ behavior: "instant", block: "center" });
  target?.setAttribute("tabindex", "-1");
  target?.focus({ preventScroll: true });
}
function moduleStyle(module: InvitationModule) {
  const style = normalizeInvitationModuleStyle(module.style);
  return {
    backgroundColor: style.backgroundColor || undefined,
    backgroundImage: style.backgroundImage
      ? `url(${JSON.stringify(assetUrl(style.backgroundImage))})`
      : undefined,
    color: style.textColor || undefined,
    "--invite-module-text": style.textColor || undefined,
    "--invite-paper": style.backgroundColor || content.value.backgroundColor,
    "--invite-primary": style.accentColor || content.value.primaryColor,
    "--invite-accent": style.accentColor || content.value.accentColor,
    "--module-padding":
      style.spacing === "compact"
        ? "28px"
        : style.spacing === "spacious"
          ? "80px"
          : undefined,
  };
}
let observer: IntersectionObserver | undefined;
function observeSections() {
  observer?.disconnect();
  documentElement.value
    ?.querySelectorAll(".invitation-reveal")
    .forEach((element) => element.classList.remove("invitation-reveal"));
  if (
    effects.value.entrance === "none" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    !("IntersectionObserver" in window)
  )
    return;
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.remove("invitation-reveal");
          observer?.unobserve(entry.target);
        }
      });
    },
    { threshold: 0, rootMargin: "0px 0px -24px 0px" },
  );
  documentElement.value
    ?.querySelectorAll(".invitation-section")
    .forEach((element) => {
      if (element.getBoundingClientRect().top > window.innerHeight) {
        element.classList.add("invitation-reveal");
        observer?.observe(element);
      }
    });
}
onMounted(observeSections);
watch(
  () => [effects.value.entrance, modules.value],
  () => nextTick(observeSections),
);
onBeforeUnmount(() => observer?.disconnect());
const safePhone = computed(() =>
  content.value.contactPhone.replace(/[^0-9+\-]/g, ""),
);
const themeStyle = computed(() => ({
  "--invite-nav-offset":
    navigationLinks.value.length && navigation.value.sticky ? "70px" : "0px",
  "--invite-duration": `${effects.value.duration}ms`,
  "--invite-primary": content.value.primaryColor,
  "--invite-accent": content.value.accentColor,
  "--invite-paper": content.value.backgroundColor,
  "--invite-page-bg": content.value.backgroundColor,
  "--invite-body-color": design.value.textColor,
  "--invite-body-size": `${design.value.bodySize}px`,
  "--invite-global-font":
    pageFont.family.value ||
    '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  "--invite-hero-text": content.value.heroTextColor || "#ffffff",
  "--invite-custom-font":
    pageFont.customFamily.value ||
    '"PingFang SC", "Microsoft YaHei", sans-serif',
  "--invite-hero-overlay": (content.value.heroOverlayOpacity ?? 55) / 100,
  "--invite-heading":
    pageFont.family.value ||
    (content.value.headingFont === "serif"
      ? '"Songti SC", "STSong", "Noto Serif CJK SC", serif'
      : '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'),
}));
</script>
<style scoped>
.invitation-page-background {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-size: 100% auto;
  background-repeat: repeat-y;
  transform-origin: center top;
}
.invitation-module-wrap {
  position: relative;
  background-size: cover;
  background-position: center;
  scroll-margin-top: var(--invite-nav-offset);
}
.invitation-chapters > .invitation-module-wrap {
  scroll-snap-align: start;
}
.custom-module-background .invitation-band,
.has-page-background .invitation-band {
  background: transparent;
}
.custom-module-text :is(p, small, h2, h3, td, th, dd),
.custom-module-text :deep(.invitation-extra-module) {
  color: inherit;
}
.center-module-heading .invitation-section__heading {
  justify-content: center;
  text-align: center;
}
.invitation-document
  :is(.invitation-letter__paragraph, .invitation-guest__biography) {
  font-size: var(--invite-body-size);
  color: inherit;
}
.invitation-document.invitation-unified-font :deep(*) {
  font-family: var(--invite-global-font) !important;
}
.invitation-font-warning {
  display: block;
  background: #f8e5d9;
  color: #843e22;
  padding: 8px 16px;
  font-size: 12px;
}
.invitation-agenda__speaker {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.invitation-agenda__speaker img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.invitation-agenda__speaker p {
  margin: 0 !important;
}
.invitation-document .invitation-guest__biography {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 16px 0 0;
  line-height: 1.85;
}
.invitation-guests > .invitation-guest:only-child {
  grid-column: 1 / -1;
}
.invitation-guests.invitation-guests--list {
  grid-template-columns: 1fr;
}
.invitation-guests--list .invitation-guest {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 28px;
  border-bottom: 1px solid #dde4df;
  padding-bottom: 28px;
}
.invitation-guests--list
  .invitation-guest:not(:has(.invitation-guest__portrait)) {
  grid-template-columns: 1fr;
}
.invitation-guests--list .invitation-guest__portrait {
  align-self: start;
  margin: 0;
}
@media (prefers-reduced-motion: no-preference) {
  .invitation-motion .background-pan {
    animation: invitation-bg-pan 30s ease-in-out infinite alternate;
  }
  .invitation-motion .background-breathe {
    animation: invitation-bg-breathe 18s ease-in-out infinite alternate;
  }
}
@keyframes invitation-bg-pan {
  to {
    transform: translateY(-28px);
  }
}
@keyframes invitation-bg-breathe {
  to {
    transform: scaleY(1.015);
  }
}
@container (max-width:600px) {
  .invitation-guests--list .invitation-guest {
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 18px;
  }
}
.invitation-artwork-cover {
  max-width: 720px;
  margin: auto;
  overflow: hidden;
}
.invitation-custom-module > img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: auto;
}
.invitation-rich-body {
  color: inherit;
  overflow-wrap: anywhere;
  line-height: 1.8;
}
.invitation-rich-body :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
}
.invitation-rich-body :deep(p) {
  margin: 0 0 1em;
}
.invitation-rich-body :deep(h1),
.invitation-rich-body :deep(h2),
.invitation-rich-body :deep(h3),
.invitation-rich-body :deep(h4) {
  margin: 1em 0 0.5em;
}
.invitation-rich-body :deep(a) {
  text-decoration: underline;
  color: var(--invite-accent);
}
.invitation-rich-body :deep(blockquote) {
  margin: 20px 0;
  padding: 6px 18px;
  border-left: 3px solid var(--invite-primary);
}
.invitation-document.invitation-chapters {
  height: 100svh;
  overflow-y: auto;
  scroll-snap-type: y proximity;
  scroll-padding-top: var(--invite-nav-offset);
  overscroll-behavior-y: contain;
}
.invitation-chapters > header,
.invitation-chapters > section {
  scroll-snap-align: start;
  scroll-margin-top: var(--invite-nav-offset);
}
.invitation-chapters > .invitation-nav {
  position: sticky;
  top: 0;
  z-index: 3;
}
.invitation-chapters > .invitation-actions {
  position: sticky;
  bottom: 0;
}
@media (prefers-reduced-motion: no-preference) {
  .invitation-cover-effect--fade > header {
    animation: artwork-fade var(--invite-duration) ease-out both;
  }
  .invitation-cover-effect--focus > header {
    animation: artwork-focus var(--invite-duration) ease-out both;
  }
  .invitation-document.invitation-motion .invitation-section {
    transition-duration: var(--invite-duration);
  }
  .invitation-document.invitation-entrance--fade .invitation-reveal {
    transform: none;
  }
  .invitation-document.invitation-entrance--unfold .invitation-section {
    clip-path: inset(0);
    transition:
      clip-path var(--invite-duration) ease,
      opacity var(--invite-duration) ease;
  }
  .invitation-document.invitation-entrance--unfold .invitation-reveal {
    clip-path: inset(0 0 100% 0);
    transform: none;
  }
}
@keyframes artwork-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes artwork-focus {
  from {
    opacity: 0;
    clip-path: inset(5% 5%);
  }
  to {
    opacity: 1;
    clip-path: inset(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .invitation-document.invitation-chapters {
    scroll-snap-type: none;
    scroll-behavior: auto;
  }
}
.invitation-document {
  container-type: inline-size;
  margin: 0;
  position: relative;
  isolation: isolate;
  background: var(--invite-page-bg);
  color: var(--invite-body-color);
  font-family: var(--invite-global-font);
  font-size: var(--invite-body-size);
  line-height: 1.8;
  letter-spacing: 0;
  overflow-wrap: anywhere;
  isolation: isolate;
}
.invitation-document * {
  box-sizing: border-box;
}
.invitation-document h1,
.invitation-document h2,
.invitation-document h3,
.invitation-document p {
  margin: 0;
}
.invitation-document a {
  color: inherit;
  text-decoration: none;
}
.invitation-document button,
.invitation-document input {
  font: inherit;
  letter-spacing: 0;
}
.invitation-document button {
  cursor: pointer;
}
.invitation-document button:disabled {
  cursor: default;
  opacity: 0.6;
}
.invitation-document button:focus-visible,
.invitation-document a:focus-visible,
.invitation-document input:focus-visible {
  outline: 3px solid var(--invite-accent);
  outline-offset: 4px;
}
.invitation-document svg {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}
.invitation-hero {
  position: relative;
  min-height: 540px;
  color: var(--invite-hero-text);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: var(--invite-primary);
  overflow: hidden;
}
.invitation-hero__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.invitation-hero__shade {
  position: absolute;
  inset: 0;
  background: rgb(16 29 23 / var(--invite-hero-overlay));
}
.invitation-hero__brand,
.invitation-hero__copy,
.invitation-hero__scroll {
  position: relative;
  z-index: 1;
}
.invitation-hero__brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 32px 36px;
  font-weight: 600;
}
.invitation-hero__brand img {
  max-width: 150px;
  max-height: 48px;
  object-fit: contain;
}
.invitation-hero__label {
  font-size: 13px;
  font-weight: 400;
  padding: 3px 0;
  border-bottom: 1px solid rgb(255 255 255 / 70%);
}
.invitation-hero__copy {
  padding: 70px 36px 48px;
  max-width: 860px;
  text-shadow: 0 2px 12px rgb(0 0 0 / 30%);
}
.invitation-hero__copy > p {
  font-size: 17px;
  margin-bottom: 18px;
}
.invitation-hero h1 {
  min-width: 0;
  white-space: normal;
  font-family: var(--invite-heading);
  font-size: 42px;
  font-weight: 600;
  line-height: 1.4;
  text-wrap: balance;
}
.invitation-hero__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 28px;
  margin-top: 28px;
  font-size: 14px;
}
.invitation-hero__facts span {
  display: flex;
  align-items: center;
  gap: 8px;
}
.invitation-hero__scroll {
  display: flex;
  align-self: flex-end;
  padding: 0 36px 28px;
}
.invitation-layout--poster .invitation-hero {
  min-height: 0;
  background: var(--invite-paper);
  color: var(--invite-primary);
}
.invitation-layout--poster .invitation-hero__image {
  position: relative;
  inset: auto;
  object-fit: contain;
  height: auto;
  order: 1;
}
.invitation-layout--poster .invitation-hero__shade {
  display: none;
}
.invitation-layout--poster .invitation-hero__brand {
  order: 0;
}
.invitation-layout--poster .invitation-hero__copy {
  order: 2;
  padding: 32px;
  text-shadow: none;
}
.invitation-layout--poster .invitation-hero__scroll {
  display: none;
}
.invitation-nav {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  justify-content: flex-start;
  gap: 32px;
  padding: 0 24px;
  overflow: auto;
  white-space: nowrap;
  background: #fefefd;
  border-bottom: 1px solid #e4e8e2;
  scrollbar-width: none;
}
.invitation-document > .invitation-nav--flow {
  position: static;
}
.invitation-nav a {
  flex: 0 0 auto;
  padding: 18px 0;
  font-size: 14px;
  color: var(--invite-primary);
}
.invitation-nav a:first-child {
  margin-left: auto;
}
.invitation-nav a:last-child {
  margin-right: auto;
}
.invitation-nav a:hover {
  color: var(--invite-accent);
}
.invitation-section {
  max-width: 780px;
  padding: var(--module-padding, 64px) 36px;
  margin: 0 auto;
  scroll-margin-top: var(--invite-nav-offset);
}
.invitation-band {
  background: var(--invite-paper);
  scroll-margin-top: var(--invite-nav-offset);
}
.invitation-section__heading {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 32px;
}
.invitation-section__heading > span {
  font-size: 14px;
  color: var(--invite-accent);
  font-variant-numeric: tabular-nums;
}
.invitation-section__heading h2 {
  font-family: var(--invite-heading);
  font-size: 28px;
  line-height: 1.4;
  font-weight: 600;
  color: var(--invite-primary);
}
.invitation-section__heading small {
  margin-left: auto;
  color: #66746a;
  font-size: 13px;
}
.invitation-letter__eyebrow {
  font-size: 13px;
  color: var(--invite-accent);
}
.invitation-letter h2 {
  font-size: 22px;
  font-weight: 500;
  margin: 16px 0 28px;
  line-height: 1.6;
}
.invitation-letter h2 span {
  color: var(--invite-primary);
  font-weight: 650;
  margin: 0 5px;
}
.invitation-letter__paragraph {
  line-height: 2.1;
  margin-bottom: 20px !important;
  white-space: pre-wrap;
}
.invitation-letter__signature {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-top: 36px;
}
.invitation-letter__signature span {
  font-size: 13px;
  color: #6b746e;
}
.invitation-letter__signature strong {
  font-family: var(--invite-heading);
  font-size: 20px;
  color: var(--invite-primary);
}
.invitation-highlights {
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.invitation-highlight {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 18px;
}
.invitation-highlight__index {
  font-size: 26px;
  font-weight: 300;
  line-height: 1.3;
  color: var(--invite-accent);
}
.invitation-highlight h3 {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.6;
}
.invitation-highlight p {
  font-size: 15px;
  color: #59665d;
  margin-top: 9px;
}
.invitation-days {
  display: flex;
  overflow: auto;
  gap: 8px;
  margin-bottom: 20px;
}
.invitation-days button {
  border: 1px solid #d9e0d8;
  padding: 8px 16px;
  color: var(--invite-primary);
  background: transparent;
  border-radius: 4px;
  white-space: nowrap;
  font-size: 14px;
}
.invitation-days button.active {
  background: var(--invite-primary);
  color: #fefefd;
  border-color: var(--invite-primary);
}
.invitation-agenda__row {
  display: grid;
  grid-template-columns: 105px minmax(0, 1fr);
  gap: 22px;
  padding: var(--invite-agenda-padding, 18px) 0;
  border-bottom: 1px solid #e4e8e2;
}
.invitation-agenda__row:first-child {
  border-top: 1px solid #e4e8e2;
}
.invitation-agenda__row time {
  color: var(--invite-accent);
  font-variant-numeric: tabular-nums;
  font-size: var(--invite-agenda-meta-size, 12px);
  line-height: var(--invite-agenda-line-height, 1.7);
  padding-top: 2px;
}
.invitation-agenda h3 {
  font-size: var(--invite-agenda-title-size, 14px);
  line-height: var(--invite-agenda-line-height, 1.7);
  font-weight: var(--invite-agenda-weight, 600);
}
.invitation-agenda p {
  font-size: var(--invite-agenda-meta-size, 12px);
  line-height: var(--invite-agenda-line-height, 1.7);
  color: var(--invite-module-text, #5d6961);
  margin-top: 8px;
}
.invitation-agenda small {
  display: block;
  color: var(--invite-module-text, #737a75);
  margin-top: 4px;
  font-size: var(--invite-agenda-meta-size, 12px);
  line-height: var(--invite-agenda-line-height, 1.7);
}
.invitation-footnote {
  color: #768077;
  font-size: 12px;
  margin-top: 18px !important;
}
.invitation-guests {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 36px 28px;
}
.invitation-guest {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.invitation-guest__portrait {
  aspect-ratio: 4/5;
  overflow: hidden;
  margin-bottom: 16px;
}
.invitation-guest img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.invitation-guest__status {
  font-size: 11px;
  color: var(--invite-accent);
}
.invitation-guest h3 {
  font-family: var(--invite-heading);
  font-size: 23px;
  color: var(--invite-primary);
  font-weight: 600;
  margin: 4px 0 8px;
}
.invitation-guest p {
  font-size: 14px;
  line-height: 1.7;
}
.invitation-guest small {
  display: block;
  font-size: 13px;
  color: #6b746e;
  margin-top: 3px;
}
.invitation-search {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #cbd4ca;
  padding: 10px 0;
  margin-bottom: 20px;
  color: #6b746e;
}
.invitation-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  font-size: 15px;
  color: inherit;
  outline: none;
}
.invitation-invitees {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 28px;
}
.invitation-invitees > div {
  padding: 17px 0;
  border-bottom: 1px solid #e4e8e2;
}
.invitation-invitees strong {
  display: block;
  font-weight: 600;
  font-size: 16px;
}
.invitation-invitees span {
  display: block;
  font-size: 13px;
  color: #6b746e;
  margin-top: 4px;
}
.invitation-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 24px;
  padding: 12px;
  background: none;
  border: 1px solid #d9e0d8;
  color: var(--invite-primary);
  border-radius: 4px;
  font-size: 14px !important;
}
.invitation-facts {
  margin: 0;
}
.invitation-facts > div {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 20px;
  margin-bottom: 28px;
}
.invitation-facts dt {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #687269;
  font-size: 13px;
}
.invitation-facts dt svg {
  width: 17px;
}
.invitation-facts dd {
  margin: 0;
  font-size: 15px;
}
.invitation-facts dd strong {
  font-weight: 600;
}
.invitation-facts dd p {
  font-size: 14px;
  color: #6b746e;
  margin-top: 6px;
}
.invitation-facts dd a {
  display: block;
  color: var(--invite-primary);
}
.invitation-facts--custom > div {
  grid-template-columns: 104px minmax(0, 1fr);
}
.invitation-facts--custom dt {
  align-items: flex-start;
  color: var(--invite-accent, #687269);
}
.invitation-facts--custom dt svg {
  flex-shrink: 0;
  height: 17px;
}
.invitation-facts--custom dt span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.invitation-facts--custom dd {
  white-space: pre-line;
  overflow-wrap: anywhere;
  color: var(--invite-module-text, inherit);
  line-height: 1.8;
}
@media (max-width: 600px) {
  .invitation-facts--custom > div {
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 14px;
  }
}
.invitation-organizers {
  border-top: 1px solid #d9e0d8;
  padding-top: 24px;
  font-size: 14px;
}
.invitation-organizers > span {
  display: block;
  font-size: 12px;
  color: #778176;
  margin-bottom: 12px;
}
.invitation-organizers p {
  margin-top: 6px;
}
.invitation-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px 130px;
  text-align: center;
  color: var(--invite-primary);
}
.invitation-footer strong {
  font-family: var(--invite-heading);
  font-size: 22px;
}
.invitation-footer span {
  font-size: 12px;
  margin-top: 10px;
  color: #748075;
}
.invitation-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 12px max(20px, calc((100vw - 700px) / 2))
    calc(12px + env(safe-area-inset-bottom));
  background: #fefefd;
  border-top: 1px solid #e2e7df;
}
.invitation-share {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 42px;
  border: 0;
  color: var(--invite-primary);
  background: none;
  font-size: 11px !important;
}
.invitation-register {
  position: relative;
  flex: 1;
  min-width: 0;
}
.invitation-register > button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  min-height: 50px;
  border: 0;
  border-radius: 4px;
  background: var(--invite-primary);
  color: #fefefd;
  font-size: 16px;
  font-weight: 500;
  padding: 10px 16px;
}
.invitation-preview .invitation-actions {
  position: sticky;
  padding: 12px 20px;
}
.invitation-preview .invitation-footer {
  padding-bottom: 48px;
}
@media (min-width: 900px) {
  .invitation-hero__brand,
  .invitation-motion .invitation-hero__copy {
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
  }
  .invitation-hero {
    min-height: 590px;
  }
  .invitation-guests {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 480px) {
  .invitation-hero {
    min-height: 500px;
  }
  .invitation-hero__brand {
    padding: 24px;
  }
  .invitation-hero__copy {
    padding: 60px 24px 36px;
  }
  .invitation-hero h1 {
    font-size: 32px;
    line-height: 1.5;
  }
  .invitation-hero__copy > p {
    font-size: 14px;
  }
  .invitation-hero__facts {
    flex-direction: column;
    gap: 10px;
    margin-top: 24px;
    font-size: 13px;
  }
  .invitation-nav {
    justify-content: flex-start;
    gap: 24px;
    padding: 0 24px;
  }
  .invitation-nav a {
    font-size: 13px;
    padding: 15px 0;
    margin-left: 0;
    margin-right: 0;
  }
  .invitation-section {
    padding: var(--module-padding, 44px) 24px;
  }
  .invitation-section__heading h2 {
    font-size: 26px;
  }
  .invitation-letter h2 {
    font-size: 20px;
  }
  .invitation-agenda__row {
    grid-template-columns: 79px minmax(0, 1fr);
    gap: 16px;
    padding: var(--invite-agenda-padding, 18px) 0;
  }
  .invitation-agenda__row time {
    font-size: var(--invite-agenda-meta-size, 12px);
  }
  .invitation-agenda h3 {
    font-size: var(--invite-agenda-title-size, 14px);
  }
  .invitation-guests {
    gap: 28px 18px;
  }
  .invitation-guest h3 {
    font-size: 21px;
  }
  .invitation-invitees {
    gap: 0 20px;
  }
  .invitation-hero__scroll {
    padding-right: 24px;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .invitation-hero__copy {
    animation: invite-arrive 0.65s ease-out;
  }
  @keyframes invite-arrive {
    from {
      opacity: 0.3;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
}
.invitation-preview .invitation-hero {
  min-height: 500px;
}
.invitation-preview .invitation-hero__brand {
  padding: 24px;
}
.invitation-preview .invitation-hero__copy {
  padding: 60px 24px 36px;
}
.invitation-preview .invitation-hero h1 {
  font-size: 32px;
  line-height: 1.5;
}
.invitation-preview .invitation-hero__copy > p {
  font-size: 14px;
}
.invitation-preview .invitation-hero__facts {
  flex-direction: column;
  gap: 10px;
  margin-top: 24px;
  font-size: 13px;
}
.invitation-preview .invitation-nav {
  justify-content: flex-start;
  gap: 24px;
  padding: 0 24px;
}
.invitation-preview .invitation-nav a {
  font-size: 13px;
  padding: 15px 0;
}
.invitation-preview .invitation-section {
  padding: var(--module-padding, 44px) 24px;
}
.invitation-preview .invitation-section__heading h2 {
  font-size: 26px;
}
.invitation-preview .invitation-letter h2 {
  font-size: 20px;
}
.invitation-preview .invitation-agenda__row {
  grid-template-columns: 79px minmax(0, 1fr);
  gap: 16px;
  padding: var(--invite-agenda-padding, 18px) 0;
}
.invitation-preview .invitation-agenda__row time {
  font-size: var(--invite-agenda-meta-size, 12px);
}
.invitation-preview .invitation-agenda h3 {
  font-size: var(--invite-agenda-title-size, 14px);
}
.invitation-preview .invitation-guests {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 28px 18px;
}
.invitation-preview .invitation-guest h3 {
  font-size: 21px;
}
.invitation-preview .invitation-invitees {
  gap: 0 20px;
}
.invitation-preview .invitation-hero__scroll {
  padding-right: 24px;
}
.invitation-hero__recipient {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 28px;
  font-size: 13px;
}
.invitation-hero__recipient strong {
  font-size: 24px;
  font-family: var(--invite-heading);
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.invitation-hero__recipient > span:first-child {
  width: 100%;
  font-size: 12px;
  margin-bottom: 2px;
}
.invitation-document:not(.invitation-preset--custom) .invitation-hero {
  min-height: 0;
  min-height: min(650px, calc(100svh - 160px));
  background: #f3f4f2;
  justify-content: flex-start;
}
.invitation-document:not(.invitation-preset--custom) .invitation-hero__image {
  object-fit: fill;
}
.invitation-document:not(.invitation-preset--custom) .invitation-hero__copy {
  padding-top: 30px;
  padding-bottom: 130px;
  text-shadow: none;
}
.invitation-document:not(.invitation-preset--custom)
  .invitation-hero__recipient {
  color: var(--invite-primary);
}
.invitation-document:not(.invitation-preset--custom)
  .invitation-hero__copy
  > p {
  font-size: 14px;
  margin-bottom: 12px;
  color: var(--invite-accent);
}
.invitation-document:not(.invitation-preset--custom) .invitation-hero h1 {
  font-size: 42px;
  max-width: 760px;
  line-height: 1.45;
}
.invitation-document:not(.invitation-preset--custom) .invitation-hero__facts {
  margin-top: 20px;
}
.invitation-document:not(.invitation-preset--custom) .invitation-hero__scroll {
  margin-top: auto;
  padding-bottom: 24px;
  color: var(--invite-primary);
}
.invitation-document:not(.invitation-preset--custom) .invitation-hero__label {
  border-color: currentColor;
}
.invitation-preset--editorial .invitation-hero h1 {
  font-weight: 750;
}
.invitation-preset--editorial .invitation-hero__recipient {
  border-left: 3px solid var(--invite-accent);
  padding-left: 16px;
}
.invitation-roster-tools {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 22px;
  flex-wrap: wrap;
}
.invitation-roster-tools .invitation-search {
  flex: 1;
  min-width: 160px;
  margin: 0;
}
.invitation-locate {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: var(--invite-paper);
  color: var(--invite-primary);
  padding: 10px 12px;
  border-radius: 4px;
  white-space: nowrap;
  font-size: 13px !important;
}
.invitation-roster {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  text-align: left;
  font-size: 14px;
  line-height: 1.65;
}
.invitation-roster .roster-number {
  width: 50px;
}
.invitation-roster .roster-name {
  width: 100px;
}
.invitation-roster .roster-role {
  width: 26%;
}
.invitation-roster th,
.invitation-roster td {
  padding: 16px 10px;
  border-bottom: 1px solid #e2e6e2;
  overflow-wrap: anywhere;
  vertical-align: top;
}
.invitation-roster thead th {
  font-size: 12px;
  font-weight: 500;
  color: #667369;
  background: var(--invite-paper);
  border-top: 1px solid #d9e0da;
}
.invitation-roster tbody th {
  font-weight: 600;
}
.invitation-roster td:first-child {
  font-variant-numeric: tabular-nums;
  color: #7c847e;
  font-size: 12px;
}
.invitation-roster .is-recipient {
  background: color-mix(in srgb, var(--invite-primary) 7%, white);
  box-shadow: inset 3px 0 var(--invite-primary);
  scroll-margin-top: 90px;
}
.invitation-roster small {
  display: inline-block;
  background: var(--invite-primary);
  color: #fff;
  border-radius: 3px;
  padding: 0 4px;
  font-size: 10px;
  margin-left: 5px;
  vertical-align: middle;
}
.invitation-roster-pages {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
.invitation-roster-pages span {
  font-size: 12px;
  color: #69736c;
  margin-right: auto;
}
.invitation-roster-pages button {
  height: 38px;
  width: 38px;
  display: grid;
  place-items: center;
  border: 1px solid #dde3dd;
  border-radius: 4px;
  background: none;
  color: var(--invite-primary);
}
.invitation-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@container (max-width:600px) {
  .invitation-document:not(.invitation-preset--custom) .invitation-hero {
    min-height: min(580px, calc(100svh - 150px));
  }
  .invitation-document:not(.invitation-preset--custom) .invitation-hero__copy {
    padding: 20px 24px 100px;
  }
  .invitation-document:not(.invitation-preset--custom) .invitation-hero h1 {
    font-size: 30px;
    line-height: 1.55;
  }
  .invitation-hero__recipient {
    margin-bottom: 24px;
  }
  .invitation-hero__recipient strong {
    font-size: 22px;
  }
  .invitation-roster .roster-number {
    width: 34px;
  }
  .invitation-roster .roster-name {
    width: 70px;
  }
  .invitation-roster .roster-role {
    width: 26%;
  }
  .invitation-roster th,
  .invitation-roster td {
    padding: 14px 6px;
    font-size: 12px;
  }
  .invitation-roster thead th {
    font-size: 11px;
  }
  .invitation-roster-tools {
    gap: 12px;
  }
  .invitation-roster-tools .invitation-search input {
    font-size: 13px;
  }
  .invitation-locate {
    font-size: 12px !important;
    padding: 8px;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .invitation-motion .invitation-hero__brand {
    animation: invite-arrive 0.6s ease-out both;
  }
  .invitation-motion .invitation-hero__copy {
    animation: invite-arrive 0.85s cubic-bezier(0.2, 0.7, 0.2, 1) 0.12s both;
  }
  .invitation-motion .invitation-hero__image {
    animation: invite-art-settle 1.6s cubic-bezier(0.2, 0.7, 0.2, 1) both;
  }
  .invitation-motion .invitation-section {
    transition:
      opacity 0.65s ease,
      transform 0.65s cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .invitation-motion .invitation-reveal {
    opacity: 0;
    transform: translateY(22px);
  }
  .invitation-document button {
    transition:
      background-color 0.18s ease,
      transform 0.18s ease;
  }
  .invitation-document button:active:not(:disabled) {
    transform: translateY(1px);
  }
  @keyframes invite-art-settle {
    from {
      transform: scale(1.06) translateY(8px);
    }
    to {
      transform: scale(1) translateY(0);
    }
  }
}
@media (prefers-reduced-motion: reduce) {
  .invitation-reveal {
    opacity: 1 !important;
    transform: none !important;
  }
}
@media (max-height: 750px) {
  .invitation-document:not(.invitation-preset--custom) .invitation-hero__image {
    height: 125%;
    bottom: auto;
  }
  .invitation-document:not(.invitation-preset--custom) .invitation-hero {
    min-height: calc(100svh - 230px);
  }
  .invitation-document:not(.invitation-preset--custom) .invitation-hero__brand {
    padding: 18px 24px;
  }
  .invitation-document:not(.invitation-preset--custom) .invitation-hero__copy {
    padding: 12px 24px 40px;
  }
  .invitation-document:not(.invitation-preset--custom) .invitation-hero h1 {
    font-size: 26px;
    line-height: 1.5;
  }
  .invitation-document:not(.invitation-preset--custom)
    .invitation-hero__recipient {
    margin-bottom: 16px;
  }
  .invitation-document:not(.invitation-preset--custom)
    .invitation-hero__recipient
    > span:first-child {
    width: auto;
  }
  .invitation-document:not(.invitation-preset--custom)
    .invitation-hero__recipient
    strong {
    font-size: 20px;
  }
  .invitation-document:not(.invitation-preset--custom) .invitation-hero__facts {
    margin-top: 16px;
    gap: 6px 24px;
  }
  .invitation-document:not(.invitation-preset--custom)
    .invitation-hero__scroll {
    display: none;
  }
  .invitation-document:not(.invitation-preset--custom) .invitation-letter {
    padding-top: 28px;
  }
}
.background-wave-pattern {
  mix-blend-mode: multiply;
  background-size: 720px auto;
  background-repeat: repeat;
}
.invitation-document.invitation-preset--booklet .invitation-hero {
  min-height: 520px;
  background: var(--invite-paper);
  justify-content: flex-start;
}
.invitation-document.invitation-preset--booklet .invitation-hero__image {
  height: 100%;
  object-fit: cover;
  opacity: 0.5;
}
.invitation-document.invitation-preset--booklet .invitation-hero__brand {
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
  padding: 32px 36px;
  color: var(--invite-primary);
  font-size: 24px;
}
.invitation-document.invitation-preset--booklet .invitation-hero__brand img {
  max-width: 190px;
  height: 44px;
  object-fit: contain;
  object-position: left;
}
.invitation-document.invitation-preset--booklet .invitation-hero__label {
  font-size: 12px;
  border: 0;
  padding: 0;
  font-weight: 500;
}
.invitation-document.invitation-preset--booklet .invitation-hero__copy {
  width: 100%;
  max-width: 820px;
  padding: 40px 36px 32px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  color: var(--invite-hero-text);
}
.invitation-document.invitation-preset--booklet .invitation-hero__copy > p {
  order: 0;
  color: var(--invite-primary);
  margin: 0 0 14px;
}
.invitation-document.invitation-preset--booklet .invitation-hero h1 {
  order: 1;
  font-size: 36px;
  font-weight: 750;
  line-height: 1.5;
}
.invitation-document.invitation-preset--booklet .invitation-hero__recipient {
  order: 2;
  margin: 44px 0 0;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 14px;
}
.invitation-document.invitation-preset--booklet
  .invitation-hero__recipient
  > span:first-child {
  width: 100%;
  font-size: 18px;
  color: var(--invite-hero-text);
  margin-bottom: 10px;
}
.invitation-document.invitation-preset--booklet
  .invitation-hero__recipient
  strong {
  font-size: 40px;
  line-height: 1.4;
  font-weight: 650;
  max-width: 100%;
  border-bottom: 1px solid var(--invite-primary);
  padding-bottom: 4px;
}
.invitation-document.invitation-preset--booklet .invitation-hero__facts {
  order: 3;
  font-size: 13px;
  margin-top: 24px;
  gap: 8px 24px;
}
.invitation-document.invitation-preset--booklet .invitation-hero__scroll {
  display: none;
}
.invitation-document.invitation-preset--booklet .invitation-section {
  max-width: 820px;
  padding: var(--module-padding, 38px) 36px;
}
.invitation-document.invitation-preset--booklet .invitation-section__heading {
  position: relative;
  gap: 10px;
  padding-bottom: 14px;
  margin-bottom: 26px;
}
.invitation-document.invitation-preset--booklet
  .invitation-section__heading::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 112px;
  height: 3px;
  background: var(--invite-primary);
}
.invitation-document.invitation-preset--booklet
  .invitation-section__heading
  > span {
  font-size: 27px;
  font-weight: 300;
  color: var(--invite-primary);
}
.invitation-document.invitation-preset--booklet
  .invitation-section__heading
  h2 {
  font-size: 26px;
  font-weight: 550;
  margin: 0;
}
.invitation-document.invitation-preset--booklet .invitation-letter__eyebrow {
  display: none;
}
.invitation-document.invitation-preset--booklet .invitation-letter__paragraph {
  line-height: 2;
  margin-bottom: 16px !important;
}
.invitation-document.invitation-preset--booklet .invitation-highlights {
  gap: 22px;
}
.invitation-document.invitation-preset--booklet .invitation-highlight {
  grid-template-columns: minmax(0, 1fr);
}
.invitation-document.invitation-preset--booklet .invitation-highlight__index {
  display: none;
}
.invitation-document.invitation-preset--booklet .invitation-highlight h3 {
  color: var(--invite-primary);
  font-size: 18px;
}
.invitation-document.invitation-preset--booklet .invitation-highlight p {
  color: inherit;
  font-size: inherit;
  line-height: 1.9;
}
.invitation-document.invitation-preset--booklet .invitation-facts {
  grid-template-columns: 1fr;
  gap: 18px;
}
.invitation-document.invitation-preset--booklet .invitation-agenda__day {
  font-size: calc(var(--invite-agenda-title-size, 14px) + 2px);
  color: var(--invite-primary);
  font-weight: 600;
  padding: 12px 0;
  margin-top: 22px;
  border-bottom: 1px solid
    color-mix(in srgb, var(--invite-primary) 25%, transparent);
}
.invitation-document.invitation-preset--booklet
  .invitation-agenda__day:first-child {
  margin-top: 0;
}
.invitation-document.invitation-preset--booklet .invitation-agenda__row {
  grid-template-columns: 100px minmax(0, 1fr);
  gap: 18px;
  padding: var(--invite-agenda-padding, 18px) 0;
}
.invitation-document.invitation-preset--booklet .invitation-roster thead th {
  color: var(--invite-primary);
  background: color-mix(in srgb, var(--invite-primary) 6%, transparent);
}
.invitation-document.invitation-preset--booklet .invitation-footer {
  color: var(--invite-primary);
  background: url("/invitation-art/booklet-waves.png") center bottom / cover
    no-repeat;
  padding: 60px 24px 110px;
}
@container (max-width: 600px) {
  .invitation-document.invitation-preset--booklet .invitation-hero__brand {
    padding: 24px;
    font-size: 22px;
  }
  .invitation-document.invitation-preset--booklet .invitation-hero__copy {
    padding: 20px 24px 28px;
  }
  .invitation-document.invitation-preset--booklet .invitation-hero h1 {
    font-size: 27px;
  }
  .invitation-document.invitation-preset--booklet .invitation-hero__recipient {
    margin-top: 36px;
  }
  .invitation-document.invitation-preset--booklet
    .invitation-hero__recipient
    strong {
    font-size: 36px;
  }
  .invitation-document.invitation-preset--booklet .invitation-section {
    padding: var(--module-padding, 30px) 24px;
  }
  .invitation-document.invitation-preset--booklet
    .invitation-section__heading
    h2 {
    font-size: 24px;
  }
  .invitation-document.invitation-preset--booklet
    .invitation-section__heading
    > span {
    font-size: 26px;
  }
  .invitation-document.invitation-preset--booklet .invitation-agenda__row {
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 14px;
  }
}
@media (max-width: 600px) {
  .invitation-document.invitation-preset--booklet .invitation-hero {
    min-height: 0;
  }
}
</style>
