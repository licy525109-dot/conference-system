<template>
  <section class="admin-page registration-page">
    <header class="registration-header">
      <div class="heading-group">
        <h1>报名管理</h1>
        <el-select v-model="conferenceId" clearable filterable placeholder="全部会议" aria-label="会议" class="conference-filter" @change="queryRegistrations">
          <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
        </el-select>
      </div>
      <div class="page-actions">
        <el-button v-if="hasPermission('registration:write')" type="primary" :icon="Plus" @click="openComplimentary">添加嘉宾</el-button>
        <el-button :icon="Download" :loading="exporting" :disabled="loading || Boolean(listError)" @click="exportExcel">导出 Excel</el-button>
        <el-tooltip content="刷新报名名单">
          <el-button :icon="Refresh" :loading="loading" aria-label="刷新报名名单" @click="load()" />
        </el-tooltip>
      </div>
    </header>

    <form class="registration-filters" @submit.prevent="queryRegistrations">
      <el-input v-model="keyword" clearable :prefix-icon="Search" placeholder="姓名 / 手机 / 报名号 / 订单号" aria-label="搜索报名" class="keyword-filter" @clear="queryRegistrations" />
      <el-radio-group v-model="registrationStatus" aria-label="报名状态" @change="queryRegistrations">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="CONFIRMED">已确认</el-radio-button>
        <el-radio-button value="CANCELLED">已取消</el-radio-button>
        <el-radio-button value="REFUNDED">已退款</el-radio-button>
      </el-radio-group>
      <el-select v-model="checkInStatus" clearable placeholder="本页签到状态" aria-label="本页签到状态" class="checkin-filter">
        <el-option label="有待签到" value="PENDING" />
        <el-option label="有已签到" value="CHECKED_IN" />
        <el-option label="有无需签到" value="NOT_REQUIRED" />
      </el-select>
      <el-button native-type="submit" :loading="loading" :icon="Search">查询</el-button>
    </form>

    <el-alert v-if="conferenceError" :title="conferenceError" type="warning" :closable="false" show-icon>
      <el-button link type="primary" @click="loadConferences">重新加载会议</el-button>
    </el-alert>
    <el-alert v-if="listError" :title="listError" type="error" :closable="false" show-icon>
      <el-button link type="primary" @click="load()">重试</el-button>
    </el-alert>

    <section class="registration-table" aria-label="报名名单" :aria-busy="loading">
      <el-table
        v-loading="loading"
        :data="displayedItems"
        row-key="id"
        :row-class-name="rowClassName"
        :max-height="440"
        @row-click="selectRow"
      >
        <AdminTableIndex :page="page" :page-size="pageSize" />
        <el-table-column label="实际参会人" min-width="190">
          <template #default="{ row }">
            <div class="attendee-name">
              <button class="attendee-button" :aria-label="`查看${row.attendeeName || row.registrationNo}的报名详情`" :aria-expanded="selectedId === row.id" aria-controls="registration-inline-detail" @click.stop="openDetail(row.id)">{{ row.attendeeName || '未填写姓名' }}</button>
              <span v-if="row.complimentary" class="invited-label">主办方邀请</span>
            </div>
            <span class="cell-secondary">{{ row.phone || '未填写手机' }}<span v-if="row.attendeeCount > 1"> · 共 {{ row.attendeeCount }} 人</span></span>
          </template>
        </el-table-column>
        <el-table-column label="提交账号 / 邀请关联账号" min-width="180">
          <template #default="{ row }">
            <el-button v-if="row.user?.id && hasPermission('member:view')" class="account-link" link type="primary" @click.stop="navigateTo('/users/detail', { id: row.user.id })">{{ accountName(row) }}</el-button>
            <span v-else>{{ accountName(row) }}</span>
            <span class="cell-secondary">{{ row.complimentary ? '邀请关联账号' : '提交账号' }}<template v-if="row.user?.phone"> · {{ row.user.phone }}</template></span>
          </template>
        </el-table-column>
        <el-table-column label="会议 / 票种" min-width="190">
          <template #default="{ row }"><span>{{ row.skuName || '-' }}</span><span class="cell-secondary">{{ row.conferenceTitle }}</span></template>
        </el-table-column>
        <el-table-column label="实付金额" width="120" align="right">
          <template #default="{ row }"><span class="money">¥{{ formatCent(row.paidAmountCent) }}</span></template>
        </el-table-column>
        <el-table-column label="报名状态" width="120">
          <template #default="{ row }"><AdminStatusBadge :status="row.status" /></template>
        </el-table-column>
        <el-table-column label="签到状态" width="135">
          <template #default="{ row }"><AdminStatusBadge :label="progressText(row)" :tone="checkInTone(row)" /></template>
        </el-table-column>
        <el-table-column label="订单号 / 报名号" min-width="210">
          <template #default="{ row }">
            <el-button v-if="row.orderNo && hasPermission('order:view')" class="record-link" link @click.stop="navigateTo('/orders', { orderNo: row.orderNo })">{{ row.orderNo }}</el-button>
            <span v-else>{{ row.orderNo || '-' }}</span>
            <span class="cell-secondary">{{ row.registrationNo }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="108" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button link type="primary" :aria-expanded="selectedId === row.id" aria-controls="registration-inline-detail" @click.stop="openDetail(row.id)">详情</el-button>
              <el-tooltip v-if="hasPermission('registration:write')" content="删除报名">
                <el-button link type="danger" :icon="Delete" :loading="deletingId === row.id" :disabled="Boolean(deletingId)" :aria-label="`删除${row.attendeeName || row.registrationNo}的报名`" @click.stop="removeRegistration(row)" />
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <template #empty><span>{{ loading ? '正在加载报名名单' : listError ? '报名名单加载失败' : checkInStatus ? '当前页没有匹配的签到记录' : '暂无符合条件的报名记录' }}</span></template>
      </el-table>
      <footer class="table-footer">
        <span class="result-count" role="status">{{ listError ? '加载失败' : `本页显示 ${displayedItems.length} 条 / 查询共 ${total} 条` }}</span>
        <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next" :pager-count="5" :disabled="loading" @current-change="changePage" />
        <el-button
          v-if="canCleanupTestData"
          link type="danger"
          :disabled="!conferenceId"
          :loading="cleaningTestData"
          @click="cleanCurrentConferenceTestData"
        >清理当前会议测试数据</el-button>
      </footer>
    </section>

    <section v-if="selectedId" id="registration-inline-detail" class="inline-detail" aria-labelledby="registration-detail-heading" :aria-busy="detailLoading">
      <header class="detail-header">
        <div class="detail-heading">
          <h2 id="registration-detail-heading">{{ detail?.attendeeName || selectedRow?.attendeeName || '报名详情' }}</h2>
          <span v-if="detail?.complimentary" class="invited-label">主办方邀请</span>
          <span v-if="detail" class="detail-number">{{ detail.registrationNo }}</span>
        </div>
        <div class="detail-actions">
          <el-button v-if="detail?.user?.id && hasPermission('member:view')" link type="primary" :icon="User" @click="navigateTo('/users/detail', { id: detail.user.id })">查看账号</el-button>
          <el-button v-if="detail?.order.orderNo && hasPermission('order:view')" link type="primary" :icon="Document" @click="navigateTo('/orders', { orderNo: detail.order.orderNo })">查看订单</el-button>
          <el-button link type="primary" :icon="FullScreen" @click="navigateTo('/registrations/detail', { id: selectedId })">完整详情</el-button>
          <el-tooltip content="收起详情"><el-button link :icon="Close" aria-label="收起详情" @click="closeDetail" /></el-tooltip>
        </div>
      </header>
      <p v-if="detailLoading" class="detail-loading" role="status">正在加载报名详情...</p>
      <el-alert v-else-if="detailError" :title="detailError" type="error" :closable="false" show-icon>
        <el-button link type="primary" @click="openDetail(selectedId)">重试详情</el-button>
      </el-alert>
      <template v-else-if="detail">
        <el-tabs v-model="detailTab" class="detail-tabs">
          <el-tab-pane label="报名资料" name="registration">
            <div class="detail-summary">
              <dl>
                <dt>实际参会人</dt><dd>{{ detail.attendees.map(item => item.name || '-').join('、') || detail.attendeeName || '-' }}</dd>
                <dt>{{ detail.complimentary ? '邀请关联账号' : '提交账号' }}</dt><dd>{{ accountName(detail) }}</dd>
                <dt>报名来源</dt><dd>{{ sourceText(detail) }}</dd>
              </dl>
              <dl>
                <dt>订单号</dt><dd>{{ detail.order.orderNo || '-' }}</dd>
                <dt>实付金额</dt><dd class="money">{{ detail.order.paidAmountCent === null ? '-' : `¥${formatCent(detail.order.paidAmountCent)}` }}</dd>
                <dt>确认时间</dt><dd>{{ formatDate(detail.confirmedAt) }}</dd>
              </dl>
              <dl>
                <dt>票种</dt><dd>{{ detail.skuName || '-' }}</dd>
                <dt>报名状态</dt><dd><AdminStatusBadge :status="detail.status" /></dd>
                <dt>支付状态</dt><dd><AdminStatusBadge v-if="detail.complimentary" label="受邀 · 免支付" tone="info" /><AdminStatusBadge v-else :status="detail.order.status" /></dd>
              </dl>
            </div>
            <div class="detail-subheading"><h3>{{ detail.conferenceTitle }}</h3><el-button v-if="hasPermission('guest-schedule:view')" link type="primary" @click="navigateTo('/guest-schedules')">会务安排</el-button></div>
            <el-table :data="detail.attendees" empty-text="暂无参会人资料" class="attendee-table">
              <AdminTableIndex />
              <el-table-column prop="name" label="实际参会人" min-width="130" />
              <el-table-column prop="phone" label="手机" min-width="145" />
              <el-table-column prop="company" label="单位" min-width="160" />
              <el-table-column prop="title" label="职位" min-width="130" />
              <el-table-column prop="skuName" label="票种" min-width="140" />
              <el-table-column label="签到状态" width="120"><template #default="{ row }"><AdminStatusBadge v-if="row.checkInStatus === 'PENDING'" label="待签到" tone="neutral" /><AdminStatusBadge v-else :status="row.checkInStatus" /></template></el-table-column>
              <el-table-column v-if="hasPermission('checkin:write')" label="操作" width="120">
                <template #default="{ row }"><el-button link type="primary" :loading="checkingInId === row.id" :disabled="row.checkInStatus !== 'PENDING' || detail.status !== 'CONFIRMED' || Boolean(checkingInId) || remarkSaving" @click="checkIn(row.id)">应急补签</el-button></template>
              </el-table-column>
            </el-table>
            <div class="remark-editor">
              <label :for="`registration-remark-${detail.id}`">内部备注</label>
              <template v-if="hasPermission('registration:write')">
                <el-input :id="`registration-remark-${detail.id}`" v-model="remark" type="textarea" :rows="2" maxlength="2000" :disabled="remarkSaving" placeholder="内部备注" />
                <el-button :loading="remarkSaving" :disabled="Boolean(checkingInId) || remark === (detail.adminRemark || '')" @click="saveRemark">保存备注</el-button>
              </template>
              <p v-else>{{ detail.adminRemark || '暂无备注' }}</p>
            </div>
          </el-tab-pane>
          <el-tab-pane v-if="formFields.length" label="报名表单" name="form">
            <dl class="form-fields"><template v-for="field in formFields" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></template></dl>
          </el-tab-pane>
          <el-tab-pane v-if="detail.order.payments.length" label="支付记录" name="payments">
            <el-table :data="detail.order.payments">
              <AdminTableIndex />
              <el-table-column label="渠道" width="130"><template #default="{ row }">{{ providerText(row.provider) }}</template></el-table-column>
              <el-table-column label="支付状态" width="130"><template #default="{ row }"><AdminStatusBadge :status="row.status" /></template></el-table-column>
              <el-table-column label="金额" width="130"><template #default="{ row }">{{ row.amountCent == null ? '-' : `¥${formatCent(row.amountCent)}` }}</template></el-table-column>
              <el-table-column prop="outTradeNo" label="商户单号" min-width="180" />
              <el-table-column prop="transactionId" label="交易号" min-width="180" />
              <el-table-column label="支付时间" min-width="180"><template #default="{ row }">{{ formatDate(row.paidAt) }}</template></el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </section>

    <el-dialog v-model="complimentaryVisible" title="添加免支付嘉宾" width="min(680px, 94vw)" :close-on-click-modal="!complimentarySaving" :close-on-press-escape="!complimentarySaving" :show-close="!complimentarySaving">
      <el-alert
        title="此操作会创建主办方邀请报名，不会生成支付流水。要接收小程序会务消息，请关联已登录过小程序的用户。"
        type="info"
        :closable="false"
        show-icon
      />
      <el-form class="complimentary-form" :model="complimentaryForm" label-width="120px" :disabled="complimentarySaving">
        <el-form-item label="会议" required>
          <el-select v-model="complimentaryForm.conferenceId" filterable style="width: 100%" @change="loadComplimentarySkus">
            <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="票种" required>
          <el-select v-model="complimentaryForm.skuId" filterable :loading="skuLoading" style="width: 100%">
            <el-option v-for="item in complimentarySkus" :key="item.id" :label="`${item.name}（剩余 ${Math.max(0, item.stock - item.lockedStock - item.soldCount)}）`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="hasPermission('member:view')" label="关联小程序用户">
          <el-select v-model="complimentaryForm.userId" clearable filterable remote :remote-method="loadUsersForSelection" :loading="usersLoading" placeholder="搜索已登录过小程序的用户" style="width: 100%">
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
        <el-button :disabled="complimentarySaving" @click="complimentaryVisible = false">取消</el-button>
        <el-button type="primary" :loading="complimentarySaving" :disabled="skuLoading || !complimentaryForm.skuId" @click="saveComplimentary">确认添加</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import AdminTableIndex from "../../components/AdminTableIndex.vue";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Close, Delete, Document, Download, FullScreen, Plus, Refresh, Search, User } from "@element-plus/icons-vue";
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
const checkInStatus = ref("");
const page = ref(1);
const pageSize = 10;
const total = ref(0);
const appliedFilters = ref({ keyword: "", conferenceId: "", status: "" });
const loading = ref(false);
const exporting = ref(false);
const listError = ref("");
const conferenceError = ref("");
const selectedId = ref("");
const detailLoading = ref(false);
const detailError = ref("");
const detailTab = ref("registration");
const complimentaryVisible = ref(false);
const complimentarySaving = ref(false);
const skuLoading = ref(false);
const usersLoading = ref(false);
const cleaningTestData = ref(false);
const deletingId = ref("");
const remarkSaving = ref(false);
const checkingInId = ref("");
const remark = ref("");
let listVersion = 0;
let detailVersion = 0;
let skuVersion = 0;
let usersVersion = 0;
let disposed = false;
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
    if (!checkInStatus.value) return true;
    const progress = item.checkInProgress;
    if (!progress || progress.total === 0) return false;
    // The export endpoint matches any attendee with the selected check-in state.
    if (checkInStatus.value === "CHECKED_IN") return progress.checkedIn > 0;
    if (checkInStatus.value === "PENDING") return progress.pending > 0;
    if (checkInStatus.value === "NOT_REQUIRED") return progress.notRequired > 0;
    return true;
  });
});
const canCleanupTestData = computed(() => hasPermission("registration:write") && hasPermission("order:delete"));
const selectedRow = computed(() => items.value.find(item => item.id === selectedId.value));
const formFields = computed(() => {
  const fields = detail.value?.order.registrationSnapshotJson?.fields;
  const labels = new Map<string, string>();
  if (Array.isArray(fields)) {
    for (const field of fields) {
      if (field && typeof field === "object" && typeof field.key === "string" && typeof field.label === "string") labels.set(field.key, field.label);
    }
  }
  return Object.entries(detail.value?.formDataJson ?? {}).map(([key, value]) => ({ key, label: labels.get(key) || key, value: formatField(value) }));
});

