<template>
  <section class="admin-page">
    <AdminPageHeader title="操作日志" eyebrow="系统管理" subtitle="查看后台登录、编辑、导出、核销和异常订单处理记录。" >
      <template #actions>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-input v-model="keyword" clearable placeholder="操作人 / 对象 / 摘要" style="width: 260px" @keyup.enter="load" />
      <el-select v-model="action" clearable placeholder="动作" style="width: 150px">
        <el-option label="登录" value="LOGIN" />
        <el-option label="创建" value="CREATE" />
        <el-option label="更新" value="UPDATE" />
        <el-option label="删除" value="DELETE" />
        <el-option label="系统" value="SYSTEM" />
      </el-select>
      <el-select v-model="entityType" clearable filterable allow-create placeholder="对象类型" style="width: 180px">
        <el-option label="会议" value="Conference" />
        <el-option label="票种" value="RegistrationSku" />
        <el-option label="报名" value="Registration" />
        <el-option label="参会人" value="RegistrationAttendee" />
        <el-option label="订单导出" value="Order" />
        <el-option label="报名导出" value="Registration" />
        <el-option label="支付异常" value="PaymentException" />
        <el-option label="后台账号" value="AdminUser" />
      </el-select>
      <template #actions>
        <el-button type="primary" :loading="loading" @click="load">查询</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table v-loading="loading" :data="items" row-key="id">
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="adminName" label="操作人" width="130" />
        <el-table-column label="动作" width="100">
          <template #default="{ row }"><AdminStatusBadge :label="actionLabel(row.action)" :tone="actionTone(row.action)" /></template>
        </el-table-column>
        <el-table-column prop="targetType" label="对象" width="150" />
        <el-table-column prop="targetId" label="对象 ID" min-width="180" show-overflow-tooltip />
        <el-table-column prop="summary" label="摘要" min-width="220" show-overflow-tooltip />
        <el-table-column label="备注/参数" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">{{ metadataText(row.metadataJson) }}</template>
        </el-table-column>
        <template #empty>
          <AdminEmptyState title="暂无操作日志" description="执行后台登录、编辑、导出或异常处理后会产生记录。" />
        </template>
      </el-table>
      <div class="pagination-row">
        <el-pagination layout="prev, pager, next, total" :total="total" :page-size="pageSize" :current-page="page" @current-change="changePage" />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import AdminEmptyState from "../../components/AdminEmptyState.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { listAuditLogs } from "../../services/admin";
import type { AdminAuditLog } from "../../services/types";

const items = ref<AdminAuditLog[]>([]);
const keyword = ref("");
const action = ref("");
const entityType = ref("");
const loading = ref(false);
const page = ref(1);
const pageSize = 20;
const total = ref(0);

onMounted(load);

async function load() {
  loading.value = true;
  try {
    const data = await listAuditLogs({
      page: page.value,
      pageSize,
      keyword: keyword.value,
      action: action.value,
      entityType: entityType.value
    });
    items.value = data.items;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

async function changePage(nextPage: number) {
  page.value = nextPage;
  await load();
}

function actionLabel(value: string) {
  const labels: Record<string, string> = {
    LOGIN: "登录",
    CREATE: "创建",
    UPDATE: "更新",
    DELETE: "删除",
    SYSTEM: "系统"
  };
  return labels[value] ?? value;
}

function actionTone(value: string) {
  if (value === "DELETE") return "danger";
  if (value === "SYSTEM") return "warning";
  if (value === "CREATE" || value === "LOGIN") return "success";
  return "neutral";
}

function metadataText(value: Record<string, unknown> | null) {
  if (!value) return "-";
  if (typeof value.note === "string") return value.note;
  if (typeof value.rowCount === "number") return `导出 ${value.rowCount} 行`;
  return JSON.stringify(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
</script>

<style scoped>
.pagination-row {
  display: flex;
  justify-content: flex-end;
  padding: 12px 4px 2px;
}
</style>
