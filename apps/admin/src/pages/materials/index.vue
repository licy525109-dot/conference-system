<template>
  <section class="admin-page">
    <AdminPageHeader
      title="素材管理"
      eyebrow="页面装修"
      subtitle="按使用位置管理图片、图标、视频和字体素材；上传接口和 uploads 目录策略保持不变。"
    >
      <template #actions>
        <el-button @click="categoryVisible = true">新增分类</el-button>
        <el-button type="primary" @click="openCreate">上传素材</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-input v-model="keyword" clearable placeholder="素材名称 / 位置 / 备注" style="width: 240px" @keyup.enter="load" />
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
        <el-option label="主题背景视频" value="theme_background_video" />
        <el-option label="资料下载" value="download_file" />
        <el-option label="AI 知识库文档" value="ai_document" />
        <el-option label="商品封面" value="product_cover" />
        <el-option label="商品详情图" value="product_detail" />
        <el-option label="企微群二维码" value="wecom_qr" />
        <el-option label="企微群发图片" value="wecom_message_image" />
        <el-option label="企微群发文件" value="wecom_message_file" />
      </el-select>
      <el-select v-model="enabledFilter" clearable placeholder="状态" style="width: 130px">
        <el-option label="启用" value="true" />
        <el-option label="停用" value="false" />
      </el-select>
      <template #actions>
        <el-button :loading="loading" type="primary" @click="load">查询</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table v-loading="loading" :data="assets" empty-text="暂无素材">
        <el-table-column label="预览" width="100">
          <template #default="{ row }">
            <img v-if="row.fileType.startsWith('image/')" class="image-preview" :src="row.url" alt="" />
            <span v-else-if="row.fileType.startsWith('font/')" class="font-preview">字体</span>
            <video v-else-if="row.fileType.startsWith('video/')" class="image-preview" :src="row.url" muted controls @error="markPreviewError(row)" />
            <span v-else class="font-preview">文件</span>
            <div v-if="previewErrors[row.id]" class="preview-error">无法播放</div>
          </template>
        </el-table-column>
        <el-table-column label="素材" min-width="180">
          <template #default="{ row }">
            <strong>{{ row.name }}</strong>
            <div class="muted-text">{{ row.fileType || "外部 URL" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="140"><template #default="{ row }">{{ row.category?.name || "-" }}</template></el-table-column>
        <el-table-column prop="usage" label="使用位置" width="160" />
        <el-table-column label="文件" width="120">
          <template #default="{ row }">
            <el-tag :type="row.uploadCheck?.localExists ? 'success' : 'warning'" size="small">
              {{ row.uploadCheck?.localExists ? "已存在" : row.uploadCheck?.localPath ? "未找到" : "外部 URL" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="URL 可访问" width="150">
          <template #default="{ row }">
            <el-tag :type="urlTagType(row)" size="small">{{ urlStatusText(row) }}</el-tag>
            <div v-if="row.uploadCheck?.publicMime" class="diagnose-mime">{{ row.uploadCheck.publicMime }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="url" label="URL" min-width="240" show-overflow-tooltip />
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.enabled" /></template></el-table-column>
        <el-table-column label="操作" width="350">
          <template #default="{ row }">
            <el-button size="small" @click="copyUrl(row.url)">复制 URL</el-button>
            <el-button size="small" :loading="diagnosingId === row.id" @click="diagnose(row)">诊断</el-button>
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="warning" :disabled="!row.enabled" @click="disable(row.id)">停用</el-button>
            <el-button size="small" type="danger" @click="hardDelete(row)">彻底删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <AdminEmptyState title="暂无素材" description="可先上传会议封面、详情头图、页面装修图片或字体文件。" action-text="上传素材" @action="openCreate" />
        </template>
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" title="上传素材" width="620px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="分类"><el-select v-model="form.categoryId" clearable><el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        <el-form-item>
          <template #label>使用位置<MaterialSpecHelp :spec="currentUploadSpec" /></template>
          <el-select v-model="form.usage" filterable allow-create default-first-option placeholder="如 home_banner / conference_cover / page_font">
            <el-option label="首页横幅 / Hero" value="home_banner" />
            <el-option label="会议封面" value="conference_cover" />
            <el-option label="详情头图" value="conference_header" />
            <el-option label="底部导航图标" value="tabbar_icon" />
            <el-option label="页面字体" value="page_font" />
            <el-option label="主题背景视频" value="theme_background_video" />
            <el-option label="资料下载" value="download_file" />
            <el-option label="AI 知识库文档" value="ai_document" />
            <el-option label="商品封面" value="product_cover" />
            <el-option label="商品详情图" value="product_detail" />
            <el-option label="企微群二维码" value="wecom_qr" />
            <el-option label="企微群发图片" value="wecom_message_image" />
            <el-option label="企微群发文件" value="wecom_message_file" />
          </el-select>
          <p class="upload-tip">{{ currentUploadSpecText }}</p>
        </el-form-item>
        <el-form-item>
          <template #label>上传文件<MaterialSpecHelp :spec="currentUploadSpec" /></template>
          <input type="file" accept="image/*,video/mp4,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.ttf,.otf,.woff,.woff2" @change="onFileChange" />
        </el-form-item>
        <el-form-item v-if="form.file || uploadProgress > 0" label="上传进度">
          <el-progress :percentage="uploadProgress" />
        </el-form-item>
        <el-form-item>
          <template #label>外部 URL<MaterialSpecHelp :spec="currentUploadSpec" /></template>
          <el-input v-model="form.url" placeholder="不上传文件时填写；请确保外部素材也符合建议尺寸与大小" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑素材" width="560px">
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="名称"><el-input v-model="editForm.name" /></el-form-item>
        <el-form-item label="分类"><el-select v-model="editForm.categoryId" clearable><el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" /></el-select></el-form-item>
        <el-form-item label="使用位置">
          <el-select v-model="editForm.usage" filterable allow-create default-first-option>
            <el-option label="首页横幅 / Hero" value="home_banner" />
            <el-option label="会议封面" value="conference_cover" />
            <el-option label="详情头图" value="conference_header" />
            <el-option label="底部导航图标" value="tabbar_icon" />
            <el-option label="页面字体" value="page_font" />
            <el-option label="主题背景视频" value="theme_background_video" />
            <el-option label="资料下载" value="download_file" />
            <el-option label="AI 知识库文档" value="ai_document" />
            <el-option label="商品封面" value="product_cover" />
            <el-option label="商品详情图" value="product_detail" />
            <el-option label="企微群二维码" value="wecom_qr" />
            <el-option label="企微群发图片" value="wecom_message_image" />
            <el-option label="企微群发文件" value="wecom_message_file" />
          </el-select>
        </el-form-item>
        <el-form-item label="URL"><el-input v-model="editForm.url" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="editForm.remark" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="状态"><el-switch v-model="editForm.enabled" active-text="启用" inactive-text="停用" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="editVisible = false">取消</el-button><el-button type="primary" :loading="editSaving" @click="saveEdit">保存</el-button></template>
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
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminEmptyState from "../../components/AdminEmptyState.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import MaterialSpecHelp from "../../components/MaterialSpecHelp.vue";
import { materialSpecs, materialSpecText, materialUsageSpecMap, validateMaterialFile } from "../../constants/materialSpecs";
import { createMaterial, createMaterialCategory, diagnoseMaterial, disableMaterial, hardDeleteMaterial, listMaterialCategories, listMaterials, updateMaterial } from "../../services/admin";
import type { MaterialAsset, MaterialCategory } from "../../services/types";

const categories = ref<MaterialCategory[]>([]);
const assets = ref<MaterialAsset[]>([]);
const keyword = ref("");
const categoryId = ref("");
const usage = ref("");
const enabledFilter = ref("true");
const loading = ref(false);
const dialogVisible = ref(false);
const editVisible = ref(false);
const categoryVisible = ref(false);
const saving = ref(false);
const editSaving = ref(false);
const categorySaving = ref(false);
const uploadProgress = ref(0);
const diagnosingId = ref("");
const previewErrors = ref<Record<string, boolean>>({});
const form = reactive({ name: "", categoryId: "", usage: "home_banner", url: "", remark: "", file: undefined as File | undefined });
const editForm = reactive({ id: "", name: "", categoryId: "", usage: "", url: "", remark: "", enabled: true });
const categoryForm = reactive({ name: "", code: "", description: "" });
const currentUploadSpec = computed(() => materialSpecs[materialUsageSpecMap[form.usage] ?? "materialUpload"]);
const currentUploadSpecText = computed(() => materialSpecText(currentUploadSpec.value));

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
    assets.value = (
      await listMaterials({
        page: 1,
        pageSize: 100,
        keyword: keyword.value,
        categoryId: categoryId.value,
        usage: usage.value,
        enabled: enabledFilter.value ? enabledFilter.value === "true" : undefined
      })
    ).items;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { name: "", categoryId: "", usage: "home_banner", url: "", remark: "", file: undefined });
  uploadProgress.value = 0;
  dialogVisible.value = true;
}

function openEdit(row: MaterialAsset) {
  Object.assign(editForm, {
    id: row.id,
    name: row.name,
    categoryId: row.categoryId ?? "",
    usage: row.usage,
    url: row.url,
    remark: row.remark ?? "",
    enabled: row.enabled
  });
  editVisible.value = true;
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) {
    form.file = undefined;
    return;
  }
  const validation = validateMaterialFile(file, currentUploadSpec.value);
  if (validation) {
    input.value = "";
    form.file = undefined;
    void showError("素材不符合要求", validation);
    return;
  }
  form.file = file;
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
    const asset = await createMaterial({
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
    const diagnostic = uploadDiagnostic(asset);
    if (diagnostic) {
      await ElMessageBox.alert(diagnostic, "素材已保存", { confirmButtonText: "知道了", type: "success" });
    } else {
      ElMessage.success("素材已保存");
    }
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

async function saveEdit() {
  if (!editForm.name.trim()) {
    await showError("无法保存素材", "请填写素材名称");
    return;
  }
  if (!editForm.usage.trim()) {
    await showError("无法保存素材", "请填写使用位置");
    return;
  }
  if (!editForm.url.trim()) {
    await showError("无法保存素材", "请填写 URL");
    return;
  }
  editSaving.value = true;
  try {
    await updateMaterial(editForm.id, {
      name: editForm.name.trim(),
      categoryId: editForm.categoryId || null,
      usage: editForm.usage.trim(),
      url: editForm.url.trim(),
      remark: editForm.remark.trim() || null,
      enabled: editForm.enabled
    });
    editVisible.value = false;
    await load();
    ElMessage.success("素材已更新");
  } catch (error) {
    await showError("素材更新失败", errorMessage(error));
  } finally {
    editSaving.value = false;
  }
}

async function disable(id: string) {
  try {
    await ElMessageBox.confirm("素材将软删除并默认隐藏，不会删除 uploads 文件；已发布页面或商品如仍引用 URL，历史展示不被强制改写。", "确认软删除素材", {
      confirmButtonText: "确认软删除",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  await disableMaterial(id);
  await load();
  ElMessage.success("素材已停用");
}

async function hardDelete(row: MaterialAsset) {
  try {
    await ElMessageBox.confirm(
      `彻底删除会检查 CMS、商品、主题、底部导航、会议封面等引用，并删除 uploads 下实际文件；该操作不可恢复。\n\n素材：${row.name}\nURL：${row.url}`,
      "确认彻底删除素材",
      {
        confirmButtonText: "彻底删除",
        cancelButtonText: "取消",
        type: "error"
      }
    );
  } catch {
    return;
  }
  try {
    const result = await hardDeleteMaterial(row.id);
    await load();
    const file = result.file || {};
    ElMessage.success(`素材已彻底删除；${String(file.message || "文件处理完成")}`);
  } catch (error) {
    await showError("无法彻底删除素材", errorMessage(error));
  }
}

async function copyUrl(url: string) {
  await navigator.clipboard.writeText(url);
  ElMessage.success("URL 已复制");
}

async function diagnose(row: MaterialAsset) {
  diagnosingId.value = row.id;
  try {
    const asset = await diagnoseMaterial(row.id);
    const index = assets.value.findIndex((item) => item.id === row.id);
    if (index >= 0) assets.value[index] = { ...assets.value[index], uploadCheck: asset.uploadCheck };
    await ElMessageBox.alert(uploadDiagnostic(asset) || "诊断完成", "素材诊断结果", {
      confirmButtonText: "知道了",
      type: asset.uploadCheck?.publicReachable === false ? "warning" : "success"
    });
  } finally {
    diagnosingId.value = "";
  }
}

function markPreviewError(row: MaterialAsset) {
  previewErrors.value = { ...previewErrors.value, [row.id]: true };
}

function urlStatusText(row: MaterialAsset): string {
  const check = row.uploadCheck;
  if (!check) return "未检测";
  if (check.publicReachable === true) return check.publicStatus ? `${check.publicStatus}` : "可访问";
  if (check.publicReachable === false) return check.publicStatus ? `${check.publicStatus}` : "不可访问";
  return "未检测";
}

function urlTagType(row: MaterialAsset): "success" | "warning" | "danger" | "info" {
  const reachable = row.uploadCheck?.publicReachable;
  if (reachable === true) return "success";
  if (reachable === false) return "danger";
  return "info";
}

function validateMaterialForm(): string {
  if (!form.name.trim()) return "请填写素材名称";
  if (!form.usage.trim()) return "请填写使用位置，例如 home_banner、conference_cover 或 page_font";
  if (!form.file && !form.url.trim()) return "请上传文件，或填写外部 URL";
  if (form.file) return validateMaterialFile(form.file, currentUploadSpec.value);
  return "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "请检查网络、登录状态和表单内容后重试";
}

function uploadDiagnostic(asset: MaterialAsset): string {
  const check = asset.uploadCheck;
  if (!check) return "";
  const lines = [
    `素材公网 URL：${check.url}`,
    check.staticUrl ? `uploads 静态目录：${check.staticUrl}` : "",
    check.localPath ? `服务器文件路径：${check.localPath}` : "",
    typeof check.localExists === "boolean" ? `本地文件检测：${check.localExists ? "已存在" : "未检测到"}` : "",
    check.accessHint
  ].filter(Boolean);
  return lines.join("\n");
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

.upload-tip {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.preview-error,
.diagnose-mime {
  margin-top: 4px;
  color: #b45309;
  font-size: 12px;
  line-height: 1.35;
}
</style>
