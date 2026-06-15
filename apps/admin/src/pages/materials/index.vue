<template>
  <section class="admin-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">素材管理</h1>
        <p class="page-subtitle">按使用位置管理图片、图标、视频和字体素材。</p>
      </div>
      <div class="inline-actions">
        <el-button @click="categoryVisible = true">新增分类</el-button>
        <el-button type="primary" @click="openCreate">上传素材</el-button>
      </div>
    </div>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="素材名称/位置/备注" style="width: 240px" @keyup.enter="load" />
      <el-select v-model="categoryId" clearable placeholder="分类" style="width: 180px">
        <el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-select v-model="usage" clearable placeholder="使用位置" style="width: 180px">
        <el-option label="首页 Banner" value="home_banner" />
        <el-option label="会议封面" value="conference_cover" />
        <el-option label="详情头图" value="conference_header" />
        <el-option label="底部导航图标" value="tabbar_icon" />
        <el-option label="支付结果页" value="payment_result" />
        <el-option label="页面字体" value="page_font" />
      </el-select>
      <el-button :loading="loading" @click="load">查询</el-button>
    </div>
    <section class="table-panel">
      <el-table :data="assets" empty-text="暂无素材">
        <el-table-column label="预览" width="100">
          <template #default="{ row }">
            <img v-if="row.fileType.startsWith('image/')" class="image-preview" :src="row.url" alt="" />
            <span v-else-if="row.fileType.startsWith('font/')" class="font-preview">字体</span>
            <span v-else>视频</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="分类" width="140"><template #default="{ row }">{{ row.category?.name || "-" }}</template></el-table-column>
        <el-table-column prop="usage" label="使用位置" width="160" />
        <el-table-column prop="url" label="URL" min-width="240" show-overflow-tooltip />
        <el-table-column label="状态" width="90"><template #default="{ row }">{{ row.enabled ? "启用" : "停用" }}</template></el-table-column>
        <el-table-column label="操作" width="190">
          <template #default="{ row }">
            <el-button size="small" @click="copyUrl(row.url)">复制 URL</el-button>
            <el-button size="small" type="warning" :disabled="!row.enabled" @click="disable(row.id)">停用</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" title="上传素材" width="620px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="分类"><el-select v-model="form.categoryId" clearable><el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="使用位置"><el-input v-model="form.usage" placeholder="如 home_banner / conference_cover / page_font" /></el-form-item>
        <el-form-item label="上传文件"><input type="file" accept="image/*,video/mp4,.ttf,.otf,.woff,.woff2" @change="onFileChange" /></el-form-item>
        <el-form-item v-if="form.file || uploadProgress > 0" label="上传进度">
          <el-progress :percentage="uploadProgress" />
        </el-form-item>
        <el-form-item label="外部 URL"><el-input v-model="form.url" placeholder="不上传文件时填写" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="categoryVisible" title="新增素材分类" width="520px">
      <el-form :model="categoryForm" label-width="100px">
        <el-form-item label="名称"><el-input v-model="categoryForm.name" /></el-form-item>
        <el-form-item label="编码"><el-input v-model="categoryForm.code" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="categoryForm.description" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="categoryVisible = false">取消</el-button><el-button type="primary" :loading="categorySaving" @click="saveCategory">保存</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { createMaterial, createMaterialCategory, disableMaterial, listMaterialCategories, listMaterials } from "../../services/admin";
import type { MaterialAsset, MaterialCategory } from "../../services/types";

const categories = ref<MaterialCategory[]>([]);
const assets = ref<MaterialAsset[]>([]);
const keyword = ref("");
const categoryId = ref("");
const usage = ref("");
const loading = ref(false);
const dialogVisible = ref(false);
const categoryVisible = ref(false);
const saving = ref(false);
const categorySaving = ref(false);
const uploadProgress = ref(0);
const form = reactive({ name: "", categoryId: "", usage: "home_banner", url: "", remark: "", file: undefined as File | undefined });
const categoryForm = reactive({ name: "", code: "", description: "" });

onMounted(async () => {
  await loadCategories();
  await load();
});

async function loadCategories() {
  categories.value = (await listMaterialCategories()).items;
}

async function load() {
  loading.value = true;
  try {
    assets.value = (await listMaterials({ page: 1, pageSize: 100, keyword: keyword.value, categoryId: categoryId.value, usage: usage.value })).items;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { name: "", categoryId: "", usage: "home_banner", url: "", remark: "", file: undefined });
  uploadProgress.value = 0;
  dialogVisible.value = true;
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  form.file = input.files?.[0];
}

async function save() {
  const validation = validateMaterialForm();
  if (validation) {
    await showError("无法保存素材", validation);
    return;
  }
  saving.value = true;
  uploadProgress.value = form.file ? 1 : 0;
  try {
    await createMaterial({
      name: form.name.trim(),
      categoryId: form.categoryId || undefined,
      usage: form.usage.trim(),
      url: form.url.trim() || undefined,
      remark: form.remark || undefined,
      file: form.file,
      onProgress: (percent) => {
        uploadProgress.value = percent;
      }
    });
    dialogVisible.value = false;
    uploadProgress.value = 0;
    await load();
    ElMessage.success("素材已保存");
  } catch (error) {
    await showError("素材保存失败", errorMessage(error));
  } finally {
    saving.value = false;
  }
}

async function saveCategory() {
  if (!categoryForm.name.trim()) {
    await showError("无法保存分类", "请填写分类名称");
    return;
  }
  if (!categoryForm.code.trim()) {
    await showError("无法保存分类", "请填写分类编码");
    return;
  }
  categorySaving.value = true;
  try {
    await createMaterialCategory({
      name: categoryForm.name.trim(),
      code: categoryForm.code.trim(),
      description: categoryForm.description.trim()
    });
    Object.assign(categoryForm, { name: "", code: "", description: "" });
    categoryVisible.value = false;
    await loadCategories();
    ElMessage.success("分类已保存");
  } catch (error) {
    await showError("分类保存失败", errorMessage(error));
  } finally {
    categorySaving.value = false;
  }
}

async function disable(id: string) {
  await disableMaterial(id);
  await load();
}

async function copyUrl(url: string) {
  await navigator.clipboard.writeText(url);
  ElMessage.success("URL 已复制");
}

function validateMaterialForm(): string {
  if (!form.name.trim()) return "请填写素材名称";
  if (!form.usage.trim()) return "请填写使用位置，例如 home_banner、conference_cover 或 page_font";
  if (!form.file && !form.url.trim()) return "请上传文件，或填写外部 URL";
  return "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "请检查网络、登录状态和表单内容后重试";
}

async function showError(title: string, message: string) {
  await ElMessageBox.alert(message, title, { confirmButtonText: "知道了", type: "warning" });
}
</script>

<style scoped>
.image-preview,
.font-preview {
  width: 64px;
  height: 44px;
  border-radius: 8px;
  background: #eef3fb;
}

.image-preview {
  object-fit: cover;
}

.font-preview {
  display: inline-grid;
  place-items: center;
  color: var(--admin-color-primary);
  font-size: 13px;
  font-weight: 800;
}
</style>
