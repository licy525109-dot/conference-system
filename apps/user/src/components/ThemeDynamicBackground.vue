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
const motionSeconds = computed(() => Math.max(5, Math.round(20 - speed.value * 0.34)));
const density = computed(() => Math.max(10, Math.min(100, Number(props.theme.backgroundDynamicDensity) || 40)));
const fromColor = computed(() => normalizeColor(props.theme.backgroundGradientFrom || props.theme.backgroundColor || "#f5f7fb"));
const toColor = computed(() => normalizeColor(props.theme.backgroundGradientTo || props.theme.secondaryColor || "#3a8f79"));
const accentColor = computed(() => normalizeColor(props.theme.accentColor || "#b58b47"));
const primaryColor = computed(() => normalizeColor(props.theme.primaryColor || "#315d7d"));

const rootStyle = computed(() => ({
  backgroundColor: props.theme.backgroundColor || "#f5f7fb"
}));

const baseStyle = computed(() => ({
  background: [
    `radial-gradient(circle at 14% 12%, ${withAlpha(primaryColor.value, 0.58)} 0, transparent 34%)`,
    `radial-gradient(circle at 88% 18%, ${withAlpha(toColor.value, 0.52)} 0, transparent 38%)`,
    `radial-gradient(circle at 22% 82%, ${withAlpha(accentColor.value, 0.36)} 0, transparent 42%)`,
    `linear-gradient(132deg, ${fromColor.value} 0%, ${toColor.value} 56%, ${withAlpha(accentColor.value, 0.5)} 132%)`
  ].join(", "),
  backgroundSize: "190% 190%",
  animation: `themeDynamicBase ${motionSeconds.value}s ease-in-out infinite alternate`
}));

const glowAStyle = computed(() => glowStyle(primaryColor.value, toColor.value, 0.34, 0.16, 560 + density.value * 4, motionSeconds.value * 0.78, "themeDynamicGlowA"));
const glowBStyle = computed(() => glowStyle(toColor.value, accentColor.value, 0.32, 0.16, 520 + density.value * 3.6, motionSeconds.value * 0.9, "themeDynamicGlowB"));
const glowCStyle = computed(() => glowStyle(accentColor.value, fromColor.value, 0.24, 0.1, 460 + density.value * 3.4, motionSeconds.value * 0.84, "themeDynamicGlowC"));

function glowStyle(colorA: string, colorB: string, alphaA: number, alphaB: number, size: number, duration: number, animationName: string): Record<string, string> {
  return {
    width: `${Math.round(size)}rpx`,
    height: `${Math.round(size * 0.78)}rpx`,
    background: `radial-gradient(circle at 50% 50%, ${withAlpha(colorA, alphaA)} 0, ${withAlpha(colorB, alphaB)} 42%, rgba(255,255,255,0) 72%)`,
    animation: `${animationName} ${Math.max(5, Math.round(duration))}s ease-in-out infinite alternate`
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
  top: -24%;
  left: -24%;
  width: 148%;
  height: 148%;
}

.theme-dynamic-bg__glow {
  border-radius: 9999rpx;
  opacity: 0.82;
  filter: blur(32rpx);
  mix-blend-mode: normal;
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
  right: -18%;
  bottom: 2%;
  opacity: 0.5;
}

.theme-dynamic-bg__filter {
  right: 0;
  bottom: 0;
  left: 0;
  height: 56%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(245, 247, 246, 0.54));
}

@keyframes themeDynamicBase {
  from {
    transform: translate(-5%, -4%) scale(1);
  }
  to {
    transform: translate(6%, 5%) scale(1.08);
  }
}

@keyframes themeDynamicGlowA {
  from {
    transform: translate(-18%, -12%) scale(1);
  }
  to {
    transform: translate(26%, 22%) scale(1.2);
  }
}

@keyframes themeDynamicGlowB {
  from {
    transform: translate(18%, -12%) scale(1.08);
  }
  to {
    transform: translate(-24%, 24%) scale(0.94);
  }
}

@keyframes themeDynamicGlowC {
  from {
    transform: translate(12%, 18%) scale(1);
  }
  to {
    transform: translate(-24%, -24%) scale(1.2);
  }
}
</style>
