<template>
  <div class="invite-asset-field">
    <div
      v-if="kind === 'image' && modelValue"
      class="asset-preview"
      :class="{ compact }"
    >
      <img
        :src="assetUrl(modelValue)"
        :alt="label"
        @load="loaded"
        @error="imageError = true"
      />
    </div>
    <div class="asset-meta">
      <span v-if="size">原图 {{ size.width }} × {{ size.height }} px</span
      ><span v-if="recommended">建议 {{ recommended }}</span
      ><span>{{ spec.label }} · ≤ {{ spec.limit }}MB</span>
    </div>
    <span v-if="imageError" class="asset-error">图片无法加载，请检查地址</span>
    <div class="asset-source">
      <el-input
        :model-value="modelValue"
        :aria-label="label"
        :disabled="disabled || uploading"
        placeholder="HTTPS 地址"
        clearable
        @update:model-value="$emit('update:modelValue', $event)"
      />
      <el-button
        :icon="Upload"
        :disabled="disabled"
        :loading="uploading"
        @click="fileInput?.click()"
        >上传</el-button
      >
      <el-button
        :icon="FolderOpened"
        :disabled="disabled || uploading"
        @click="openLibrary"
        >素材库</el-button
      >
    </div>
    <input
      ref="fileInput"
      type="file"
      :accept="spec.accept"
      hidden
      :aria-label="`上传${label}`"
      @change="upload"
    />
    <el-drawer
      v-model="libraryOpen"
      :title="`${label} · 素材库`"
      size="min(94vw, 780px)"
      append-to-body
    >
      <div class="asset-library-search">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索素材名称"
          :prefix-icon="Search"
          aria-label="搜索素材名称"
          @keyup.enter="
            page = 1;
            load();
          "
          @clear="
            page = 1;
            load();
          "
        /><el-button
          :icon="Search"
          @click="
            page = 1;
            load();
          "
          >搜索</el-button
        >
      </div>
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
      /><el-button v-if="error" :icon="Refresh" @click="load">重试</el-button>
      <el-skeleton v-if="loading" :rows="6" animated />
      <div v-else class="asset-library-grid">
        <button
          v-for="item in assets"
          :key="item.id"
          type="button"
          class="asset-library-item"
          :aria-label="`选择素材 ${item.name}`"
          @click="select(item)"
        >
          <img
            v-if="kind === 'image'"
            :src="assetUrl(item.url)"
            :alt="item.name"
            loading="lazy"
          />
          <div v-else class="asset-library-symbol">
            <el-icon
              ><component
                :is="
                  kind === 'video'
                    ? VideoPlay
                    : kind === 'audio'
                      ? Headset
                      : Document
                " /></el-icon
            ><span>{{
              kind === "font" ? "Aa 字体" : kind === "audio" ? "音频" : "视频"
            }}</span>
          </div>
          <strong>{{ item.name }}</strong
          ><small>{{
            item.sizeBytes
              ? (item.sizeBytes / 1024 / 1024).toFixed(2) + " MB"
              : item.fileType
          }}</small>
        </button>
      </div>
      <el-empty
        v-if="!loading && !error && !assets.length"
        description="暂无符合条件的素材"
      />
      <template #footer
        ><el-pagination
          v-if="total > 24"
          v-model:current-page="page"
          :page-size="24"
          :total="total"
          layout="prev, pager, next"
          @current-change="load"
      /></template>
    </el-drawer>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  Upload,
  FolderOpened,
  Search,
  Refresh,
  VideoPlay,
  Headset,
  Document,
} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { API_BASE_URL } from "../../config";
import {
  getInvitationAssets,
  uploadInvitationAsset,
  type InvitationAsset,
} from "../../services/invitations";
const props = withDefaults(
  defineProps<{
    modelValue: string;
    campaignId: string;
    label: string;
    kind?: "image" | "video" | "audio" | "font";
    disabled?: boolean;
    compact?: boolean;
    recommended?: string;
  }>(),
  { kind: "image" },
);
const emit = defineEmits<{
  "update:modelValue": [value: string];
  dimensions: [size: { width: number; height: number }];
  asset: [value: InvitationAsset];
}>();
const specs = {
  image: {
    accept: ".jpg,.jpeg,.png,.webp",
    label: "JPG / PNG / WebP",
    limit: 2,
  },
  video: { accept: ".mp4", label: "MP4", limit: 20 },
  audio: { accept: ".mp3,.wav,.ogg", label: "MP3 / WAV / OGG", limit: 20 },
  font: {
    accept: ".woff2,.woff,.ttf,.otf",
    label: "WOFF2 / WOFF / TTF / OTF",
    limit: 5,
  },
};
const spec = computed(() => specs[props.kind]);
const fileInput = ref<HTMLInputElement>(),
  size = ref<{ width: number; height: number }>(),
  imageError = ref(false);
