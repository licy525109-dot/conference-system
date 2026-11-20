<template>
  <section class="organization-import">
    <label
      >单位分组
      <el-select
        v-model="role"
        filterable
        allow-create
        default-first-option
        aria-label="批量添加的单位分组"
        :disabled="disabled || busy"
      >
        <el-option
          v-for="name in roles"
          :key="name"
          :label="name"
          :value="name"
        />
      </el-select>
    </label>
    <el-button
      :disabled="disabled || busy || !role.trim() || available < 1"
      @click="picker?.click()"
    >
      {{ busy ? progress : "批量添加 Logo" }}
    </el-button>
    <input
      ref="picker"
      hidden
      type="file"
      multiple
      accept=".png,.jpg,.jpeg,.webp"
      @change="upload"
    />
    <el-button
      :disabled="disabled || busy || !available"
      @click="textOpen = !textOpen"
      >添加纯文字单位</el-button
    >
    <small>{{ items.length }} / {{ INVITATION_ORGANIZATION_LIMIT }} 家</small>
    <form v-if="textOpen" class="text-units" @submit.prevent="addNames">
      <el-input
        v-model="textNames"
        type="textarea"
        :rows="2"
        aria-label="纯文字单位名称"
        placeholder="每行一个单位名称"
        :disabled="disabled || busy"
      />
      <el-button
        native-type="submit"
        :disabled="disabled || busy || !textNames.trim()"
        >加入分组</el-button
      >
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import {
  INVITATION_ORGANIZATION_LIMIT,
  type InvitationModule,
  type InvitationModuleItem,
} from "@conference/shared";
import { uploadInvitationAsset } from "../../services/invitations";

const props = defineProps<{
  module: InvitationModule;
  campaignId: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ append: [items: InvitationModuleItem[]] }>();
const items = computed(() => props.module.items || []);
const roles = computed(() => [
  ...new Set(
    [
      ...items.value.map((unit) => unit.title),
      "指导单位",
      "主办单位",
      "联合主办",
      "协办单位",
      "战略协同",
      "平台协同",
      "会务协同",
    ].filter(Boolean),
  ),
]);
const role = ref("主办单位");
const picker = ref<HTMLInputElement>();
const busy = ref(false);
const textOpen = ref(false),
  textNames = ref("");
function addNames() {
  const names = textNames.value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const title = role.value.trim().slice(0, 120);
  if (!names.length || !title || props.disabled || busy.value) return;
  if (names.length > available.value || names.some((n) => n.length > 2000))
    return ElMessage.warning("请检查可添加数量及单位名称长度");
  emit(
    "append",
    names.map((description) => ({
      id: crypto.randomUUID(),
      title,
      description,
      imageUrl: "",
      href: "",
      icon: "link",
      body: [],
    })),
  );
  textOpen.value = false;
  textNames.value = "";
}
const progress = ref("");
const available = computed(
  () => INVITATION_ORGANIZATION_LIMIT - items.value.length,
);
let generation = 0;
watch(
  () => [props.campaignId, props.module.id],
  () => {
    generation++;
    busy.value = false;
  },
);
onBeforeUnmount(() => {
  generation++;
});

async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = "";
  if (!files.length || busy.value || props.disabled) return;
  if (files.length > available.value)
    return ElMessage.warning(
      `本组还可添加 ${available.value} 家，请减少选择数量`,
    );
  if (
    files.some(
      (file) =>
        !/\.(png|jpe?g|webp)$/i.test(file.name) || file.size > 2 * 1024 * 1024,
    )
  )
    return ElMessage.warning("请选择 2 MB 以内的 PNG、JPG 或 WebP 图片");
  const current = ++generation;
  const title = role.value.trim().slice(0, 120);
  if (!title) return;
  busy.value = true;
  const added: InvitationModuleItem[] = [];
  const failed: string[] = [];
  try {
    for (const [index, file] of files.entries()) {
      if (generation !== current || props.disabled) return;
      progress.value = `正在上传 ${index + 1} / ${files.length}`;
      try {
        const asset = await uploadInvitationAsset(props.campaignId, file);
        added.push({
          id: crypto.randomUUID(),
          title,
          description: file.name.replace(/\.[^.]+$/, ""),
          imageUrl: asset.url,
          href: "",
          icon: "link",
          body: [],
        });
      } catch {
        failed.push(file.name);
      }
    }
    if (generation !== current || props.disabled) return;
    if (added.length) emit("append", added);
    if (failed.length)
      ElMessage.warning(`上传失败：${failed.join("、")}，可单独重试`);
  } finally {
    if (generation === current) busy.value = false;
  }
}
</script>
<style scoped>
.organization-import {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin: 8px 0 16px;
}
.organization-import label {
  display: grid;
  gap: 6px;
  min-width: 140px;
  font-size: 13px;
}
.organization-import small {
  align-self: flex-end;
  line-height: 32px;
  color: #627068;
}
.text-units {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}
</style>
