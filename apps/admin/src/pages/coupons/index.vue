<template>
  <section class="admin-page">
    <AdminPageHeader
      v-if="!embedded"
      title="优惠券"
      eyebrow="营销配置"
      badge="灰度能力"
      badge-tone="warning"
      subtitle="配置固定金额或折扣券；订单创建时后端会重新计算优惠，前端金额仅用于展示。"
    >
      <AdminFeatureBadge label="营销配置 / 灰度能力" description="不改变 quote、下单和支付金额计算逻辑。" tone="warning" />
      <template #actions>
        <el-button type="primary" @click="openCreate">新增优惠券</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-input v-model="keyword" clearable placeholder="券码 / 名称" style="width: 220px" @keyup.enter="load" />
      <template #actions>
        <el-button :loading="loading" type="primary" @click="load">查询</el-button>
        <el-button v-if="embedded" type="primary" @click="openCreate">新增优惠券</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table v-loading="loading" :data="items">
        <el-table-column prop="code" label="券码" width="140" />
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column label="优惠" width="120"><template #default="{ row }">{{ discountText(row) }}</template></el-table-column>
        <el-table-column label="门槛" width="160"><template #default="{ row }">{{ thresholdText(row.minAmountCent, row.minQuantity) }}</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.enabled" /></template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openEdit(row)">编辑</el-button></template></el-table-column>
        <template #empty>
          <AdminEmptyState title="暂无优惠券" description="优惠券为灰度营销能力，第一版会议报名可先不配置。" action-text="新增优惠券" @action="openCreate" />
        </template>
      </el-table>
    </section>
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑优惠券' : '新增优惠券'" width="680px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="券码"><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="类型"><el-select v-model="form.type"><el-option label="固定金额" value="AMOUNT" /><el-option label="百分比" value="PERCENT" /></el-select></el-form-item>
        <el-form-item v-if="form.type === 'AMOUNT'" label="优惠金额(元)"><el-input-number v-model="form.discountAmountYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item v-else label="折扣比例"><el-input-number v-model="form.discountPercent" :min="1" :max="10000" /><span class="muted-text">基点：8500 表示 85%</span></el-form-item>
        <el-form-item label="最多优惠(元)"><el-input-number v-model="form.maxDiscountYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="最低金额(元)"><el-input-number v-model="form.minAmountYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="最低张数"><el-input-number v-model="form.minQuantity" :min="0" /></el-form-item>
        <el-form-item label="总次数"><el-input-number v-model="form.totalLimit" :min="0" /></el-form-item>
        <el-form-item label="每人次数"><el-input-number v-model="form.perUserLimit" :min="0" /></el-form-item>
        <el-form-item label="可与满减叠加"><el-switch v-model="form.stackableWithPromotion" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import AdminEmptyState from "../../components/AdminEmptyState.vue";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { createCoupon, listCoupons, updateCoupon } from "../../services/admin";
import type { Coupon } from "../../services/types";

const props = defineProps<{ conferenceId?: string; embedded?: boolean }>();
const items = ref<Coupon[]>([]);
const keyword = ref("");
const loading = ref(false);
const dialogVisible = ref(false);
const form = reactive({
  id: "",
  code: "",
  name: "",
  type: "AMOUNT" as Coupon["type"],
  discountAmountYuan: 0,
  discountPercent: 8500,
  maxDiscountYuan: 0,
  minAmountYuan: 0,
  minQuantity: 0,
  totalLimit: 0,
  perUserLimit: 0,
  enabled: true,
  stackableWithPromotion: false
});

onMounted(() => void load());
watch(() => props.conferenceId, () => void load());

async function load() {
  loading.value = true;
  try {
    items.value = (await listCoupons({ page: 1, pageSize: 100, keyword: keyword.value, conferenceId: props.conferenceId })).items;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { id: "", code: "", name: "", type: "AMOUNT", discountAmountYuan: 0, discountPercent: 8500, maxDiscountYuan: 0, minAmountYuan: 0, minQuantity: 0, totalLimit: 0, perUserLimit: 0, enabled: true, stackableWithPromotion: false });
  dialogVisible.value = true;
}

function openEdit(row: Coupon) {
  Object.assign(form, {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    discountAmountYuan: (row.discountAmountCent ?? 0) / 100,
    discountPercent: row.discountPercent ?? 8500,
    maxDiscountYuan: (row.maxDiscountCent ?? 0) / 100,
    minAmountYuan: (row.minAmountCent ?? 0) / 100,
    minQuantity: row.minQuantity ?? 0,
    totalLimit: row.totalLimit ?? 0,
    perUserLimit: row.perUserLimit ?? 0,
    enabled: row.enabled,
    stackableWithPromotion: row.stackableWithPromotion
  });
  dialogVisible.value = true;
}

async function save() {
  const payload = {
    code: form.code,
    name: form.name,
    type: form.type,
    discountAmountCent: form.type === "AMOUNT" ? yuanToCent(form.discountAmountYuan) : null,
    discountPercent: form.type === "PERCENT" ? form.discountPercent : null,
    maxDiscountCent: form.maxDiscountYuan > 0 ? yuanToCent(form.maxDiscountYuan) : null,
    minAmountCent: form.minAmountYuan > 0 ? yuanToCent(form.minAmountYuan) : null,
    minQuantity: form.minQuantity > 0 ? form.minQuantity : null,
    totalLimit: form.totalLimit > 0 ? form.totalLimit : null,
    perUserLimit: form.perUserLimit > 0 ? form.perUserLimit : null,
    enabled: form.enabled,
    stackableWithPromotion: form.stackableWithPromotion,
    conferenceId: props.conferenceId ?? null
  };
  if (form.id) await updateCoupon(form.id, payload);
  else await createCoupon(payload);
  dialogVisible.value = false;
  await load();
  ElMessage.success("优惠券已保存");
}

function discountText(row: Coupon) {
  return row.type === "AMOUNT" ? `¥${formatCent(row.discountAmountCent ?? 0)}` : `${((row.discountPercent ?? 0) / 100).toFixed(2)}%`;
}

function thresholdText(minAmountCent: number | null, minQuantity: number | null) {
  const parts = [];
  if (minAmountCent) parts.push(`满 ¥${formatCent(minAmountCent)}`);
  if (minQuantity) parts.push(`满 ${minQuantity} 张`);
  return parts.length ? parts.join(" / ") : "无门槛";
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function yuanToCent(value: number) {
  return Math.round(value * 100);
}
</script>
