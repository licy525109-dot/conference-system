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
        <el-table-column label="时间" min-width="220">
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
          <AdminEmptyState title="暂无会议" description="创建第一场会议后，可以继续配置票种、报名字段和页面装修。" mark="会" action-text="新建会议" @action="openCreate" />
        </template>
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑会议' : '新建会议'" width="720px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="副标题"><el-input v-model="form.subtitle" /></el-form-item>
        <el-form-item label="封面 URL">
          <div class="cover-row">
            <el-input v-model="form.coverImage" />
            <el-button @click="openMaterialPicker">应用素材库</el-button>
          </div>
        </el-form-item>
        <el-form-item label="地点"><el-input v-model="form.location" /></el-form-item>
        <el-form-item label="开始时间"><el-date-picker v-model="form.startAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" /></el-form-item>
        <el-form-item label="结束时间"><el-date-picker v-model="form.endAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" /></el-form-item>
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

    <el-dialog v-model="materialVisible" title="选择会议封面" width="820px">
      <div class="material-picker">
        <div class="material-picker__head">
          <el-input v-model="materialKeyword" clearable placeholder="搜索素材名称" @keyup.enter="loadMaterials" />
          <el-button :loading="materialLoading" @click="loadMaterials">搜索</el-button>
        </div>
        <el-empty v-if="!materialLoading && materialImages.length === 0" description="暂无可用图片素材" />
        <div v-else class="material-grid">
          <button v-for="asset in materialImages" :key="asset.id" class="material-card" @click="chooseMaterial(asset)">
            <img :src="asset.url" :alt="asset.name" />
            <strong>{{ asset.name }}</strong>
            <small>{{ asset.usage || "通用素材" }}</small>
          </button>
        </div>
      </div>
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
import { createConference, listConferences, listMaterials, updateConference, updateConferenceStatus } from "../../services/admin";
import type { Conference, MaterialAsset } from "../../services/types";
import { navigateTo } from "../../router";

const items = ref<Conference[]>([]);
const keyword = ref("");
const status = ref("");
const loading = ref(false);
const dialogVisible = ref(false);
const materialVisible = ref(false);
const materialLoading = ref(false);
const materialKeyword = ref("");
const materialImages = ref<MaterialAsset[]>([]);
const form = reactive({
  id: "",
  title: "",
  subtitle: "",
  coverImage: "",
  location: "",
  startAt: "",
  endAt: "",
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
  Object.assign(form, {
    id: "",
    title: "",
    subtitle: "",
    coverImage: "",
    location: "",
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 86400000).toISOString(),
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
    status: row.status,
    sortOrder: row.sortOrder
  });
  dialogVisible.value = true;
}

async function save() {
  const payload = {
    title: form.title,
    subtitle: form.subtitle,
    coverImage: form.coverImage,
    location: form.location,
    startAt: form.startAt,
    endAt: form.endAt,
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

async function openMaterialPicker() {
  materialVisible.value = true;
  await loadMaterials();
}

async function loadMaterials() {
  materialLoading.value = true;
  try {
    const response = await listMaterials({ page: 1, pageSize: 80, keyword: materialKeyword.value, enabled: true });
    materialImages.value = response.items.filter((asset) => asset.enabled && (asset.fileType.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(asset.url)));
  } finally {
    materialLoading.value = false;
  }
}

function chooseMaterial(asset: MaterialAsset) {
  form.coverImage = asset.url;
  materialVisible.value = false;
  ElMessage.success("已应用会议封面");
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
.cover-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  width: 100%;
}

.material-picker {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.material-picker__head {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
}

.material-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  max-height: 520px;
  overflow: auto;
}

.material-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--admin-color-border);
  border-radius: 8px;
  background: #ffffff;
  color: var(--admin-color-text);
  text-align: left;
  cursor: pointer;
}

.material-card:hover {
  border-color: var(--admin-color-primary);
  box-shadow: var(--admin-shadow-soft);
}

.material-card img {
  width: 100%;
  height: 100px;
  object-fit: cover;
  border-radius: 8px;
  background: #eef3fb;
}

.material-card strong,
.material-card small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-card small {
  color: var(--admin-color-muted);
}
</style>
