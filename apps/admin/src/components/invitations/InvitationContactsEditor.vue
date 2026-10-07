<template>
  <section class="contacts-editor">
    <header>
      <span>{{ contacts.length }} / 20</span
      ><el-button
        :icon="Plus"
        :disabled="disabled || contacts.length >= 20"
        @click="add"
        >添加联系人</el-button
      >
    </header>
    <el-empty
      v-if="!contacts.length"
      description="暂无会务联系人"
      :image-size="56"
    />
    <div
      v-for="(contact, index) in contacts"
      :key="contact.id"
      class="contact-edit-row"
    >
      <div class="contact-edit-bar">
        <strong>{{ contact.name || `联系人 ${index + 1}` }}</strong>
        <div>
          <el-button
            v-for="action in actions"
            :key="action.kind"
            :icon="action.icon"
            :title="action.label"
            :aria-label="`${action.label}联系人${index + 1}`"
            :disabled="
              disabled ||
              (action.kind === 'up' && index === 0) ||
              (action.kind === 'down' && index === contacts.length - 1)
            "
            @click="act(index, action.kind)"
          />
        </div>
      </div>
      <div class="contact-edit-fields">
        <el-form-item
          v-for="field in fields"
          :key="field.key"
          :label="field.label"
          :class="{ wide: field.key === 'note' }"
          ><el-input
            :model-value="contact[field.key]"
            :aria-label="`联系人${index + 1}${field.label}`"
            :type="field.key === 'note' ? 'textarea' : 'text'"
            :rows="3"
            :maxlength="field.max"
            :disabled="disabled"
            @update:model-value="
              edit(index, field.key, $event)
            " /></el-form-item
        ><el-form-item class="wide" label="微信 / 群二维码"
          ><InvitationImageField
            :model-value="contact.imageUrl"
            :campaign-id="campaignId"
            label="会务联系二维码"
            compact
            :disabled="disabled"
            @update:model-value="edit(index, 'imageUrl', $event)"
        /></el-form-item>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { Plus, Top, Bottom, Delete } from "@element-plus/icons-vue";
import type { InvitationModule, InvitationContact } from "@conference/shared";
import InvitationImageField from "./InvitationImageField.vue";
const props = defineProps<{
  module: InvitationModule;
  campaignId: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ patch: [value: Partial<InvitationModule>] }>();
const contacts = computed(() => props.module.contacts || []);
const fields = [
  { key: "name", label: "姓名", max: 80 },
  { key: "role", label: "负责事项", max: 100 },
  { key: "phone", label: "电话", max: 80 },
  { key: "wechat", label: "微信号", max: 100 },
  { key: "note", label: "备注", max: 2000 },
] as const;
const actions = [
  { kind: "up", icon: Top, label: "上移" },
  { kind: "down", icon: Bottom, label: "下移" },
  { kind: "delete", icon: Delete, label: "删除" },
] as const;
function update(value: InvitationContact[]) {
  if (!props.disabled) emit("patch", { contacts: value });
}
function add() {
  if (contacts.value.length < 20)
    update([
      ...contacts.value,
      {
        id: crypto.randomUUID(),
        name: "",
        role: "",
        phone: "",
        wechat: "",
        note: "",
        imageUrl: "",
      },
    ]);
}
function edit(index: number, key: keyof InvitationContact, value: string) {
  update(
    contacts.value.map((item, i) =>
      i === index ? { ...item, [key]: value } : item,
    ),
  );
}
function act(index: number, kind: (typeof actions)[number]["kind"]) {
  const value = [...contacts.value];
  if (kind === "delete") value.splice(index, 1);
  else {
    const target = index + (kind === "up" ? -1 : 1);
    if (!value[target]) return;
    [value[index], value[target]] = [value[target], value[index]];
  }
  update(value);
}
</script>
<style scoped>
.contacts-editor {
  padding: 12px 0 24px;
  min-width: 0;
}
.contacts-editor header,
.contact-edit-bar,
.contact-edit-bar > div {
  display: flex;
  align-items: center;
  gap: 6px;
}
.contacts-editor header,
.contact-edit-bar {
  justify-content: space-between;
}
.contacts-editor header > span {
  font-size: 12px;
  color: #69756e;
}
.contact-edit-row {
  padding: 20px 0;
  border-bottom: 1px solid #e2e8e4;
}
.contact-edit-bar {
  margin-bottom: 14px;
}
.contact-edit-bar strong {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.contact-edit-bar :deep(.el-button + .el-button) {
  margin: 0;
}
.contact-edit-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.contact-edit-fields :deep(.el-form-item) {
  min-width: 0;
  margin-bottom: 14px;
}
.contact-edit-fields .wide {
  grid-column: 1/-1;
}
@media (max-width: 600px) {
  .contact-edit-fields {
    grid-template-columns: 1fr;
  }
}
</style>
