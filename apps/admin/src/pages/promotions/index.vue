<template>
  <section class="admin-page">
    <AdminPageHeader
      v-if="!embedded"
      title="满减规则"
      eyebrow="营销活动"
      subtitle="配置满金额或满张数优惠；订单创建时由后端重新计算，不以后台展示值作为支付依据。"
    >
      <AdminFeatureBadge label="计价顺序" description="SKU 原价 -> 会员价 -> 优惠券 -> 满减 -> 最终应付；create order 会重新计算。" tone="success" />
      <template #actions>
        <el-button type="primary" @click="openCreate">新增满减</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-input v-model="keyword" clearable placeholder="规则名称" style="width: 220px" @keyup.enter="load" />
      <template #actions>
        <el-button :loading="loading" type="primary" @click="load">查询</el-button>
        <el-button v-if="embedded" type="primary" @click="openCreate">新增满减</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table v-loading="loading" :data="items">
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column label="门槛" width="170"><template #default="{ row }">{{ thresholdText(row.minAmountCent, row.minQuantity) }}</template></el-table-column>
        <el-table-column label="优惠" width="120"><template #default="{ row }">¥{{ formatCent(row.discountAmountCent) }}</template></el-table-column>
        <el-table-column label="可叠券" width="100"><template #default="{ row }">{{ row.stackableWithCoupon ? "是" : "否" }}</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.enabled" /></template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openEdit(row)">编辑</el-button></template></el-table-column>
        <template #empty>
          <AdminEmptyState title="暂无满减规则" description="可配置满金额或满张数优惠；没有规则时订单不应用满减。" action-text="新增满减" @action="openCreate" />
        </template>
      </el-table>
    </section>
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑满减' : '新增满减'" width="620px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="最低金额(元)"><el-input-number v-model="form.minAmountYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="最低张数"><el-input-number v-model="form.minQuantity" :min="0" /></el-form-item>
        <el-form-item label="优惠金额(元)"><el-input-number v-model="form.discountAmountYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="适用票种 ID"><el-input v-model="form.allowedSkuIdsText" placeholder="多个 ID 用英文逗号分隔，留空表示不限" /></el-form-item>
        <el-form-item label="开始时间"><el-date-picker v-model="form.startAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" style="width: 100%" /></el-form-item>
        <el-form-item label="结束时间"><el-date-picker v-model="form.endAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" style="width: 100%" /></el-form-item>
        <el-form-item label="可与券叠加"><el-switch v-model="form.stackableWithCoupon" /></el-form-item>
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
import { createPromotionRule, listPromotionRules, updatePromotionRule } from "../../services/admin";
import type { PromotionRule } from "../../services/types";

const props = defineProps<{ conferenceId?: string; embedded?: boolean }>();
const items = ref<PromotionRule[]>([]);
const keyword = ref("");
const loading = ref(false);
const dialogVisible = ref(false);
const form = reactive({
  id: "",
  name: "",
  minAmountYuan: 0,
  minQuantity: 0,
  discountAmountYuan: 0,
  allowedSkuIdsText: "",
  startAt: "",
  endAt: "",
  enabled: true,
  stackableWithCoupon: false
});

onMounted(() => void load());
watch(() => props.conferenceId, () => void load());

async function load() {
  loading.value = true;
  try {
    items.value = (await listPromotionRules({ page: 1, pageSize: 100, keyword: keyword.value, conferenceId: props.conferenceId })).items;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, { id: "", name: "", minAmountYuan: 0, minQuantity: 0, discountAmountYuan: 0, allowedSkuIdsText: "", startAt: "", endAt: "", enabled: true, stackableWithCoupon: false });
  dialogVisible.value = true;
}

function openEdit(row: PromotionRule) {
  Object.assign(form, {
    id: row.id,
    name: row.name,
    minAmountYuan: (row.minAmountCent ?? 0) / 100,
    minQuantity: row.minQuantity ?? 0,
    discountAmountYuan: row.discountAmountCent / 100,
    allowedSkuIdsText: row.allowedSkuIds.join(","),
    startAt: row.startAt ?? "",
    endAt: row.endAt ?? "",
    enabled: row.enabled,
    stackableWithCoupon: row.stackableWithCoupon
  });
  dialogVisible.value = true;
}

async function save() {
  const payload = {
    name: form.name,
    conferenceId: props.conferenceId ?? null,
    minAmountCent: form.minAmountYuan > 0 ? yuanToCent(form.minAmountYuan) : null,
    minQuantity: form.minQuantity > 0 ? form.minQuantity : null,
    discountAmountCent: yuanToCent(form.discountAmountYuan),
    allowedSkuIds: form.allowedSkuIdsText.split(",").map((item) => item.trim()).filter(Boolean),
    startAt: form.startAt || null,
    endAt: form.endAt || null,
    enabled: form.enabled,
    stackableWithCoupon: form.stackableWithCoupon
  };
  if (form.id) await updatePromotionRule(form.id, payload);
  else await createPromotionRule(payload);
  dialogVisible.value = false;
  await load();
  ElMessage.success("满减规则已保存");
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
