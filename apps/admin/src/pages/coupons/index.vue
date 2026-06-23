<template>
  <section class="admin-page">
    <AdminPageHeader
      v-if="!embedded"
      title="优惠券"
      eyebrow="营销活动"
      subtitle="配置固定金额或折扣券；订单创建时后端会重新计算优惠，前端金额仅用于展示。"
    >
      <AdminFeatureBadge label="后端计价已接入" description="优惠券参与 quote 和 create order；最终金额以后端重新计算和订单快照为准。" tone="success" />
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
        <el-table-column label="适用业务" width="130"><template #default="{ row }">{{ scopeText(row.scope) }}</template></el-table-column>
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column label="优惠" width="120"><template #default="{ row }">{{ discountText(row) }}</template></el-table-column>
        <el-table-column label="门槛" width="160"><template #default="{ row }">{{ thresholdText(row.minAmountCent, row.minQuantity) }}</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.enabled" /></template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openEdit(row)">编辑</el-button></template></el-table-column>
        <template #empty>
          <AdminEmptyState title="暂无优惠券" description="可创建优惠码、领取限制和适用范围；没有配置时订单按原价或会员价计算。" action-text="新增优惠券" @action="openCreate" />
        </template>
      </el-table>
    </section>
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑优惠券' : '新增优惠券'" width="680px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="券码"><el-input v-model="form.code" placeholder="留空后端自动生成" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="适用业务">
          <el-radio-group v-model="form.scope">
            <el-radio-button label="CONFERENCE">会议券</el-radio-button>
            <el-radio-button label="MALL">商品券</el-radio-button>
            <el-radio-button label="BOTH">通用券</el-radio-button>
          </el-radio-group>
          <p class="field-tip">商品购买只能使用商品券或通用券；会议报名只能使用会议券或通用券。</p>
        </el-form-item>
        <el-form-item label="类型"><el-select v-model="form.type"><el-option label="固定金额" value="AMOUNT" /><el-option label="百分比" value="PERCENT" /></el-select></el-form-item>
        <el-form-item v-if="form.type === 'AMOUNT'" label="优惠金额(元)"><el-input-number v-model="form.discountAmountYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item v-else label="折扣比例"><el-input-number v-model="form.discountPercent" :min="1" :max="10000" /><span class="muted-text">基点：8500 表示 85%</span></el-form-item>
        <el-form-item label="最多优惠(元)"><el-input-number v-model="form.maxDiscountYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="最低金额(元)"><el-input-number v-model="form.minAmountYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="最低张数"><el-input-number v-model="form.minQuantity" :min="0" /></el-form-item>
        <el-form-item label="总次数"><el-input-number v-model="form.totalLimit" :min="0" /></el-form-item>
        <el-form-item label="每人次数"><el-input-number v-model="form.perUserLimit" :min="0" /></el-form-item>
        <el-form-item label="适用 SKU ID"><el-input v-model="form.allowedSkuIdsText" placeholder="多个票种/商品 SKU ID 用英文逗号分隔，留空表示不限" /></el-form-item>
        <el-form-item label="开始时间"><el-date-picker v-model="form.startAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" style="width: 100%" /></el-form-item>
        <el-form-item label="结束时间"><el-date-picker v-model="form.endAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" style="width: 100%" /></el-form-item>
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
  scope: "CONFERENCE" as Coupon["scope"],
  discountAmountYuan: 0,
  discountPercent: 8500,
  maxDiscountYuan: 0,
  minAmountYuan: 0,
  minQuantity: 0,
  totalLimit: 0,
  perUserLimit: 0,
  allowedSkuIdsText: "",
  startAt: "",
  endAt: "",
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
  Object.assign(form, { id: "", code: "", name: "", type: "AMOUNT", scope: props.conferenceId ? "CONFERENCE" : "CONFERENCE", discountAmountYuan: 0, discountPercent: 8500, maxDiscountYuan: 0, minAmountYuan: 0, minQuantity: 0, totalLimit: 0, perUserLimit: 0, allowedSkuIdsText: "", startAt: "", endAt: "", enabled: true, stackableWithPromotion: false });
  dialogVisible.value = true;
}

function openEdit(row: Coupon) {
  Object.assign(form, {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    scope: row.scope,
    discountAmountYuan: (row.discountAmountCent ?? 0) / 100,
    discountPercent: row.discountPercent ?? 8500,
    maxDiscountYuan: (row.maxDiscountCent ?? 0) / 100,
    minAmountYuan: (row.minAmountCent ?? 0) / 100,
    minQuantity: row.minQuantity ?? 0,
    totalLimit: row.totalLimit ?? 0,
    perUserLimit: row.perUserLimit ?? 0,
    allowedSkuIdsText: row.allowedSkuIds.join(","),
    startAt: row.startAt ?? "",
    endAt: row.endAt ?? "",
    enabled: row.enabled,
    stackableWithPromotion: row.stackableWithPromotion
  });
  dialogVisible.value = true;
}

async function save() {
  const payload = {
    ...(form.code.trim() ? { code: form.code.trim() } : {}),
    name: form.name,
    type: form.type,
    scope: form.scope,
    discountAmountCent: form.type === "AMOUNT" ? yuanToCent(form.discountAmountYuan) : null,
    discountPercent: form.type === "PERCENT" ? form.discountPercent : null,
    maxDiscountCent: form.maxDiscountYuan > 0 ? yuanToCent(form.maxDiscountYuan) : null,
    minAmountCent: form.minAmountYuan > 0 ? yuanToCent(form.minAmountYuan) : null,
    minQuantity: form.minQuantity > 0 ? form.minQuantity : null,
    totalLimit: form.totalLimit > 0 ? form.totalLimit : null,
    perUserLimit: form.perUserLimit > 0 ? form.perUserLimit : null,
    allowedSkuIds: form.allowedSkuIdsText.split(",").map((item) => item.trim()).filter(Boolean),
    startAt: form.startAt || null,
    endAt: form.endAt || null,
    enabled: form.enabled,
    stackableWithPromotion: form.stackableWithPromotion,
    conferenceId: form.scope === "MALL" ? null : props.conferenceId ?? null
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

function scopeText(scope: Coupon["scope"]) {
  if (scope === "MALL") return "商品优惠券";
  if (scope === "BOTH") return "通用券";
  return "会议优惠券";
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

<style scoped>
.field-tip {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}
</style>
