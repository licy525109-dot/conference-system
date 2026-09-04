<template>
  <section class="admin-page">
    <AdminPageHeader
      title="报名名单"
      eyebrow="会议管理"
      subtitle="查看报名记录、参会人信息、内部备注和核销进度。后台补签仅用于现场异常处理，常规签到请使用客户自助或工作人员扫码。"
    >
      <template #actions>
        <el-button type="primary" @click="openComplimentary">添加免支付嘉宾</el-button>
        <el-button
          v-if="canCleanupTestData"
          type="danger"
          plain
          :disabled="!conferenceId"
          :loading="cleaningTestData"
          @click="cleanCurrentConferenceTestData"
        >清理当前会议测试数据</el-button>
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
            <el-tag v-if="row.complimentary" size="small" type="success">主办方邀请</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="微信用户" min-width="200">
          <template #default="{ row }">
            <div class="wechat-user-cell">
              <img v-if="row.user?.wechatAvatarUrl" :src="row.user.wechatAvatarUrl" alt="" />
              <span v-else class="avatar-fallback">{{ userInitial(row) }}</span>
              <div>
                <strong>{{ row.user?.wechatNickname || row.user?.nickname || "微信用户" }}</strong>
                <small>{{ row.user?.phone || row.user?.openid || "-" }}</small>
              </div>
            </div>
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
        <el-table-column label="支付状态" width="110">
          <template #default="{ row }">
            <AdminStatusBadge v-if="!row.complimentary" status="PAID" />
            <el-tag v-else size="small" type="success">免支付</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="核销" width="140">
          <template #default="{ row }">
            <AdminStatusBadge :label="progressText(row.checkInProgress)" :tone="checkInTone(row.checkInProgress)" />
          </template>
        </el-table-column>
        <el-table-column label="金额" width="100"><template #default="{ row }">¥{{ formatCent(row.paidAmountCent) }}</template></el-table-column>
        <el-table-column label="备注" min-width="180" show-overflow-tooltip><template #default="{ row }">{{ row.adminRemark || "-" }}</template></el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row.id)">详情</el-button>
            <el-button size="small" type="danger" plain @click="removeRegistration(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <AdminEmptyState title="暂无报名记录" description="调整筛选条件，或从会议管理进入报名主链路。" action-text="查看会议" @action="goConferences" />
        </template>
      </el-table>
    </section>

    <el-dialog v-model="complimentaryVisible" title="添加免支付嘉宾" width="680px">
      <el-alert
        title="此操作会创建主办方邀请报名，不会生成支付流水。要接收小程序会务消息，请关联已登录过小程序的用户。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-form class="complimentary-form" :model="complimentaryForm" label-width="120px">
        <el-form-item label="会议" required>
          <el-select v-model="complimentaryForm.conferenceId" filterable style="width: 100%" @change="loadComplimentarySkus">
            <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="票种" required>
          <el-select v-model="complimentaryForm.skuId" filterable style="width: 100%">
            <el-option v-for="item in complimentarySkus" :key="item.id" :label="`${item.name}（剩余 ${Math.max(0, item.stock - item.lockedStock - item.soldCount)}）`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联小程序用户">
          <el-select v-model="complimentaryForm.userId" clearable filterable placeholder="不关联则无法推送小程序消息" style="width: 100%">
            <el-option v-for="item in users" :key="item.id" :label="userLabel(item)" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="嘉宾姓名" required><el-input v-model="complimentaryForm.attendeeName" maxlength="80" /></el-form-item>
        <el-form-item label="手机号" required><el-input v-model="complimentaryForm.phone" maxlength="30" /></el-form-item>
        <el-form-item label="公司"><el-input v-model="complimentaryForm.company" maxlength="120" /></el-form-item>
        <el-form-item label="职位"><el-input v-model="complimentaryForm.title" maxlength="120" /></el-form-item>
        <el-form-item label="内部备注"><el-input v-model="complimentaryForm.adminRemark" type="textarea" :rows="3" maxlength="500" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="complimentaryVisible = false">取消</el-button>
        <el-button type="primary" :loading="complimentarySaving" @click="saveComplimentary">确认添加</el-button>
      </template>
    </el-dialog>

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
              <el-button size="small" type="warning" :disabled="row.checkInStatus !== 'PENDING'" @click="checkIn(row.id)">应急补签</el-button>
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
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminEmptyState from "../../components/AdminEmptyState.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { navigateTo } from "../../router";
import { cleanupConferenceTestData, createComplimentaryRegistration, deleteRegistration, exportRegistrationsExcel, getRegistration, listConferences, listRegistrations, listSkus, listUsers, manualCheckin, previewConferenceTestDataCleanup, updateRegistrationRemark } from "../../services/admin";
import type { AdminAppUser, AdminRegistration, AdminRegistrationDetail, Conference, Sku } from "../../services/types";
import { useAdminSession } from "../../stores/admin-session";