const uploading = ref(false),
  libraryOpen = ref(false),
  keyword = ref(""),
  page = ref(1),
  loading = ref(false),
  error = ref(""),
  assets = ref<InvitationAsset[]>([]),
  total = ref(0);
let generation = 0,
  uploadGeneration = 0;
const assetUrl = (url: string) =>
  url.startsWith("/") ? new URL(API_BASE_URL).origin + url : url;
watch(
  () => props.modelValue,
  () => {
    size.value = undefined;
    imageError.value = false;
  },
);
watch(
  () => [props.campaignId, props.kind],
  () => {
    generation++;
    uploadGeneration++;
    uploading.value = false;
    libraryOpen.value = false;
  },
);
onBeforeUnmount(() => {
  generation++;
  uploadGeneration++;
});
function loaded(event: Event) {
  const img = event.target as HTMLImageElement;
  imageError.value = false;
  size.value = { width: img.naturalWidth, height: img.naturalHeight };
  emit("dimensions", size.value);
}
function select(item: InvitationAsset) {
  if (props.disabled) return;
  emit("update:modelValue", item.url);
  emit("asset", item);
  libraryOpen.value = false;
}
function openLibrary() {
  libraryOpen.value = true;
  page.value = 1;
  void load();
}
async function load() {
  const current = ++generation;
  loading.value = true;
  error.value = "";
  try {
    const result = await getInvitationAssets(
      props.campaignId,
      props.kind,
      keyword.value,
      page.value,
    );
    if (current === generation) {
      assets.value = result.items;
      total.value = result.total;
    }
  } catch (e) {
    if (current === generation)
      error.value = e instanceof Error ? e.message : "素材加载失败";
  } finally {
    if (current === generation) loading.value = false;
  }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (!file || props.disabled || uploading.value) return;
  const extension = "." + file.name.split(".").pop()?.toLowerCase();
  if (
    !spec.value.accept.split(",").includes(extension) ||
    file.size > spec.value.limit * 1024 * 1024
  ) {
    ElMessage.error(
      `请选择 ${spec.value.limit}MB 以内的 ${spec.value.label} 文件`,
    );
    return;
  }
  const current = ++uploadGeneration;
  uploading.value = true;
  try {
    const asset = await uploadInvitationAsset(props.campaignId, file);
    if (current === uploadGeneration && !props.disabled) {
      select(asset);
      ElMessage.success("已上传并保存到素材库");
    }
  } catch (e) {
    if (current === uploadGeneration)
      ElMessage.error(e instanceof Error ? e.message : "上传失败");
  } finally {
    if (current === uploadGeneration) uploading.value = false;
  }
}
</script>
<style scoped>
.invite-asset-field {
  width: 100%;
  min-width: 0;
}
.asset-preview {
  height: 150px;
  background: #f0f3f4;
  margin-bottom: 10px;
  border-radius: 4px;
  overflow: hidden;
}
.asset-preview.compact {
  height: 92px;
}
.asset-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.asset-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 11px;
  color: #747e87;
  line-height: 1.6;
  margin-bottom: 10px;
}
.asset-source {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.asset-source > .el-input {
  flex: 1 1 180px;
  min-width: 0;
}
.asset-source :deep(.el-button + .el-button) {
  margin-left: 0;
}
.asset-error {
  color: #a73446;
  font-size: 12px;
}
.asset-library-search {
  display: flex;
  gap: 10px;
  margin-bottom: 24px;
}
.asset-library-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.asset-library-item {
  min-width: 0;
  text-align: left;
  border: 1px solid #e2e6e9;
  border-radius: 6px;
  background: #fcfdfd;
  padding: 8px;
  cursor: pointer;
  color: #283238;
  transition: border-color 0.2s;
}
.asset-library-item:hover,
.asset-library-item:focus-visible {
  border-color: #287264;
  outline: 2px solid #d9ede8;
}
.asset-library-item img,
.asset-library-symbol {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: contain;
  background: #eef2f3;
  border-radius: 3px;
}
.asset-library-item strong {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-top: 10px;
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.asset-library-item small {
  font-size: 11px;
  color: #78848a;
}
.asset-library-symbol {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  color: #65776f;
}
.asset-library-symbol .el-icon {
  font-size: 28px;
}
@media (max-width: 600px) {
  .asset-library-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .asset-source > .el-input {
    flex-basis: 100%;
  }
}
</style>
