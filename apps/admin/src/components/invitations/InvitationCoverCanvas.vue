<template>
  <div
    ref="frame"
    class="invite-artwork"
    :class="{ 'is-editable': editable }"
    :style="{ aspectRatio: `${cover.width} / ${cover.height}` }"
  >
    <div
      class="invite-artwork__sheet"
      :style="{
        width: `${cover.width}px`,
        height: `${cover.height}px`,
        transform: `scale(${scale})`,
      }"
    >
      <img
        v-if="src"
        :src="src"
        :alt="title || '邀请函封面'"
        draggable="false"
        fetchpriority="high"
      />
      <div v-else class="invite-artwork__empty">封面</div>
      <div
        v-for="layer in cover.layers.filter((item) => item.enabled)"
        :key="layer.id"
        :ref="(el) => bindLayer(layer.id, el)"
        class="invite-artwork__text"
        :class="{ selected: editable && selectedId === layer.id }"
        :data-layer-id="layer.id"
        :style="layerStyle(layer)"
        :role="editable ? 'button' : undefined"
        :tabindex="editable ? 0 : undefined"
        :aria-label="editable ? `定位${layer.label}` : undefined"
        @pointerdown="startDrag($event, layer)"
        @pointermove="drag"
        @pointerup="stopDrag"
        @pointercancel="stopDrag"
        @lostpointercapture="stopDrag"
        @keydown="moveKey($event, layer)"
        @click="editable && $emit('select', layer.id)"
      >
        <span>{{ resolve(layer.text) }}</span>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue";
import {
  INVITATION_FONTS,
  type InvitationCover,
  type InvitationTextLayer,
} from "@conference/shared";
const props = defineProps<{
  cover: InvitationCover;
  src: string;
  title?: string;
  name: string;
  salutation?: string;
  organization?: string;
  role?: string;
  date?: string;
  location?: string;
  editable?: boolean;
  selectedId?: string;
  customFont?: string;
  fontFamily?: string;
}>();
const emit = defineEmits<{
  select: [id: string];
  change: [layer: InvitationTextLayer];
}>();
const frame = ref<HTMLElement>();
const width = ref(0);
const scale = computed(() => width.value / props.cover.width);
const elements = new Map<string, HTMLElement>();
let observer: ResizeObserver | undefined;
let moving:
  | {
      layer: InvitationTextLayer;
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | undefined;
function resolve(text: string) {
  const variables: Record<string, string> = {
    姓名: props.name,
    称谓: props.salutation || "",
    单位: props.organization || "",
    职务: props.role || "",
    会议名称: props.title || "",
    会议时间: props.date || "",
    会议地点: props.location || "",
  };
  return text.replace(
    /\{(姓名|称谓|单位|职务|会议名称|会议时间|会议地点)\}/g,
    (_, name: string) => variables[name],
  );
}
function layerStyle(layer: InvitationTextLayer) {
  return {
    left: `${layer.x}%`,
    top: `${layer.y}%`,
    width: `${layer.width}%`,
    height: `${layer.height}%`,
    color: layer.color,
    fontFamily:
      props.fontFamily ||
      (layer.font === "custom"
        ? props.customFont || INVITATION_FONTS.sans.family
        : INVITATION_FONTS[layer.font].family),
    fontWeight: layer.bold ? "700" : "400",
    fontStyle: layer.italic ? "italic" : "normal",
    textDecoration: layer.underline ? "underline" : "none",
    textAlign: layer.align,
    fontSize: `${layer.fontSize}px`,
  };
}
function bindLayer(id: string, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) elements.set(id, el);
  else elements.delete(id);
}
function fitText() {
  for (const layer of props.cover.layers) {
    const box = elements.get(layer.id),
      span = box?.firstElementChild as HTMLElement | undefined;
    if (!box || !span) continue;
    let low = 1,
      high = layer.fontSize;
    span.style.fontSize = `${high}px`;
    if (
      span.scrollHeight <= box.clientHeight &&
      span.scrollWidth <= box.clientWidth
    )
      continue;
    for (let i = 0; i < 10; i++) {
      const mid = (low + high) / 2;
      span.style.fontSize = `${mid}px`;
      if (
        span.scrollHeight <= box.clientHeight &&
        span.scrollWidth <= box.clientWidth
      )
        low = mid;
      else high = mid;
    }
    span.style.fontSize = `${low}px`;
  }
}
function startDrag(event: PointerEvent, layer: InvitationTextLayer) {
  if (!props.editable || event.button !== 0) return;
  const bounds = frame.value!.getBoundingClientRect();
  moving = {
    layer: { ...layer },
    x: event.clientX,
    y: event.clientY,
    width: bounds.width,
    height: bounds.height,
  };
  emit("select", layer.id);
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  (event.currentTarget as HTMLElement).focus({ preventScroll: true });
  event.preventDefault();
}
function position(layer: InvitationTextLayer, x: number, y: number) {
  emit("change", {
    ...layer,
    x: Math.round(Math.max(0, Math.min(100 - layer.width, x)) * 100) / 100,
    y: Math.round(Math.max(0, Math.min(100 - layer.height, y)) * 100) / 100,
  });
}
function drag(event: PointerEvent) {
  if (!moving || !props.editable) return;
  position(
    moving.layer,
    moving.layer.x + ((event.clientX - moving.x) / moving.width) * 100,
    moving.layer.y + ((event.clientY - moving.y) / moving.height) * 100,
  );
}
function stopDrag() {
  moving = undefined;
}
function moveKey(event: KeyboardEvent, layer: InvitationTextLayer) {
  if (
    !props.editable ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  )
    return;
  event.preventDefault();
  emit("select", layer.id);
  const step = event.shiftKey ? 1 : 0.1;
  position(
    layer,
    layer.x +
      (event.key === "ArrowLeft"
        ? -step
        : event.key === "ArrowRight"
          ? step
          : 0),
    layer.y +
      (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
  );
}
watch(
  () => [
    props.cover,
    props.name,
    props.salutation,
    props.organization,
    props.role,
    props.title,
    props.date,
    props.location,
    props.customFont,
    props.fontFamily,
  ],
  () => nextTick(fitText),
  { deep: true },
);
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    width.value = entries[0].contentRect.width;
    void nextTick(fitText);
  });
  observer.observe(frame.value!);
  void nextTick(fitText);
});
onBeforeUnmount(() => observer?.disconnect());
</script>
<style scoped>
.invite-artwork {
  width: 100%;
  position: relative;
  overflow: hidden;
  background: #f5f5f5;
}
.invite-artwork__sheet {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: top left;
}
.invite-artwork__sheet > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.invite-artwork__empty {
  display: grid;
  place-items: center;
  height: 100%;
  color: #adb1b4;
  font-size: 54px;
}
.invite-artwork__text {
  position: absolute;
  display: flex;
  align-items: center;
  line-height: 1.3;
  letter-spacing: 0;
  overflow-wrap: anywhere;
  box-sizing: border-box;
}
.invite-artwork__text span {
  width: 100%;
  max-height: 100%;
  white-space: pre-wrap;
}
.is-editable .invite-artwork__text {
  cursor: move;
  touch-action: none;
  user-select: none;
  outline: 3px dashed #397b85;
  outline-offset: 5px;
}
.is-editable .invite-artwork__text.selected {
  outline: 4px solid #087a8b;
}
.is-editable .invite-artwork__text:focus-visible {
  outline-color: #db4776;
}
</style>