const items = ref<AdminRegistration[]>([]);
const { hasPermission } = useAdminSession();
const conferences = ref<Conference[]>([]);
const complimentarySkus = ref<Sku[]>([]);
const users = ref<AdminAppUser[]>([]);
const detail = ref<AdminRegistrationDetail | null>(null);
const keyword = ref("");
const conferenceId = ref("");
const registrationStatus = ref("");
const paymentStatus = ref("");
const checkInStatus = ref("");
const loading = ref(false);
const exporting = ref(false);
const detailVisible = ref(false);
const complimentaryVisible = ref(false);
const complimentarySaving = ref(false);
const cleaningTestData = ref(false);
const remark = ref("");
const complimentaryForm = reactive({
  conferenceId: "",
  skuId: "",
  userId: "",
  attendeeName: "",
  phone: "",
  company: "",
  title: "",
  adminRemark: ""
});

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
const canCleanupTestData = computed(() => hasPermission("registration:write") && hasPermission("order:delete"));

onMounted(async () => {
  await Promise.all([loadConferences(), loadUsersForSelection(), load()]);
});

async function loadConferences() {
  conferences.value = (await listConferences({ page: 1, pageSize: 100 })).items;
}

async function loadUsersForSelection() {
  users.value = (await listUsers({ page: 1, pageSize: 100 })).items;
}

async function loadComplimentarySkus() {
  complimentarySkus.value = complimentaryForm.conferenceId
    ? (await listSkus(complimentaryForm.conferenceId)).items
    : [];
  complimentaryForm.skuId = complimentarySkus.value[0]?.id ?? "";
}

async function openComplimentary() {
  Object.assign(complimentaryForm, {
    conferenceId: conferenceId.value || conferences.value[0]?.id || "",
    skuId: "",
    userId: "",
    attendeeName: "",
    phone: "",
    company: "",
    title: "",
    adminRemark: ""
  });
  await loadComplimentarySkus();
  complimentaryVisible.value = true;
}

async function saveComplimentary() {
  if (!complimentaryForm.conferenceId || !complimentaryForm.skuId || !complimentaryForm.attendeeName.trim() || !complimentaryForm.phone.trim()) {
    ElMessage.warning("请完整填写会议、票种、嘉宾姓名和手机号");
    return;
  }
  complimentarySaving.value = true;
  try {
    await createComplimentaryRegistration({
      conferenceId: complimentaryForm.conferenceId,
      skuId: complimentaryForm.skuId,
      userId: complimentaryForm.userId || null,
      attendeeName: complimentaryForm.attendeeName.trim(),
      phone: complimentaryForm.phone.trim(),
      company: complimentaryForm.company.trim() || null,
      title: complimentaryForm.title.trim() || null,
      adminRemark: complimentaryForm.adminRemark.trim() || null
    });
    complimentaryVisible.value = false;
    await load();
    ElMessage.success("免支付嘉宾已添加");
  } finally {
    complimentarySaving.value = false;
  }
}

