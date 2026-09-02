<template>
  <section class="admin-page guest-schedule-page">
    <AdminPageHeader
      eyebrow="会议管理"
      title="嘉宾会务安排"
      subtitle="报名嘉宾自动同步到企微智能表；运营修改事项后，需在这里确认发布，嘉宾端才会更新。"
    >
      <template #actions>
        <el-button :icon="Connection" :disabled="!conferenceId" @click="openConnection">智能表连接</el-button>
        <el-button :icon="Refresh" :loading="syncing" :disabled="!syncConfig?.connection?.enabled" @click="syncNow">立即同步</el-button>
        <el-button type="primary" :icon="Plus" :disabled="!conferenceId" @click="openCreate">新增事项</el-button>
      </template>
    </AdminPageHeader>

    <section class="sync-status" :class="syncTone">
      <div class="sync-status__icon">
        <el-icon><CircleCheck v-if="syncConfig?.connection?.lastSyncStatus === 'SUCCESS'" /><Warning v-else /></el-icon>
      </div>
      <div class="sync-status__content">
        <strong>{{ syncTitle }}</strong>
        <span>{{ syncDescription }}</span>
      </div>
      <el-button v-if="syncConfig?.connection?.lastError" link type="danger" @click="showSyncError">查看错误</el-button>
      <span v-if="syncConfig?.connection?.lastSyncAt" class="sync-status__time">{{ formatRelative(syncConfig.connection.lastSyncAt) }}</span>
    </section>

    <section class="summary-grid" aria-label="发布概览">
      <article class="summary-item">
        <span>全部事项</span>
        <strong>{{ summary.total }}</strong>
      </article>
      <article class="summary-item summary-item--draft">
        <span>待首次发布</span>
        <strong>{{ summary.draft }}</strong>
      </article>
      <article class="summary-item summary-item--changed">
        <span>有待发布变更</span>
        <strong>{{ summary.changed }}</strong>
      </article>
      <article class="summary-item summary-item--published">
        <span>已发布</span>
        <strong>{{ summary.published }}</strong>
      </article>
    </section>

    <AdminFilterBar>
      <el-select v-model="conferenceId" filterable placeholder="选择会议" style="width: 280px">
        <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
      </el-select>
      <el-input v-model="keyword" clearable :prefix-icon="Search" placeholder="嘉宾 / 手机 / 事项 / 地点" style="width: 240px" @keyup.enter="querySchedules" />
      <el-select v-model="typeFilter" clearable placeholder="事项类型" style="width: 150px">
        <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-select v-model="stateFilter" clearable placeholder="发布状态" style="width: 160px">
        <el-option label="待首次发布" value="DRAFT" />
        <el-option label="有待发布变更" value="CHANGED" />
        <el-option label="已发布" value="PUBLISHED" />
      </el-select>
      <template #actions>
        <el-button :loading="loading" type="primary" :icon="Search" @click="querySchedules">查询</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel schedule-table-panel">
      <div v-if="selectedIds.length" class="batch-toolbar">
        <span>已选 {{ selectedIds.length }} 项</span>
        <el-button :icon="Check" @click="publishSelected(false)">仅发布</el-button>
        <el-button type="primary" :icon="Bell" @click="publishSelected(true)">发布并提醒</el-button>
        <el-button link @click="clearSelection">取消选择</el-button>
      </div>
      <el-table ref="tableRef" v-loading="loading" :data="items" row-key="id" @selection-change="onSelectionChange">
        <el-table-column type="selection" width="46" />
        <el-table-column label="嘉宾" min-width="190">
          <template #default="{ row }">
            <div class="guest-cell">
              <span class="guest-avatar">{{ row.attendee.name.slice(0, 1) }}</span>
              <div>
                <strong>{{ row.attendee.name }}</strong>
                <small>{{ row.attendee.company || row.attendee.title || row.attendee.phone }}</small>
                <small>{{ row.attendee.registration.registrationNo }}</small>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="参与事项" min-width="200">
          <template #default="{ row }">
            <div class="activity-cell">
              <span class="type-mark" :data-type="row.type">{{ row.typeLabel }}</span>
              <strong>{{ row.name }}</strong>
              <small v-if="row.shareTopic">{{ row.shareTopic }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="时间与地点" min-width="190">
          <template #default="{ row }">
            <div class="detail-lines">
              <span><el-icon><Clock /></el-icon>{{ formatScheduleTime(row.startsAt, row.endsAt) }}</span>
              <span><el-icon><Location /></el-icon>{{ row.location || "地点待定" }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="现场信息" min-width="165">
          <template #default="{ row }">
            <div class="detail-lines">
              <span v-if="row.role">角色：{{ row.role }}</span>
              <span v-if="row.tableNo">桌号：{{ row.tableNo }}<em v-if="row.isTableLeader">桌长</em></span>
              <span v-if="!row.role && !row.tableNo && !row.notes" class="muted-text">暂无补充</span>
              <span v-if="row.notes" class="one-line">{{ row.notes }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="120">
          <template #default="{ row }">
            <AdminStatusBadge :label="row.source === 'WECOM_SMART_SHEET' ? '企微智能表' : '后台录入'" :tone="row.source === 'WECOM_SMART_SHEET' ? 'info' : 'neutral'" />
          </template>
        </el-table-column>
        <el-table-column label="发布状态" width="130">
          <template #default="{ row }">
            <div class="publish-state">
              <AdminStatusBadge :label="stateLabel(row.state)" :tone="stateTone(row.state)" />
              <small v-if="row.publishedAt">{{ formatRelative(row.publishedAt) }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="175" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-tooltip
                :disabled="row.source !== 'WECOM_SMART_SHEET'"
                content="企微来源事项请在智能表修改"
                placement="top"
              >
                <span>
                  <el-button
                    size="small"
                    :icon="EditPen"
                    :disabled="row.source === 'WECOM_SMART_SHEET'"
                    @click="openEdit(row)"
                  >编辑</el-button>
                </span>
              </el-tooltip>
              <el-dropdown trigger="click" @command="(command: string) => handleRowCommand(command, row)">
                <el-button size="small" type="primary">发布<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="publish">仅发布</el-dropdown-item>
                    <el-dropdown-item command="notify" :icon="Bell">发布并提醒嘉宾</el-dropdown-item>
                    <el-dropdown-item command="archive" divided :icon="Delete">归档事项</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <AdminEmptyState
            title="暂无嘉宾事项"
            description="完成智能表连接后同步事项，或在后台新增一项。"
            action-text="新增事项"
            @action="openCreate"
          />
        </template>
      </el-table>
      <div class="pagination-row">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          layout="total, prev, pager, next"
          :total="total"
          @current-change="loadSchedules"
        />
      </div>
    </section>

    <el-dialog v-model="editorVisible" :title="editingId ? '编辑嘉宾事项' : '新增嘉宾事项'" width="760px" destroy-on-close>
      <el-form label-position="top" class="schedule-form">
        <el-form-item label="参与嘉宾" required>
          <el-select
            v-model="form.attendeeId"
            filterable
            remote
            :remote-method="searchAttendees"
            :loading="attendeeLoading"
            placeholder="搜索姓名、手机号或报名号"
            style="width: 100%"
          >
            <el-option v-for="item in attendeeOptions" :key="item.id" :value="item.id" :label="`${item.name} · ${item.phone}`">
              <div class="attendee-option">
                <strong>{{ item.name }}</strong>
                <span>{{ item.company || item.title || item.phone }}</span>
                <small>{{ item.registrationNo }} · {{ item.sku.name }}</small>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="事项类型" required>
          <el-segmented v-model="form.type" :options="typeOptions" block />
        </el-form-item>
        <el-form-item label="事项名称" required>
          <el-input v-model="form.name" maxlength="80" show-word-limit placeholder="例如：品牌增长工作坊" />
        </el-form-item>
        <div class="form-grid form-grid--time">
          <el-form-item label="开始时间" required>
            <el-date-picker v-model="form.startsAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.SSSZ" placeholder="选择开始时间" style="width: 100%" />
          </el-form-item>
          <el-form-item label="结束时间">
            <el-date-picker v-model="form.endsAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.SSSZ" placeholder="可不填" style="width: 100%" />
          </el-form-item>
        </div>
        <div class="form-grid">
          <el-form-item label="地点">
            <el-input v-model="form.location" placeholder="会场、楼层或房间" />
          </el-form-item>
          <el-form-item label="嘉宾角色">
            <el-input v-model="form.role" placeholder="主持人、分享嘉宾、桌长等" />
          </el-form-item>
        </div>
        <div v-if="form.type === 'DINNER'" class="form-grid">
          <el-form-item label="晚宴桌号">
            <el-input v-model="form.tableNo" placeholder="例如：A08" />
          </el-form-item>
          <el-form-item label="桌长身份">
            <el-switch v-model="form.isTableLeader" active-text="是桌长" inactive-text="普通嘉宾" />
          </el-form-item>
        </div>
        <el-form-item v-if="form.type === 'SPEECH'" label="分享主题">
          <el-input v-model="form.shareTopic" maxlength="120" show-word-limit placeholder="嘉宾本次分享的标题或核心内容" />
        </el-form-item>
        <el-form-item label="现场备注">
          <el-input v-model="form.notes" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="签到、联络人、设备或其他仅对嘉宾展示的信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editorVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveAssignment">保存为待发布</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="connectionVisible" title="企微智能表连接" size="620px" destroy-on-close>
      <div class="connection-drawer">
        <el-alert
          v-if="!connectionForm.integrationId"
          type="warning"
          :closable="false"
          title="请先在企微接入配置中完成自建应用 CorpID、AgentID 和 Secret 配置。"
        />
        <el-form label-position="top">
          <el-form-item label="企业微信自建应用" required>
            <el-select v-model="connectionForm.integrationId" placeholder="选择企微配置" style="width: 100%">
              <el-option
                v-for="item in syncConfig?.integrations || []"
                :key="item.id"
                :value="item.id"
                :label="`${item.name}${item.configured ? '' : '（未完成配置）'}`"
                :disabled="!item.configured"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="智能表文档 ID" required>
            <el-input v-model="connectionForm.docId" placeholder="docid" />
          </el-form-item>
          <el-form-item label="智能表访问地址">
            <el-input v-model="connectionForm.docUrl" placeholder="https://doc.weixin.qq.com/smartsheet/..." />
          </el-form-item>
          <div class="form-grid">
            <el-form-item label="报名嘉宾子表 ID" required>
              <el-input v-model="connectionForm.guestSheetId" placeholder="系统写入报名数据" />
            </el-form-item>
            <el-form-item label="嘉宾事项子表 ID" required>
              <el-input v-model="connectionForm.assignmentSheetId" placeholder="运营维护现场事项" />
            </el-form-item>
          </div>
          <div class="form-grid">
            <el-form-item label="自动同步">
              <el-switch v-model="connectionForm.enabled" active-text="已启用" inactive-text="已停用" />
            </el-form-item>
            <el-form-item label="同步间隔">
              <el-select v-model="connectionForm.syncIntervalSeconds" style="width: 100%">
                <el-option label="30 秒" :value="30" />
                <el-option label="1 分钟" :value="60" />
                <el-option label="5 分钟" :value="300" />
                <el-option label="10 分钟" :value="600" />
              </el-select>
            </el-form-item>
          </div>
        </el-form>

        <el-collapse class="field-template">
          <el-collapse-item title="报名嘉宾子表字段" name="guest">
            <div class="field-list">
              <span v-for="field in guestFieldNames" :key="field">{{ field }}</span>
            </div>
          </el-collapse-item>
          <el-collapse-item title="嘉宾事项子表字段" name="assignment">
            <div class="field-list">
              <span v-for="field in assignmentFieldNames" :key="field">{{ field }}</span>
            </div>
          </el-collapse-item>
        </el-collapse>

        <section v-if="checkResult" class="check-result" :class="checkResult.ready ? 'is-ready' : 'has-errors'">
          <strong>{{ checkResult.message }}</strong>
          <span v-if="checkResult.guestSheet.missingFields.length">嘉宾表缺少：{{ checkResult.guestSheet.missingFields.join("、") }}</span>
          <span v-if="checkResult.assignmentSheet.missingRequiredFields.length">事项表缺少必填列：{{ checkResult.assignmentSheet.missingRequiredFields.join("、") }}</span>
        </section>

        <div class="drawer-actions">
          <el-button :icon="CircleCheck" :loading="checking" :disabled="!syncConfig?.connection" @click="checkConnection">检查连接</el-button>
          <el-button type="primary" :icon="Check" :loading="savingConnection" @click="saveConnection">保存连接</el-button>
        </div>

        <section v-if="syncRuns.length" class="sync-history">
          <h3>最近同步</h3>
          <div v-for="run in syncRuns" :key="run.id" class="sync-run">
            <AdminStatusBadge :status="run.status" />
            <span>{{ formatDateTime(run.startedAt) }}</span>
            <small>嘉宾 +{{ run.guestCreatedCount }}/{{ run.guestUpdatedCount }}，事项 +{{ run.assignmentCreatedCount }}/{{ run.assignmentUpdatedCount }}</small>
          </div>
        </section>
      </div>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  ArrowDown,
  Bell,
  Check,
  CircleCheck,
  Clock,
  Connection,
  Delete,
  EditPen,
  Location,
  Plus,
  Refresh,
  Search,
  Warning
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, type TableInstance } from "element-plus";
import AdminEmptyState from "../../components/AdminEmptyState.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { routeQuery } from "../../router";
import {
  archiveGuestSchedule,
  checkGuestScheduleSmartSheet,
  createGuestSchedule,
  getGuestScheduleSmartSheetConfig,
  listConferences,
  listGuestScheduleAttendees,
  listGuestSchedules,
  listGuestScheduleSyncRuns,
  publishGuestSchedules,
  saveGuestScheduleSmartSheetConfig,
  syncGuestScheduleSmartSheet,
  updateGuestSchedule
} from "../../services/admin";
import type {
  Conference,
  GuestScheduleAssignment,
  GuestScheduleAttendeeOption,
  GuestScheduleSmartSheetConfig,
  GuestScheduleState,
  GuestScheduleSyncRun,
  GuestScheduleType
} from "../../services/types";

const typeOptions: Array<{ label: string; value: GuestScheduleType }> = [
  { label: "工作坊", value: "WORKSHOP" },
  { label: "晚宴", value: "DINNER" },
  { label: "分享演讲", value: "SPEECH" },
  { label: "彩排", value: "REHEARSAL" },
  { label: "接待", value: "RECEPTION" },
  { label: "其他", value: "OTHER" }
];

const items = ref<GuestScheduleAssignment[]>([]);
const conferences = ref<Conference[]>([]);
const attendeeOptions = ref<GuestScheduleAttendeeOption[]>([]);
const syncConfig = ref<GuestScheduleSmartSheetConfig | null>(null);
const syncRuns = ref<GuestScheduleSyncRun[]>([]);
const checkResult = ref<Awaited<ReturnType<typeof checkGuestScheduleSmartSheet>> | null>(null);
const tableRef = ref<TableInstance>();
const conferenceId = ref("");
const keyword = ref("");
const typeFilter = ref("");
const stateFilter = ref("");
const selectedIds = ref<string[]>([]);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const summary = reactive({ total: 0, draft: 0, changed: 0, published: 0 });
const loading = ref(false);
const saving = ref(false);
const syncing = ref(false);
const attendeeLoading = ref(false);
const editorVisible = ref(false);
const connectionVisible = ref(false);
const savingConnection = ref(false);
const checking = ref(false);
const editingId = ref("");
const form = reactive(emptyForm());
const connectionForm = reactive(emptyConnectionForm());

const syncTone = computed(() => {
  if (!syncConfig.value?.connection?.enabled) return "is-off";
  if (syncConfig.value.connection.lastSyncStatus === "SUCCESS") return "is-success";
  if (syncConfig.value.connection.lastSyncStatus === "FAILED") return "is-error";
  return "is-pending";
});
const syncTitle = computed(() => {
  const connection = syncConfig.value?.connection;
  if (!connection) return "尚未连接企微智能表";
  if (!connection.enabled) return "智能表自动同步已停用";
  if (connection.syncing) return "智能表正在同步";
  if (connection.lastSyncStatus === "SUCCESS") return "企微智能表同步正常";
  if (connection.lastSyncStatus === "FAILED") return "最近一次同步失败";
  return "智能表连接已启用，等待首次同步";
});
const syncDescription = computed(() => {
  const connection = syncConfig.value?.connection;
  if (!connection) return "连接后，报名嘉宾会自动写入嘉宾表，事项表修改会进入待发布状态。";
  if (!connection.enabled) return "现有发布内容不受影响；启用后才会继续交换数据。";
  return `每 ${formatInterval(connection.syncIntervalSeconds)} 同步一次 · 嘉宾表 ${connection.guestSheetId} · 事项表 ${connection.assignmentSheetId}`;
});
const guestFieldNames = computed(() => Object.values(syncConfig.value?.defaults.guestFieldMapping || {}));
const assignmentFieldNames = computed(() => Object.values(syncConfig.value?.defaults.assignmentFieldMapping || {}));

onMounted(async () => {
  conferences.value = (await listConferences({ page: 1, pageSize: 100 })).items;
  conferenceId.value = routeQuery.value.conferenceId || conferences.value[0]?.id || "";
});

watch(conferenceId, async (value) => {
  if (!value) return;
  page.value = 1;
  await Promise.all([loadSchedules(), loadSyncConfig(), searchAttendees("")]);
});

async function loadSchedules() {
  if (!conferenceId.value) return;
  loading.value = true;
  try {
    const data = await listGuestSchedules({
      page: page.value,
      pageSize: pageSize.value,
      conferenceId: conferenceId.value,
      keyword: keyword.value,
      type: typeFilter.value,
      state: stateFilter.value
    });
    items.value = data.items;
    total.value = data.total;
    Object.assign(summary, data.summary);
    selectedIds.value = [];
  } finally {
    loading.value = false;
  }
}

function querySchedules() {
  page.value = 1;
  void loadSchedules();
}

async function loadSyncConfig() {
  if (!conferenceId.value) return;
  syncConfig.value = await getGuestScheduleSmartSheetConfig(conferenceId.value);
  hydrateConnectionForm();
}

async function searchAttendees(query: string) {
  if (!conferenceId.value) return;
  attendeeLoading.value = true;
  try {
    attendeeOptions.value = (await listGuestScheduleAttendees({ conferenceId: conferenceId.value, keyword: query })).items;
  } finally {
    attendeeLoading.value = false;
  }
}

function openCreate() {
  editingId.value = "";
  Object.assign(form, emptyForm());
  editorVisible.value = true;
  void searchAttendees("");
}

function openEdit(item: GuestScheduleAssignment) {
  editingId.value = item.id;
  Object.assign(form, {
    attendeeId: item.attendeeId,
    type: item.type,
    name: item.name,
    startsAt: item.startsAt,
    endsAt: item.endsAt || "",
    location: item.location || "",
    role: item.role || "",
    tableNo: item.tableNo || "",
    isTableLeader: item.isTableLeader,
    shareTopic: item.shareTopic || "",
    notes: item.notes || ""
  });
  if (!attendeeOptions.value.some((attendee) => attendee.id === item.attendeeId)) {
    attendeeOptions.value.unshift({
      id: item.attendee.id,
      name: item.attendee.name,
      phone: item.attendee.phone,
      company: item.attendee.company,
      title: item.attendee.title,
      sku: item.attendee.sku,
      registrationId: item.attendee.registration.id,
      registrationNo: item.attendee.registration.registrationNo,
      canReceiveMiniProgramMessage: Boolean(item.attendee.registration.userId)
    });
  }
  editorVisible.value = true;
}

async function saveAssignment() {
  if (!form.attendeeId || !form.name.trim() || !form.startsAt) {
    ElMessage.warning("请选择嘉宾，并填写事项名称和开始时间");
    return;
  }
  saving.value = true;
  try {
    const payload = {
      attendeeId: form.attendeeId,
      type: form.type,
      name: form.name.trim(),
      startsAt: form.startsAt,
      endsAt: form.endsAt || null,
      location: form.location.trim() || null,
      role: form.role.trim() || null,
      tableNo: form.type === "DINNER" ? form.tableNo.trim() || null : null,
      isTableLeader: form.type === "DINNER" && form.isTableLeader,
      shareTopic: form.type === "SPEECH" ? form.shareTopic.trim() || null : null,
      notes: form.notes.trim() || null
    };
    if (editingId.value) await updateGuestSchedule(editingId.value, payload);
    else await createGuestSchedule(payload);
    editorVisible.value = false;
    ElMessage.success("已保存为待发布内容");
    await loadSchedules();
  } finally {
    saving.value = false;
  }
}

function onSelectionChange(selection: GuestScheduleAssignment[]) {
  selectedIds.value = selection.map((item) => item.id);
}

function clearSelection() {
  tableRef.value?.clearSelection();
}

async function publishSelected(notify: boolean) {
  if (!selectedIds.value.length) return;
  await confirmPublish(selectedIds.value, notify);
}

async function confirmPublish(ids: string[], notify: boolean) {
  try {
    await ElMessageBox.confirm(
      notify
        ? `将发布 ${ids.length} 项安排，并尝试向已授权订阅的嘉宾发送微信提醒。`
        : `将发布 ${ids.length} 项安排。企微中的后续修改仍需再次发布。`,
      notify ? "发布并提醒嘉宾" : "发布嘉宾安排",
      { confirmButtonText: notify ? "发布并提醒" : "确认发布", cancelButtonText: "取消", type: notify ? "warning" : "info" }
    );
  } catch {
    return;
  }
  const result = await publishGuestSchedules(ids, notify);
  ElMessage({
    type: result.notification.status === "FAILED" ? "warning" : "success",
    message: result.notification.message,
    duration: 5000
  });
  await loadSchedules();
}

async function handleRowCommand(command: string, row: GuestScheduleAssignment) {
  if (command === "publish") return confirmPublish([row.id], false);
  if (command === "notify") return confirmPublish([row.id], true);
  if (command === "archive") {
    try {
      await ElMessageBox.confirm("归档后嘉宾端将不再显示该事项。", "归档事项", { type: "warning", confirmButtonText: "确认归档" });
    } catch {
      return;
    }
    await archiveGuestSchedule(row.id);
    ElMessage.success("事项已归档");
    await loadSchedules();
  }
}

async function openConnection() {
  await loadSyncConfig();
  syncRuns.value = syncConfig.value?.connection ? (await listGuestScheduleSyncRuns(conferenceId.value)).items : [];
  checkResult.value = null;
  connectionVisible.value = true;
}

function hydrateConnectionForm() {
  const config = syncConfig.value;
  if (!config) return;
  const connection = config.connection;
  Object.assign(connectionForm, connection
    ? {
        integrationId: connection.integrationId,
        docId: connection.docId,
        docUrl: connection.docUrl || "",
        guestSheetId: connection.guestSheetId,
        assignmentSheetId: connection.assignmentSheetId,
        enabled: connection.enabled,
        syncIntervalSeconds: connection.syncIntervalSeconds
      }
    : {
        ...emptyConnectionForm(),
        integrationId: config.integrations.find((item) => item.configured)?.id || "",
        syncIntervalSeconds: config.defaults.syncIntervalSeconds
      });
}

async function saveConnection() {
  if (!connectionForm.integrationId || !connectionForm.docId.trim() || !connectionForm.guestSheetId.trim() || !connectionForm.assignmentSheetId.trim()) {
    ElMessage.warning("请填写企微应用、文档 ID 和两个子表 ID");
    return;
  }
  savingConnection.value = true;
  try {
    await saveGuestScheduleSmartSheetConfig(conferenceId.value, {
      ...connectionForm,
      docId: connectionForm.docId.trim(),
      docUrl: connectionForm.docUrl.trim() || null,
      guestSheetId: connectionForm.guestSheetId.trim(),
      assignmentSheetId: connectionForm.assignmentSheetId.trim()
    });
    await loadSyncConfig();
    ElMessage.success("智能表连接已保存");
  } finally {
    savingConnection.value = false;
  }
}

async function checkConnection() {
  checking.value = true;
  try {
    checkResult.value = await checkGuestScheduleSmartSheet(conferenceId.value);
    ElMessage({ type: checkResult.value.ready ? "success" : "warning", message: checkResult.value.message });
  } finally {
    checking.value = false;
  }
}

async function syncNow() {
  if (!conferenceId.value) return;
  syncing.value = true;
  try {
    await syncGuestScheduleSmartSheet(conferenceId.value);
    ElMessage.success("智能表同步完成");
    await Promise.all([loadSchedules(), loadSyncConfig()]);
  } finally {
    syncing.value = false;
  }
}

function showSyncError() {
  ElMessageBox.alert(syncConfig.value?.connection?.lastError || "暂无错误详情", "最近同步错误", { type: "error" });
}

function stateLabel(state: GuestScheduleState) {
  return ({ DRAFT: "待首次发布", CHANGED: "有待发布变更", PUBLISHED: "已发布", ARCHIVED: "已归档" } as const)[state];
}

function stateTone(state: GuestScheduleState) {
  return ({ DRAFT: "warning", CHANGED: "danger", PUBLISHED: "success", ARCHIVED: "neutral" } as const)[state];
}

function formatScheduleTime(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const startText = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(start);
  if (!endsAt) return startText;
  const end = new Date(endsAt);
  const sameDay = start.toDateString() === end.toDateString();
  const endText = new Intl.DateTimeFormat("zh-CN", sameDay
    ? { hour: "2-digit", minute: "2-digit", hour12: false }
    : { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(end);
  return `${startText} - ${endText}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function formatRelative(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  if (delta < 60_000) return "刚刚";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`;
  return formatDateTime(value);
}

function formatInterval(seconds: number) {
  return seconds < 60 ? `${seconds} 秒` : `${Math.round(seconds / 60)} 分钟`;
}

function emptyForm() {
  return {
    attendeeId: "",
    type: "WORKSHOP" as GuestScheduleType,
    name: "",
    startsAt: "",
    endsAt: "",
    location: "",
    role: "",
    tableNo: "",
    isTableLeader: false,
    shareTopic: "",
    notes: ""
  };
}

function emptyConnectionForm() {
  return {
    integrationId: "",
    docId: "",
    docUrl: "",
    guestSheetId: "",
    assignmentSheetId: "",
    enabled: false,
    syncIntervalSeconds: 60
  };
}
</script>

<style scoped>
.guest-schedule-page {
  --schedule-ink: #122238;
  --schedule-line: #dfe7ef;
  --schedule-muted: #69788a;
}

.sync-status {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  min-height: 72px;
  padding: 14px 18px;
  border: 1px solid var(--schedule-line);
  border-left: 4px solid #9aa8b7;
  background: #fff;
}

.sync-status.is-success { border-left-color: #16856b; background: #f6fbf9; }
.sync-status.is-error { border-left-color: #cf4b4b; background: #fff8f7; }
.sync-status.is-pending { border-left-color: #b68724; background: #fffbf2; }
.sync-status__icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: #eef3f7; color: #486078; font-size: 18px; }
.sync-status.is-success .sync-status__icon { background: #dff3ec; color: #16856b; }
.sync-status.is-error .sync-status__icon { background: #fae6e4; color: #bd3d3d; }
.sync-status__content { display: grid; gap: 3px; min-width: 0; }
.sync-status__content strong { color: var(--schedule-ink); font-size: 14px; }
.sync-status__content span,
.sync-status__time { color: var(--schedule-muted); font-size: 12px; }

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--schedule-line);
  background: #fff;
}

.summary-item {
  display: grid;
  gap: 8px;
  padding: 17px 20px;
  border-right: 1px solid var(--schedule-line);
}
.summary-item:last-child { border-right: 0; }
.summary-item span { color: var(--schedule-muted); font-size: 12px; }
.summary-item strong { color: var(--schedule-ink); font-size: 25px; line-height: 1; }
.summary-item--draft strong { color: #a06f12; }
.summary-item--changed strong { color: #c24b3e; }
.summary-item--published strong { color: #14765f; }

.schedule-table-panel { position: relative; overflow: hidden; }
.batch-toolbar { display: flex; align-items: center; gap: 10px; min-height: 54px; padding: 8px 14px; border-bottom: 1px solid #d7e2ec; background: #f3f8fc; }
.batch-toolbar span { margin-right: auto; color: #27455f; font-size: 13px; font-weight: 700; }
.pagination-row { display: flex; justify-content: flex-end; padding: 16px; border-top: 1px solid var(--schedule-line); }

.guest-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.guest-avatar { display: grid; place-items: center; flex: 0 0 36px; width: 36px; height: 36px; border-radius: 50%; background: #e8f0f6; color: #163b59; font-weight: 800; }
.guest-cell > div,
.activity-cell,
.detail-lines,
.publish-state { display: grid; gap: 4px; min-width: 0; }
.guest-cell strong,
.activity-cell strong { color: var(--schedule-ink); font-size: 13px; }
.guest-cell small,
.activity-cell small,
.publish-state small { overflow: hidden; color: var(--schedule-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.type-mark { width: fit-content; padding: 2px 7px; border-radius: 3px; background: #e8eef4; color: #425a70; font-size: 11px; font-weight: 700; }
.type-mark[data-type="WORKSHOP"] { background: #e6f1fb; color: #22628e; }
.type-mark[data-type="DINNER"] { background: #f7edda; color: #835f20; }
.type-mark[data-type="SPEECH"] { background: #e6f4ed; color: #176b53; }
.detail-lines span { display: flex; align-items: center; gap: 5px; color: #3a4a5d; font-size: 12px; }
.detail-lines .el-icon { color: #7b8a98; }
.detail-lines em { margin-left: 4px; padding: 1px 5px; border-radius: 3px; background: #f5e7c7; color: #7f5c19; font-style: normal; font-size: 10px; }
.one-line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-actions { display: flex; gap: 7px; }

.schedule-form { padding: 0 4px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.attendee-option { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; line-height: 1.35; }
.attendee-option span { color: #5e6d7e; }
.attendee-option small { grid-column: 1 / -1; color: #8491a0; }

.connection-drawer { display: grid; gap: 20px; padding: 0 2px 28px; }
.field-template { border-top: 1px solid var(--schedule-line); }
.field-list { display: flex; flex-wrap: wrap; gap: 7px; }
.field-list span { padding: 5px 8px; border: 1px solid #d8e1e9; border-radius: 4px; background: #f8fafc; color: #415368; font-size: 12px; }
.check-result { display: grid; gap: 6px; padding: 12px 14px; border-left: 3px solid #bd3d3d; background: #fff4f3; color: #7d3430; font-size: 12px; }
.check-result.is-ready { border-left-color: #16856b; background: #eef9f5; color: #17624f; }
.drawer-actions { display: flex; justify-content: flex-end; gap: 8px; }
.sync-history { display: grid; gap: 8px; padding-top: 18px; border-top: 1px solid var(--schedule-line); }
.sync-history h3 { margin: 0 0 4px; color: var(--schedule-ink); font-size: 14px; }
.sync-run { display: grid; grid-template-columns: auto 100px 1fr; align-items: center; gap: 10px; min-height: 38px; color: #425469; font-size: 12px; }
.sync-run small { color: var(--schedule-muted); }

@media (max-width: 1100px) {
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .summary-item:nth-child(2) { border-right: 0; }
  .summary-item:nth-child(-n+2) { border-bottom: 1px solid var(--schedule-line); }
}
</style>
