<template>
  <view v-if="visible" :class="['theme-dynamic-bg', placementClass]" :style="rootStyle">
    <view class="theme-dynamic-bg__base" :style="baseStyle" />
    <view class="theme-dynamic-bg__glow theme-dynamic-bg__glow-a" :style="glowAStyle" />
    <view class="theme-dynamic-bg__glow theme-dynamic-bg__glow-b" :style="glowBStyle" />
    <view class="theme-dynamic-bg__glow theme-dynamic-bg__glow-c" :style="glowCStyle" />
    <view v-if="theme.backgroundBottomFilter !== false" class="theme-dynamic-bg__filter" />
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ThemeConfig } from "@/services/cms";

const props = withDefaults(
  defineProps<{
    theme: ThemeConfig;
    active?: boolean;
    placement?: "fixed" | "absolute";
  }>(),
  {
    active: true,
    placement: "fixed"
  }
);

const visible = computed(() => props.active && props.theme.backgroundMode === "dynamic-gradient");
const placementClass = computed(() => (props.placement === "absolute" ? "is-absolute" : "is-fixed"));
const speed = computed(() => Math.max(6, Math.min(40, Number(props.theme.backgroundDynamicSpeed) || 18)));
const density = computed(() => Math.max(10, Math.min(100, Number(props.theme.backgroundDynamicDensity) || 40)));
const fromColor = computed(() => normalizeColor(props.theme.backgroundGradientFrom || props.theme.backgroundColor || "#f5f7fb"));
const toColor = computed(() => normalizeColor(props.theme.backgroundGradientTo || props.theme.secondaryColor || "#14b8a6"));
const accentColor = computed(() => normalizeColor(props.theme.accentColor || "#f59e0b"));

const rootStyle = computed(() => ({
  backgroundColor: props.theme.backgroundColor || "#f5f7fb"
}));

const baseStyle = computed(() => ({
  background: `linear-gradient(135deg, ${fromColor.value}, ${toColor.value})`,
  animation: `themeDynamicBase ${speed.value}s ease-in-out infinite alternate`
}));

const glowAStyle = computed(() => glowStyle(fromColor.value, toColor.value, 0.66, 0.2, 320 + density.value * 3, speed.value * 0.92, "themeDynamicGlowA"));
const glowBStyle = computed(() => glowStyle(toColor.value, accentColor.value, 0.58, 0.18, 280 + density.value * 2.6, speed.value * 1.08, "themeDynamicGlowB"));
const glowCStyle = computed(() => glowStyle(accentColor.value, fromColor.value, 0.48, 0.16, 240 + density.value * 2.2, speed.value * 1.18, "themeDynamicGlowC"));

function glowStyle(colorA: string, colorB: string, alphaA: number, alphaB: number, size: number, duration: number, animationName: string): Record<string, string> {
  return {
    width: `${Math.round(size)}rpx`,
    height: `${Math.round(size * 0.78)}rpx`,
    background: `linear-gradient(135deg, ${withAlpha(colorA, alphaA)}, ${withAlpha(colorB, alphaB)})`,
    animation: `${animationName} ${Math.max(6, Math.round(duration))}s ease-in-out infinite alternate`
  };
}

function normalizeColor(value: string): string {
  const color = value.trim();
  return color || "#f5f7fb";
}

function withAlpha(value: string, alpha: number): string {
  const hex = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    const chars = hex.slice(1).split("");
    const [r, g, b] = chars.map((char) => parseInt(`${char}${char}`, 16));
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (/^rgb\(/i.test(hex)) {
    return hex.replace(/^rgb\((.+)\)$/i, `rgba($1,${alpha})`);
  }
  return `rgba(36,82,168,${alpha})`;
}
</script>

<style>
.theme-dynamic-bg {
  pointer-events: none;
  overflow: hidden;
}

.theme-dynamic-bg.is-fixed {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 0;
  width: 100vw;
  height: 100vh;
}

.theme-dynamic-bg.is-absolute {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
}

.theme-dynamic-bg__base,
.theme-dynamic-bg__glow,
.theme-dynamic-bg__filter {
  position: absolute;
}

.theme-dynamic-bg__base {
  top: -18%;
  left: -18%;
  width: 136%;
  height: 136%;
}

.theme-dynamic-bg__glow {
  border-radius: 9999rpx;
  opacity: 0.78;
}

.theme-dynamic-bg__glow-a {
  top: -10%;
  left: -16%;
}

.theme-dynamic-bg__glow-b {
  top: 4%;
  right: -18%;
}

.theme-dynamic-bg__glow-c {
  right: 12%;
  bottom: -12%;
}

.theme-dynamic-bg__filter {
  right: 0;
  bottom: 0;
  left: 0;
  height: 62%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(245, 247, 251, 0.68));
}

@keyframes themeDynamicBase {
  from {
    transform: translate(-2%, -1%) scale(1);
  }
  to {
    transform: translate(3%, 2%) scale(1.04);
  }
}

@keyframes themeDynamicGlowA {
  from {
    transform: translate(-10%, -8%) scale(1);
  }
  to {
    transform: translate(22%, 18%) scale(1.16);
  }
}

@keyframes themeDynamicGlowB {
  from {
    transform: translate(16%, -8%) scale(1.08);
  }
  to {
    transform: translate(-20%, 22%) scale(0.96);
  }
}

@keyframes themeDynamicGlowC {
  from {
    transform: translate(10%, 12%) scale(1);
  }
  to {
    transform: translate(-16%, -18%) scale(1.18);
  }
}
</style>
