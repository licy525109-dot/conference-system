<template>
  <view class="qr-shell" :aria-label="label">
    <view class="qr-grid" :style="{ gridTemplateColumns }">
      <view v-for="(cell, index) in cells" :key="index" :class="cell ? 'qr-cell qr-cell--dark' : 'qr-cell'" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { createQrMatrix } from "@/utils/qr";

const props = defineProps<{
  value: string;
  label?: string;
}>();

const matrix = computed(() => createQrMatrix(props.value || "EMPTY"));
const gridTemplateColumns = computed(() => `repeat(${matrix.value.length}, 1fr)`);
const cells = computed(() => matrix.value.flat());
</script>

<style scoped>
.qr-shell {
  width: 190rpx;
  height: 190rpx;
  padding: 12rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: 8px;
  background: #fff;
  box-sizing: border-box;
}

.qr-grid {
  display: grid;
  width: 100%;
  height: 100%;
  background: #fff;
}

.qr-cell {
  background: #fff;
}

.qr-cell--dark {
  background: #111827;
}
</style>
