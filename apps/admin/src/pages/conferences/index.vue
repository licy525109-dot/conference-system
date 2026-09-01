<template>
  <section class="admin-page">
    <AdminPageHeader title="会议管理" subtitle="维护会议基础信息、上下架状态，并进入会议配置中心。" eyebrow="会议管理">
      <template #actions>
        <el-button type="primary" @click="openCreate">新建会议</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-input v-model="keyword" placeholder="搜索标题、地点" style="width: 260px" @keyup.enter="load" />
      <el-select v-model="status" clearable placeholder="状态" style="width: 160px">
        <el-option label="草稿" value="DRAFT" />
        <el-option label="已发布" value="PUBLISHED" />
        <el-option label="已关闭" value="CLOSED" />
        <el-option label="已归档" value="ARCHIVED" />
      </el-select>
      <template #actions>
        <el-button :loading="loading" @click="load">查询</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table :data="items" empty-text="暂无会议">
        <el-table-column label="会议" min-width="260">
          <template #default="{ row }">
            <strong>{{ row.title }}</strong>
            <div class="muted-text">{{ row.subtitle || "未填写副标题" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }"><AdminStatusBadge :status="row.status" /></template>
        </el-table-column>
        <el-table-column prop="location" label="地点" width="140" />
        <el-table-column label="运营数据" width="150">
          <template #default="{ row }">
            <div class="muted-text">{{ row.counts?.registrations ?? 0 }} 报名 / {{ row.counts?.orders ?? 0 }} 订单</div>
          </template>
        </el-table-column>
        <el-table-column label="会议时间" min-width="220">
          <template #default="{ row }">{{ formatDate(row.startAt) }} - {{ formatDate(row.endAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="310" fixed="right">
          <template #default="{ row }">
            <div class="inline-actions">
              <el-button size="small" @click="openEdit(row)">编辑</el-button>
              <el-button size="small" type="primary" @click="goConfig(row.id)">配置详情</el-button>
              <el-dropdown @command="(next: string) => changeStatus(row.id, next)">
                <el-button size="small">状态</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="DRAFT">草稿</el-dropdown-item>
                    <el-dropdown-item command="PUBLISHED">发布</el-dropdown-item>
                    <el-dropdown-item command="CLOSED">关闭</el-dropdown-item>
                    <el-dropdown-item command="ARCHIVED">归档</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <AdminEmptyState title="暂无会议" description="创建第一场会议后，可以继续配置票种、报名字段和详情长图。" mark="会" action-text="新建会议" @action="openCreate" />
        </template>
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑会议' : '新建会议'" width="760px">
      <el-form :model="form" label-width="120px">
        <div class="dialog-section-heading">
          <strong>会议信息</strong>
          <span>用户端列表和详情页展示的基本内容。</span>
        </div>
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="副标题"><el-input v-model="form.subtitle" /></el-form-item>
        <el-form-item label="会议封面"><ConferenceCoverPicker v-model="form.coverImage" /></el-form-item>
        <el-form-item label="地点"><el-input v-model="form.location" /></el-form-item>

        <div class="dialog-section-heading">
          <strong>会议时间</strong>
          <span>会议实际举办的开始和结束时间。</span>
        </div>
        <el-form-item label="会议开始时间"><el-date-picker v-model="form.startAt" class="date-picker" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" placeholder="选择会议开始时间" /></el-form-item>
        <el-form-item label="会议结束时间"><el-date-picker v-model="form.endAt" class="date-picker" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" placeholder="选择会议结束时间" /></el-form-item>

        <div class="dialog-section-heading">
          <strong>报名开放时间</strong>
          <span>控制用户可报名的时间；两项都不填时默认跟随会议时间。</span>
        </div>
        <el-form-item label="报名开始时间"><el-date-picker v-model="form.registrationStartsAt" class="date-picker" clearable type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" placeholder="不填则跟随会议开始时间" /></el-form-item>
        <el-form-item label="报名截止时间"><el-date-picker v-model="form.registrationEndsAt" class="date-picker" clearable type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" placeholder="不填则跟随会议结束时间" /></el-form-item>

        <div class="dialog-section-heading">
          <strong>管理设置</strong>
          <span>控制会议状态和列表顺序。</span>
        </div>
        <el-form-item label="状态">
          <el-select v-model="form.status">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="已发布" value="PUBLISHED" />
            <el-option label="已关闭" value="CLOSED" />
            <el-option label="已归档" value="ARCHIVED" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminEmptyState from "../../components/AdminEmptyState.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import ConferenceCoverPicker from "../../components/conference/ConferenceCoverPicker.vue";
import { createConference, listConferences, updateConference, updateConferenceStatus } from "../../services/admin";
import type { Conference } from "../../services/types";
import { navigateTo } from "../../router";

const items = ref<Conference[]>([]);
const keyword = ref("");
const status = ref("");
const loading = ref(false);
const dialogVisible = ref(false);
const form = reactive({
  id: "",
  title: "",
  subtitle: "",
  coverImage: "",
  location: "",
  startAt: "",
  endAt: "",
  registrationStartsAt: "",
  registrationEndsAt: "",
  status: "DRAFT",
  sortOrder: 0
});

onMounted(() => {
  void load();
});

async function load() {
  loading.value = true;
  try {
    items.value = (await listConferences({ page: 1, pageSize: 100, keyword: keyword.value, status: status.value })).items;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  const registrationStart = new Date();
  const meetingStart = new Date(Date.now() + 7 * 86400000);
  const meetingEnd = new Date(meetingStart.getTime() + 8 * 60 * 60 * 1000);
  Object.assign(form, {
    id: "",
    title: "",
    subtitle: "",
    coverImage: "",
    location: "",
    startAt: meetingStart.toISOString(),
    endAt: meetingEnd.toISOString(),
    registrationStartsAt: registrationStart.toISOString(),
    registrationEndsAt: meetingStart.toISOString(),
    status: "DRAFT",
    sortOrder: 0
  });
  dialogVisible.value = true;
}

function openEdit(row: Conference) {
  Object.assign(form, {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? "",
    coverImage: row.coverImage ?? "",
    location: row.location ?? "",
    startAt: row.startAt,
    endAt: row.endAt,
    registrationStartsAt: row.registrationStartsAt ?? "",
    registrationEndsAt: row.registrationEndsAt ?? "",
    status: row.status,
    sortOrder: row.sortOrder
  });
  dialogVisible.value = true;
}

async function save() {
  if (!validateConferenceTimes()) return;
  const payload = {
    title: form.title,
    subtitle: form.subtitle,
    coverImage: form.coverImage,
    location: form.location,
    startAt: form.startAt,
    endAt: form.endAt,
    registrationStartsAt: form.registrationStartsAt || null,
    registrationEndsAt: form.registrationEndsAt || null,
    status: form.status,
    sortOrder: form.sortOrder
  };
  if (form.id) {
    await updateConference(form.id, payload);
  } else {
    await createConference(payload);
  }
  dialogVisible.value = false;
  await load();
  ElMessage.success("会议已保存");
}

function validateConferenceTimes(): boolean {
  if (!form.startAt || !form.endAt) {
    ElMessage.warning("请完整填写会议开始和结束时间");
    return false;
  }
  if (new Date(form.startAt) >= new Date(form.endAt)) {
    ElMessage.warning("会议开始时间必须早于会议结束时间");
    return false;
  }
  const hasRegistrationStart = Boolean(form.registrationStartsAt);
  const hasRegistrationEnd = Boolean(form.registrationEndsAt);
  if (hasRegistrationStart !== hasRegistrationEnd) {
    ElMessage.warning("报名开始和截止时间请同时填写，或同时留空跟随会议时间");
    return false;
  }
  if (
    form.registrationStartsAt
    && form.registrationEndsAt
    && new Date(form.registrationStartsAt) >= new Date(form.registrationEndsAt)
  ) {
    ElMessage.warning("报名开始时间必须早于报名截止时间");
    return false;
  }
  return true;
}

async function changeStatus(id: string, nextStatus: string) {
  const target = items.value.find((item) => item.id === id);
  if (requiresStatusConfirm(nextStatus)) {
    await ElMessageBox.confirm(
      `确认将「${target?.title ?? "该会议"}」切换为${statusText(nextStatus)}？该操作会影响用户端报名入口展示。`,
      "确认变更会议状态",
      { confirmButtonText: "确认变更", cancelButtonText: "取消", type: nextStatus === "PUBLISHED" ? "warning" : "error" }
    );
  }
  await updateConferenceStatus(id, nextStatus);
  await load();
  ElMessage.success("状态已更新");
}

function goConfig(id: string) {
  navigateTo("/conferences/config", { id });
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function statusText(value: string) {
  return { DRAFT: "草稿", PUBLISHED: "已发布", CLOSED: "已关闭", ARCHIVED: "已归档" }[value] ?? value;
}

function requiresStatusConfirm(value: string) {
  return ["PUBLISHED", "CLOSED", "ARCHIVED"].includes(value);
}
</script>

<style scoped>
.date-picker {
  width: min(100%, 360px);
}

.dialog-section-heading {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 4px 0 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--admin-color-border);
}

.dialog-section-heading:not(:first-child) {
  margin-top: 28px;
}

.dialog-section-heading strong {
  color: var(--admin-color-text);
  font-size: 15px;
}

.dialog-section-heading span {
  color: var(--admin-color-muted);
  font-size: 12px;
}
</style>
