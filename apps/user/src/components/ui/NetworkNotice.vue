<template>
  <view class="network-notice" role="status">
    <wd-icon name="wifi-error" size="22px" />
    <view>
      <text class="network-notice__title">网络未连接</text>
      <text class="network-notice__message">正在显示已加载内容，连接网络后自动更新。</text>
    </view>
  </view>
</template>

<style scoped>
.network-notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 12px 16px;
  padding: 14px 16px;
  border-left: 3px solid var(--ui-color-primary);
  background: #faf8f1;
  color: var(--ui-color-text);
}
.network-notice__title, .network-notice__message { display: block; line-height: 1.55; }
.network-notice__title { font-size: 18px; font-weight: 600; }
.network-notice__message { margin-top: 4px; font-size: 16px; }
</style>
