<template>
  <view class="cms-search-module">
    <view v-if="title" class="cms-search-module__head">
      <text class="cms-search-module__title">{{ title }}</text>
    </view>
    <view class="cms-search-module__control">
      <wd-search
        v-model="keyword"
        light
        hide-cancel
        placeholder-left
        :placeholder="placeholder"
        :maxlength="60"
        @search="submit"
        @clear="emit('search', '')"
      />
      <wd-button size="small" :round="false" :custom-style="buttonStyle" @click="submit">{{ buttonText }}</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { CmsComponent } from "@/services/cms";
import { stringConfig } from "./config";

const props = defineProps<{ component: CmsComponent }>();
const emit = defineEmits<{ search: [keyword: string] }>();
const keyword = ref("");
const title = computed(() => stringConfig(props.component, "title"));
const placeholder = computed(() => stringConfig(props.component, "placeholder", "输入会议关键词"));
const buttonText = computed(() => stringConfig(props.component, "buttonText", "搜索"));
const buttonStyle = "min-width:112rpx;min-height:72rpx;padding:0 24rpx;border-radius:12rpx;background:var(--cms-primary);color:#f8faf8;border:0;";

function submit(): void {
  emit("search", keyword.value.trim());
}
</script>

<style scoped>
.cms-search-module {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding: 24rpx;
  border: 1rpx solid var(--cms-border);
  border-radius: 16rpx;
  background: var(--cms-surface-elevated);
  box-shadow: var(--cms-shadow-sm);
}

.cms-search-module__title {
  color: var(--cms-text-primary);
  font-size: 30rpx;
  font-weight: 700;
}

.cms-search-module__control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12rpx;
}

.cms-search-module__control :deep(.wd-search) {
  padding: 0;
  background: transparent;
}
</style>
