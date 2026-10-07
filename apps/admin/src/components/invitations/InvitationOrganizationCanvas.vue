<template>
  <div
    ref="stage"
    class="organization-canvas"
    :class="{ editable, 'with-grid': editable && grid }"
    :style="{ aspectRatio: `${canvas.width}/${canvas.height}` }"
    @pointermove="drag"
    @pointerup="stop"
    @pointercancel="stop"
  >
    <div
      class="organization-canvas-sheet"
      :style="{
        width: `${canvas.width}px`,
        height: `${canvas.height}px`,
        transform: `scale(${scale})`,
        '--canvas-scale': scale || 1,
      }"
    >
      <component
        :is="!editable && item.href ? 'a' : 'div'"
        v-for="item in units"
        :key="item.id"
        :ref="
          (el: Element | ComponentPublicInstance | null) =>
            bind(`logo:${item.id}`, el)
        "
        :href="!editable ? item.href || undefined : undefined"
        :target="item.href.startsWith('https:') ? '_blank' : undefined"
        rel="noopener noreferrer"
        class="organization-canvas-logo"
        :class="{ selected: editable && selectedId === `logo:${item.id}` }"
        :data-canvas-id="`logo:${item.id}`"
        :style="position(frameFor(item))"
        :role="editable ? 'button' : undefined"
        :tabindex="editable ? 0 : undefined"
        :aria-label="
          editable ? `定位Logo ${item.description || item.title}` : undefined
        "
        @pointerdown="start($event, `logo:${item.id}`, frameFor(item))"
        @lostpointercapture="stop"
        @keydown="keyMove($event, `logo:${item.id}`, frameFor(item))"
      >
        <img
          v-if="item.imageUrl"
          :src="assetUrl(item.imageUrl)"
          :alt="item.description || item.title"
          draggable="false"
        />
        <span
          v-if="
            item.description &&
            (settings.showOrganizationNames || !item.imageUrl)
          "
          class="organization-canvas-name"
          >{{ item.description }}</span
        >
        <button
          v-if="editable && selectedId === `logo:${item.id}`"
          class="canvas-resize-handle"
          :aria-label="`调整Logo ${item.description || item.title}大小`"
          @pointerdown.stop="
            start($event, `logo:${item.id}`, frameFor(item), true)
          "
        />
      </component>
      <div
        v-for="label in canvas.labels.filter((item) => item.enabled)"
        :key="label.id"
        :ref="(el) => bind(label.id, el)"
        class="organization-canvas-label"
        :class="{ selected: editable && selectedId === `text:${label.id}` }"
        :data-canvas-id="`text:${label.id}`"
        :style="{
          ...position(label),
          color: label.color,
          fontFamily:
            fontFamily ||
            (label.font === 'custom'
              ? customFontFamily || 'var(--invite-custom-font)'
              : INVITATION_FONTS[label.font].family),
          fontSize: `${label.fontSize}px`,
          fontWeight: label.bold ? 700 : 400,
          fontStyle: label.italic ? 'italic' : 'normal',
          textDecoration: label.underline ? 'underline' : undefined,
          textAlign: label.align,
        }"
        :role="editable ? 'button' : undefined"
        :tabindex="editable ? 0 : undefined"
        :aria-label="editable ? `定位文字 ${label.text}` : undefined"
        @pointerdown="start($event, `text:${label.id}`, label)"
        @lostpointercapture="stop"
        @keydown="keyMove($event, `text:${label.id}`, label)"
      >
        <span>{{ label.text }}</span>
        <button
          v-if="editable && selectedId === `text:${label.id}`"
          class="canvas-resize-handle"
          :aria-label="`调整文字 ${label.text}大小`"
          @pointerdown.stop="start($event, `text:${label.id}`, label, true)"
        />
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue";
import {
  INVITATION_FONTS,
  arrangeInvitationOrganizations,
  normalizeInvitationFrame,
  normalizeInvitationModuleSettings,
  normalizeInvitationOrganizationCanvas,
  type InvitationCanvasFrame,
  type InvitationModule,
  type InvitationModuleItem,
} from "@conference/shared";
const props = defineProps<{
  module: InvitationModule;
  assetOrigin: string;
  editable?: boolean;
  selectedId?: string;
  grid?: boolean;
  fontFamily?: string;
  customFontFamily?: string;
}>();
const emit = defineEmits<{
  select: [id: string];
  change: [id: string, frame: InvitationCanvasFrame];
  start: [];
  commit: [];
}>();
const stage = ref<HTMLElement>(),
  width = ref(0);
