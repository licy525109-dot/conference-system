<template>
  <section class="admin-page">
    <AdminPageHeader
      title="商品管理"
      eyebrow="商城"
      subtitle="维护商城商品、封面、详情图和上架状态。商城真实支付暂未开放，用户创建的是待支付订单，不会伪造支付成功。"
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
        <el-form-item>
          <template #label>封面 URL<MaterialSpecHelp spec-key="productCover" /></template>
          <el-input v-model="form.coverImageUrl" placeholder="建议 800×800 或 750×750，JPG/PNG/WebP，单张不超过 2MB" />
        </el-form-item>
        <el-form-item>
          <template #label>详情图 URL<MaterialSpecHelp spec-key="productDetail" /></template>
          <el-input v-model="form.detailImageUrlsText" type="textarea" :rows="4" placeholder="每行一张详情图 URL，建议宽度 750px，单张不超过 2MB" />
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
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import MaterialSpecHelp from "../../components/MaterialSpecHelp.vue";
import { createProduct, createProductSku, listProductCategories, listProducts, updateProduct } from "../../services/admin";
import type { Product, ProductCategory, ProductSku } from "../../services/types";
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
const form = reactive({ id: "", title: "", subtitle: "", categoryId: "", coverImageUrl: "", detailImageUrlsText: "", status: "DRAFT", sortOrder: 0 });
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
  Object.assign(form, { id: "", title: "", subtitle: "", categoryId: "", coverImageUrl: "", detailImageUrlsText: "", status: "DRAFT", sortOrder: 0 });
  productVisible.value = true;
}

function openEdit(row: Product) {
  Object.assign(form, {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? "",
    categoryId: row.categoryId ?? "",
    coverImageUrl: row.coverImageUrl ?? "",
    detailImageUrlsText: (row.detailImageUrls ?? []).join("\n"),
    status: row.status,
    sortOrder: row.sortOrder
  });
  productVisible.value = true;
}

function openSku(productId: string) {
  Object.assign(skuForm, { productId, name: "", priceYuan: 0, stock: 0, status: "ACTIVE" });
  skuVisible.value = true;
}

async function saveProduct() {
  const payload = {
    title: form.title,
    subtitle: form.subtitle || null,
    categoryId: form.categoryId || null,
    coverImageUrl: form.coverImageUrl || null,
    detailImageUrls: form.detailImageUrlsText.split(/\n|,/).map((item) => item.trim()).filter(Boolean),
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
</style>
