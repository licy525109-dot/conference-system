<template>
  <div class="invitation-map">
    <div
      v-if="configured"
      ref="container"
      class="map-canvas"
      :aria-label="settings.address || '会议地图'"
    />
    <p v-if="failed" class="map-error" role="status">地图暂时无法加载</p>
    <div class="map-location">
      <div>
        <strong>{{ title }}</strong>
        <p>{{ settings.address }}</p>
      </div>
      <a
        v-if="settings.address"
        :href="`https://uri.amap.com/search?keyword=${encodeURIComponent(settings.address)}&callnative=1`"
        target="_blank"
        rel="noopener noreferrer"
        ><Location />导航</a
      >
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
} from "vue";
import { Location } from "@element-plus/icons-vue";
import type { InvitationModuleSettings } from "@conference/shared";
import type { Map, CircleMarker } from "leaflet";
import "leaflet/dist/leaflet.css";
const props = defineProps<{
  settings: InvitationModuleSettings;
  title: string;
}>();
const container = ref<HTMLElement>(),
  failed = ref(false);
const configured = computed(
  () => props.settings.latitude != null && props.settings.longitude != null,
);
let map: Map | undefined,
  marker: CircleMarker | undefined,
  observer: IntersectionObserver | undefined,
  disposed = false,
  initializing = false;
async function init() {
  if (!container.value || map || initializing || !configured.value) return;
  initializing = true;
  try {
    const L = await import("leaflet");
    if (disposed || !container.value || !configured.value) return;
    const latlng: [number, number] = [
      props.settings.latitude!,
      props.settings.longitude!,
    ];
    map = L.map(container.value, { scrollWheelZoom: false }).setView(
      latlng,
      props.settings.zoom,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      // Identify the site as required by the tile provider without leaking the personal URL.
      referrerPolicy: "origin",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    })
      .on("tileerror", () => {
        failed.value = true;
      })
      .on("tileload", () => {
        failed.value = false;
      })
      .addTo(map);
    marker = L.circleMarker(latlng, {
      radius: 9,
      fillColor: "#b83a45",
      color: "#f8fcfb",
      weight: 3,
      fillOpacity: 1,
    }).addTo(map);
    const popup = document.createElement("span");
    popup.textContent = props.settings.address || props.title;
    marker.bindPopup(popup);
  } catch {
    failed.value = true;
  } finally {
    initializing = false;
  }
}
function observe() {
  observer?.disconnect();
  if (!container.value) return;
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void init();
        observer?.disconnect();
      }
    },
    { rootMargin: "200px" },
  );
  observer.observe(container.value);
}
onMounted(observe);
watch(
  [
    () => props.settings.latitude,
    () => props.settings.longitude,
    () => props.settings.zoom,
    () => props.settings.address,
  ],
  async () => {
    if (configured.value && map) {
      const coordinates: [number, number] = [
        props.settings.latitude!,
        props.settings.longitude!,
      ];
      map.setView(coordinates, props.settings.zoom, { animate: false });
      marker?.setLatLng(coordinates);
      const text = document.createElement("span");
      text.textContent = props.settings.address || props.title;
      marker?.setPopupContent(text);
    } else {
      map?.remove();
      map = undefined;
      await nextTick();
      observe();
    }
  },
);
onBeforeUnmount(() => {
  disposed = true;
  observer?.disconnect();
  map?.remove();
});
</script>
<style scoped>
.map-canvas {
  height: 320px;
  width: 100%;
  z-index: 0;
  background: #edf1ee;
  border-radius: 4px;
}
.map-location {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-top: 18px;
}
.map-location strong {
  font-size: 17px;
}
.map-location p {
  font-size: 14px;
  margin: 6px 0 0;
  overflow-wrap: anywhere;
}
.map-location a {
  display: flex;
  gap: 7px;
  align-items: center;
  white-space: nowrap;
  color: var(--invite-primary);
}
.map-location svg {
  width: 18px;
  height: 18px;
}
.map-error {
  font-size: 12px;
  color: #a93b47;
}
.invitation-map :deep(.leaflet-container) {
  font-family: inherit;
}
@media (max-width: 600px) {
  .map-canvas {
    height: 260px;
  }
}
</style>
