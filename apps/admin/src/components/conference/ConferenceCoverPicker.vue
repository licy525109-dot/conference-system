<template>
  <div class="cover-picker">
    <div class="cover-preview" :class="{ 'cover-preview--empty': !modelValue }">
      <img v-if="modelValue" :src="modelValue" alt="会议封面预览" />
      <div v-else class="cover-empty">
        <Picture class="cover-empty__icon" />
        <strong>尚未设置会议封面</strong>
        <span>上传图片或从素材库选择</span>
      </div>
    </div>

    <div class="cover-actions">
      <el-button type="primary" :icon="Upload" :loading="uploading" @click="triggerUpload">
        {{ modelValue ? "替换图片" : "上传图片" }}
      </el-button>
      <el-button :icon="FolderOpened" :disabled="uploading" @click="openMaterialPicker">从素材库选择</el-button>
      <el-button v-if="modelValue" type="danger" plain :icon="Delete" :disabled="uploading" @click="clearCover">移除</el-button>
    </div>
    <el-progress v-if="uploading" :percentage="uploadProgress" :stroke-width="6" />
    <p class="cover-help">建议 750 × 420，支持 JPG、PNG、WebP，单张不超过 2MB。上传后会自动进入素材库。</p>

    <el-dialog v-model="materialVisible" title="选择会议封面" width="820px" append-to-body>
      <div class="material-picker">
        <div class="material-search">
          <el-input v-model="materialKeyword" clearable placeholder="搜索素材名称" @keyup.enter="loadMaterials" />
          <el-button :loading="materialLoading" @click="loadMaterials">搜索</el-button>
        </div>
        <el-empty v-if="!materialLoading && materialAssets.length === 0" description="暂无可用图片素材" />
        <div v-else class="material-grid">
          <button
            v-for="asset in materialAssets"
            :key="asset.id"
            type="button"
            class="material-card"
            @click="chooseMaterial(asset)"
          >
            <img :src="asset.url" :alt="asset.name" />
            <strong>{{ asset.name }}</strong>
            <span>{{ asset.width || "-" }} × {{ asset.height || "-" }}</span>
          </button>
        </div>
      </div>
    </el-dialog>

    <input ref="uploadInput" class="hidden-file" type="file" accept="image/jpeg,image/png,image/webp" @change="handleUploadChange" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ElMessage } from "element-plus";
import { Delete, FolderOpened, Picture, Upload } from "@element-plus/icons-vue";
import { materialSpecs, validateMaterialFile } from "../../constants/materialSpecs";
import { createMaterial, listMaterials } from "../../services/admin";
import type { MaterialAsset } from "../../services/types";

defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
}>();

const uploadInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const uploadProgress = ref(0);
const materialVisible = ref(false);
const materialLoading = ref(false);
const materialKeyword = ref("");
const materialAssets = ref<MaterialAsset[]>([]);

function triggerUpload() {
  uploadInput.value?.click();
}

async function handleUploadChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  const validationMessage = validateMaterialFile(file, materialSpecs.conferenceCover);
  if (validationMessage) {
    ElMessage.error(validationMessage);
    return;
  }

  uploading.value = true;
  uploadProgress.value = 1;
  try {
    const asset = await createMaterial({
      name: file.name.replace(/\.[^.]+$/, ""),
      usage: "conference_cover",
      file,
      remark: "会议封面上传自动入库",
      onProgress: (percent) => {
        uploadProgress.value = percent;
      }
    });
    emit("update:modelValue", asset.url);
    ElMessage.success("会议封面已上传");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "会议封面上传失败");
  } finally {
    uploading.value = false;
    uploadProgress.value = 0;
  }
}

async function openMaterialPicker() {
  materialVisible.value = true;
  await loadMaterials();
}

async function loadMaterials() {
  materialLoading.value = true;
  try {
    const response = await listMaterials({ page: 1, pageSize: 80, keyword: materialKeyword.value, enabled: true });
    materialAssets.value = response.items.filter(isImageAsset);
  } finally {
    materialLoading.value = false;
  }
}

function chooseMaterial(asset: MaterialAsset) {
  emit("update:modelValue", asset.url);
  materialVisible.value = false;
  ElMessage.success("已应用素材库封面");
}

function clearCover() {
  emit("update:modelValue", "");
}

function isImageAsset(asset: MaterialAsset): boolean {
  return asset.enabled && (asset.fileType.startsWith("image/") || /\.(png|jpe?g|webp)(\?|$)/i.test(asset.url));
}
</script>

<style scoped>
.cover-picker {
  width: min(100%, 720px);
}

.cover-preview {
  position: relative;
  width: min(100%, 520px);
  aspect-ratio: 25 / 14;
  overflow: hidden;
  border: 1px solid var(--admin-color-border);
  border-radius: 8px;
  background: #f6f8fa;
}

.cover-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-preview--empty {
  border-style: dashed;
}

.cover-empty {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--admin-color-muted);
}

.cover-empty strong {
  color: var(--admin-color-text);
}

.cover-empty__icon {
  width: 34px;
  color: #8795a6;
}

.cover-actions,
.material-search {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cover-actions {
  margin-top: 12px;
}

.cover-help {
  margin: 8px 0 0;
  color: var(--admin-color-muted);
  font-size: 12px;
  line-height: 1.5;
}

.material-picker {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.material-search .el-input {
  flex: 1;
}

.material-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  max-height: 520px;
  overflow-y: auto;
}

.material-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
  padding: 8px;
  border: 1px solid var(--admin-color-border);
  border-radius: 8px;
  background: #ffffff;
  color: var(--admin-color-text);
  text-align: left;
  cursor: pointer;
}

.material-card:hover,
.material-card:focus-visible {
  border-color: var(--admin-color-primary);
  outline: none;
  box-shadow: var(--admin-shadow-soft);
}

.material-card img {
  width: 100%;
  aspect-ratio: 25 / 14;
  object-fit: cover;
  border-radius: 6px;
  background: #eef3f7;
}

.material-card strong,
.material-card span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-card span {
  color: var(--admin-color-muted);
  font-size: 12px;
}

.hidden-file {
  display: none;
}

@media (max-width: 760px) {
  .cover-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
