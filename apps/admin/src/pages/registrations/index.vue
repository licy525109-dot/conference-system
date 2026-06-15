<template>
  <section class="admin-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">报名名单</h1>
        <p class="page-subtitle">查看报名、参会人、内部备注和手动核销。</p>
      </div>
    </div>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="报名号/姓名/手机/订单" style="width: 280px" @keyup.enter="load" />
      <el-button :loading="loading" @click="load">查询</el-button>
    </div>
    <section class="table-panel">
      <el-table :data="items" empty-text="暂无报名">
        <el-table-column prop="registrationNo" label="报名号" min-width="180" />
        <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
        <el-table-column prop="skuName" label="规格" width="140" />
        <el-table-column prop="attendeeName" label="姓名" width="120" />
        <el-table-column prop="phone" label="手机" width="140" />
        <el-table-column label="人数" width="80"><template #default="{ row }">{{ row.attendeeCount }}</template></el-table-column>
        <el-table-column label="核销" width="130"><template #default="{ row }">{{ progressText(row.checkInProgress) }}</template></el-table-column>
        <el-table-column label="金额" width="100"><template #default="{ row }">¥{{ formatCent(row.paidAmountCent) }}</template></el-table-column>
        <el-table-column label="备注" min-width="180"><template #default="{ row }">{{ row.adminRemark || "-" }}</template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openDetail(row.id)">详情</el-button></template></el-table-column>
      </el-table>
    </section>
    <el-dialog v-model="detailVisible" title="报名详情" width="900px">
      <div v-if="detail" class="admin-page">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="报名号">{{ detail.registrationNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ detail.status }}</el-descriptions-item>
          <el-descriptions-item label="会议">{{ detail.conferenceTitle }}</el-descriptions-item>
          <el-descriptions-item label="订单号">{{ detail.order.orderNo }}</el-descriptions-item>
        </el-descriptions>
        <h3>参会人</h3>
        <el-table :data="detail.attendees" empty-text="暂无参会人">
          <el-table-column prop="skuName" label="规格" min-width="120" />
          <el-table-column prop="name" label="姓名" width="120" />
          <el-table-column prop="phone" label="手机" width="140" />
          <el-table-column prop="company" label="单位" min-width="140" />
          <el-table-column label="核销状态" width="130"><template #default="{ row }">{{ checkInText(row.checkInStatus) }}</template></el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button size="small" type="primary" :disabled="row.checkInStatus !== 'PENDING'" @click="checkIn(row.id)">确认核销</el-button>
            </template>
          </el-table-column>
        </el-table>
        <h3>内部备注</h3>
        <el-input v-model="remark" type="textarea" :rows="4" maxlength="2000" show-word-limit />
        <div class="inline-actions">
          <el-button type="primary" @click="saveRemark">保存备注</el-button>
        </div>
        <h3>报名表单</h3>
        <pre class="json-block">{{ formatJson(detail.formDataJson) }}</pre>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { checkInRegistrationAttendee, getRegistration, listRegistrations, updateRegistrationRemark } from "../../services/admin";
import type { AdminRegistration, AdminRegistrationDetail } from "../../services/types";

const items = ref<AdminRegistration[]>([]);
const detail = ref<AdminRegistrationDetail | null>(null);
const keyword = ref("");
const loading = ref(false);
const detailVisible = ref(false);
const remark = ref("");

onMounted(() => void load());

async function load() {
  loading.value = true;
  try {
    items.value = (await listRegistrations({ page: 1, pageSize: 100, keyword: keyword.value })).items;
  } finally {
    loading.value = false;
  }
}

async function openDetail(id: string) {
  detail.value = await getRegistration(id);
  remark.value = detail.value.adminRemark ?? "";
  detailVisible.value = true;
}

async function saveRemark() {
  if (!detail.value) return;
  detail.value = await updateRegistrationRemark(detail.value.id, remark.value || null);
  await load();
  ElMessage.success("备注已保存");
}

async function checkIn(id: string) {
  if (!detail.value) return;
  await checkInRegistrationAttendee(id);
  detail.value = await getRegistration(detail.value.id);
  await load();
  ElMessage.success("核销成功");
}

function progressText(progress: AdminRegistration["checkInProgress"]) {
  if (!progress || progress.total === 0) return "暂无";
  if (progress.notRequired === progress.total) return "无需核销";
  return `${progress.checkedIn}/${progress.total}`;
}

function checkInText(status: string) {
  return { NOT_REQUIRED: "无需核销", PENDING: "待核销", CHECKED_IN: "已核销", CANCELLED: "已取消" }[status] ?? status;
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}
</script>
