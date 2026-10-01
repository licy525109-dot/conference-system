<template>
  <div class="extra-module-editor">
    <template v-if="module.type === 'video' || module.type === 'audio'">
      <el-form-item :label="module.type === 'video' ? '视频素材' : '音频素材'"
        ><InvitationAssetField
          :model-value="settings.mediaUrl"
          :campaign-id="campaignId"
          :kind="module.type"
          :label="module.type === 'video' ? '视频' : '音频'"
          :disabled="disabled"
          @update:model-value="patchSettings({ mediaUrl: $event })"
      /></el-form-item>
      <el-form-item v-if="module.type === 'video'" label="视频封面"
        ><InvitationImageField
          :model-value="settings.posterUrl"
          :campaign-id="campaignId"
          label="视频封面"
          :disabled="disabled"
          @update:model-value="patchSettings({ posterUrl: $event })"
      /></el-form-item>
    </template>
    <template v-if="module.type === 'map'">
      <el-form-item label="会场地址"
        ><el-input
          :model-value="settings.address"
          :disabled="disabled"
          maxlength="300"
          @update:model-value="patchSettings({ address: $event })"
      /></el-form-item>
      <div class="extra-fields">
        <el-form-item label="纬度（WGS84）"
          ><el-input-number
            :model-value="settings.latitude"
            :min="-90"
            :max="90"
            :precision="6"
            :controls="false"
            :disabled="disabled"
            @update:model-value="
              patchSettings({ latitude: $event ?? null })
            " /></el-form-item
        ><el-form-item label="经度（WGS84）"
          ><el-input-number
            :model-value="settings.longitude"
            :min="-180"
            :max="180"
            :precision="6"
            :controls="false"
            :disabled="disabled"
            @update:model-value="patchSettings({ longitude: $event ?? null })"
        /></el-form-item>
      </div>
      <el-form-item label="地图缩放"
        ><el-slider
          :model-value="settings.zoom"
          :min="3"
          :max="18"
          :disabled="disabled"
          @update:model-value="patchSettings({ zoom: Number($event) })"
      /></el-form-item>
    </template>
    <el-form-item
      v-if="module.type === 'guests' || module.type === 'links'"
      label="展示形式"
      ><el-radio-group
        :model-value="settings.layout"
        :disabled="disabled"
        @update:model-value="
          patchSettings({ layout: $event === 'list' ? 'list' : 'grid' })
        "
        ><el-radio-button value="grid">网格</el-radio-button
        ><el-radio-button value="list"
          >纵向列表</el-radio-button
        ></el-radio-group
      ></el-form-item
    >
    <template v-if="module.type === 'carousel'">
      <el-form-item label="切换效果"
        ><el-select
          :model-value="settings.effect"
          :disabled="disabled"
          aria-label="轮播切换效果"
          @update:model-value="patchSettings({ effect: $event })"
          ><el-option label="水平滑动" value="slide" /><el-option
            label="淡入淡出"
            value="fade" /><el-option
            label="立体旋转"
            value="coverflow" /><el-option
            label="翻转"
            value="flip" /></el-select
      ></el-form-item>
      <div class="extra-fields">
        <el-form-item label="自动轮播"
          ><el-switch
            :model-value="settings.autoplay"
            :disabled="disabled"
            @update:model-value="
              patchSettings({ autoplay: Boolean($event) })
            " /></el-form-item
        ><el-form-item v-if="settings.autoplay" label="切换间隔（秒）"
          ><el-input-number
            :model-value="settings.interval / 1000"
            :min="3"
            :max="15"
            :disabled="disabled"
            @update:model-value="
              patchSettings({ interval: Number($event) * 1000 })
            "
        /></el-form-item>
      </div>
    </template>
    <div
      v-if="module.type === 'carousel' || module.type === 'video'"
      class="extra-fields"
    >
      <el-form-item label="画面比例"
        ><el-select
          :model-value="settings.ratio"
          :disabled="disabled"
          @update:model-value="patchSettings({ ratio: $event })"
          ><el-option
            v-for="ratio in ['16/9', '4/3', '1/1', '3/4']"
            :key="ratio"
            :label="ratio.replace('/', ' : ')"
            :value="ratio" /></el-select
      ></el-form-item>
      <el-form-item label="图片适应"
        ><el-radio-group
          :model-value="settings.fit"
          :disabled="disabled"
          @update:model-value="
            patchSettings({ fit: $event === 'cover' ? 'cover' : 'contain' })
          "
          ><el-radio-button value="contain">完整显示</el-radio-button
          ><el-radio-button value="cover">铺满</el-radio-button></el-radio-group
        ></el-form-item
      >
    </div>
    <template v-if="['carousel', 'tabs', 'links'].includes(module.type)">
      <div class="extra-items-heading">
        <h3>
          {{
            module.type === "tabs"
              ? "标签页"
              : module.type === "links"
                ? "链接项目"
                : "轮播图片"
          }}
        </h3>
        <el-button
          :icon="Plus"
          :disabled="disabled || items.length >= 20"
          @click="addItem"
          >添加项目</el-button
        >
      </div>
      <el-empty v-if="!items.length" description="暂无项目" :image-size="64" />
      <el-collapse v-model="opened">
        <el-collapse-item
          v-for="(item, index) in items"
          :key="item.id"
          :name="item.id"
          :title="`${String(index + 1).padStart(2, '0')}　${item.title || '未命名项目'}`"
        >
          <div class="extra-item-commands">
            <el-button
              :icon="Top"
              title="项目上移"
              aria-label="项目上移"
              :disabled="disabled || index === 0"
              @click="move(index, -1)"
            /><el-button
              :icon="Bottom"
              title="项目下移"
              aria-label="项目下移"
              :disabled="disabled || index === items.length - 1"
              @click="move(index, 1)"
            /><el-button
              :icon="Delete"
              title="删除项目"
              aria-label="删除项目"
              :disabled="disabled"
              @click="setItems(items.filter((_, i) => i !== index))"
            />
          </div>
          <el-form-item label="项目标题"
            ><el-input
              :model-value="item.title"
              :disabled="disabled"
              maxlength="120"
              @update:model-value="patchItem(index, { title: $event })"
          /></el-form-item>
          <el-form-item v-if="module.type !== 'links'" label="图片（选填）"
            ><InvitationImageField
              :model-value="item.imageUrl"
              :campaign-id="campaignId"
              label="项目图片"
              :disabled="disabled"
              @update:model-value="patchItem(index, { imageUrl: $event })"
          /></el-form-item>
          <template v-if="module.type === 'links'"
            ><el-form-item label="图标"
              ><el-select
                :model-value="item.icon"
                :disabled="disabled"
                @update:model-value="patchItem(index, { icon: $event })"
                ><el-option
                  v-for="(label, icon) in iconLabels"
                  :key="icon"
                  :label="label"
                  :value="icon" /></el-select></el-form-item
          ></template>
          <InvitationRichTextEditor
            v-if="module.type === 'tabs'"
            :key="item.id"
            :model-value="item.body"
            :campaign-id="campaignId"
            :disabled="disabled"
            @update:model-value="patchItem(index, { body: $event })"
          />
          <el-form-item v-else label="说明（选填）"
            ><el-input
              :model-value="item.description"
              :disabled="disabled"
              type="textarea"
              :rows="3"
              maxlength="2000"
              @update:model-value="patchItem(index, { description: $event })"
          /></el-form-item>
          <el-form-item label="超链接（HTTPS / tel: / mailto:）"
            ><el-input
              :model-value="item.href"
              :disabled="disabled"
              maxlength="1500"
              @update:model-value="patchItem(index, { href: $event })"
          /></el-form-item>
        </el-collapse-item>
      </el-collapse>
    </template>
    <el-form-item v-if="module.type === 'search'" label="搜索范围"
      ><el-tag>议程</el-tag><el-tag>嘉宾</el-tag
      ><el-tag>公开名单</el-tag></el-form-item
    >
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { Plus, Delete, Top, Bottom } from "@element-plus/icons-vue";
import {
  normalizeInvitationModuleSettings,
  type InvitationModule,
  type InvitationModuleItem,
  type InvitationModuleSettings,
} from "@conference/shared";
import InvitationAssetField from "./InvitationAssetField.vue";
import InvitationImageField from "./InvitationImageField.vue";
import InvitationRichTextEditor from "./InvitationRichTextEditor.vue";
const props = defineProps<{
  module: InvitationModule;
  campaignId: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ patch: [value: Partial<InvitationModule>] }>();
