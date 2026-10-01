<template>
  <InvitationAssetField
    class="invite-image-field"
    v-bind="$props"
    kind="image"
    @update:model-value="$emit('update:modelValue', $event)"
    @dimensions="$emit('dimensions', $event)"
  />
</template>
<script setup lang="ts">
import InvitationAssetField from "./InvitationAssetField.vue";
defineProps<{
  modelValue: string;
  campaignId: string;
  label: string;
  disabled?: boolean;
  compact?: boolean;
  recommended?: string;
}>();
defineEmits<{
  "update:modelValue": [value: string];
  dimensions: [size: { width: number; height: number }];
}>();
</script>
