<template>
  <section class="admin-page">
    <AdminPageHeader
      title="商城商品"
      eyebrow="扩展能力"
      badge="灰度中"
      badge-tone="warning"
      subtitle="商城能力灰度中，商品支付和履约后续完善；商品与 SKU 独立于会议报名订单。"
    >
      <AdminFeatureBadge label="商城能力灰度中" description="当前不伪装成完整电商后台，商品支付和履约后续完善。" tone="warning" />
      <template #actions>
        <el-button @click="categoryVisible = true">新增分类</el-button>
        <el-button type="primary" @click="openCreate">新增商品</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-input v-model="keyword" clearable placeholder="商品标题" style="width: 240px" @keyup.enter="loadProducts" />
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
        <el-table-column label="商品" min-width="240">
          <template #default="{ row }">
            <div class="product-cell">
              <img v-if="row.coverImageUrl" class="image-preview" :src="row.coverImageUrl" alt="" />
              <div>
                <strong>{{ row.title }}</strong>
                <div class="muted-text">{{ row.subtitle || "-" }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="140"><template #default="{ row }">{{ row.category?.name || "-" }}</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="productStatusText(row.status)" /></template></el-table-column>
        <el-table-column label="规格" width="160">
          <template #default="{ row }">{{ row.skus.length }} 个</template>
        </el-table-column>
        <el-table-column label="操作" width="190">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" @click="openSku(row.id)">加规格</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="productVisible" :title="form.id ? '编辑商品' : '新增商品'" width="660px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="副标题"><el-input v-model="form.subtitle" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.categoryId" clearable>
            <el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="封面 URL"><el-input v-model="form.coverImageUrl" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="上架" value="PUBLISHED" />
            <el-option label="下架" value="OFFLINE" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="productVisible = false">取消</el-button><el-button type="primary" @click="saveProduct">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="skuVisible" title="新增商品规格" width="520px">
      <el-form :model="skuForm" label-width="110px">
        <el-form-item label="名称"><el-input v-model="skuForm.name" /></el-form-item>
        <el-form-item label="价格(元)"><el-input-number v-model="skuForm.priceYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="库存"><el-input-number v-model="skuForm.stock" :min="0" /></el-form-item>
        <el-form-item label="状态"><el-select v-model="skuForm.status"><el-option label="启用" value="ACTIVE" /><el-option label="停用" value="INACTIVE" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="skuVisible = false">取消</el-button><el-button type="primary" @click="saveSku">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="categoryVisible" title="新增商品分类" width="520px">
      <el-form :model="categoryForm" label-width="100px">
        <el-form-item label="名称"><el-input v-model="categoryForm.name" /></el-form-item>
        <el-form-item label="编码"><el-input v-model="categoryForm.code" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="categoryForm.description" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="categoryVisible = false">取消</el-button><el-button type="primary" @click="saveCategory">保存</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { createProduct, createProductCategory, createProductSku, listProductCategories, listProducts, updateProduct } from "../../services/admin";
import type { Product, ProductCategory } from "../../services/types";

const categories = ref<ProductCategory[]>([]);
const products = ref<Product[]>([]);
const keyword = ref("");
const status = ref("");
const loading = ref(false);
const productVisible = ref(false);
const skuVisible = ref(false);
const categoryVisible = ref(false);
const form = reactive({ id: "", title: "", subtitle: "", categoryId: "", coverImageUrl: "", status: "DRAFT", sortOrder: 0 });
const skuForm = reactive({ productId: "", name: "", priceYuan: 0, stock: 0, status: "ACTIVE" });
const categoryForm = reactive({ name: "", code: "", description: "" });

onMounted(async () => {
  await Promise.all([loadCategories(), loadProducts()]);
});

async function loadCategories() {
  categories.value = (await listProductCategories()).items;
}

async function loadProducts() {
  loading.value = true;
  try {
    products.value = (await listProducts({ page: 1, pageSize: 100, keyword: keyword.value, status: status.value })).items;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { id: "", title: "", subtitle: "", categoryId: "", coverImageUrl: "", status: "DRAFT", sortOrder: 0 });
  productVisible.value = true;
}

function openEdit(row: Product) {
  Object.assign(form, {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? "",
    categoryId: row.categoryId ?? "",
    coverImageUrl: row.coverImageUrl ?? "",
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

async function saveCategory() {
  await createProductCategory(categoryForm);
  Object.assign(categoryForm, { name: "", code: "", description: "" });
  categoryVisible.value = false;
  await loadCategories();
  ElMessage.success("商品分类已保存");
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
</style>