const canvas = computed(() =>
  normalizeInvitationOrganizationCanvas(props.module.organizationCanvas),
);
const settings = computed(() =>
  normalizeInvitationModuleSettings(props.module.settings),
);
const units = computed(() =>
  (props.module.items || []).filter(
    (item) => item.imageUrl || item.description.trim(),
  ),
);
const fallback = computed(
  () => arrangeInvitationOrganizations(props.module).items || [],
);
const scale = computed(() => width.value / canvas.value.width);
const assetUrl = (url: string) =>
  url.startsWith("/uploads/") ? props.assetOrigin + url : url;
const frameFor = (item: InvitationModuleItem) =>
  normalizeInvitationFrame(
    item.frame || fallback.value.find((row) => row.id === item.id)?.frame,
  );
const position = (frame: InvitationCanvasFrame) => ({
  left: `${frame.x}%`,
  top: `${frame.y}%`,
  width: `${frame.width}%`,
  height: `${frame.height}%`,
});
const elements = new Map<string, HTMLElement>();
let observer: ResizeObserver | undefined;
let moving:
  | {
      id: string;
      frame: InvitationCanvasFrame;
      x: number;
      y: number;
      width: number;
      height: number;
      resize: boolean;
    }
  | undefined;
function bind(id: string, el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) elements.set(id, el);
  else elements.delete(id);
}
function fitText() {
  for (const label of canvas.value.labels) {
    const el = elements.get(label.id),
      span = el?.querySelector("span");
    if (!el || !span) continue;
    span.style.fontSize = `${label.fontSize}px`;
    if (
      span.scrollWidth <= el.clientWidth &&
      span.scrollHeight <= el.clientHeight
    )
      continue;
    let low = 1,
      high = label.fontSize;
    for (let i = 0; i < 10; i++) {
      const mid = (low + high) / 2;
      span.style.fontSize = `${mid}px`;
      if (
        span.scrollWidth <= el.clientWidth &&
        span.scrollHeight <= el.clientHeight
      )
        low = mid;
      else high = mid;
    }
    span.style.fontSize = `${low}px`;
  }
  for (const item of units.value) {
    const el = elements.get(`logo:${item.id}`),
      span = el?.querySelector<HTMLElement>(".organization-canvas-name");
    if (!el || !span) continue;
    const available = el.clientHeight * (item.imageUrl ? 0.35 : 1);
    let low = 1,
      high = 24;
    span.style.fontSize = "24px";
    if (span.scrollHeight <= available && span.scrollWidth <= el.clientWidth)
      continue;
    for (let i = 0; i < 10; i++) {
      const mid = (low + high) / 2;
      span.style.fontSize = `${mid}px`;
      if (span.scrollHeight <= available && span.scrollWidth <= el.clientWidth)
        low = mid;
      else high = mid;
    }
    span.style.fontSize = `${low}px`;
  }
}
function start(
  event: PointerEvent,
  id: string,
  frame: InvitationCanvasFrame,
  resize = false,
) {
  if (!props.editable || event.button !== 0) return;
  const bounds = stage.value!.getBoundingClientRect();
  moving = {
    id,
    frame: { ...frame },
    x: event.clientX,
    y: event.clientY,
    width: bounds.width,
    height: bounds.height,
    resize,
  };
  emit("select", id);
  emit("start");
  const target = (event.currentTarget as HTMLElement).closest<HTMLElement>(
    "[data-canvas-id]",
  )!;
  target.setPointerCapture(event.pointerId);
  target.focus({ preventScroll: true });
  event.preventDefault();
}
function drag(event: PointerEvent) {
  if (!moving || !props.editable) return;
  const dx = ((event.clientX - moving.x) / moving.width) * 100,
    dy = ((event.clientY - moving.y) / moving.height) * 100;
  const frame = moving.frame;
  emit(
    "change",
    moving.id,
    normalizeInvitationFrame(
      moving.resize
        ? {
            ...frame,
            width: Math.max(2, Math.min(100 - frame.x, frame.width + dx)),
            height: Math.max(1, Math.min(100 - frame.y, frame.height + dy)),
          }
        : { ...frame, x: frame.x + dx, y: frame.y + dy },
    ),
  );
}
function stop() {
  if (moving) {
    moving = undefined;
    emit("commit");
  }
}
function keyMove(
  event: KeyboardEvent,
  id: string,
  frame: InvitationCanvasFrame,
) {
  if (
    !props.editable ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  )
    return;
  event.preventDefault();
  emit("select", id);
  emit("start");
  const step = event.shiftKey ? 1 : 0.1;
  emit(
    "change",
    id,
    normalizeInvitationFrame({
      ...frame,
      x:
        frame.x +
        (event.key === "ArrowLeft"
          ? -step
          : event.key === "ArrowRight"
            ? step
            : 0),
      y:
        frame.y +
        (event.key === "ArrowUp"
          ? -step
          : event.key === "ArrowDown"
            ? step
            : 0),
    }),
  );
  emit("commit");
}
watch(
  () => [props.module, props.fontFamily, props.customFontFamily],
  () => nextTick(fitText),
  { deep: true },
);
onMounted(() => {
  document.fonts.addEventListener("loadingdone", fitText);
  observer = new ResizeObserver((entries) => {
    width.value = entries[0].contentRect.width;
    void nextTick(fitText);
  });
  observer.observe(stage.value!);
});
onBeforeUnmount(() => {
  document.fonts.removeEventListener("loadingdone", fitText);
  observer?.disconnect();
  moving = undefined;
});
</script>
<style scoped>
.organization-canvas {
  width: 100%;
  position: relative;
  overflow: hidden;
}
.organization-canvas.editable {
  background-color: #fafbf9;
  outline: 1px solid #dbe3df;
}
.organization-canvas.with-grid {
  background-image:
    linear-gradient(#e4eae4 1px, transparent 1px),
    linear-gradient(90deg, #e4eae4 1px, transparent 1px);
  background-size: 20px 20px;
}
.organization-canvas-sheet {
  position: absolute;
  left: 0;
  top: 0;
  transform-origin: top left;
}
.organization-canvas-logo,
.organization-canvas-label {
  position: absolute;
  margin: 0;
  min-width: 0;
}
.organization-canvas-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-decoration: none;
  color: inherit;
}
.organization-canvas-logo img {
  display: block;
  flex: 1;
  min-height: 0;
  width: 100%;
  object-fit: contain;
}
.organization-canvas-name {
  flex-shrink: 0;
  width: 100%;
  font-size: 24px;
  line-height: 1.3;
  overflow-wrap: anywhere;
  text-align: center;
  white-space: pre-line;
}
.organization-canvas-label {
  display: flex;
  align-items: center;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.organization-canvas-label > span {
  width: 100%;
  white-space: pre-line;
}
.editable [data-canvas-id] {
  cursor: move;
  touch-action: none;
  user-select: none;
  outline: 1px dashed #648b87;
}
.editable [data-canvas-id].selected {
  outline: calc(2px / var(--canvas-scale)) solid #087a8b;
}
.editable [data-canvas-id]:focus-visible {
  outline-color: #a6335d;
}
.canvas-resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  transform: translate(50%, 50%);
  width: calc(22px / var(--canvas-scale));
  height: calc(22px / var(--canvas-scale));
  border: calc(1px / var(--canvas-scale)) solid #087a8b;
  border-radius: 2px;
  background: #f7faf9;
  cursor: nwse-resize;
  touch-action: none;
  padding: 0;
  z-index: 2;
}
</style>
