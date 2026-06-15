<template>
  <view class="page">
    <view v-if="loading" class="state">加载会议详情中...</view>
    <view v-else-if="error" class="state error">
      <text>{{ error }}</text>
      <button v-if="conferenceId" class="primary-button compact" @click="loadDetail">重试</button>
      <button class="ghost-button compact" @click="goHome">返回首页</button>
    </view>

    <PageRenderer
      v-else-if="conference && cmsPage"
      :components="cmsPage.version.components"
      :theme="theme"
      :conference="conference"
      @register="goRegisterFirst"
    />

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
              <button class="ghost-button" @click="goRegister(sku.id)">填表后加购</button>
            </view>
          </view>
        </view>
      </view>
    </view>
    <WechatProfilePrompt />
    <CustomTabbar active-page-key="conference-detail" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
import CustomTabbar from "@/components/CustomTabbar.vue";
import PageRenderer from "@/components/PageRenderer.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { applyPageTitle, buildPageShare, DEFAULT_THEME, getAppTheme, getPublishedPage, type PublishedPage, type ThemeConfig } from "@/services/cms";
import { getConferenceDetail, type ConferenceDetail } from "@/services/conference";
import { formatDateTime } from "@/utils/date";
import { formatCent } from "@/utils/money";
import { goHome } from "@/utils/navigation";

const conferenceId = ref("");
const conference = ref<ConferenceDetail | null>(null);
const cmsPage = ref<PublishedPage | null>(null);
const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });
const loading = ref(false);
const error = ref("");

const contentText = computed(() => toContentText(conference.value?.contentJson) || "会议议程、嘉宾和报名说明请以主办方发布内容为准。");

onLoad((query) => {
  conferenceId.value = String(query?.id || query?.conferenceId || "");
  void loadDetail();
});

onShareAppMessage(() =>
  buildPageShare(
    cmsPage.value,
    `/pages/conference/detail?id=${encodeURIComponent(conferenceId.value)}`,
    conference.value?.title || "会议详情"
  )
);

async function loadDetail() {
  if (!conferenceId.value) {
    error.value = "页面信息不完整，请返回首页重新进入";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    const [detail, page, themeConfig] = await Promise.all([
      getConferenceDetail(conferenceId.value),
      getPublishedPage("conference-detail"),
      getAppTheme()
    ]);
    conference.value = detail;
    cmsPage.value = page;
    theme.value = themeConfig;
    applyPageTitle(page, detail.title);
  } catch (err) {
    console.error("[CONFERENCE_DETAIL_LOAD_ERROR]", err);
    error.value = "会议详情加载失败，请稍后重试";
  } finally {
    loading.value = false;
  }
}

function goRegister(skuId: string) {
  uni.navigateTo({
    url: `/pages/registration/form?conferenceId=${encodeURIComponent(conferenceId.value)}&skuId=${encodeURIComponent(skuId)}`
  });
}

function goRegisterFirst() {
  const sku = conference.value?.skus[0];
  if (!sku) {
    uni.showToast({ title: "暂无可报名规格", icon: "none" });
    return;
  }
  goRegister(sku.id);
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
  width: 210rpx;
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

.primary-button,
.ghost-button {
  min-height: 72rpx;
  border-radius: 8px;
  font-size: 27rpx;
  line-height: 72rpx;
}

.primary-button {
  background: #2452a8;
  color: #ffffff;
}

.ghost-button {
  border: 1px solid #ccd7e6;
  background: #ffffff;
  color: #2452a8;
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
