<template>
  <el-drawer
    v-model="open"
    :title="title"
    size="min(94vw, 780px)"
    append-to-body
  >
    <div class="asset-library-search">
      <el-select v-model="category" aria-label="素材分类" @change="search">
        <el-option label="全部分类" value="" />
        <el-option
          v-for="group in groups"
          :key="group.code"
          :label="group.name"
          :value="group.code"
        />
        <el-option label="未分类" value="__none" />
      </el-select>
      <el-input
        v-model="keyword"
        clearable
        placeholder="搜索素材名称"
        :prefix-icon="Search"
        aria-label="搜索素材名称"
        @keyup.enter="search"
        @clear="search"
      /><el-button :icon="Search" @click="search">搜索</el-button>
    </div>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
    /><el-button v-if="error" :icon="Refresh" @click="load">重试</el-button>
    <el-skeleton v-if="loading" :rows="6" animated />
    <div v-else-if="!error" class="asset-library-grid">
      <button
        v-for="item in assets"
        :key="item.id"
        type="button"
        class="asset-library-item"
        :aria-label="`选择素材 ${item.name}`"
        :disabled="unavailable(item)"
        :aria-pressed="multiple ? chosen(item) : undefined"
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
        <span v-if="multiple" class="choice" aria-hidden="true">{{
          used(item) ? "已加入" : chosen(item) ? "✓" : "＋"
        }}</span>
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
      ><div class="library-footer">
        <el-pagination
          v-if="total > 24"
          v-model:current-page="page"
          :page-size="24"
          :total="total"
          layout="prev, pager, next"
          @current-change="load"
        />
        <div v-if="multiple" class="batch-actions">
          <el-button @click="open = false">取消</el-button>
          <el-button
            type="primary"
            :disabled="
              !selection.length || selection.length > limit || disabled
            "
            @click="confirm"
            >加入{{ role }}（{{ selection.length }}）</el-button
          >
        </div>
      </div></template
    >
  </el-drawer>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import {
  Search,
  Refresh,
  VideoPlay,
  Headset,
  Document,
} from "@element-plus/icons-vue";
import { API_BASE_URL } from "../../config";
import {
  getInvitationAssets,
  type InvitationAsset,
} from "../../services/invitations";
const props = withDefaults(
  defineProps<{
    campaignId: string;
    title: string;
    kind: "image" | "font" | "video" | "audio";
    multiple?: boolean;
    limit?: number;
    role?: string;
    usedUrls?: string[];
    disabled?: boolean;
  }>(),
  { limit: 1 },
);
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ select: [items: InvitationAsset[]] }>();
const keyword = ref(""),
  category = ref(""),
  page = ref(1),
  loading = ref(false),
  error = ref(""),
  total = ref(0);
const assets = ref<InvitationAsset[]>([]),
  groups = ref<{ code: string; name: string }[]>([]),
  selection = ref<InvitationAsset[]>([]);
const assetUrl = (url: string) =>
  url.startsWith("/") ? new URL(API_BASE_URL).origin + url : url;
const chosen = (item: InvitationAsset) =>
  selection.value.some((a) => assetUrl(a.url) === assetUrl(item.url));
const used = (item: InvitationAsset) =>
  props.usedUrls?.some((url) => assetUrl(url) === assetUrl(item.url)) ?? false;
const unavailable = (item: InvitationAsset) =>
  props.disabled ||
  (props.multiple &&
    (used(item) || (!chosen(item) && selection.value.length >= props.limit)));
function select(item: InvitationAsset) {
  if (unavailable(item)) return;
  if (!props.multiple) {
    emit("select", [item]);
    open.value = false;
    return;
  }
  selection.value = chosen(item)
    ? selection.value.filter((a) => assetUrl(a.url) !== assetUrl(item.url))
    : [...selection.value, item];
}
function confirm() {
  if (
    props.disabled ||
    !selection.value.length ||
    selection.value.length > props.limit ||
    selection.value.some(used)
  )
    return;
  emit("select", selection.value);
  open.value = false;
}
let request = 0;
watch(
  () => [props.campaignId, props.kind, props.role, props.disabled],
  () => {
    open.value = false;
  },
);
watch(open, (active) => {
  request++;
  selection.value = [];
  assets.value = [];
  groups.value = [];
  keyword.value = "";
  page.value = 1;
  category.value = props.multiple ? "logo" : "";
  if (active) void load();
});
function search() {
  page.value = 1;
  void load();
}
async function load() {
  const current = ++request;
  loading.value = true;
  error.value = "";
  try {
    const result = await getInvitationAssets(
      props.campaignId,
      props.kind,
      keyword.value.trim(),
      page.value,
      category.value,
    );
    if (current !== request) return;
    groups.value = result.categories || [];
    if (
      category.value === "logo" &&
      props.multiple &&
      !groups.value.some((group) => group.code === "logo") &&
      !result.total
    ) {
      category.value = "";
      await load();
      return;
    }
    assets.value = result.items;
    total.value = result.total;
  } catch (e) {
    if (current === request) {
      error.value = e instanceof Error ? e.message : "素材加载失败";
      total.value = 0;
    }
  } finally {
    if (current === request) loading.value = false;
  }
}
</script>
<style scoped>
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
}

.asset-library-item {
  position: relative;
}
.asset-library-item[aria-pressed="true"] {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary);
}
.asset-library-item:disabled {
  cursor: default;
  opacity: 0.64;
}
.choice {
  position: absolute;
  right: 12px;
  top: 12px;
  padding: 2px 6px;
  background: white;
  color: var(--el-color-primary);
  border: 1px solid #d9d5c8;
  border-radius: 4px;
}
.asset-library-item[aria-pressed="true"] .choice {
  background: var(--el-color-primary);
  color: white;
}
.library-footer,
.batch-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}
.asset-library-search .el-select {
  flex: 0 1 180px;
}
@media (max-width: 600px) {
  .asset-library-search {
    flex-wrap: wrap;
  }
  .asset-library-search .el-select {
    flex-basis: 100%;
  }
  .asset-library-search .el-input {
    flex: 1;
  }
}
</style>