async function removeRegistration(row: AdminRegistration) {
  try {
    await ElMessageBox.confirm(
      row.complimentary
        ? `确认删除免支付嘉宾「${row.attendeeName}」的报名记录？相关会务安排也会删除。`
        : `仅 Mock 测试报名允许删除；真实微信支付报名会被服务端拦截。确认检查并删除「${row.registrationNo}」？`,
      "删除报名",
      { confirmButtonText: "确认删除", cancelButtonText: "取消", type: "warning" }
    );
  } catch {
    return;
  }
  await deleteRegistration(row.id);
  await load();
  ElMessage.success("报名记录已删除");
}

async function cleanCurrentConferenceTestData() {
  if (!conferenceId.value || cleaningTestData.value) {
    ElMessage.warning("请先选择要清理的会议");
    return;
  }
  cleaningTestData.value = true;
  try {
    const preview = await previewConferenceTestDataCleanup(conferenceId.value);
    const deletableCount = preview.mockRegistrations.count + preview.standaloneMockOrders.count;
    if (deletableCount === 0) {
      ElMessage.info(preview.protectedRecords.count > 0
        ? `没有可自动清理的 Mock 数据；${preview.protectedRecords.count} 条记录受保护`
        : "当前会议没有可清理的测试数据");
      return;
    }

    const message = [
      `将永久删除 Mock 报名 ${preview.mockRegistrations.count} 条、相关及孤立测试订单共 ${preview.mockRegistrations.count + preview.standaloneMockOrders.count} 条。`,
      `另有 ${preview.protectedRecords.count} 条记录受保护并会跳过。`,
      "真实微信支付流水和人工免支付嘉宾不会删除。",
      `请输入完整会议名称确认：${preview.conferenceTitle}`
    ].join("\n");
    const { value } = await ElMessageBox.prompt(message, "清理会议测试数据", {
      confirmButtonText: "确认永久删除",
      cancelButtonText: "取消",
      type: "warning",
      inputPlaceholder: preview.conferenceTitle,
      inputValidator: (input) => input === preview.conferenceTitle || "会议名称不一致"
    });
    const result = await cleanupConferenceTestData(conferenceId.value, value);
    await load();
    ElMessage.success(`已删除 ${result.deletedRegistrations} 条 Mock 报名和 ${result.deletedOrders} 条测试订单；保护 ${result.protectedRecords} 条`);
  } catch (error) {
    if (error === "cancel" || error === "close") return;
    throw error;
  } finally {
    cleaningTestData.value = false;
  }
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
    await ElMessageBox.confirm("后台应急补签仅用于现场异常处理。确认后该参会人将标记为已签到，并写入审计日志。", "后台应急补签", {
      confirmButtonText: "确认补签",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  await manualCheckin({ attendeeId: id, remark: "报名列表应急补签" });
  detail.value = await getRegistration(detail.value.id);
  await load();
  ElMessage.success("应急补签成功");
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

function userInitial(row: AdminRegistration) {
  return String(row.user?.wechatNickname || row.user?.nickname || row.attendeeName || "微").slice(0, 1);
}

function userLabel(user: AdminAppUser) {
  return `${user.wechatNickname || user.nickname || "未命名用户"}${user.phone ? ` · ${user.phone}` : ""}`;
}

function goConferences() {
  navigateTo("/conferences");
}
</script>

<style scoped>
.wechat-user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.wechat-user-cell img,
.avatar-fallback {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #edf4ff;
  color: var(--admin-color-primary);
  font-size: 13px;
  font-weight: 800;
  object-fit: cover;
}

.wechat-user-cell strong,
.wechat-user-cell small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.complimentary-form {
  margin-top: 22px;
}

.wechat-user-cell small {
  color: var(--admin-color-muted);
  font-size: 12px;
}
</style>
