<template>
  <section class="admin-page">
    <AdminPageHeader
      title="报名名单"
      eyebrow="会议业务"
      subtitle="查看报名记录、参会人信息、内部备注和核销进度。手动核销属于敏感操作，执行前会二次确认。"
    >
      <template #actions>
        <el-button :loading="exporting" @click="exportExcel">导出 Excel</el-button>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-input v-model="keyword" clearable placeholder="报名号 / 姓名 / 手机 / 订单" style="width: 260px" @keyup.enter="load" />
      <el-select v-model="conferenceId" clearable filterable placeholder="会议" style="width: 220px">
        <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
      </el-select>
      <el-select v-model="registrationStatus" clearable placeholder="报名状态" style="width: 150px">
        <el-option label="已确认" value="CONFIRMED" />
        <el-option label="已取消" value="CANCELLED" />
        <el-option label="已退款" value="REFUNDED" />
      </el-select>
      <el-select v-model="paymentStatus" clearable placeholder="支付状态" style="width: 150px">
        <el-option label="已支付" value="PAID" />
      </el-select>
      <el-select v-model="checkInStatus" clearable placeholder="核销状态" style="width: 150px">
        <el-option label="待核销" value="PENDING" />
        <el-option label="已核销" value="CHECKED_IN" />
        <el-option label="无需核销" value="NOT_REQUIRED" />
      </el-select>
      <template #actions>
        <el-button :loading="loading" type="primary" @click="load">查询</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table v-loading="loading" :data="displayedItems">
        <el-table-column label="报名信息" min-width="230">
          <template #default="{ row }">
            <strong>{{ row.registrationNo }}</strong>
            <div class="muted-text">{{ row.orderNo }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="conferenceTitle" label="会议" min-width="200" show-overflow-tooltip />
        <el-table-column prop="skuName" label="规格" width="140" show-overflow-tooltip />
        <el-table-column label="参会人" min-width="150">
          <template #default="{ row }">
            <strong>{{ row.attendeeName || "-" }}</strong>
            <div class="muted-text">{{ row.phone || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="人数" width="80"><template #default="{ row }">{{ row.attendeeCount }}</template></el-table-column>
        <el-table-column label="报名状态" width="120"><template #default="{ row }"><AdminStatusBadge :status="row.status" /></template></el-table-column>
        <el-table-column label="支付状态" width="110"><template #default><AdminStatusBadge status="PAID" /></template></el-table-column>
        <el-table-column label="核销" width="140">
          <template #default="{ row }">
            <AdminStatusBadge :label="progressText(row.checkInProgress)" :tone="checkInTone(row.checkInProgress)" />
          </template>
        </el-table-column>
        <el-table-column label="金额" width="100"><template #default="{ row }">¥{{ formatCent(row.paidAmountCent) }}</template></el-table-column>
        <el-table-column label="备注" min-width="180" show-overflow-tooltip><template #default="{ row }">{{ row.adminRemark || "-" }}</template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openDetail(row.id)">详情</el-button></template></el-table-column>
        <template #empty>
          <AdminEmptyState title="暂无报名记录" description="调整筛选条件，或从会议管理进入报名主链路。" action-text="查看会议" @action="goConferences" />
        </template>
      </el-table>
    </section>

    <el-dialog v-model="detailVisible" title="报名详情" width="900px">
      <div v-if="detail" class="admin-page">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="报名号">{{ detail.registrationNo }}</el-descriptions-item>
          <el-descriptions-item label="状态"><AdminStatusBadge :status="detail.status" /></el-descriptions-item>
          <el-descriptions-item label="会议">{{ detail.conferenceTitle }}</el-descriptions-item>
          <el-descriptions-item label="订单号">{{ detail.order.orderNo }}</el-descriptions-item>
        </el-descriptions>
        <h3>参会人</h3>
        <el-table :data="detail.attendees" empty-text="暂无参会人">
          <el-table-column prop="skuName" label="规格" min-width="120" />
          <el-table-column prop="name" label="姓名" width="120" />
          <el-table-column prop="phone" label="手机" width="140" />
          <el-table-column prop="company" label="单位" min-width="140" />
          <el-table-column label="核销状态" width="130"><template #default="{ row }"><AdminStatusBadge :status="row.checkInStatus" /></template></el-table-column>
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
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminEmptyState from "../../components/AdminEmptyState.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { navigateTo } from "../../router";
import { checkInRegistrationAttendee, exportRegistrationsExcel, getRegistration, listConferences, listRegistrations, updateRegistrationRemark } from "../../services/admin";
import type { AdminRegistration, AdminRegistrationDetail, Conference } from "../../services/types";

const items = ref<AdminRegistration[]>([]);
const conferences = ref<Conference[]>([]);
const detail = ref<AdminRegistrationDetail | null>(null);
const keyword = ref("");
const conferenceId = ref("");
const registrationStatus = ref("");
const paymentStatus = ref("");
const checkInStatus = ref("");
const loading = ref(false);
const exporting = ref(false);
const detailVisible = ref(false);
const remark = ref("");

const displayedItems = computed(() => {
  return items.value.filter((item) => {
    if (paymentStatus.value && paymentStatus.value !== "PAID") return false;
    if (!checkInStatus.value) return true;
    const progress = item.checkInProgress;
    if (!progress || progress.total === 0) return checkInStatus.value === "NOT_REQUIRED";
    if (checkInStatus.value === "CHECKED_IN") return progress.checkedIn > 0 && progress.checkedIn === progress.total - progress.notRequired;
    if (checkInStatus.value === "PENDING") return progress.pending > 0;
    if (checkInStatus.value === "NOT_REQUIRED") return progress.notRequired === progress.total;
    return true;
  });
});

onMounted(async () => {
  await Promise.all([loadConferences(), load()]);
});

async function loadConferences() {
  conferences.value = (await listConferences({ page: 1, pageSize: 100 })).items;
}

async function load() {
  loading.value = true;
  try {
    items.value = (await listRegistrations({ page: 1, pageSize: 100, keyword: keyword.value, conferenceId: conferenceId.value, status: registrationStatus.value })).items;
  } finally {
    loading.value = false;
  }
}

async function exportExcel() {
  exporting.value = true;
  try {
    await exportRegistrationsExcel({
      keyword: keyword.value,
      conferenceId: conferenceId.value,
      status: registrationStatus.value,
      paymentStatus: paymentStatus.value,
      checkInStatus: checkInStatus.value
    });
    ElMessage.success("报名名单 Excel 已开始下载");
  } finally {
    exporting.value = false;
  }
}

async function openDetail(id: string) {
  navigateTo("/registrations/detail", { id });
}

async function saveRemark() {
  if (!detail.value) return;
  detail.value = await updateRegistrationRemark(detail.value.id, remark.value || null);
  await load();
  ElMessage.success("备注已保存");
}

async function checkIn(id: string) {
  if (!detail.value) return;
  try {
    await ElMessageBox.confirm("确认后该参会人将标记为已核销，请确认现场身份信息无误。", "确认手动核销", {
      confirmButtonText: "确认核销",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
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

function checkInTone(progress: AdminRegistration["checkInProgress"]) {
  if (!progress || progress.total === 0 || progress.notRequired === progress.total) return "neutral";
  if (progress.pending > 0) return "warning";
  return "success";
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function goConferences() {
  navigateTo("/conferences");
}
</script>
