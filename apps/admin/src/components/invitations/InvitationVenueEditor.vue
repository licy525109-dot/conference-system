<template>
  <section class="invitation-venue-editor">
    <el-radio-group
      :model-value="mode"
      aria-label="赴约信息来源"
      :disabled="disabled"
      @update:model-value="setMode(String($event))"
    >
      <el-radio-button value="meeting">跟随会议信息</el-radio-button>
      <el-radio-button value="custom">自定义条目</el-radio-button>
    </el-radio-group>
    <div v-if="mode === 'meeting'" class="invitation-venue-form">
      <el-form-item
        v-for="(label, key) in meetingFields"
        :key="key"
        :label="label"
      >
        <el-input
          :model-value="modelValue[key]"
          :aria-label="label"
          :disabled="disabled"
          maxlength="200"
          @update:model-value="setMeeting(key, $event)"
        />
      </el-form-item>
      <el-form-item label="组织单位（每行一个 · 选填）">
        <el-input
          :model-value="modelValue.organizers.join('\n')"
          aria-label="组织单位"
          :disabled="disabled"
          type="textarea"
          :rows="4"
          @update:model-value="
            setMeeting('organizers', $event.split('\n').filter(Boolean))
          "
        />
      </el-form-item>
    </div>
    <template v-else>
      <header class="venue-items-heading">
        <h3>信息条目</h3>
        <el-button
          :icon="Plus"
          :disabled="disabled || items.length >= 20"
          @click="add"
          >添加条目</el-button
        >
      </header>
      <p v-if="!items.length" class="venue-items-empty">暂无信息条目</p>
      <div v-for="(item, index) in items" :key="item.id" class="venue-edit-row">
        <header>
          <span>{{ String(index + 1).padStart(2, "0") }}</span>
          <div>
            <el-button
              :icon="Top"
              :disabled="disabled || index === 0"
              :title="`第${index + 1}项上移`"
              :aria-label="`第${index + 1}项上移`"
              @click="move(index, -1)"
            />
            <el-button
              :icon="Bottom"
              :disabled="disabled || index === items.length - 1"
              :title="`第${index + 1}项下移`"
              :aria-label="`第${index + 1}项下移`"
              @click="move(index, 1)"
            />
            <el-button
              :icon="Delete"
              :disabled="disabled"
              :title="`删除第${index + 1}项`"
              :aria-label="`删除第${index + 1}项`"
              @click="remove(index)"
            />
          </div>
        </header>
        <div class="venue-item-fields">
          <el-form-item label="标题"
            ><el-input
              :model-value="item.title"
              :aria-label="`第${index + 1}项标题`"
              :disabled="disabled"
              maxlength="120"
              @update:model-value="setItem(index, 'title', $event)"
          /></el-form-item>
          <el-form-item label="图标"
            ><el-select
              :model-value="item.icon"
              :aria-label="`第${index + 1}项图标`"
              :disabled="disabled"
              @update:model-value="setItem(index, 'icon', $event)"
            >
              <el-option
                v-for="(label, key) in iconLabels"
                :key="key"
                :label="label"
                :value="key"
                ><span class="venue-icon-option"
                  ><el-icon><component :is="icons[key]" /></el-icon
                  >{{ label }}</span
                ></el-option
              >
            </el-select></el-form-item
          >
          <el-form-item label="内容" class="wide"
            ><el-input
              :model-value="item.description"
              :aria-label="`第${index + 1}项内容`"
              :disabled="disabled"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 8 }"
              maxlength="2000"
              show-word-limit
              @update:model-value="setItem(index, 'description', $event)"
          /></el-form-item>
          <el-form-item
            label="跳转链接（选填）"
            class="wide"
            :error="
              item.href && !invitationLinkUrl(item.href)
                ? '请输入有效 HTTPS、电话、邮箱或章节链接'
                : undefined
            "
            ><el-input
              :model-value="item.href"
              :aria-label="`第${index + 1}项链接`"
              :disabled="disabled"
              maxlength="1500"
              @update:model-value="setItem(index, 'href', $event)"
          /></el-form-item>
        </div>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed } from "vue";