onMounted(() => {
  void loadConferences();
  void load();
});

onBeforeUnmount(() => {
  disposed = true;
  listVersion += 1;
  detailVersion += 1;
  skuVersion += 1;
  usersVersion += 1;
});

watch(checkInStatus, () => {
  if (selectedId.value && !displayedItems.value.some(item => item.id === selectedId.value)) closeDetail();
});

async function loadConferences() {
  if (!hasPermission("conference:view")) return;
  conferenceError.value = "";
  try {
    const result = await listConferences({ page: 1, pageSize: 100 });
    if (!disposed) conferences.value = result.items;
  } catch (error) {
    if (!disposed) conferenceError.value = errorText(error, "会议列表加载失败");
  }
}

async function loadUsersForSelection(search = "") {
  if (!hasPermission("member:view")) return;
  const version = ++usersVersion;
  usersLoading.value = true;
  try {
    const result = await listUsers({ page: 1, pageSize: 100, keyword: search });
    if (version === usersVersion) users.value = result.items;
  } catch (error) {
    if (version === usersVersion) { users.value = []; ElMessage.error(errorText(error, "用户列表加载失败")); }
  } finally {
    if (version === usersVersion) usersLoading.value = false;
  }
}

async function loadComplimentarySkus() {
  const version = ++skuVersion;
  const id = complimentaryForm.conferenceId;
  complimentarySkus.value = [];
  complimentaryForm.skuId = "";
  skuLoading.value = Boolean(id);
  if (!id) return;
  try {
    const result = await listSkus(id);
    if (version !== skuVersion) return;
    complimentarySkus.value = result.items;
    complimentaryForm.skuId = result.items[0]?.id ?? "";
  } catch (error) {
    if (version === skuVersion) ElMessage.error(errorText(error, "票种加载失败"));
  } finally {
    if (version === skuVersion) skuLoading.value = false;
  }
}

