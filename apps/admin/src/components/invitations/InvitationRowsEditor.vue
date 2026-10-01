<template>
  <section class="invite-rows">
    <div class="invite-rows__heading">
      <h3>{{ title }}</h3>
      <el-button
        :icon="Plus"
        :disabled="disabled || modelValue.length >= max"
        @click="add"
        >添加</el-button
      >
    </div>
    <p v-if="!modelValue.length" class="invite-rows__empty">暂无{{ title }}</p>
    <div
      v-for="(row, index) in modelValue"
      :key="row.id"
      class="invite-edit-row"
    >
      <div class="invite-edit-row__bar">
        <span>{{ index + 1 }}</span>
        <div>
          <el-button
            :icon="Top"
            :disabled="disabled || index === 0"
            title="上移"
            aria-label="上移"
            circle
            @click="move(index, -1)"
          /><el-button
            :icon="Bottom"
            :disabled="disabled || index === modelValue.length - 1"
            title="下移"
            aria-label="下移"
            circle
            @click="move(index, 1)"
          /><el-button
            :icon="Delete"
            :disabled="disabled"
            title="删除"
            aria-label="删除"
            circle
            @click="remove(index)"
          />
        </div>
      </div>
      <div class="invite-edit-row__fields">
        <el-form-item
          v-for="field in fields"
          :key="field.key"
          :label="field.label"
          :class="{ wide: field.wide }"
          ><InvitationImageField
            v-if="field.image"
            :model-value="value(row, field.key)"
            :campaign-id="campaignId || ''"
            :label="field.label"
            :disabled="disabled"
            compact
            @update:model-value="update(index, field.key, $event)" /><el-select
            v-else-if="field.key === 'status'"
            :model-value="value(row, field.key)"
            :disabled="disabled"
            @update:model-value="update(index, field.key, $event)"
            ><el-option label="拟邀嘉宾" value="INVITED" /><el-option
              label="确认出席"
              value="CONFIRMED" /></el-select
          ><el-input
            v-else
            :model-value="value(row, field.key)"
            :disabled="disabled"
            :type="field.multiline ? 'textarea' : 'text'"
            :rows="field.multiline ? 6 : undefined"
            :maxlength="
              field.key === 'biography' ? 10000 : field.multiline ? 2000 : 300
            "
            @update:model-value="update(index, field.key, $event)"
        /></el-form-item>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { Plus, Top, Bottom, Delete } from "@element-plus/icons-vue";
import InvitationImageField from "./InvitationImageField.vue";
interface Row {
  id: string;
}
const props = withDefaults(
  defineProps<{
    modelValue: Row[];
    title: string;
    campaignId?: string;
    fields: Array<{
      key: string;
      label: string;
      wide?: boolean;
      multiline?: boolean;
      image?: boolean;
    }>;
    max?: number;
    disabled?: boolean;
  }>(),
  { max: 100, disabled: false },
);
const emit = defineEmits<{ "update:modelValue": [rows: Row[]] }>();
function value(row: Row, key: string): string {
  return String((row as unknown as Record<string, unknown>)[key] || "");
}
function add() {
  emit("update:modelValue", [
    ...props.modelValue,
    {
      id: crypto.randomUUID(),
      ...Object.fromEntries(
        props.fields.map((field) => [
          field.key,
          field.key === "status" ? "INVITED" : "",
        ]),
      ),
    },
  ]);
}
function update(index: number, key: string, value: string) {
  emit(
    "update:modelValue",
    props.modelValue.map((row, i) =>
      i === index ? { ...row, [key]: value } : row,
    ),
  );
}
function remove(index: number) {
  emit(
    "update:modelValue",
    props.modelValue.filter((_, i) => index !== i),
  );
}
function move(index: number, delta: number) {
  const items = [...props.modelValue];
  const item = items.splice(index, 1)[0];
  if (item) items.splice(index + delta, 0, item);
  emit("update:modelValue", items);
}
</script>
<style scoped>
.invite-rows {
  border-top: 1px solid var(--admin-color-border, #dfe5df);
  padding: 24px 0;
}
.invite-rows__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.invite-rows__heading h3 {
  margin: 0;
  font-size: 16px;
}
.invite-rows__empty {
  font-size: 13px;
  color: #778176;
  margin: 24px 0;
}
.invite-edit-row {
  padding: 18px 0;
  border-bottom: 1px solid #e8ede8;
}
.invite-edit-row__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.invite-edit-row__bar > span {
  font-size: 13px;
  color: #6a766c;
}
.invite-edit-row__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.invite-edit-row__fields .wide {
  grid-column: 1/-1;
}
.invite-edit-row__fields :deep(.el-form-item) {
  min-width: 0;
  margin-bottom: 14px;
}
.invite-edit-row__fields :deep(.el-select) {
  width: 100%;
}
@media (max-width: 500px) {
  .invite-edit-row__fields {
    grid-template-columns: 1fr;
  }
}
</style>