import {
  Plus,
  Top,
  Bottom,
  Delete,
  Link,
  Calendar,
  Location,
  Phone,
  Ticket,
  VideoPlay,
  Document,
  Star,
} from "@element-plus/icons-vue";
import {
  invitationVenueItems,
  invitationLinkUrl,
  normalizeInvitationModuleSettings,
  type InvitationContent,
  type InvitationModule,
  type InvitationModuleItem,
} from "@conference/shared";
const props = defineProps<{
  modelValue: InvitationContent;
  module: InvitationModule;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: InvitationContent] }>();
const mode = computed(
  () => normalizeInvitationModuleSettings(props.module.settings).venueMode,
);
const items = computed(() => props.module.items || []);
const meetingFields = {
  dateLabel: "会议时间（选填）",
  location: "会场（选填）",
  address: "详细地址（选填）",
  contactName: "会务联系人（选填）",
  contactPhone: "联系电话（选填）",
} as const;
const icons = {
  link: Link,
  calendar: Calendar,
  location: Location,
  phone: Phone,
  ticket: Ticket,
  video: VideoPlay,
  document: Document,
  star: Star,
};
const iconLabels = {
  link: "链接",
  calendar: "日期",
  location: "地点",
  phone: "电话",
  ticket: "票券",
  video: "视频",
  document: "文件",
  star: "星标",
};
function patch(value: Partial<InvitationModule>) {
  if (props.disabled) return;
  emit("update:modelValue", {
    ...props.modelValue,
    modules: props.modelValue.modules.map((module) =>
      module.id === props.module.id ? { ...module, ...value } : module,
    ),
  });
}
function setMode(value: string) {
  if (value !== "meeting" && value !== "custom") return;
  patch({
    settings: {
      ...normalizeInvitationModuleSettings(props.module.settings),
      venueMode: value,
    },
    ...(value === "custom" && !items.value.length
      ? {
          items: invitationVenueItems(props.modelValue, {
            ...props.module,
            settings: {
              ...normalizeInvitationModuleSettings(props.module.settings),
              venueMode: "meeting",
            },
          }),
        }
      : {}),
  });
}
function setMeeting(key: string, value: string | string[]) {
  if (!props.disabled)
    emit("update:modelValue", { ...props.modelValue, [key]: value });
}
function setItems(value: InvitationModuleItem[]) {
  patch({ items: value });
}
function setItem(
  index: number,
  key: "title" | "description" | "href" | "icon",
  value: string,
) {
  setItems(
    items.value.map((item, i) =>
      i === index ? { ...item, [key]: value } : item,
    ),
  );
}
function add() {
  if (items.value.length < 20)
    setItems([
      ...items.value,
      {
        id: crypto.randomUUID(),
        title: "",
        description: "",
        href: "",
        imageUrl: "",
        icon: "calendar",
        body: [],
      },
    ]);
}
function remove(index: number) {
  setItems(items.value.filter((_, i) => i !== index));
}
function move(index: number, delta: number) {
  const next = [...items.value];
  const target = index + delta;
  if (target < 0 || target >= next.length) return;
  [next[index], next[target]] = [next[target], next[index]];
  setItems(next);
}
</script>
<style scoped>
.invitation-venue-form {
  margin-top: 24px;
}
.venue-items-heading,
.venue-edit-row > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.venue-items-heading {
  margin: 24px 0 8px;
}
.venue-items-heading h3 {
  margin: 0;
  font-size: 16px;
}
.venue-edit-row {
  border-bottom: 1px solid var(--admin-color-border, #dfe5df);
  padding: 18px 0 4px;
}
.venue-edit-row > header {
  margin-bottom: 16px;
}
.venue-edit-row > header > span,
.venue-items-empty {
  font-size: 13px;
  color: #6a766c;
}
.venue-item-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 140px;
  gap: 0 16px;
}
.venue-item-fields .wide {
  grid-column: 1 / -1;
}
.venue-item-fields :deep(.el-form-item) {
  min-width: 0;
}
.venue-item-fields :deep(.el-select) {
  width: 100%;
}
.venue-item-fields :deep(.el-textarea__inner) {
  padding-bottom: 24px;
}
.venue-icon-option {
  display: flex;
  align-items: center;
  gap: 8px;
}
@media (max-width: 600px) {
  .venue-item-fields {
    grid-template-columns: minmax(0, 1fr) 110px;
    gap: 0 12px;
  }
}
</style>
