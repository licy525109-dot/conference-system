<template>
  <section class="admin-page dashboard-page">
    <div class="page-header dashboard-hero">
      <div>
        <h1 class="page-title">数据看板</h1>
        <p class="page-subtitle">按时间和会议查看收入、订单、报名、核销与优惠使用情况。</p>
      </div>
      <el-button type="primary" :loading="loading" @click="load">刷新数据</el-button>
    </div>

    <section class="toolbar dashboard-filter">
      <el-segmented v-model="quickRange" :options="rangeOptions" @change="applyQuickRange" />
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        style="width: 260px"
        @change="load"
      />
      <el-select v-model="conferenceId" clearable filterable placeholder="全部会议" style="width: 260px" @change="load">
        <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
      </el-select>
      <el-button @click="resetFilters">重置筛选</el-button>
    </section>

    <el-alert v-if="error" type="error" :title="error" show-icon :closable="false" />

    <div v-if="overview" class="grid-cards dashboard-metrics">
      <div v-for="item in metricCards" :key="item.label" class="metric-card dashboard-metric">
        <div class="metric-label">{{ item.label }}</div>
        <div class="metric-value">{{ item.value }}</div>
        <div class="metric-note">{{ item.note }}</div>
      </div>
    </div>

    <el-row v-if="overview" :gutter="16">
      <el-col :span="12">
        <section class="data-panel dashboard-panel">
          <div class="panel-heading">
            <h2 class="page-title">热门会议</h2>
            <span>按报名热度排序</span>
          </div>
          <el-table :data="overview.hotConferences" empty-text="暂无会议数据">
            <el-table-column prop="title" label="会议" min-width="180" />
            <el-table-column prop="orderCount" label="订单" width="100" />
            <el-table-column prop="registrationCount" label="报名" width="100" />
          </el-table>
        </section>
      </el-col>
      <el-col :span="12">
        <section class="data-panel dashboard-panel">
          <div class="panel-heading">
            <h2 class="page-title">库存预警</h2>
            <span>剩余 10 张以内</span>
          </div>
          <el-table :data="overview.inventoryAlerts" empty-text="暂无库存预警">
            <el-table-column prop="conferenceTitle" label="会议" min-width="160" />
            <el-table-column prop="name" label="规格" min-width="140" />
            <el-table-column prop="remainingStock" label="剩余" width="100" />
          </el-table>
        </section>
      </el-col>
    </el-row>

    <el-row v-if="overview" :gutter="16">
      <el-col :span="12">
        <section class="data-panel dashboard-panel">
          <div class="panel-heading">
            <h2 class="page-title">最近支付订单</h2>
            <span>按创建时间倒序</span>
          </div>
          <el-table :data="overview.recentOrders" empty-text="暂无订单">
            <el-table-column prop="orderNo" label="订单号" min-width="160" />
            <el-table-column prop="conferenceTitle" label="会议" min-width="160" />
            <el-table-column label="应付" width="100">
              <template #default="{ row }">¥{{ formatCent(row.payableAmountCent) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100" />
          </el-table>
        </section>
      </el-col>
      <el-col :span="12">
        <section class="data-panel dashboard-panel">
          <div class="panel-heading">
            <h2 class="page-title">最近报名记录</h2>
            <span>支付成功后生成</span>
          </div>
          <el-table :data="overview.recentRegistrations" empty-text="暂无报名">
            <el-table-column prop="registrationNo" label="报名号" min-width="160" />
            <el-table-column prop="conferenceTitle" label="会议" min-width="160" />
            <el-table-column prop="attendeeName" label="姓名" width="100" />
            <el-table-column label="金额" width="100">
              <template #default="{ row }">¥{{ formatCent(row.paidAmountCent) }}</template>
            </el-table-column>
          </el-table>
        </section>
      </el-col>
    </el-row>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { getDashboardOverview, listConferences } from "../../services/admin";
import type { Conference, DashboardOverview } from "../../services/types";

const overview = ref<DashboardOverview | null>(null);
const conferences = ref<Conference[]>([]);
const loading = ref(false);
const error = ref("");
const quickRange = ref("today");
const dateRange = ref<[string, string] | null>(null);
const conferenceId = ref("");

const rangeOptions = [
  { label: "今天", value: "today" },
  { label: "近 7 天", value: "7" },
  { label: "近 30 天", value: "30" },
  { label: "全部", value: "all" }
];

const metricCards = computed(() => {
  const cards = overview.value?.cards;
  if (!cards) return [];
  return [
    { label: "今日收入", value: `¥${formatCent(cards.todayRevenueCent)}`, note: "自然日已支付" },
    { label: "筛选收入", value: `¥${formatCent(cards.totalRevenueCent)}`, note: "当前筛选范围" },
    { label: "今日订单", value: cards.todayOrders, note: "新建订单" },
    { label: "已支付订单", value: cards.paidOrders, note: "当前筛选范围" },
    { label: "待支付订单", value: cards.pendingOrders, note: "当前筛选范围" },
    { label: "今日报名", value: cards.todayRegistrations, note: "自然日确认报名" },
    { label: "筛选报名", value: cards.totalRegistrations, note: "当前筛选范围" },
    { label: "已核销", value: cards.checkedInCount, note: "累计核销" },
    { label: "待核销", value: cards.pendingCheckInCount, note: "累计待核销" },
    { label: "优惠券使用", value: cards.couponUsedCount, note: "累计使用" },
    { label: "优惠金额", value: `¥${formatCent(cards.discountAmountCent)}`, note: "当前筛选范围" },
    { label: "支付成功率", value: formatRate(cards.paymentSuccessRate), note: "支付流水口径" }
  ];
});

onMounted(async () => {
  applyQuickRange();
  await Promise.all([loadConferences(), load()]);
});

async function loadConferences() {
  conferences.value = (await listConferences({ page: 1, pageSize: 200 })).items;
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    overview.value = await getDashboardOverview({
      dateFrom: dateRange.value?.[0],
      dateTo: dateRange.value?.[1],
      conferenceId: conferenceId.value
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : "数据看板加载失败";
  } finally {
    loading.value = false;
  }
}

function applyQuickRange() {
  if (quickRange.value === "all") {
    dateRange.value = null;
    void load();
    return;
  }
  const now = new Date();
  const end = formatDate(now);
  const startDate = new Date(now);
  if (quickRange.value === "7") startDate.setDate(now.getDate() - 6);
  if (quickRange.value === "30") startDate.setDate(now.getDate() - 29);
  dateRange.value = [formatDate(startDate), end];
  void load();
}

function resetFilters() {
  conferenceId.value = "";
  quickRange.value = "today";
  applyQuickRange();
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function formatRate(value: number | null) {
  return value === null ? "暂无" : `${(value * 100).toFixed(1)}%`;
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
</script>

<style scoped>
.dashboard-hero {
  min-height: 120px;
  padding: 24px;
  border: 1px solid rgb(221 230 242 / 88%);
  border-radius: var(--admin-radius);
  background:
    linear-gradient(135deg, rgb(20 99 255 / 12%), rgb(24 194 156 / 8%)),
    #ffffff;
  box-shadow: var(--admin-shadow);
}

.dashboard-filter {
  justify-content: space-between;
}

.dashboard-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.dashboard-metric {
  min-height: 116px;
}

.metric-note {
  margin-top: 10px;
  color: var(--admin-color-muted);
  font-size: 12px;
}

.dashboard-panel {
  min-height: 360px;
}

.panel-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.panel-heading span {
  color: var(--admin-color-muted);
  font-size: 12px;
}
</style>
