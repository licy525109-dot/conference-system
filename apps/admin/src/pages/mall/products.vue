<template>
  <section class="admin-page">
    <AdminPageHeader
      title="商品管理"
      eyebrow="商城"
      subtitle="维护商城商品、封面、详情图和上架状态。支付成功后才会进入发货与售后流程。"
    >
      <template #actions>
        <el-button @click="navigateTo('/mall/categories')">商品分类</el-button>
        <el-button type="primary" @click="openCreate">新增商品</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-input v-model="keyword" clearable placeholder="商品标题" style="width: 220px" @keyup.enter="loadProducts" />
      <el-select v-model="categoryId" clearable placeholder="分类" style="width: 180px">
        <el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-select v-model="status" clearable placeholder="状态" style="width: 140px">
        <el-option label="草稿" value="DRAFT" />
        <el-option label="上架" value="PUBLISHED" />
        <el-option label="下架" value="OFFLINE" />
      </el-select>
      <template #actions>
        <el-button :loading="loading" type="primary" @click="loadProducts">查询</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table v-loading="loading" :data="products" empty-text="暂无商品">
        <el-table-column label="商品" min-width="280">
          <template #default="{ row }">
            <div class="product-cell">
              <img v-if="row.coverImageUrl" class="image-preview" :src="row.coverImageUrl" alt="" />
              <div class="product-text">
                <strong>{{ row.title }}</strong>
                <div class="muted-text">{{ row.subtitle || "-" }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="140"><template #default="{ row }">{{ row.category?.name || "-" }}</template></el-table-column>
        <el-table-column label="类型" width="110"><template #default="{ row }"><el-tag size="small">{{ productTypeText(row.productType) }}</el-tag></template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="productStatusText(row.status)" /></template></el-table-column>
        <el-table-column label="SKU / 可售" width="150">
          <template #default="{ row }">
            {{ row.skus.length }} 个 / {{ row.skus.reduce((sum: number, sku: ProductSku) => sum + sku.availableStock, 0) }}
          </template>
        </el-table-column>
        <el-table-column label="排序" prop="sortOrder" width="90" />
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" @click="openSku(row.id)">加规格</el-button>
            <el-button size="small" @click="navigateTo('/mall/skus', { productId: row.id })">SKU</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          layout="total, sizes, prev, pager, next"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          @current-change="loadProducts"
          @size-change="loadProducts"
        />
      </div>
    </section>

    <el-dialog v-model="productVisible" :title="form.id ? '编辑商品' : '新增商品'" width="720px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="副标题"><el-input v-model="form.subtitle" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.categoryId" clearable filterable placeholder="选择分类">
            <el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="商品类型">
          <el-radio-group v-model="form.productType">
            <el-radio-button label="PHYSICAL">实体商品</el-radio-button>
            <el-radio-button label="VIRTUAL">虚拟商品</el-radio-button>
            <el-radio-button label="SERVICE">服务商品</el-radio-button>
          </el-radio-group>
          <p class="form-help">实体商品要求用户填写收货信息；虚拟/服务商品不进入发货流程，订单显示为待使用/待核销。</p>
        </el-form-item>
        <el-form-item>
          <template #label>封面 URL<MaterialSpecHelp spec-key="productCover" /></template>
          <div class="field-stack">
            <div class="field-row">
              <el-input v-model="form.coverImageUrl" placeholder="建议 800×800 或 750×750，JPG/PNG/WebP，单张不超过 2MB" />
              <el-button @click="openMaterialPicker('cover')">素材库</el-button>
              <el-button @click="triggerUpload('cover')">本地上传</el-button>
            </div>
            <img v-if="form.coverImageUrl" class="large-preview" :src="form.coverImageUrl" alt="" />
          </div>
        </el-form-item>
        <el-form-item>
          <template #label>详情图 URL<MaterialSpecHelp spec-key="productDetail" /></template>
          <div class="field-stack">
            <div class="field-row">
              <el-input v-model="detailUrlDraft" placeholder="粘贴详情图 URL，建议宽度 750px，JPG/PNG/WebP，单张不超过 2MB" />
              <el-button @click="addDetailUrl">添加 URL</el-button>
              <el-button @click="openMaterialPicker('detail')">素材库</el-button>
              <el-button @click="triggerUpload('detail')">本地上传</el-button>
            </div>
            <div v-if="form.detailImages.length" class="detail-image-list">
              <div v-for="(item, index) in form.detailImages" :key="`${item.url}-${index}`" class="detail-image-item">
                <img :src="item.url" alt="" />
                <span>{{ item.materialId ? "素材库" : "URL" }}</span>
                <el-button link type="danger" @click="removeDetailImage(index)">移除</el-button>
              </div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="上架" value="PUBLISHED" />
            <el-option label="下架" value="OFFLINE" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="productVisible = false">取消</el-button>
        <el-button type="primary" @click="saveProduct">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="skuVisible" title="新增商品规格" width="540px">
      <el-form :model="skuForm" label-width="120px">
        <el-form-item label="名称"><el-input v-model="skuForm.name" placeholder="如 标准版 / VIP 套装" /></el-form-item>
        <el-form-item label="价格(元)"><el-input-number v-model="skuForm.priceYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="库存"><el-input-number v-model="skuForm.stock" :min="0" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="skuForm.status">
            <el-option label="启用" value="ACTIVE" />
            <el-option label="停用" value="INACTIVE" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="skuVisible = false">取消</el-button>
        <el-button type="primary" @click="saveSku">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="materialVisible" title="选择商品图片素材" width="820px">
      <div class="material-picker">
        <div class="field-row">
          <el-input v-model="materialKeyword" clearable placeholder="搜索素材名称" @keyup.enter="loadMaterials" />
          <el-button :loading="materialLoading" @click="loadMaterials">搜索</el-button>
        </div>
        <p class="form-help">商品封面建议 800×800 或 750×750，详情图建议宽度 750px；JPG/PNG/WebP，单张不超过 2MB。</p>
        <el-empty v-if="!materialLoading && materialAssets.length === 0" description="暂无图片素材" />
        <div v-else class="material-grid">
          <button v-for="asset in materialAssets" :key="asset.id" class="material-card" @click="chooseMaterial(asset)">
            <img :src="asset.url" :alt="asset.name" />
            <strong>{{ asset.name }}</strong>
          </button>
        </div>
      </div>
    </el-dialog>

    <input ref="uploadInput" class="hidden-file" type="file" accept="image/jpeg,image/png,image/webp" @change="handleUploadChange" />
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import MaterialSpecHelp from "../../components/MaterialSpecHelp.vue";
import { createMaterial, createProduct, createProductSku, listMaterials, listProductCategories, listProducts, updateProduct } from "../../services/admin";
import type { MaterialAsset, Product, ProductCategory, ProductSku } from "../../services/types";
import { navigateTo } from "../../router";

const categories = ref<ProductCategory[]>([]);
const products = ref<Product[]>([]);
const keyword = ref("");
const categoryId = ref("");
const status = ref("");
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const productVisible = ref(false);
const skuVisible = ref(false);
const materialVisible = ref(false);
const materialLoading = ref(false);
const materialKeyword = ref("");
const materialAssets = ref<MaterialAsset[]>([]);
const materialTarget = ref<"cover" | "detail">("cover");
const uploadTarget = ref<"cover" | "detail">("cover");
const uploadInput = ref<HTMLInputElement | null>(null);
const detailUrlDraft = ref("");
const form = reactive({
  id: "",
  title: "",
  subtitle: "",
  categoryId: "",
  productType: "PHYSICAL",
  coverImageUrl: "",
  coverMaterialId: "",
  detailImages: [] as Array<{ url: string; materialId: string | null; alt: string | null }>,
  status: "DRAFT",
  sortOrder: 0
});
const skuForm = reactive({ productId: "", name: "", priceYuan: 0, stock: 0, status: "ACTIVE" });

onMounted(async () => {
  await Promise.all([loadCategories(), loadProducts()]);
});

async function loadCategories() {
  categories.value = (await listProductCategories()).items;
}

async function loadProducts() {
  loading.value = true;
  try {
    const result = await listProducts({ page: page.value, pageSize: pageSize.value, keyword: keyword.value, categoryId: categoryId.value, status: status.value });
    products.value = result.items;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { id: "", title: "", subtitle: "", categoryId: "", productType: "PHYSICAL", coverImageUrl: "", coverMaterialId: "", detailImages: [], status: "DRAFT", sortOrder: 0 });
  detailUrlDraft.value = "";
  productVisible.value = true;
}

function openEdit(row: Product) {
  Object.assign(form, {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? "",
    categoryId: row.categoryId ?? "",
    productType: row.productType ?? "PHYSICAL",
    coverImageUrl: row.coverImageUrl ?? "",
    coverMaterialId: row.coverMaterialId ?? "",
    detailImages: (row.detailImages?.length ? row.detailImages : (row.detailImageUrls ?? []).map((url) => ({ url, materialId: null, alt: null }))).map((item) => ({
      url: item.url,
      materialId: item.materialId ?? null,
      alt: item.alt ?? null
    })),
    status: row.status,
    sortOrder: row.sortOrder
  });
  detailUrlDraft.value = "";
  productVisible.value = true;
}

function openSku(productId: string) {
  Object.assign(skuForm, { productId, name: "", priceYuan: 0, stock: 0, status: "ACTIVE" });
  skuVisible.value = true;
}

async function saveProduct() {
  const images = [...form.detailImages];
  try {
    await validateProductImages(form.coverImageUrl, images.map((item) => item.url));
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "商品图片校验失败");
    return;
  }
  const payload = {
    title: form.title,
    subtitle: form.subtitle || null,
    categoryId: form.categoryId || null,
    productType: form.productType,
    coverImageUrl: form.coverImageUrl || null,
    coverMaterialId: form.coverMaterialId || null,
    detailImages: images,
    status: form.status,
    sortOrder: form.sortOrder
  };
  if (form.id) await updateProduct(form.id, payload);
  else await createProduct(payload);
  productVisible.value = false;
  await loadProducts();
  ElMessage.success("商品已保存");
}

