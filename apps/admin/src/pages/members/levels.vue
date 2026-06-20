<template>
  <section class="admin-page">
    <AdminPageHeader
      title="会员等级"
      eyebrow="用户中心"
      subtitle="配置会员等级、默认有效期、会员价参与状态和等级权益。停用等级不会影响历史会员，但不能再新授予或命中新订单会员价。"
    >
      <AdminFeatureBadge label="已可运营" description="等级、权益数量、会员人数和会员价状态均来自真实数据。" tone="success" />
      <template #actions>
        <el-button type="primary" @click="openCreate">新增等级</el-button>
      </template>
    </AdminPageHeader>

    <section class="table-panel">
      <el-table :data="levels" empty-text="暂无会员等级">
        <el-table-column label="等级" min-width="180">
          <template #default="{ row }">
            <strong>{{ row.name }}</strong>
            <div class="muted-text">{{ row.code }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="rank" label="排序" width="90" />
        <el-table-column label="默认有效期" width="130">
          <template #default="{ row }">{{ row.defaultDays ? `${row.defaultDays} 天` : "长期" }}</template>
        </el-table-column>
        <el-table-column label="展示价格" width="120"><template #default="{ row }">¥{{ formatCent(row.priceCent) }}</template></el-table-column>
        <el-table-column label="展示折扣" width="120"><template #default="{ row }">{{ formatDiscount(row.discountPercent) }}</template></el-table-column>
        <el-table-column label="会员价" width="110"><template #default="{ row }"><AdminStatusBadge :status="row.pricingEnabled" :label="row.pricingEnabled ? '参与' : '不参与'" /></template></el-table-column>
        <el-table-column label="权益 / 会员" width="130"><template #default="{ row }">{{ row.benefitCount || 0 }} / {{ row.memberCount || 0 }}</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.enabled" :label="row.enabled ? '启用' : '停用'" /></template></el-table-column>
        <el-table-column prop="description" label="说明" min-width="220" show-overflow-tooltip />
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openEdit(row)">编辑</el-button></template></el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑会员等级' : '新增会员等级'" width="680px">
      <el-form :model="form" label-width="130px">
        <el-form-item>
          <template #label>等级名称<FieldHelp content="用户端和后台会员管理都会展示该名称。" /></template>
          <el-input v-model="form.name" placeholder="如 金牌会员" />
        </el-form-item>
        <el-form-item>
          <template #label>等级编码<FieldHelp content="用于运营识别，保存后仍可以编辑；建议使用英文、数字、下划线。" /></template>
          <el-input v-model="form.code" placeholder="gold" />
        </el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item>
          <template #label>等级排序<FieldHelp content="数值越小越靠前；会员价命中时会优先使用等级 rank 更高的有效会员。" /></template>
          <el-input-number v-model="form.rank" :min="0" />
        </el-form-item>
        <el-form-item>
          <template #label>默认有效期<FieldHelp content="后台授予或续期未填写有效天数时使用；为空表示长期有效。" /></template>
          <el-input-number v-model="form.defaultDays" :min="1" placeholder="长期有效可留空" />
        </el-form-item>
        <el-form-item label="展示价格(元)"><el-input-number v-model="form.priceYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item>
          <template #label>展示折扣<FieldHelp content="仅用于会员中心展示；实际报名会员价由会员价规则计算。" /></template>
          <el-input-number v-model="form.discountPercent" :min="0" :max="10000" />
          <span class="muted-text">9000 表示 9 折</span>
        </el-form-item>
        <el-form-item>
          <template #label>参与会员价<FieldHelp content="关闭后，该等级会员仍可存在，但不会命中新订单报名会员价。" /></template>
          <el-switch v-model="form.pricingEnabled" active-text="参与" inactive-text="不参与" />
        </el-form-item>
        <el-form-item>
          <template #label>启用状态<FieldHelp content="停用后不能新授予；已存在会员保留记录，但新订单会员价不会命中该等级。" /></template>
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>
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
import FieldHelp from "../../components/FieldHelp.vue";
import { createMemberLevel, listMemberLevels, updateMemberLevel } from "../../services/admin";
import type { MemberLevel } from "../../services/types";

const levels = ref<MemberLevel[]>([]);
const dialogVisible = ref(false);
const form = reactive({
  id: "",
  code: "",
  name: "",
  description: "",
  rank: 0,
  defaultDays: undefined as number | undefined,
  priceYuan: 0,
  discountPercent: 0,
  pricingEnabled: true,
  enabled: true
});

onMounted(() => void load());

async function load() {
  levels.value = (await listMemberLevels()).items;
}

function openCreate() {
  Object.assign(form, { id: "", code: "", name: "", description: "", rank: 0, defaultDays: undefined, priceYuan: 0, discountPercent: 0, pricingEnabled: true, enabled: true });
  dialogVisible.value = true;
}

function openEdit(row: MemberLevel) {
  Object.assign(form, {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    rank: row.rank,
    defaultDays: row.defaultDays ?? undefined,
    priceYuan: row.priceCent / 100,
    discountPercent: row.discountPercent ?? 0,
    pricingEnabled: row.pricingEnabled,
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
    defaultDays: form.defaultDays || null,
    priceCent: Math.round(form.priceYuan * 100),
    discountPercent: form.discountPercent > 0 ? form.discountPercent : null,
    pricingEnabled: form.pricingEnabled,
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