async function openComplimentary() {
  if (!hasPermission("registration:write") || complimentarySaving.value) return;
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
  complimentaryVisible.value = true;
  void loadUsersForSelection();
  await loadComplimentarySkus();
}

async function saveComplimentary() {
  if (!hasPermission("registration:write") || complimentarySaving.value || skuLoading.value) return;
  if (!complimentaryForm.conferenceId || !complimentaryForm.skuId || !complimentaryForm.attendeeName.trim() || !complimentaryForm.phone.trim()) {
    ElMessage.warning("请完整填写会议、票种、嘉宾姓名和手机号");
    return;
  }
  complimentarySaving.value = true;
  try {
    await createComplimentaryRegistration({
      conferenceId: complimentaryForm.conferenceId,
      skuId: complimentaryForm.skuId,
      userId: hasPermission("member:view") ? complimentaryForm.userId || null : null,
      attendeeName: complimentaryForm.attendeeName.trim(),
      phone: complimentaryForm.phone.trim(),
      company: complimentaryForm.company.trim() || null,
      title: complimentaryForm.title.trim() || null,
      adminRemark: complimentaryForm.adminRemark.trim() || null
    });
    complimentaryVisible.value = false;
    await load();
    ElMessage.success("免支付嘉宾已添加");
  } catch (error) {
    ElMessage.error(errorText(error, "添加嘉宾失败"));
  } finally {
    complimentarySaving.value = false;
  }
}