async function saveSku() {
  await createProductSku(skuForm.productId, {
    name: skuForm.name,
    priceCent: Math.round(skuForm.priceYuan * 100),
    stock: skuForm.stock,
    status: skuForm.status
  });
  skuVisible.value = false;
  await loadProducts();
  ElMessage.success("SKU 已新增");
}

function productStatusText(value: string) {
  return { DRAFT: "草稿", PUBLISHED: "上架", OFFLINE: "下架", ACTIVE: "启用", INACTIVE: "停用" }[value] ?? value;
}

function productTypeText(value: string) {
  return { PHYSICAL: "实物商品", VIRTUAL: "虚拟商品", SERVICE: "服务类商品" }[value] ?? value;
}

async function openMaterialPicker(target: "cover" | "detail") {
  materialTarget.value = target;
  materialVisible.value = true;
  await loadMaterials();
}

async function loadMaterials() {
  materialLoading.value = true;
  try {
    const result = await listMaterials({ page: 1, pageSize: 80, keyword: materialKeyword.value, enabled: true });
    materialAssets.value = result.items.filter((item) => isProductImageType(item.fileType, item.url));
  } finally {
    materialLoading.value = false;
  }
}

function chooseMaterial(asset: MaterialAsset) {
  if (materialTarget.value === "cover") {
    form.coverImageUrl = asset.url;
    form.coverMaterialId = asset.id;
  } else {
    form.detailImages.push({ url: asset.url, materialId: asset.id, alt: asset.name });
  }
  materialVisible.value = false;
  ElMessage.success("已应用素材");
}

