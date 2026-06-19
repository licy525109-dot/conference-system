<template>
  <section class="admin-page">
    <AdminPageHeader :title="pageMeta.title" eyebrow="商城" :subtitle="pageMeta.subtitle">
      <template #actions>
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button v-if="mode === 'categories'" type="primary" @click="openCategory()">新增分类</el-button>
        <el-button v-if="mode === 'skus'" type="primary" @click="openSku()">新增 SKU</el-button>
        <el-button v-if="mode === 'fulfillment'" type="primary" @click="openShipment()">创建发货</el-button>
        <el-button v-if="mode === 'aftersales'" type="primary" @click="openAfterSale()">创建售后</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <template v-if="mode === 'categories'">
        <el-input v-model="keyword" clearable placeholder="分类名称 / 编码" style="width: 220px" @keyup.enter="load" />
        <el-select v-model="enabledFilter" clearable placeholder="启用状态" style="width: 140px">
          <el-option label="启用" value="true" />
          <el-option label="停用" value="false" />
        </el-select>
      </template>
      <template v-else-if="mode === 'skus'">
        <el-input v-model="keyword" clearable placeholder="商品 / SKU 名称" style="width: 220px" @keyup.enter="load" />
        <el-select v-model="productId" clearable filterable placeholder="商品" style="width: 220px">
          <el-option v-for="item in productOptions" :key="item.id" :label="item.title" :value="item.id" />
        </el-select>
        <el-select v-model="skuStatus" clearable placeholder="SKU 状态" style="width: 140px">
          <el-option label="启用" value="ACTIVE" />
          <el-option label="停用" value="INACTIVE" />
        </el-select>
      </template>
      <template v-else-if="mode === 'fulfillment'">
        <el-select v-model="shipmentStatus" clearable placeholder="发货状态" style="width: 160px">
          <el-option label="待处理" value="PENDING" />
          <el-option label="已发货" value="SHIPPED" />
          <el-option label="已完成" value="COMPLETED" />
          <el-option label="已取消" value="CANCELLED" />
        </el-select>
        <el-select v-model="orderId" clearable filterable placeholder="商城订单" style="width: 260px">
          <el-option v-for="item in orderOptions" :key="item.id" :label="`${item.orderNo} ${item.receiverName || ''}`" :value="item.id" />
        </el-select>
      </template>
      <template v-else>
        <el-select v-model="afterSaleStatus" clearable placeholder="售后状态" style="width: 160px">
          <el-option label="已申请" value="REQUESTED" />
          <el-option label="已同意" value="APPROVED" />
          <el-option label="处理中" value="PROCESSING" />
          <el-option label="已完成" value="COMPLETED" />
          <el-option label="已拒绝" value="REJECTED" />
          <el-option label="已取消" value="CANCELLED" />
        </el-select>
        <el-select v-model="orderId" clearable filterable placeholder="商城订单" style="width: 260px">
          <el-option v-for="item in orderOptions" :key="item.id" :label="`${item.orderNo} ${item.receiverName || ''}`" :value="item.id" />
        </el-select>
      </template>
      <template #actions>
        <el-button :loading="loading" type="primary" @click="load">查询</el-button>
      </template>
    </AdminFilterBar>

    <section v-if="mode === 'categories'" class="table-panel">
      <el-table v-loading="loading" :data="categories" empty-text="暂无商品分类">
        <el-table-column prop="name" label="分类名称" min-width="160" />
        <el-table-column prop="code" label="编码" width="160" />
        <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
        <el-table-column prop="sortOrder" label="排序" width="90" />
        <el-table-column label="启用" width="100">
          <template #default="{ row }">
            <el-switch v-model="row.enabled" @change="toggleCategory(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }"><el-button size="small" @click="openCategory(row)">编辑</el-button></template>
        </el-table-column>
      </el-table>
      <Pager v-model:page="page" v-model:page-size="pageSize" :total="total" @change="load" />
    </section>

    <section v-else-if="mode === 'skus'" class="table-panel">
      <el-table v-loading="loading" :data="skus" empty-text="暂无 SKU">
        <el-table-column prop="productTitle" label="商品" min-width="180" />
        <el-table-column prop="name" label="SKU" min-width="160" />
        <el-table-column label="价格" width="110"><template #default="{ row }">¥{{ formatCent(row.priceCent) }}</template></el-table-column>
        <el-table-column prop="stock" label="总库存" width="90" />
        <el-table-column prop="lockedStock" label="锁定" width="90" />
        <el-table-column prop="soldCount" label="已售" width="90" />
        <el-table-column prop="availableStock" label="可售" width="90" />
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="skuStatusText(row.status)" /></template></el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openSku(row)">编辑</el-button>
            <el-button size="small" @click="showInventoryLogs(row)">库存流水</el-button>
          </template>
        </el-table-column>
      </el-table>
      <Pager v-model:page="page" v-model:page-size="pageSize" :total="total" @change="load" />

      <el-divider v-if="inventoryLogs.length">库存流水</el-divider>
      <el-table v-if="inventoryLogs.length" :data="inventoryLogs" size="small">
        <el-table-column prop="createdAt" label="时间" width="180" />
        <el-table-column prop="action" label="动作" width="160" />
        <el-table-column prop="quantity" label="数量" width="90" />
        <el-table-column label="锁定库存" width="150"><template #default="{ row }">{{ row.beforeLockedStock }} -> {{ row.afterLockedStock }}</template></el-table-column>
        <el-table-column label="已售" width="130"><template #default="{ row }">{{ row.beforeSoldCount }} -> {{ row.afterSoldCount }}</template></el-table-column>
        <el-table-column prop="orderNo" label="订单" width="180" />
        <el-table-column prop="remark" label="说明" min-width="220" show-overflow-tooltip />
      </el-table>
    </section>

    <section v-else-if="mode === 'fulfillment'" class="table-panel">
      <el-table v-loading="loading" :data="shipments" empty-text="暂无发货记录">
        <el-table-column prop="orderNo" label="订单号" min-width="180" />
        <el-table-column prop="receiverName" label="收件人" width="120" />
        <el-table-column label="物流 / 核销" min-width="220">
          <template #default="{ row }">
            <div>{{ row.company || "到店核销" }} {{ row.trackingNo || row.pickupCode || "" }}</div>
            <div class="muted-text">{{ row.remark || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="shipmentStatusText(row.status)" /></template></el-table-column>
        <el-table-column prop="shippedAt" label="发货时间" width="180" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openShipment(row)">编辑</el-button>
            <el-button v-if="row.status === 'SHIPPED'" size="small" type="primary" @click="completeShipment(row.id)">完成核销</el-button>
          </template>
        </el-table-column>
      </el-table>
      <Pager v-model:page="page" v-model:page-size="pageSize" :total="total" @change="load" />
    </section>

    <section v-else class="table-panel">
      <el-table v-loading="loading" :data="afterSales" empty-text="暂无售后记录">
        <el-table-column prop="orderNo" label="订单号" min-width="180" />
        <el-table-column label="类型" width="120"><template #default="{ row }">{{ afterSaleTypeText(row.type) }}</template></el-table-column>
        <el-table-column label="状态" width="120"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="afterSaleStatusText(row.status)" /></template></el-table-column>
        <el-table-column label="退款" min-width="220">
          <template #default="{ row }">
            <div>{{ refundStatusText(latestRefund(row)?.status) }} / {{ providerText(latestRefund(row)?.provider) }}</div>
            <div class="muted-text">{{ latestRefund(row)?.refundNo || row.refundNotice || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="220" show-overflow-tooltip />
        <el-table-column prop="note" label="处理备注" min-width="220" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="申请时间" width="180" />
        <el-table-column label="操作" width="330" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'REQUESTED'" size="small" type="primary" @click="moveAfterSale(row.id, 'APPROVED')">同意</el-button>
            <el-button v-if="row.status === 'REQUESTED'" size="small" @click="moveAfterSale(row.id, 'REJECTED')">拒绝</el-button>
            <el-button v-if="['APPROVED', 'PROCESSING'].includes(row.status)" size="small" type="warning" @click="processRefund(row)">处理退款</el-button>
            <el-button v-if="row.status === 'PROCESSING' && latestRefund(row)?.status !== 'PROCESSING'" size="small" type="success" @click="moveAfterSale(row.id, 'COMPLETED')">完成</el-button>
          </template>
        </el-table-column>
      </el-table>
      <Pager v-model:page="page" v-model:page-size="pageSize" :total="total" @change="load" />
    </section>

    <el-dialog v-model="categoryVisible" :title="categoryForm.id ? '编辑商品分类' : '新增商品分类'" width="520px">
      <el-form :model="categoryForm" label-width="100px">
        <el-form-item label="名称"><el-input v-model="categoryForm.name" /></el-form-item>
        <el-form-item label="编码"><el-input v-model="categoryForm.code" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="categoryForm.description" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="categoryForm.enabled" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="categoryForm.sortOrder" :min="0" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="categoryVisible = false">取消</el-button><el-button type="primary" @click="saveCategory">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="skuVisible" :title="skuForm.id ? '编辑 SKU' : '新增 SKU'" width="560px">
      <el-form :model="skuForm" label-width="120px">
        <el-form-item label="商品">
          <el-select v-model="skuForm.productId" filterable placeholder="选择商品">
            <el-option v-for="item in productOptions" :key="item.id" :label="item.title" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="SKU 名称"><el-input v-model="skuForm.name" /></el-form-item>
        <el-form-item label="价格(元)"><el-input-number v-model="skuForm.priceYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="库存"><el-input-number v-model="skuForm.stock" :min="0" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="skuForm.status">
            <el-option label="启用" value="ACTIVE" />
            <el-option label="停用" value="INACTIVE" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="skuVisible = false">取消</el-button><el-button type="primary" @click="saveSku">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="shipmentVisible" :title="shipmentForm.id ? '编辑发货记录' : '创建发货记录'" width="620px">
      <el-alert type="info" :closable="false" show-icon title="仅已支付商城订单可发货；当前不会因为商城待支付订单而伪造支付成功。" />
      <el-form :model="shipmentForm" label-width="120px" class="dialog-form">
        <el-form-item label="订单">
          <el-select v-model="shipmentForm.orderId" filterable placeholder="选择商城订单">
            <el-option v-for="item in shippableOrderOptions" :key="item.id" :label="`${item.orderNo} ${item.receiverName || ''}`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="物流公司"><el-input v-model="shipmentForm.company" placeholder="到店核销可为空" /></el-form-item>
        <el-form-item label="物流单号"><el-input v-model="shipmentForm.trackingNo" /></el-form-item>
        <el-form-item label="核销码"><el-input v-model="shipmentForm.pickupCode" placeholder="到店核销时填写" /></el-form-item>
        <el-form-item label="状态" v-if="shipmentForm.id">
          <el-select v-model="shipmentForm.status">
            <el-option label="已发货" value="SHIPPED" />
            <el-option label="已完成" value="COMPLETED" />
            <el-option label="已取消" value="CANCELLED" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="shipmentForm.remark" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="shipmentVisible = false">取消</el-button><el-button type="primary" @click="saveShipment">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="afterSaleVisible" title="创建售后记录" width="560px">
      <el-alert type="warning" :closable="false" show-icon title="退款由 MallRefund 独立记录；微信退款未配置时只进入处理中，不会伪造成功。" />
      <el-form :model="afterSaleForm" label-width="110px" class="dialog-form">
        <el-form-item label="订单">
          <el-select v-model="afterSaleForm.orderId" filterable placeholder="选择商城订单">
            <el-option v-for="item in orderOptions" :key="item.id" :label="`${item.orderNo} ${item.receiverName || ''}`" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="afterSaleForm.type">
            <el-option label="退款" value="REFUND" />
            <el-option label="退货退款" value="RETURN_REFUND" />
            <el-option label="换货" value="EXCHANGE" />
          </el-select>
        </el-form-item>
        <el-form-item label="原因"><el-input v-model="afterSaleForm.reason" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="afterSaleForm.note" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="afterSaleVisible = false">取消</el-button><el-button type="primary" @click="saveAfterSale">保存</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElPagination } from "element-plus";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { currentRoute, routeQuery } from "../../router";
import {
  createMallAfterSale,
  createMallShipment,
  createProductCategory,
  createProductSkuFromBody,
  getMallOrderOptions,
  getProductOptions,
  listMallAfterSales,
  listMallInventoryLogs,
  listMallShipments,
  listProductCategories,
  listProductSkus,
  processMallAfterSaleRefund,
  updateMallAfterSale,
  updateMallShipment,
  updateProductCategory,
  updateProductSku
} from "../../services/admin";
import type { MallAfterSale, MallInventoryLog, MallOrder, MallShipment, Product, ProductCategory, ProductSku } from "../../services/types";

type MallMode = "categories" | "skus" | "fulfillment" | "aftersales";

const Pager = defineComponent({
  props: { page: { type: Number, required: true }, pageSize: { type: Number, required: true }, total: { type: Number, required: true } },
  emits: ["update:page", "update:pageSize", "change"],
  setup(props, { emit }) {
    return () =>
      h("div", { class: "pagination-row" }, [
        h(ElPagination, {
          currentPage: props.page,
          pageSize: props.pageSize,
          total: props.total,
          pageSizes: [10, 20, 50, 100],
          layout: "total, sizes, prev, pager, next",
          "onUpdate:currentPage": (value: number) => emit("update:page", value),
          "onUpdate:pageSize": (value: number) => emit("update:pageSize", value),
          onCurrentChange: () => emit("change"),
          onSizeChange: () => emit("change")
        })
      ]);
  }
});

const mode = computed<MallMode>(() => {
  if (currentRoute.value.path === "/mall/skus") return "skus";
  if (currentRoute.value.path === "/mall/fulfillment") return "fulfillment";
  if (currentRoute.value.path === "/mall/aftersales") return "aftersales";
  return "categories";
});

const pageMeta = computed(() => {
  const map = {
    categories: { title: "商品分类", subtitle: "维护商城商品分类、启停和排序，用户端只展示已启用分类。" },
    skus: { title: "SKU 库存", subtitle: "维护 SKU 价格、总库存、锁定库存和可售库存；待支付订单会锁定库存。" },
    fulfillment: { title: "发货核销", subtitle: "处理已支付商城订单的发货和到店核销；支付成功后才能发货。" },
    aftersales: { title: "商城售后", subtitle: "处理商城售后申请、退款请求和退款结果；未配置微信退款时不会伪造成功。" }
  } satisfies Record<MallMode, { title: string; subtitle: string }>;
  return map[mode.value];
});

const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const keyword = ref("");
const enabledFilter = ref("");
const productId = ref("");
const skuStatus = ref("");
const shipmentStatus = ref("");
const afterSaleStatus = ref("");
const orderId = ref("");

const categories = ref<ProductCategory[]>([]);
const skus = ref<ProductSku[]>([]);
const shipments = ref<MallShipment[]>([]);
const afterSales = ref<MallAfterSale[]>([]);
const inventoryLogs = ref<MallInventoryLog[]>([]);
const productOptions = ref<Product[]>([]);
const orderOptions = ref<MallOrder[]>([]);
const shippableOrderOptions = computed(() => orderOptions.value.filter((item) => item.fulfillmentType === "SHIPMENT"));

const categoryVisible = ref(false);
const skuVisible = ref(false);
const shipmentVisible = ref(false);
const afterSaleVisible = ref(false);

const categoryForm = reactive({ id: "", name: "", code: "", description: "", enabled: true, sortOrder: 0 });
const skuForm = reactive({ id: "", productId: "", name: "", priceYuan: 0, stock: 0, status: "ACTIVE" });
const shipmentForm = reactive({ id: "", orderId: "", company: "", trackingNo: "", pickupCode: "", remark: "", status: "SHIPPED" });
const afterSaleForm = reactive({ orderId: "", type: "REFUND", reason: "", note: "" });

onMounted(async () => {
  await loadOptions();
  syncRouteQuery();
  await load();
});

watch(mode, async () => {
  resetPaging();
  syncRouteQuery();
  inventoryLogs.value = [];
  await loadOptions();
  await load();
});

function syncRouteQuery() {
  if (mode.value === "skus" && routeQuery.value.productId) productId.value = routeQuery.value.productId;
}

async function loadOptions() {
  if (mode.value === "skus") productOptions.value = (await getProductOptions()).items;
  if (mode.value === "fulfillment" || mode.value === "aftersales") orderOptions.value = (await getMallOrderOptions()).items;
}

async function load() {
  loading.value = true;
  try {
    if (mode.value === "categories") {
      const result = await listProductCategories({ page: page.value, pageSize: pageSize.value, keyword: keyword.value, enabled: enabledFilter.value ? enabledFilter.value === "true" : undefined });
      categories.value = result.items;
      total.value = result.total;
    } else if (mode.value === "skus") {
      const result = await listProductSkus({ page: page.value, pageSize: pageSize.value, keyword: keyword.value, productId: productId.value, status: skuStatus.value });
      skus.value = result.items;
      total.value = result.total;
    } else if (mode.value === "fulfillment") {
      const result = await listMallShipments({ page: page.value, pageSize: pageSize.value, status: shipmentStatus.value, orderId: orderId.value });
      shipments.value = result.items;
      total.value = result.total;
    } else {
      const result = await listMallAfterSales({ page: page.value, pageSize: pageSize.value, status: afterSaleStatus.value, orderId: orderId.value });
      afterSales.value = result.items;
      total.value = result.total;
    }
  } finally {
    loading.value = false;
  }
}

function resetPaging() {
  page.value = 1;
  pageSize.value = 20;
  total.value = 0;
  keyword.value = "";
  enabledFilter.value = "";
  productId.value = "";
  skuStatus.value = "";
  shipmentStatus.value = "";
  afterSaleStatus.value = "";
  orderId.value = "";
}

function openCategory(row?: ProductCategory) {
  Object.assign(categoryForm, row ? { id: row.id, name: row.name, code: row.code, description: row.description ?? "", enabled: row.enabled, sortOrder: row.sortOrder } : { id: "", name: "", code: "", description: "", enabled: true, sortOrder: 0 });
  categoryVisible.value = true;
}

async function saveCategory() {
  const payload = { name: categoryForm.name, code: categoryForm.code, description: categoryForm.description || null, enabled: categoryForm.enabled, sortOrder: categoryForm.sortOrder };
  if (categoryForm.id) await updateProductCategory(categoryForm.id, payload);
  else await createProductCategory(payload);
  categoryVisible.value = false;
  await load();
  ElMessage.success("商品分类已保存");
}

async function toggleCategory(row: ProductCategory) {
  await updateProductCategory(row.id, { enabled: row.enabled });
  ElMessage.success(row.enabled ? "分类已启用" : "分类已停用");
}

function openSku(row?: ProductSku) {
  Object.assign(skuForm, row ? { id: row.id, productId: row.productId, name: row.name, priceYuan: row.priceCent / 100, stock: row.stock, status: row.status } : { id: "", productId: productId.value, name: "", priceYuan: 0, stock: 0, status: "ACTIVE" });
  skuVisible.value = true;
}

async function saveSku() {
  const payload = { productId: skuForm.productId, name: skuForm.name, priceCent: Math.round(skuForm.priceYuan * 100), stock: skuForm.stock, status: skuForm.status };
  if (skuForm.id) await updateProductSku(skuForm.id, payload);
  else await createProductSkuFromBody(payload);
  skuVisible.value = false;
  await load();
  ElMessage.success("SKU 已保存");
}

async function showInventoryLogs(row: ProductSku) {
  const result = await listMallInventoryLogs({ skuId: row.id, page: 1, pageSize: 20 });
  inventoryLogs.value = result.items;
}

function openShipment(row?: MallShipment) {
  Object.assign(
    shipmentForm,
    row
      ? { id: row.id, orderId: row.orderId, company: row.company ?? "", trackingNo: row.trackingNo ?? "", pickupCode: row.pickupCode ?? "", remark: row.remark ?? "", status: row.status }
      : { id: "", orderId: orderId.value, company: "", trackingNo: "", pickupCode: "", remark: "", status: "SHIPPED" }
  );
  shipmentVisible.value = true;
}

async function saveShipment() {
  const selectedOrder = orderOptions.value.find((item) => item.id === shipmentForm.orderId);
  if (!shipmentForm.id && selectedOrder?.fulfillmentType !== "SHIPMENT") {
    ElMessage.warning("虚拟/服务商品不进入发货流程");
    return;
  }
  const payload = {
    orderId: shipmentForm.orderId,
    company: shipmentForm.company || null,
    trackingNo: shipmentForm.trackingNo || null,
    pickupCode: shipmentForm.pickupCode || null,
    remark: shipmentForm.remark || null,
    status: shipmentForm.status
  };
  if (shipmentForm.id) await updateMallShipment(shipmentForm.id, payload);
  else await createMallShipment(payload);
  shipmentVisible.value = false;
  await load();
  ElMessage.success("发货记录已保存");
}

async function completeShipment(id: string) {
  await updateMallShipment(id, { status: "COMPLETED" });
  await load();
  ElMessage.success("发货核销已完成");
}

function openAfterSale() {
  Object.assign(afterSaleForm, { orderId: orderId.value, type: "REFUND", reason: "", note: "" });
  afterSaleVisible.value = true;
}

async function saveAfterSale() {
  await createMallAfterSale({ ...afterSaleForm, reason: afterSaleForm.reason || null, note: afterSaleForm.note || null });
  afterSaleVisible.value = false;
  await load();
  ElMessage.success("售后记录已创建");
}

async function moveAfterSale(id: string, status: string) {
  await updateMallAfterSale(id, { status });
  await load();
  ElMessage.success("售后状态已更新");
}

async function processRefund(row: MallAfterSale) {
  await processMallAfterSaleRefund(row.id);
  await load();
  ElMessage.success("退款处理状态已更新");
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function skuStatusText(value: string) {
  return { ACTIVE: "启用", INACTIVE: "停用" }[value] ?? value;
}

function shipmentStatusText(value: string) {
  return { PENDING: "待处理", SHIPPED: "已发货", COMPLETED: "已完成", CANCELLED: "已取消" }[value] ?? value;
}

function afterSaleTypeText(value: string) {
  return { REFUND: "退款", RETURN_REFUND: "退货退款", EXCHANGE: "换货" }[value] ?? value;
}

function afterSaleStatusText(value: string) {
  return { REQUESTED: "已申请", APPROVED: "已同意", REJECTED: "已拒绝", PROCESSING: "处理中", COMPLETED: "已完成", CANCELLED: "已取消" }[value] ?? value;
}

function latestRefund(row: MallAfterSale) {
  return row.latestRefund || row.refunds?.[0] || null;
}

function refundStatusText(value?: string | null) {
  return value ? ({ REQUESTED: "已申请", APPROVED: "已同意", PROCESSING: "处理中", SUCCESS: "已退款", FAILED: "失败", REJECTED: "已拒绝" }[value] ?? value) : "无退款";
}

function providerText(value?: string | null) {
  return value ? ({ MOCK: "Mock 测试", WECHAT: "微信支付" }[value] ?? value) : "-";
}
</script>

<style scoped>
.pagination-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}

.dialog-form {
  margin-top: 16px;
}
</style>