async function removeRegistration(row: AdminRegistration) {
  if (!hasPermission("registration:write") || deletingId.value) return;
  deletingId.value = row.id;
  try {
    await ElMessageBox.confirm(
      row.complimentary
        ? `确认删除免支付嘉宾「${row.attendeeName}」的报名记录？相关会务安排也会删除。`
        : `仅 Mock 测试报名允许删除；真实微信支付报名会被服务端拦截。确认检查并删除「${row.registrationNo}」？`,
      "删除报名",
      { confirmButtonText: "确认删除", cancelButtonText: "取消", type: "warning" }
    );
    await deleteRegistration(row.id);
    if (selectedId.value === row.id) closeDetail();
    await load(false);
    ElMessage.success("报名记录已删除");
  } catch (error) {
    if (error !== "cancel" && error !== "close") ElMessage.error(errorText(error, "删除报名失败"));
  } finally {
    deletingId.value = "";
  }
}

async function cleanCurrentConferenceTestData() {
  if (!canCleanupTestData.value) return;
  if (!conferenceId.value || cleaningTestData.value) {
    ElMessage.warning("请先选择要清理的会议");
    return;
  }
  cleaningTestData.value = true;
  const targetConferenceId = conferenceId.value;
  try {
    const preview = await previewConferenceTestDataCleanup(targetConferenceId);
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
    const result = await cleanupConferenceTestData(targetConferenceId, value);
    await load();
    ElMessage.success(`已删除 ${result.deletedRegistrations} 条 Mock 报名和 ${result.deletedOrders} 条测试订单；保护 ${result.protectedRecords} 条`);
  } catch (error) {
    if (error === "cancel" || error === "close") return;
    ElMessage.error(errorText(error, "清理测试数据失败"));
  } finally {
    cleaningTestData.value = false;
  }
}

