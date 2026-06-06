<template>
  <view class="page">
    <view v-if="loading" class="state">加载会议详情中...</view>
    <view v-else-if="error" class="state error">
      <text>{{ error }}</text>
      <button class="primary-button compact" @click="loadDetail">重试</button>
    </view>

    <view v-else-if="conference" class="content">
      <view class="section headline">
        <text class="title">{{ conference.title }}</text>
        <text class="summary">{{ conference.summary || "会议报名已开放。" }}</text>
        <view class="meta">
          <text>{{ formatDateTime(conference.startsAt) }} - {{ formatDateTime(conference.endsAt) }}</text>
          <text v-if="conference.location">{{ conference.location }}</text>
        </view>
      </view>

      <view class="section">
        <text class="section-title">会议详情</text>
        <text class="body-text">{{ contentText }}</text>
      </view>

      <view class="section">
        <text class="section-title">报名规格</text>
        <view v-if="conference.skus.length === 0" class="empty-line">暂无可报名规格</view>
        <view v-else class="sku-list">
          <view v-for="sku in conference.skus" :key="sku.id" class="sku-card">
            <view class="sku-info">
              <text class="sku-name">{{ sku.name }}</text>
              <text class="sku-desc">{{ sku.description || "标准报名规格" }}</text>
              <text class="stock">剩余 {{ Math.max(sku.stock - sku.soldCount, 0) }} / {{ sku.stock }}</text>
            </view>
            <view class="sku-action">
              <text class="price">¥{{ formatCent(sku.priceCent) }}</text>
              <button class="primary-button" @click="goRegister(sku.id)">报名</button>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { getConferenceDetail, type ConferenceDetail } from "@/services/conference";
import { formatDateTime } from "@/utils/date";
import { formatCent } from "@/utils/money";

const conferenceId = ref("");
const conference = ref<ConferenceDetail | null>(null);
const loading = ref(false);
const error = ref("");

const contentText = computed(() => toContentText(conference.value?.contentJson) || "会议议程、嘉宾和报名说明请以主办方发布内容为准。");

onLoad((query) => {
  conferenceId.value = String(query?.id || "");
  void loadDetail();
});

async function loadDetail() {
  if (!conferenceId.value) {
    error.value = "缺少会议 ID";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    conference.value = await getConferenceDetail(conferenceId.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "会议详情加载失败";
  } finally {
    loading.value = false;
  }
}

function goRegister(skuId: string) {
  uni.navigateTo({
    url: `/pages/registration/form?conferenceId=${encodeURIComponent(conferenceId.value)}&skuId=${encodeURIComponent(skuId)}`
  });
}

function toContentText(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toContentText).filter(Boolean).join("\n");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidates = [record.title, record.text, record.content, record.description, record.blocks, record.sections];
    return candidates.map(toContentText).filter(Boolean).join("\n");
  }

  return "";
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 28rpx;
  box-sizing: border-box;
}

.content,
.sku-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.section {
  padding: 28rpx;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #ffffff;
}

.headline {
  gap: 18rpx;
}

.title,
.section-title,
.sku-name,
.price {
  display: block;
  color: #172033;
  font-weight: 800;
}

.title {
  font-size: 42rpx;
  line-height: 1.35;
}

.summary,
.body-text,
.sku-desc,
.stock,
.meta,
.empty-line {
  color: #5c6b82;
  font-size: 27rpx;
  line-height: 1.55;
}

.section-title {
  margin-bottom: 16rpx;
  font-size: 31rpx;
}

.sku-card {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  padding: 24rpx;
  border: 1px solid #e4eaf3;
  border-radius: 8px;
  background: #fbfcff;
}

.sku-info {
  flex: 1;
  min-width: 0;
}

.sku-action {
  width: 180rpx;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16rpx;
}

.sku-name {
  font-size: 30rpx;
}

.price {
  font-size: 30rpx;
  text-align: right;
}

.primary-button {
  min-height: 72rpx;
  border-radius: 8px;
  background: #2452a8;
  color: #ffffff;
  font-size: 27rpx;
  line-height: 72rpx;
}

.compact {
  width: 200rpx;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  padding: 96rpx 24rpx;
  color: #627087;
  font-size: 28rpx;
  text-align: center;
}

.error {
  color: #b42318;
}
</style>
