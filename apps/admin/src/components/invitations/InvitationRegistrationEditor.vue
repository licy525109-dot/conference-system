<template>
  <section class="invitation-registration-editor" aria-label="报名入口设置">
    <el-form-item label="报名方式">
      <el-radio-group
        :model-value="registration.mode"
        :disabled="disabled"
        @update:model-value="
          patch({ mode: $event as InvitationRegistration['mode'] })
        "
      >
        <el-radio-button value="miniapp">小程序会议</el-radio-button>
        <el-radio-button value="external">外部链接</el-radio-button>
        <el-radio-button value="none">不显示报名</el-radio-button>
      </el-radio-group>
    </el-form-item>
    <el-form-item
      v-if="registration.mode === 'miniapp'"
      label="报名会议"
      required
    >
      <el-select
        :model-value="registration.conferenceId || linkedId || ''"
        aria-label="报名会议"
        placeholder="选择小程序会议"
        filterable
        :disabled="disabled"
        @update:model-value="patch({ conferenceId: $event })"
      >
        <el-option
          v-for="item in conferences"
          :key="item.id"
          :value="item.id"
          :label="item.title"
        />
      </el-select>
    </el-form-item>
    <el-form-item
      v-if="registration.mode === 'external'"
      label="外部报名链接"
      required
    >
      <el-input
        :model-value="registration.url"
        aria-label="外部报名链接"
        placeholder="https://"
        maxlength="2000"
        :disabled="disabled"
        @update:model-value="patch({ url: $event })"
      />
    </el-form-item>
    <el-form-item v-if="registration.mode !== 'none'" label="报名按钮文字">
      <el-input
        :model-value="registration.label"
        aria-label="报名按钮文字"
        :placeholder="
          registration.mode === 'miniapp' ? '前往小程序报名' : '前往报名'
        "
        maxlength="24"
        show-word-limit
        :disabled="disabled"
        @update:model-value="patch({ label: $event })"
      />
    </el-form-item>
  </section>
</template>
<script setup lang="ts">
import { computed } from "vue";
import {
  normalizeInvitationRegistration,
  type InvitationRegistration,
} from "@conference/shared";
const props = defineProps<{
  modelValue?: InvitationRegistration;
  linkedId?: string | null;
  conferences: Array<{ id: string; title: string }>;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: InvitationRegistration];
}>();
const registration = computed(() => ({
  ...normalizeInvitationRegistration(props.modelValue),
  url: props.modelValue?.url || "",
}));
function patch(value: Partial<InvitationRegistration>) {
  emit("update:modelValue", { ...registration.value, ...value });
}
</script>
<style scoped>
.invitation-registration-editor {
  width: 100%;
  max-width: 680px;
  padding: 20px 0;
}
.invitation-registration-editor :deep(.el-select) {
  width: 100%;
}
.invitation-registration-editor :deep(.el-radio-group) {
  display: flex;
  flex-wrap: wrap;
  row-gap: 8px;
}
.invitation-registration-editor :deep(.el-radio-button__inner) {
  padding: 10px 13px;
}
</style>