function queryRegistrations() {
  page.value = 1;
  closeDetail();
  void load();
}

function changePage() {
  closeDetail();
  void load();
}

async function load(refreshDetail = true) {
  if (disposed) return;
  const version = ++listVersion;
  const currentDetailVersion = detailVersion;
  const filters = { keyword: keyword.value.trim(), conferenceId: conferenceId.value, status: registrationStatus.value };
  loading.value = true;
  listError.value = "";
  try {
    const result = await listRegistrations({ page: page.value, pageSize, ...filters });
    if (version !== listVersion) return;
    total.value = result.total;
    const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
    if (page.value > lastPage) { page.value = lastPage; await load(refreshDetail); return; }
    items.value = result.items;
    appliedFilters.value = filters;
    if (selectedId.value && !displayedItems.value.some(item => item.id === selectedId.value)) closeDetail();
    else if (refreshDetail && selectedId.value && currentDetailVersion === detailVersion) void openDetail(selectedId.value, true);
  } catch (error) {
    if (version !== listVersion) return;
    listError.value = errorText(error, "报名名单加载失败");
    items.value = [];
    total.value = 0;
    closeDetail();
  } finally {
    if (version === listVersion) loading.value = false;
  }
}

async function exportExcel() {
  if (exporting.value || loading.value || listError.value || !hasPermission("registration:view")) return;
  exporting.value = true;
  try {
    await exportRegistrationsExcel({
      ...appliedFilters.value,
      checkInStatus: checkInStatus.value
    });
    ElMessage.success("报名名单 Excel 已开始下载");
  } catch (error) {
    ElMessage.error(errorText(error, "导出失败"));
  } finally {
    exporting.value = false;
  }
}

