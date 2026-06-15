<template>
  <section class="admin-page dashboard-page">
    <AdminPageHeader
      title="数据看板"
      subtitle="聚焦会议报名、订单支付、收入和库存预警，优先服务日常运营判断。"
      eyebrow="工作台"
    >
      <template #actions>
        <el-button type="primary" :loading="loading" @click="load">刷新数据</el-button>
      </template>
    </AdminPageHeader>

    <section class="quick-actions">
      <button v-for="action in quickActions" :key="action.path" class="quick-action" @click="go(action.path)">
        <strong>{{ action.title }}</strong>
        <span>{{ action.desc }}</span>
      </button>
    </section>

    <AdminFilterBar>
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
      <template #actions>
        <el-button @click="resetFilters">重置筛选</el-button>
      </template>
    </AdminFilterBar>

    <el-alert v-if="error" type="error" :title="error" show-icon :closable="false" />

    <div v-if="overview" class="dashboard-metrics">
      <AdminStatCard
        v-for="item in metricCards"
        :key="item.label"
        :label="item.label"
        :value="item.value"
        :note="item.note"
        :tone="item.tone"
      />
    </div>

    <el-row v-if="overview" :gutter="16">
      <el-col :span="12">
        <AdminSectionCard title="热门会议" subtitle="按报名热度排序，帮助判断主推会议。">
          <el-table :data="overview.hotConferences" empty-text="暂无会议数据">
            <el-table-column prop="title" label="会议" min-width="180" />
            <el-table-column prop="orderCount" label="订单" width="100" />
            <el-table-column prop="registrationCount" label="报名" width="100" />
          </el-table>
        </AdminSectionCard>
      </el-col>
      <el-col :span="12">
        <AdminSectionCard title="库存预警" subtitle="剩余 10 张以内的票种需要关注。">
          <el-table :data="overview.inventoryAlerts" empty-text="暂无库存预警">
            <el-table-column prop="conferenceTitle" label="会议" min-width="160" />
            <el-table-column prop="name" label="规格" min-width="140" />
            <el-table-column prop="remainingStock" label="剩余" width="100" />
          </el-table>
        </AdminSectionCard>
      </el-col>
    </el-row>

    <el-row v-if="overview" :gutter="16">
      <el-col :span="12">
        <AdminSectionCard title="最近支付订单" subtitle="按创建时间倒序，异常订单建议进入订单页核对。">
          <el-table :data="overview.recentOrders" empty-text="暂无订单">
            <el-table-column prop="orderNo" label="订单号" min-width="160" />
            <el-table-column prop="conferenceTitle" label="会议" min-width="160" />
            <el-table-column label="应付" width="100">
              <template #default="{ row }">¥{{ formatCent(row.payableAmountCent) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <AdminStatusBadge :status="row.status" />
              </template>
            </el-table-column>
          </el-table>
        </AdminSectionCard>
      </el-col>
      <el-col :span="12">
        <AdminSectionCard title="最近报名记录" subtitle="支付成功后生成报名记录。">
          <el-table :data="overview.recentRegistrations" empty-text="暂无报名">
            <el-table-column prop="registrationNo" label="报名号" min-width="160" />
            <el-table-column prop="conferenceTitle" label="会议" min-width="160" />
            <el-table-column prop="attendeeName" label="姓名" width="100" />
            <el-table-column label="金额" width="100">
              <template #default="{ row }">¥{{ formatCent(row.paidAmountCent) }}</template>
            </el-table-column>
          </el-table>
        </AdminSectionCard>
      </el-col>
    </el-row>

    <AdminSectionCard v-if="overview" title="热门票种" subtitle="按售卖量观察票种表现和库存压力。">
      <el-table :data="overview.hotSkus" empty-text="暂无票种数据">
        <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
        <el-table-column prop="name" label="票种" min-width="140" />
        <el-table-column prop="soldCount" label="已售" width="100" />
        <el-table-column prop="remainingStock" label="剩余" width="100" />
      </el-table>
    </AdminSectionCard>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminSectionCard from "../../components/AdminSectionCard.vue";
import AdminStatCard from "../../components/AdminStatCard.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { navigateTo } from "../../router";
import { getDashboardOverview, listConferences } from "../../services/admin";
import type { Conference, DashboardOverview } from "../../services/types";

type MetricTone = "default" | "primary" | "success" | "warning" | "danger";

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

const quickActions = [
  { title: "新建会议", desc: "维护基础信息与票种", path: "/conferences" },
  { title: "查看报名", desc: "核对参会人与备注", path: "/registrations" },
  { title: "查看订单", desc: "跟进支付与异常", path: "/orders" },
  { title: "页面装修", desc: "发布首页和详情页", path: "/pages" }
];

const paymentAbnormalCount = computed(() => overview.value?.recentOrders.filter((item) => isPaymentAbnormal(item.status)).length ?? 0);

const metricCards = computed<Array<{ label: string; value: string | number; note: string; tone: MetricTone }>>(() => {
  const cards = overview.value?.cards;
  if (!cards) return [];
  return [
    { label: "今日报名人数", value: cards.todayRegistrations, note: "自然日确认报名", tone: "primary" },
    { label: "今日收入", value: `¥${formatCent(cards.todayRevenueCent)}`, note: "自然日已支付", tone: "success" },
    { label: "总报名人数", value: cards.totalRegistrations, note: "当前筛选范围", tone: "default" },
    { label: "总收入", value: `¥${formatCent(cards.totalRevenueCent)}`, note: "当前筛选范围", tone: "success" },
    { label: "待支付订单", value: cards.pendingOrders, note: "当前筛选范围", tone: "warning" },
    { label: "支付异常订单", value: paymentAbnormalCount.value, note: "最近订单口径", tone: paymentAbnormalCount.value > 0 ? "danger" : "default" },
    { label: "支付成功率", value: formatRate(cards.paymentSuccessRate), note: "支付流水口径", tone: "default" },
    { label: "待核销", value: cards.pendingCheckInCount, note: "现场执行关注", tone: cards.pendingCheckInCount > 0 ? "warning" : "default" }
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

function go(path: string) {
  navigateTo(path);
}

function isPaymentAbnormal(status: string) {
  return ["FAILED", "CANCELLED", "CANCELED", "CLOSED"].includes(status.toUpperCase());
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
.quick-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.quick-action {
  min-height: 82px;
  padding: 15px;
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius);
  background: var(--admin-color-panel);
  color: var(--admin-color-text);
  text-align: left;
  cursor: pointer;
  box-shadow: var(--admin-shadow-soft);
}

.quick-action:hover {
  border-color: var(--admin-color-primary);
  transform: translateY(-1px);
}

.quick-action strong,
.quick-action span {
  display: block;
}

.quick-action strong {
  font-size: 15px;
  font-weight: 900;
}

.quick-action span {
  margin-top: 8px;
  color: var(--admin-color-muted);
  font-size: 12px;
}

.dashboard-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
</style>
