<template>
  <view class="page ui-page">
    <view class="topbar ui-card">
      <text class="title">会议助手</text>
      <text class="subtitle">基于当前会议资料回答问题。</text>
    </view>
    <AiAssistantPanel v-if="conferenceId" :conference-id="conferenceId" />
    <ErrorState v-else message="缺少会议 ID" primary-text="返回" @retry="goBack" />
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import AiAssistantPanel from "@/components/AiAssistantPanel.vue";
import ErrorState from "@/components/ui/ErrorState.vue";

const conferenceId = ref("");

onLoad((query) => {
  conferenceId.value = typeof query?.conferenceId === "string" ? query.conferenceId : "";
});

function goBack() {
  uni.navigateBack();
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.topbar {
  padding: 28rpx;
}

.title {
  display: block;
  color: var(--ui-color-text);
  font-size: 40rpx;
  font-weight: 900;
}

.subtitle {
  display: block;
  margin-top: 8rpx;
  color: var(--ui-color-muted);
  font-size: 25rpx;
}
</style>
