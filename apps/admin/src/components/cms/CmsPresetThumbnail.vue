<template>
  <span class="preset-thumb" :class="`is-${kind}`">
    <template v-if="kind === 'hero'">
      <img v-if="imageUrl" :src="imageUrl" alt="" />
      <span class="preset-thumb__hero-copy"><i /><i /><b /></span>
    </template>
    <template v-else-if="kind === 'grid'">
      <span v-for="index in 4" :key="index" class="preset-thumb__tile"><i /><b /></span>
    </template>
    <template v-else-if="kind === 'list'">
      <span v-for="index in 2" :key="index" class="preset-thumb__row"><i /><span><b /><em /></span></span>
    </template>
    <template v-else-if="kind === 'profile'">
      <span class="preset-thumb__avatar" /><span class="preset-thumb__profile-copy"><b /><i /></span><em />
    </template>
    <template v-else-if="kind === 'form'">
      <span v-for="index in 3" :key="index" class="preset-thumb__field"><i /><b /></span>
    </template>
    <template v-else-if="kind === 'media'">
      <span class="preset-thumb__media-mark">▶</span><span class="preset-thumb__media-line" />
    </template>
    <template v-else-if="kind === 'action'">
      <span class="preset-thumb__action-line" /><span class="preset-thumb__action-button" />
    </template>
    <template v-else>
      <span class="preset-thumb__heading" />
      <span class="preset-thumb__text" />
      <span class="preset-thumb__text is-short" />
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  type: string;
  config?: Record<string, unknown> | null;
}>();

const imageUrl = computed(() => {
  const value = props.config?.imageUrl || props.config?.coverUrl;
  return typeof value === "string" ? value : "";
});

const kind = computed(() => {
  if (["hero", "hero-banner", "carousel", "image-promo-card", "image-grid"].includes(props.type)) return "hero";
  if (["quick-icon-grid", "service-shortcut-card", "stats-grid", "sponsor-wall", "mall-product-grid"].includes(props.type)) return "grid";
  if (["conference-list", "conference-schedule", "conference-tabs", "event-card-carousel", "my-order-list", "download-list", "schedule-timeline"].includes(props.type)) return "list";
  if (["login-card", "user-profile-card", "membership-benefits", "member-promo-banner"].includes(props.type)) return "profile";
  if (["credential-form-summary", "process-steps", "ticket-price-list", "faq"].includes(props.type)) return "form";
  if (["video", "live-card"].includes(props.type)) return "media";
  if (["registration-button", "floating-registration-button", "coupon-card", "contact-card"].includes(props.type)) return "action";
  return "content";
});
</script>

<style scoped>
.preset-thumb {
  position: relative;
  width: 100%;
  height: 64px;
  display: flex;
  box-sizing: border-box;
  overflow: hidden;
  padding: 8px;
  border: 1px solid #e1e6e4;
  border-radius: 6px;
  background: #fff;
  color: #10233d;
}

.preset-thumb.is-hero {
  align-items: flex-end;
  background: #10233d;
}

.preset-thumb.is-hero::before {
  position: absolute;
  inset: 0 42% 0 0;
  content: "";
  background: #f4f5ef;
  clip-path: ellipse(72% 90% at 18% 50%);
}

.preset-thumb.is-hero img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preset-thumb__hero-copy {
  position: relative;
  z-index: 1;
  width: 62%;
  display: grid;
  gap: 4px;
}

.preset-thumb__hero-copy i,
.preset-thumb__hero-copy b {
  display: block;
  height: 4px;
  border-radius: 2px;
  background: rgb(255 255 255 / 86%);
}

.preset-thumb__hero-copy i:first-child { width: 38%; background: #d2b06e; }
.preset-thumb__hero-copy i:nth-child(2) { width: 82%; height: 7px; }
.preset-thumb__hero-copy b { width: 52%; }

.preset-thumb.is-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px;
  background: #f5f7f5;
}

.preset-thumb__tile {
  display: grid;
  place-items: center;
  gap: 3px;
  padding: 5px 2px;
  border: 1px solid #e1e6e4;
  border-radius: 5px;
  background: #fff;
}

.preset-thumb__tile i { width: 15px; height: 15px; border-radius: 4px; background: #e8eef4; }
.preset-thumb__tile b { width: 70%; height: 3px; border-radius: 2px; background: #10233d; }

.preset-thumb.is-list { display: grid; gap: 5px; background: #f5f7f5; }
.preset-thumb__row { display: grid; grid-template-columns: 28px 1fr; gap: 6px; padding: 4px; border: 1px solid #e1e6e4; border-radius: 5px; background: #fff; }
.preset-thumb__row > i { border-radius: 4px; background: #e8eef4; }
.preset-thumb__row > span { display: grid; align-content: center; gap: 4px; }
.preset-thumb__row b, .preset-thumb__row em { height: 4px; border-radius: 2px; background: #10233d; }
.preset-thumb__row em { width: 70%; height: 3px; background: #c9d0d5; }

.preset-thumb.is-profile { align-items: center; gap: 8px; background: #f5f7f5; }
.preset-thumb__avatar { width: 28px; height: 28px; flex: 0 0 28px; border-radius: 50%; background: #10233d; }
.preset-thumb__profile-copy { min-width: 0; flex: 1; display: grid; gap: 5px; }
.preset-thumb__profile-copy b, .preset-thumb__profile-copy i { height: 5px; border-radius: 3px; background: #10233d; }
.preset-thumb__profile-copy i { width: 70%; height: 3px; background: #b3bbc1; }
.preset-thumb.is-profile > em { width: 28px; height: 16px; border-radius: 5px; background: #a97e38; }

.preset-thumb.is-form { display: grid; gap: 5px; }
.preset-thumb__field { display: grid; grid-template-columns: 28px 1fr; gap: 5px; align-items: center; }
.preset-thumb__field i { height: 4px; border-radius: 2px; background: #657083; }
.preset-thumb__field b { height: 12px; border: 1px solid #e1e6e4; border-radius: 4px; background: #f9faf9; }

.preset-thumb.is-media { align-items: center; justify-content: center; gap: 8px; background: #10233d; color: #fff; }
.preset-thumb__media-mark { width: 26px; height: 26px; display: grid; place-items: center; border: 1px solid rgb(255 255 255 / 54%); border-radius: 50%; font-size: 10px; }
.preset-thumb__media-line { width: 45%; height: 5px; border-radius: 3px; background: rgb(255 255 255 / 74%); }

.preset-thumb.is-action { align-items: center; gap: 8px; }
.preset-thumb__action-line { height: 5px; flex: 1; border-radius: 3px; background: #c8d0d5; }
.preset-thumb__action-button { width: 40px; height: 22px; border-radius: 5px; background: #10233d; }

.preset-thumb.is-content { display: grid; align-content: center; gap: 6px; }
.preset-thumb__heading, .preset-thumb__text { height: 6px; border-radius: 3px; background: #10233d; }
.preset-thumb__heading { width: 58%; }
.preset-thumb__text { height: 3px; background: #b7c0c6; }
.preset-thumb__text.is-short { width: 72%; }
</style>
