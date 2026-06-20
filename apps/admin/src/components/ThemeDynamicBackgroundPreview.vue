<template>
  <div v-if="visible" :class="['theme-dynamic-bg-preview', patternClass]" :style="rootStyle">
    <div class="theme-dynamic-bg-preview__base" :style="baseStyle" />
    <div class="theme-dynamic-bg-preview__glow theme-dynamic-bg-preview__glow-a" :style="glowAStyle" />
    <div class="theme-dynamic-bg-preview__glow theme-dynamic-bg-preview__glow-b" :style="glowBStyle" />
    <div class="theme-dynamic-bg-preview__glow theme-dynamic-bg-preview__glow-c" :style="glowCStyle" />
    <div v-if="theme.backgroundBottomFilter !== false" class="theme-dynamic-bg-preview__filter" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ThemeConfig } from "../services/types";

const props = withDefaults(
  defineProps<{
    theme: ThemeConfig;
    active?: boolean;
  }>(),
  {
    active: true
  }
);

const visible = computed(() => props.active && props.theme.backgroundMode === "dynamic-gradient");
const speed = computed(() => Math.max(6, Math.min(40, Number(props.theme.backgroundDynamicSpeed) || 18)));
const motionSeconds = computed(() => Math.max(4, Math.round(18 - speed.value * 0.28)));
const density = computed(() => Math.max(10, Math.min(100, Number(props.theme.backgroundDynamicDensity) || 40)));
const angle = computed(() => Math.max(0, Math.min(360, Number(props.theme.backgroundGradientAngle) || 135)));
const patternClass = computed(() => `pattern-${normalizePattern(props.theme.backgroundDynamicPattern)}`);
const fromColor = computed(() => normalizeColor(props.theme.backgroundGradientFrom || props.theme.backgroundColor || "#f5f7fb"));
const toColor = computed(() => normalizeColor(props.theme.backgroundGradientTo || props.theme.secondaryColor || "#3a8f79"));
const accentColor = computed(() => normalizeColor(props.theme.accentColor || "#b58b47"));
const primaryColor = computed(() => normalizeColor(props.theme.primaryColor || "#315d7d"));

const rootStyle = computed(() => ({
  backgroundColor: props.theme.backgroundColor || "#f5f7fb"
}));

const baseStyle = computed(() => ({
  background: [
    `radial-gradient(circle at 10% 12%, ${withAlpha(primaryColor.value, 0.72)} 0, transparent 36%)`,
    `radial-gradient(circle at 90% 14%, ${withAlpha(toColor.value, 0.66)} 0, transparent 42%)`,
    `radial-gradient(circle at 18% 86%, ${withAlpha(accentColor.value, 0.52)} 0, transparent 46%)`,
    `radial-gradient(circle at 72% 72%, ${withAlpha(primaryColor.value, 0.36)} 0, transparent 34%)`,
    `linear-gradient(${angle.value}deg, ${fromColor.value} 0%, ${toColor.value} 58%, ${withAlpha(accentColor.value, 0.64)} 138%)`
  ].join(", "),
  backgroundSize: "320% 320%",
  animation: `themeDynamicPreviewBase ${motionSeconds.value}s ease-in-out infinite alternate`
}));

const glowAStyle = computed(() => glowStyle(primaryColor.value, toColor.value, 0.54, 0.26, 340 + density.value * 3, motionSeconds.value * 0.68, "themeDynamicPreviewGlowA"));
const glowBStyle = computed(() => glowStyle(toColor.value, accentColor.value, 0.5, 0.24, 325 + density.value * 2.6, motionSeconds.value * 0.8, "themeDynamicPreviewGlowB"));
const glowCStyle = computed(() => glowStyle(accentColor.value, fromColor.value, 0.42, 0.2, 305 + density.value * 2.4, motionSeconds.value * 0.74, "themeDynamicPreviewGlowC"));

