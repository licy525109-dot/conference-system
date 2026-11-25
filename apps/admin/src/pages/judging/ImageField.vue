<template>
  <div class="j-image">
    <el-input
      :model-value="modelValue"
      placeholder="HTTPS 图片地址或平台图片路径"
      @update:model-value="emit('update:modelValue', $event)"
      clearable
    />
    <el-button v-if="hasPermission('material:view')" @click="openLibrary">素材库</el-button>
    <el-button v-if="eventId || hasPermission('material:write')" :loading="busy" @click="input?.click()"
      >上传</el-button
    >
    <input ref="input" hidden type="file" accept="image/jpeg,image/png,image/webp" @change="upload" />
    <el-dialog v-model="shown" title="选择图片素材" width="min(720px,94vw)" append-to-body>
      <el-input v-model="keyword" placeholder="素材名称，回车搜索" @keyup.enter="openLibrary" />
      <div class="j-assets">
        <button
          v-for="a in assets"
          :key="a.id"
          type="button"
          @click="
            emit('update:modelValue', a.url);
            shown = false;
          "
        >
          <img :src="judgingImageUrl(a.url)" :alt="a.name" />
          {{ a.name }}
        </button>
      </div>
      <el-empty v-if="!assets.length" description="尚无匹配图片" />
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { judgingApi, judgingImageUrl } from "../../services/judging";
import { ElMessage } from "element-plus";
import { createMaterial, listMaterials } from "../../services/admin";
import { useAdminSession } from "../../stores/admin-session";
import type { MaterialAsset } from "../../services/types";
const props = defineProps<{ modelValue: string; eventId?: string }>();
const emit = defineEmits<{ (e: "update:modelValue", v: string): void }>();
const { hasPermission } = useAdminSession();
const input = ref<HTMLInputElement>(),
  busy = ref(false),
  shown = ref(false),
  assets = ref<MaterialAsset[]>([]),
  keyword = ref("");
async function openLibrary() {
  try {
    shown.value = true;
    const r = await listMaterials({ page: 1, pageSize: 60, keyword: keyword.value, enabled: true });
    assets.value = r.items.filter((a) => /image|png|jpeg|webp|jpg/i.test(a.fileType + " " + a.url));
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}
async function upload(e: Event) {
  const field = e.target as HTMLInputElement,
    f = field.files?.[0];
  if (!f) return;
  busy.value = true;
  try {
    const a = props.eventId
      ? await judgingApi.uploadDesignImage(props.eventId, f)
      : await createMaterial({ name: f.name, usage: "conference_cover", file: f });
    emit("update:modelValue", a.url);
  } catch (err) {
    ElMessage.error((err as Error).message);
  } finally {
    field.value = "";
    busy.value = false;
  }
}
</script>
<style scoped>
.j-image {
  display: flex;
  gap: 6px;
  align-items: center;
  width: 100%;
}
.j-assets {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 12px;
}
.j-assets button {
  background: #fff;
  border: 1px solid #ddd;
  padding: 6px;
}
.j-assets img {
  width: 100%;
  height: 70px;
  object-fit: contain;
}
</style>