async function openDetail(id: string, force = false) {
  if (!id || disposed || !hasPermission("registration:view")) return;
  if (!force && selectedId.value === id && (detail.value || detailLoading.value)) return;
  const version = ++detailVersion;
  selectedId.value = id;
  detail.value = null;
  detailError.value = "";
  detailTab.value = "registration";
  remark.value = "";
  detailLoading.value = true;
  try {
    const result = await getRegistration(id);
    if (version !== detailVersion || selectedId.value !== id) return;
    detail.value = result;
    remark.value = result.adminRemark || "";
  } catch (error) {
    if (version === detailVersion) detailError.value = errorText(error, "报名详情加载失败");
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}

function closeDetail() {
  detailVersion += 1;
  selectedId.value = "";
  detail.value = null;
  detailError.value = "";
  detailLoading.value = false;
  remark.value = "";
}

function selectRow(row: AdminRegistration, _column: unknown, event: MouseEvent) {
  if ((event.target as HTMLElement | null)?.closest("button, a, input")) return;
  void openDetail(row.id);
}

function rowClassName({ row }: { row: AdminRegistration }) {
  return row.id === selectedId.value ? "is-selected-registration" : "";
}

async function saveRemark() {
  if (!detail.value || !hasPermission("registration:write") || remarkSaving.value || checkingInId.value) return;
  const id = detail.value.id;
  const version = detailVersion;
  remarkSaving.value = true;
  try {
    const result = await updateRegistrationRemark(id, remark.value || null);
    if (version === detailVersion && selectedId.value === id) { detail.value = result; remark.value = result.adminRemark || ""; }
    await load(false);
    ElMessage.success("备注已保存");
  } catch (error) {
    ElMessage.error(errorText(error, "备注保存失败"));
  } finally {
    remarkSaving.value = false;
  }
}

async function checkIn(id: string) {
  if (!detail.value || !hasPermission("checkin:write") || checkingInId.value || remarkSaving.value || detail.value.status !== "CONFIRMED") return;
  if (!detail.value.attendees.some(item => item.id === id && item.checkInStatus === "PENDING")) return;
  const registrationId = detail.value.id;
  const version = detailVersion;
  checkingInId.value = id;
  try {
    await ElMessageBox.confirm("后台应急补签仅用于现场异常处理。确认后该参会人将标记为已签到，并写入审计日志。", "后台应急补签", {
      confirmButtonText: "确认补签",
      cancelButtonText: "取消",
      type: "warning"
    });
    await manualCheckin({ attendeeId: id, remark: "报名列表应急补签" });
    if (version === detailVersion && selectedId.value === registrationId) await openDetail(registrationId, true);
    await load(false);
    ElMessage.success("应急补签成功");
  } catch (error) {
    if (error !== "cancel" && error !== "close") ElMessage.error(errorText(error, "应急补签失败"));
  } finally {
    checkingInId.value = "";
  }
}

function progressText(row: AdminRegistration) {
  if (row.status === "CANCELLED") return "已取消";
  if (row.status === "REFUNDED") return "已退款";
  const progress = row.checkInProgress;
  if (!progress || progress.total === 0) return "暂无签到资料";
  if (progress.notRequired === progress.total) return "无需签到";
  if (progress.pending === progress.total) return "待签到";
  const required = progress.total - progress.notRequired;
  if (progress.checkedIn === required) return "已签到";
  return `已签到 ${progress.checkedIn}/${required}`;
}

function checkInTone(row: AdminRegistration) {
  const progress = row.checkInProgress;
  if (row.status !== "CONFIRMED" || !progress || progress.total === 0 || progress.notRequired === progress.total) return "neutral";
  if (progress.pending > 0) return "warning";
  return progress.checkedIn === progress.total - progress.notRequired ? "success" : "neutral";
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function formatField(value: unknown): string {
  if (value == null || value === "") return "-";
  if (Array.isArray(value)) return value.map(formatField).join("、");
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}

function accountName(row: AdminRegistration) {
  return row.user ? row.user.wechatNickname || row.user.nickname || "未设置昵称" : "未关联账号";
}

function sourceText(row: AdminRegistration) {
  if (row.complimentary) return "主办方邀请";
  return row.source === "PAYMENT" ? "支付报名" : row.source || "未记录";
}

function userLabel(user: AdminAppUser) {
  return `${user.wechatNickname || user.nickname || "未命名用户"}${user.phone ? ` · ${user.phone}` : ""}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function providerText(value?: string | null) {
  return value ? ({ MOCK: "Mock 测试", WECHAT: "微信支付" }[value] ?? value) : "-";
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
</script>

<style scoped>
.registration-page.admin-page {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: var(--admin-color-text, #24272b);
  font-size: 16px;
  letter-spacing: 0;
}

.registration-header,
.heading-group,
.page-actions,
.registration-filters,
.table-footer,
.detail-header,
.detail-heading,
.detail-actions,
.detail-subheading,
.row-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
}

.registration-header,
.table-footer,
.detail-header,
.detail-subheading {
  justify-content: space-between;
}

.registration-header h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.4;
  font-weight: 700;
}

.heading-group { gap: 20px; }
.conference-filter { width: 260px; max-width: 100%; }
.keyword-filter { width: 310px; max-width: 100%; }
.checkin-filter { width: 160px; }
.registration-filters { gap: 10px; }
.page-actions :deep(.el-button),
.detail-actions :deep(.el-button),
.row-actions :deep(.el-button) { margin-left: 0; }

.registration-table {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  border-top: 1px solid var(--admin-color-border, #e3e5e8);
}

.registration-table :deep(.el-table),
.inline-detail :deep(.el-table) {
  --el-table-header-bg-color: var(--admin-color-panel-soft, #f5f6f7);
  --el-table-border-color: var(--admin-color-border, #e3e5e8);
  --el-table-header-text-color: var(--admin-color-muted, #626973);
  --el-table-row-hover-bg-color: var(--admin-color-panel-soft, #f5f6f7);
  width: 100%;
  max-width: 100%;
  min-width: 0;
  font-size: 16px;
}

.registration-table :deep(.el-table__row) { cursor: pointer; }
.registration-table :deep(.el-table__cell),
.inline-detail :deep(.el-table__cell) { padding: 14px 0; }
.registration-table :deep(th.el-table__cell),
.inline-detail :deep(th.el-table__cell) { padding: 12px 0; font-size: 14px; font-weight: 500; }
.registration-table :deep(.cell),
.inline-detail :deep(.cell) { line-height: 1.6; overflow-wrap: anywhere; }
.registration-page :deep(.admin-status-badge) { min-height: 28px; font-size: 14px; font-weight: 600; }
.row-actions :deep(.el-button),
.detail-actions :deep(.el-button) { font-size: 15px; }
.registration-table :deep(.is-selected-registration) {
  --el-table-tr-bg-color: var(--admin-color-primary-soft, #fbf7ed);
  --el-table-row-hover-bg-color: var(--admin-color-primary-soft, #fbf7ed);
}
.registration-table :deep(.is-selected-registration td:first-child) {
  box-shadow: inset 3px 0 var(--admin-color-primary, #98742d);
}

.attendee-name { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.attendee-button {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 16px;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.attendee-button:hover { color: var(--admin-color-primary, #98742d); }
.attendee-button:focus-visible {
  outline: 2px solid var(--admin-color-primary, #98742d);
  outline-offset: 4px;
  border-radius: 2px;
}
.invited-label {
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--admin-color-primary, #98742d);
  background: var(--admin-color-primary-soft, #fbf7ed);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.6;
}
.cell-secondary {
  display: block;
  margin-top: 5px;
  color: var(--admin-color-muted, #626973);
  font-size: 14px;
  line-height: 1.55;
}
.account-link,
.record-link { max-width: 100%; height: auto; font-size: 16px; line-height: 1.6; text-align: left; }
.account-link :deep(span),
.record-link :deep(span) { white-space: normal; overflow-wrap: anywhere; }
.money { font-variant-numeric: tabular-nums; white-space: nowrap; }
.row-actions { gap: 12px; flex-wrap: nowrap; }
.table-footer { padding-top: 12px; gap: 8px; }
.result-count,
.detail-number { color: var(--admin-color-muted, #626973); font-size: 14px; overflow-wrap: anywhere; }

.inline-detail {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding-top: 22px;
  font-size: 16px;
  line-height: 1.7;
  border-top: 1px solid var(--admin-color-primary, #98742d);
  scroll-margin-top: 20px;
}
.detail-header { gap: 16px; margin-bottom: 16px; }
.detail-heading h2 { margin: 0; font-size: 20px; line-height: 1.4; overflow-wrap: anywhere; }
.detail-actions { gap: 16px; }
.detail-loading { padding: 36px 0; color: var(--admin-color-muted, #626973); }
.detail-tabs,
.detail-tabs :deep(.el-tabs__content),
.detail-tabs :deep(.el-tab-pane) { min-width: 0; max-width: 100%; }
.detail-tabs :deep(.el-tabs__item) { font-size: 16px; }
.detail-tabs :deep(.el-tabs__header) { margin-bottom: 22px; }
.detail-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
.detail-summary dl {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr);
  align-content: start;
  gap: 16px 16px;
  margin: 0;
  padding-right: 20px;
  border-right: 1px solid var(--admin-color-border, #e3e5e8);
  line-height: 1.7;
}
.detail-summary dl:last-child { border-right: 0; padding-right: 0; }
.detail-summary dt,
.form-fields dt { color: var(--admin-color-muted, #626973); }
.detail-summary dd,
.form-fields dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.detail-subheading { margin: 28px 0 14px; }
.detail-subheading h3 { margin: 0; font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
.remark-editor {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px;
  margin-top: 22px;
}
.remark-editor label { padding-top: 7px; font-size: 16px; color: var(--admin-color-muted, #626973); }
.remark-editor :deep(.el-textarea__inner) { font-size: 16px; line-height: 1.7; }
.remark-editor p { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.form-fields { display: grid; grid-template-columns: minmax(112px, 180px) minmax(0, 1fr); gap: 18px 24px; margin: 0; line-height: 1.7; }
.form-fields dd { white-space: pre-wrap; }

@media (max-width: 1100px) {
  .detail-summary { grid-template-columns: 1fr 1fr; }
  .detail-summary dl { padding-right: 0; border-right: 0; }
}

@media (max-width: 640px) {
  .registration-page.admin-page { gap: 14px; }
  .registration-header { align-items: stretch; }
  .heading-group { width: 100%; gap: 12px; }
  .registration-header h1 { font-size: 22px; }
  .conference-filter { flex: 1; min-width: 145px; }
  .keyword-filter { width: 100%; }
  .page-actions { gap: 8px; }
  .registration-filters :deep(.el-radio-button__inner) { padding: 8px 11px; }
  .detail-summary { grid-template-columns: minmax(0, 1fr); gap: 18px; }
  .detail-summary dl { grid-template-columns: 112px minmax(0, 1fr); }
  .detail-actions { gap: 12px; }
  .remark-editor { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .remark-editor > :deep(.el-button) { justify-self: start; }
  .form-fields { grid-template-columns: 96px minmax(0, 1fr); gap: 18px 14px; }
}

.complimentary-form { margin-top: 20px; }
</style>
