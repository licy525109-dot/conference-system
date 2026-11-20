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
      ><span>{{ spec.label }}<template v-if="spec.limit !== null"> · ≤ {{ spec.limit }}MB</template><template v-else> · 不限大小</template></span>
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
        @click="libraryOpen = true"
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
    <InvitationAssetLibrary v-model="libraryOpen" :title="`${label} · 素材库`" :campaign-id="campaignId" :kind="kind" :disabled="disabled" @select="select($event[0])" />
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  Upload,
  FolderOpened,

} from "@element-plus/icons-vue";
import InvitationAssetLibrary from "./InvitationAssetLibrary.vue";
import { ElMessage } from "element-plus";
import { API_BASE_URL } from "../../config";
import {

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
    limit: null,
  },
};
const spec = computed(() => specs[props.kind]);
const fileInput = ref<HTMLInputElement>(),
  size = ref<{ width: number; height: number }>(),
  imageError = ref(false);
const uploading = ref(false),
  libraryOpen = ref(false);
let uploadGeneration = 0;
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
    uploadGeneration++;
    uploading.value = false;
    libraryOpen.value = false;
  },
);
onBeforeUnmount(() => {
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
async function upload(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (!file || props.disabled || uploading.value) return;
  const extension = "." + file.name.split(".").pop()?.toLowerCase();
  if (
    !spec.value.accept.split(",").includes(extension) ||
    (spec.value.limit !== null && file.size > spec.value.limit * 1024 * 1024)
  ) {
    ElMessage.error(
      spec.value.limit === null
        ? `请选择 ${spec.value.label} 文件`
        : `请选择 ${spec.value.limit}MB 以内的 ${spec.value.label} 文件`,
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
@media (max-width:600px){.asset-source > .el-input{flex-basis:100%}}
</style>
