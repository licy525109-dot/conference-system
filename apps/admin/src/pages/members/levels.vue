<template>
  <section class="admin-page">
    <AdminPageHeader
      title="会员等级"
      eyebrow="扩展能力"
      badge="后续开放"
      badge-tone="neutral"
      subtitle="维护会员等级、价格和展示权益；会员能力后续才参与报名定价，第一版不改变会议订单金额。"
    >
      <AdminFeatureBadge label="扩展能力 / 后续参与报名定价" description="会员权益只做预留展示，不影响报名规格、quote 和订单金额。" tone="warning" />
      <template #actions>
        <el-button type="primary" @click="openCreate">新增等级</el-button>
      </template>
    </AdminPageHeader>

    <section class="table-panel">
      <el-table :data="levels" empty-text="暂无会员等级">
        <el-table-column prop="name" label="名称" min-width="140" />
        <el-table-column prop="code" label="编码" width="140" />
        <el-table-column prop="rank" label="等级序" width="100" />
        <el-table-column label="价格" width="120"><template #default="{ row }">¥{{ formatCent(row.priceCent) }}</template></el-table-column>
        <el-table-column label="折扣" width="120"><template #default="{ row }">{{ formatDiscount(row.discountPercent) }}</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.enabled" /></template></el-table-column>
        <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openEdit(row)">编辑</el-button></template></el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑会员等级' : '新增会员等级'" width="620px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="编码"><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="等级序"><el-input-number v-model="form.rank" :min="0" /></el-form-item>
        <el-form-item label="价格(元)"><el-input-number v-model="form.priceYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="折扣基点"><el-input-number v-model="form.discountPercent" :min="0" :max="10000" /><span class="muted-text">9000 表示 9 折，仅展示预留</span></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { createMemberLevel, listMemberLevels, updateMemberLevel } from "../../services/admin";
import type { MemberLevel } from "../../services/types";

const levels = ref<MemberLevel[]>([]);
const dialogVisible = ref(false);
const form = reactive({ id: "", code: "", name: "", description: "", rank: 0, priceYuan: 0, discountPercent: 0, enabled: true });

onMounted(() => void load());

async function load() {
  levels.value = (await listMemberLevels()).items;
}

function openCreate() {
  Object.assign(form, { id: "", code: "", name: "", description: "", rank: 0, priceYuan: 0, discountPercent: 0, enabled: true });
  dialogVisible.value = true;
}

function openEdit(row: MemberLevel) {
  Object.assign(form, {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    rank: row.rank,
    priceYuan: row.priceCent / 100,
    discountPercent: row.discountPercent ?? 0,
    enabled: row.enabled
  });
  dialogVisible.value = true;
}

async function save() {
  const payload = {
    code: form.code,
    name: form.name,
    description: form.description || null,
    rank: form.rank,
    priceCent: Math.round(form.priceYuan * 100),
    discountPercent: form.discountPercent > 0 ? form.discountPercent : null,
    enabled: form.enabled
  };
  if (form.id) await updateMemberLevel(form.id, payload);
  else await createMemberLevel(payload);
  dialogVisible.value = false;
  await load();
  ElMessage.success("会员等级已保存");
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function formatDiscount(value: number | null) {
  return value ? `${(value / 100).toFixed(2)}%` : "无";
}
</script>