const settings = computed(() =>
  normalizeInvitationModuleSettings(props.module.settings),
);
const items = computed(() => props.module.items || []),
  opened = ref<string[]>([]);
const iconLabels = {
  link: "链接",
  location: "地点",
  calendar: "日历",
  phone: "电话",
  ticket: "票券",
  video: "视频",
  document: "文档",
  star: "星标",
};
function patchSettings(value: Partial<InvitationModuleSettings>) {
  if (!props.disabled)
    emit("patch", { settings: { ...settings.value, ...value } });
}
function setItems(value: InvitationModuleItem[]) {
  if (!props.disabled) emit("patch", { items: value });
}
function patchItem(index: number, value: Partial<InvitationModuleItem>) {
  setItems(
    items.value.map((item, i) => (i === index ? { ...item, ...value } : item)),
  );
}
function addItem() {
  const id = crypto.randomUUID();
  setItems([
    ...items.value,
    {
      id,
      title: "",
      description: "",
      imageUrl: "",
      href: "",
      icon: "link",
      body: [],
    },
  ]);
  opened.value = [id];
}
function move(index: number, delta: number) {
  const next = [...items.value];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  setItems(next);
}
</script>
<style scoped>
.extra-module-editor {
  padding: 12px 0;
  min-width: 0;
}
.extra-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}
.extra-items-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #e3e8eb;
  padding-top: 24px;
  margin-top: 12px;
}
.extra-items-heading h3 {
  font-size: 15px;
  font-weight: 600;
}
.extra-item-commands {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin-bottom: 16px;
}
.extra-item-commands :deep(.el-button + .el-button) {
  margin: 0;
}
.extra-module-editor :deep(.el-select) {
  width: 100%;
}
.extra-module-editor :deep(.el-collapse-item__header) {
  font-size: 14px;
  overflow-wrap: anywhere;
  height: auto;
  min-height: 52px;
}
.extra-module-editor :deep(.el-tag) {
  margin-right: 8px;
}
@media (max-width: 600px) {
  .extra-fields {
    grid-template-columns: 1fr;
  }
  .extra-items-heading {
    gap: 8px;
  }
}
</style>
