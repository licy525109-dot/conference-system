<template>
  <div
    class="invitation-carousel"
    :style="{ '--slide-ratio': settings.ratio, '--slide-fit': settings.fit }"
  >
    <Swiper
      :key="`${settings.effect}-${reduced}`"
      :modules="[
        Navigation,
        Pagination,
        A11y,
        Keyboard,
        Autoplay,
        EffectFade,
        EffectCoverflow,
        EffectFlip,
      ]"
      :effect="reduced ? 'slide' : settings.effect"
      :speed="reduced ? 0 : 650"
      :slides-per-view="1"
      :space-between="settings.effect === 'slide' ? 20 : 0"
      :navigation="items.length > 1"
      :pagination="{ clickable: true }"
      :keyboard="{ enabled: true, onlyInViewport: true }"
      :rewind="true"
      :autoplay="
        settings.autoplay && !paused && !reduced && items.length > 1
          ? {
              delay: settings.interval,
              pauseOnMouseEnter: true,
              disableOnInteraction: true,
            }
          : false
      "
      :coverflow-effect="{ rotate: 35, depth: 100, slideShadows: false }"
      :fade-effect="{ crossFade: true }"
      :flip-effect="{ slideShadows: false }"
      :a11y="{
        prevSlideMessage: '上一张',
        nextSlideMessage: '下一张',
        paginationBulletMessage: '跳转到第 {{index}} 张',
      }"
      @swiper="instance = $event"
    >
      <SwiperSlide v-for="item in items" :key="item.id"
        ><figure>
          <component
            :is="item.href ? 'a' : 'div'"
            :href="item.href || undefined"
            :target="item.href.startsWith('https:') ? '_blank' : undefined"
            rel="noopener noreferrer"
            ><img
              :src="assetUrl(item.imageUrl)"
              :alt="item.title"
              loading="lazy"
          /></component>
          <figcaption v-if="item.title || item.description">
            <strong>{{ item.title }}</strong>
            <p v-if="item.description">{{ item.description }}</p>
          </figcaption>
        </figure></SwiperSlide
      >
    </Swiper>
    <div v-if="items.length > 1" class="carousel-controls">
      <input
        type="range"
        min="0"
        :max="items.length - 1"
        :value="current"
        aria-label="轮播进度滑块"
        @input="
          instance?.slideTo(Number(($event.target as HTMLInputElement).value))
        "
      /><button
        v-if="settings.autoplay && !reduced"
        :aria-label="paused ? '继续轮播' : '暂停轮播'"
        :title="paused ? '继续轮播' : '暂停轮播'"
        @click="toggle"
      >
        <component :is="paused ? VideoPlay : VideoPause" />
      </button>
    </div>
  </div>
</template>
<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import { Swiper, SwiperSlide } from "swiper/vue";
import {
  Navigation,
  Pagination,
  A11y,
  Keyboard,
  Autoplay,
  EffectFade,
  EffectCoverflow,
  EffectFlip,
} from "swiper/modules";
import type { Swiper as SwiperInstance } from "swiper";
import { VideoPlay, VideoPause } from "@element-plus/icons-vue";
import type {
  InvitationModuleItem,
  InvitationModuleSettings,
} from "@conference/shared";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import "swiper/css/effect-fade";
import "swiper/css/effect-coverflow";
import "swiper/css/effect-flip";
const props = defineProps<{
  items: InvitationModuleItem[];
  settings: InvitationModuleSettings;
  assetOrigin: string;
}>();
const items = computed(() => props.items.filter((item) => item.imageUrl));
const instance = shallowRef<SwiperInstance>(),
  current = ref(0),
  paused = ref(false),
  reduced = ref(false);
const assetUrl = (url: string) =>
  url.startsWith("/uploads/") ? props.assetOrigin + url : url;
let media: MediaQueryList | undefined;
function setReduced() {
  reduced.value = media?.matches || false;
}
onMounted(() => {
  media = window.matchMedia("(prefers-reduced-motion: reduce)");
  setReduced();
  media.addEventListener("change", setReduced);
});
onBeforeUnmount(() => media?.removeEventListener("change", setReduced));
watch(instance, (swiper) => {
  swiper?.on("slideChange", () => {
    current.value = swiper.activeIndex;
  });
});
function toggle() {
  paused.value = !paused.value;
  if (paused.value) instance.value?.autoplay.stop();
  else instance.value?.autoplay.start();
}
</script>
<style scoped>
.invitation-carousel {
  min-width: 0;
  --swiper-theme-color: var(--invite-primary);
  --swiper-navigation-size: 20px;
}
.invitation-carousel figure {
  margin: 0;
}
.invitation-carousel img {
  display: block;
  width: 100%;
  aspect-ratio: var(--slide-ratio);
  object-fit: var(--slide-fit);
  background: color-mix(in srgb, var(--invite-paper) 80%, transparent);
}
.invitation-carousel figcaption {
  padding: 18px 0 30px;
}
.invitation-carousel figcaption strong {
  font-size: 18px;
  font-weight: 600;
}
.invitation-carousel figcaption p {
  font-size: 14px;
  margin: 6px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.invitation-carousel :deep(.swiper-slide) {
  background: var(--invite-paper);
}
.invitation-carousel :deep(.swiper-button-next),
.invitation-carousel :deep(.swiper-button-prev) {
  width: 36px;
  height: 36px;
  background: rgba(250, 252, 252, 0.94);
  border-radius: 50%;
  box-shadow: 0 2px 10px #253b3220;
}
.carousel-controls {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
}
.carousel-controls input {
  width: 100%;
  accent-color: var(--invite-primary);
  cursor: pointer;
  min-width: 0;
}
.carousel-controls button {
  border: 1px solid #dce3df;
  background: transparent;
  color: var(--invite-primary);
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 4px;
  cursor: pointer;
}
.carousel-controls svg {
  width: 20px;
  height: 20px;
}
</style>
