<template>
  <button class="ai-entry ui-button-secondary" @click="open">会议助手</button>
</template>

<script setup lang="ts">
const props = defineProps<{ conferenceId: string }>();

function open() {
  uni.navigateTo({ url: `/pages/ai-assistant/index?conferenceId=${encodeURIComponent(props.conferenceId)}` });
}
</script>

<style scoped>
.ai-entry {
  width: 100%;
}
</style>