function glowStyle(colorA: string, colorB: string, alphaA: number, alphaB: number, size: number, duration: number, animationName: string): Record<string, string> {
  return {
    width: `${Math.round(size)}px`,
    height: `${Math.round(size * 0.78)}px`,
    background: `radial-gradient(circle at 50% 50%, ${withAlpha(colorA, alphaA)} 0, ${withAlpha(colorB, alphaB)} 42%, rgba(255,255,255,0) 72%)`,
    animation: `${animationName} ${Math.max(5, Math.round(duration))}s ease-in-out infinite alternate`
  };
}

function normalizeColor(value: string): string {
  const color = value.trim();
  return color || "#f5f7fb";
}

function normalizePattern(value: unknown): "flow" | "ripple" | "float" | "zoom" {
  return value === "ripple" || value === "float" || value === "zoom" ? value : "flow";
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

<style scoped>
.theme-dynamic-bg-preview {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.theme-dynamic-bg-preview__base,
.theme-dynamic-bg-preview__glow,
.theme-dynamic-bg-preview__filter {
  position: absolute;
}

.theme-dynamic-bg-preview.pattern-ripple::after,
.theme-dynamic-bg-preview.pattern-zoom::after {
  position: absolute;
  inset: -20%;
  content: "";
  opacity: 0.28;
}

.theme-dynamic-bg-preview.pattern-ripple::after {
  background: repeating-radial-gradient(circle at 52% 46%, rgba(255, 255, 255, 0.34) 0 1px, rgba(255, 255, 255, 0) 1px 18px);
  animation: themeDynamicPreviewRipple 8s linear infinite;
}

.theme-dynamic-bg-preview.pattern-zoom::after {
  background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.32), rgba(255, 255, 255, 0) 42%);
  animation: themeDynamicPreviewZoom 7s ease-in-out infinite alternate;
}

.theme-dynamic-bg-preview.pattern-float .theme-dynamic-bg-preview__glow {
  filter: blur(12px);
  opacity: 0.92;
}

.theme-dynamic-bg-preview__base {
  top: -24%;
  left: -24%;
  width: 148%;
  height: 148%;
}

.theme-dynamic-bg-preview__glow {
  border-radius: 9999px;
  opacity: 0.82;
  filter: blur(24px);
}

.theme-dynamic-bg-preview__glow-a {
  top: -10%;
  left: -16%;
}

.theme-dynamic-bg-preview__glow-b {
  top: 4%;
  right: -18%;
}

.theme-dynamic-bg-preview__glow-c {
  right: -18%;
  bottom: 2%;
  opacity: 0.5;
}

.theme-dynamic-bg-preview__filter {
  right: 0;
  bottom: 0;
  left: 0;
  height: 56%;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(245, 247, 246, 0.54));
}

@keyframes themeDynamicPreviewBase {
  from {
    transform: translate(-18%, -16%) scale(1);
  }
  to {
    transform: translate(18%, 16%) scale(1.24);
  }
}

@keyframes themeDynamicPreviewGlowA {
  from {
    transform: translate(-42%, -30%) scale(0.9);
  }
  to {
    transform: translate(44%, 38%) scale(1.36);
  }
}

@keyframes themeDynamicPreviewGlowB {
  from {
    transform: translate(38%, -28%) scale(1.18);
  }
  to {
    transform: translate(-44%, 38%) scale(0.86);
  }
}

@keyframes themeDynamicPreviewGlowC {
  from {
    transform: translate(30%, 38%) scale(0.9);
  }
  to {
    transform: translate(-42%, -42%) scale(1.36);
  }
}

@keyframes themeDynamicPreviewRipple {
  from {
    transform: translate3d(-6%, -4%, 0) scale(0.82) rotate(0deg);
  }
  to {
    transform: translate3d(6%, 5%, 0) scale(1.18) rotate(8deg);
  }
}

@keyframes themeDynamicPreviewZoom {
  from {
    transform: scale(0.7);
    opacity: 0.2;
  }
  to {
    transform: scale(1.28);
    opacity: 0.36;
  }
}
</style>