function triggerUpload(target: "cover" | "detail") {
  uploadTarget.value = target;
  uploadInput.value?.click();
}

async function handleUploadChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!validateProductFile(file)) return;
  const asset = await createMaterial({
    name: file.name.replace(/\.[^.]+$/, ""),
    usage: uploadTarget.value === "cover" ? "product_cover" : "product_detail",
    file,
    remark: uploadTarget.value === "cover" ? "商品封面上传自动入库" : "商品详情图上传自动入库"
  });
  chooseMaterial(asset);
}

function addDetailUrl() {
  const url = detailUrlDraft.value.trim();
  if (!url) return;
  if (!isProductImageType("", url)) {
    ElMessage.error("详情图仅支持 JPG/PNG/WebP");
    return;
  }
  form.detailImages.push({ url, materialId: null, alt: null });
  detailUrlDraft.value = "";
}

function removeDetailImage(index: number) {
  form.detailImages.splice(index, 1);
}

function validateProductFile(file: File) {
  if (!isProductImageType(file.type, file.name)) {
    ElMessage.error("格式不支持，请上传 JPG/PNG/WebP 图片");
    return false;
  }
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.error("文件过大，商品图片单张不超过 2MB");
    return false;
  }
  return true;
}

function isProductImageType(fileType: string, url: string) {
  return ["image/jpeg", "image/png", "image/webp"].includes(fileType) || /\.(jpe?g|png|webp)(\?|$)/i.test(url);
}

async function validateProductImages(coverUrl: string, detailUrls: string[]) {
  const urls = [coverUrl, ...detailUrls].filter(Boolean);
  for (const url of urls) {
    if (!isProductImageType("", url)) throw new Error("商品图片仅支持 JPG/PNG/WebP");
    const ok = await checkImageReachable(url);
    if (!ok) throw new Error(`图片无法访问或已失效：${url}`);
  }
}

function checkImageReachable(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(false), 5000);
    image.onload = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    image.src = url;
  });
}
</script>

<style scoped>
.product-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.product-text {
  min-width: 0;
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}

.field-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.field-row .el-input {
  flex: 1;
}

.form-help {
  margin: 6px 0 0;
  color: var(--admin-color-muted);
  font-size: 12px;
  line-height: 1.5;
}

.large-preview {
  width: 96px;
  height: 96px;
  border-radius: 8px;
  object-fit: cover;
  background: #f3f6fb;
}

.detail-image-list,
.material-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.detail-image-item,
.material-card {
  padding: 8px;
  border: 1px solid var(--admin-color-border);
  border-radius: 8px;
  background: #fff;
}

.detail-image-item img,
.material-card img {
  width: 100%;
  height: 96px;
  border-radius: 6px;
  object-fit: cover;
  background: #f3f6fb;
}

.detail-image-item span,
.material-card strong {
  display: block;
  margin-top: 6px;
  color: var(--admin-color-muted);
  font-size: 12px;
}

.hidden-file {
  display: none;
}
</style>
