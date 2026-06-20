<template>
  <section class="admin-page">
    <AdminPageHeader
      title="会员权益"
      eyebrow="用户中心"
      subtitle="配置会员等级权益、用户端展示和自动发放规则；展示型权益不会自动生成领取记录。"
    >
      <AdminFeatureBadge label="发放可追踪" description="自动发放、撤销和发放记录均使用持久化表记录。" tone="success" />
      <template #actions>
        <el-button type="primary" @click="openCreate">新增权益</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-select v-model="levelId" clearable placeholder="会员等级" style="width: 220px" @change="load">
        <el-option v-for="item in levels" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <template #actions>
        <el-button :loading="loading" type="primary" @click="load">刷新</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table v-loading="loading" :data="benefits" empty-text="暂无会员权益">
        <el-table-column label="权益" min-width="220">
          <template #default="{ row }">
            <strong>{{ row.title }}</strong>
            <div class="muted-text">{{ row.description || "无说明" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="等级" width="150"><template #default="{ row }">{{ row.level?.name }}</template></el-table-column>
        <el-table-column label="类型" width="130"><template #default="{ row }">{{ typeText(row.type) }}</template></el-table-column>
        <el-table-column label="自动发放" width="110"><template #default="{ row }"><AdminStatusBadge :status="row.autoGrant" :label="row.autoGrant ? '自动' : '展示型'" /></template></el-table-column>
        <el-table-column label="用户端" width="110"><template #default="{ row }"><AdminStatusBadge :status="row.visible" :label="row.visible ? '展示' : '隐藏'" /></template></el-table-column>
        <el-table-column label="发放数" width="90"><template #default="{ row }">{{ row.grantCount || 0 }}</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.enabled" /></template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openEdit(row)">编辑</el-button></template></el-table-column>
      </el-table>
    </section>

    <AdminSectionCard title="权益发放记录" subtitle="授予、续期、调级时会自动为启用且自动发放的权益生成记录；同一会员记录下同一权益幂等发放。">
      <AdminFilterBar>
        <el-select v-model="grantStatus" clearable placeholder="发放状态" style="width: 160px">
          <el-option label="已发放" value="GRANTED" />
          <el-option label="已使用" value="USED" />
          <el-option label="已过期" value="EXPIRED" />
          <el-option label="已撤销" value="REVOKED" />
          <el-option label="失败" value="FAILED" />
        </el-select>
        <template #actions><el-button @click="loadGrants">查询记录</el-button></template>
      </AdminFilterBar>
      <el-table :data="grants" empty-text="暂无发放记录">
        <el-table-column label="用户" min-width="180"><template #default="{ row }">{{ userName(row.user) }}</template></el-table-column>
        <el-table-column label="权益" min-width="180"><template #default="{ row }">{{ row.benefit.title }}</template></el-table-column>
        <el-table-column label="等级" width="130"><template #default="{ row }">{{ row.benefit.level?.name || row.membership?.level.name }}</template></el-table-column>
        <el-table-column label="状态" width="110"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="grantStatusText(row.status)" /></template></el-table-column>
        <el-table-column prop="source" label="来源" width="130" />
        <el-table-column label="发放时间" width="170"><template #default="{ row }">{{ formatDate(row.grantedAt) }}</template></el-table-column>
        <el-table-column label="到期时间" width="170"><template #default="{ row }">{{ formatDate(row.expiredAt) }}</template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" :disabled="row.status !== 'GRANTED'" @click="revoke(row.id)">撤销</el-button></template></el-table-column>
      </el-table>
    </AdminSectionCard>

    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑会员权益' : '新增会员权益'" width="680px">
      <el-form :model="form" label-width="130px">
        <el-form-item>
          <template #label>会员等级<FieldHelp content="使用选择器绑定等级，保存时提交 levelId。" /></template>
          <el-select v-model="form.levelId" filterable placeholder="请选择会员等级">
            <el-option v-for="item in levels" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <template #label>权益类型<FieldHelp content="TEXT 为展示型说明；COUPON、ACCESS、SERVICE 等可用于后续自动化扩展。" /></template>
          <el-select v-model="form.type">
            <el-option v-for="item in benefitTypes" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="权益标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="权益说明"><el-input v-model="form.description" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="图标/图片 URL"><el-input v-model="form.iconUrl" placeholder="可选，建议使用素材库图片 URL" /></el-form-item>
        <el-form-item>
          <template #label>自动发放<FieldHelp content="开启后，授予/续期/调级会员时会生成权益发放记录；关闭时仅在用户端展示。" /></template>
          <el-switch v-model="form.autoGrant" active-text="自动发放" inactive-text="展示型权益" />
        </el-form-item>
        <el-form-item>
          <template #label>用户端展示<FieldHelp content="关闭后普通用户会员中心不会展示该权益。" /></template>
          <el-switch v-model="form.visible" active-text="展示" inactive-text="隐藏" />
        </el-form-item>
        <el-form-item>
          <template #label>发放规则<FieldHelp content="简短记录运营规则，如授予即发放、续期延长权益等。" /></template>
          <el-input v-model="form.grantRule" />
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!form.levelId || !form.title" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminSectionCard from "../../components/AdminSectionCard.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import FieldHelp from "../../components/FieldHelp.vue";
import { createMemberBenefit, listMemberBenefitGrants, listMemberBenefits, listMemberLevels, revokeMemberBenefitGrant, updateMemberBenefit } from "../../services/admin";
import type { AdminAppUser, MemberBenefit, MemberBenefitGrant, MemberLevel } from "../../services/types";

const benefitTypes = [
  { label: "文本说明", value: "TEXT" },
  { label: "折扣", value: "DISCOUNT" },
  { label: "优惠券", value: "COUPON" },
  { label: "准入权益", value: "ACCESS" },
  { label: "服务权益", value: "SERVICE" },
  { label: "企微客户群", value: "WE_COM_GROUP" },
  { label: "自定义", value: "CUSTOM" }
];
const levels = ref<MemberLevel[]>([]);
const benefits = ref<MemberBenefit[]>([]);
const grants = ref<MemberBenefitGrant[]>([]);
const levelId = ref("");
const grantStatus = ref("");
const loading = ref(false);
const dialogVisible = ref(false);
const form = reactive({ id: "", levelId: "", title: "", description: "", type: "TEXT", iconUrl: "", autoGrant: false, visible: true, grantRule: "", sortOrder: 0, enabled: true });

onMounted(async () => {
  levels.value = (await listMemberLevels()).items;
  await Promise.all([load(), loadGrants()]);
});

async function load() {
  loading.value = true;
  try {
    benefits.value = (await listMemberBenefits({ levelId: levelId.value })).items;
  } finally {
    loading.value = false;
  }
}

async function loadGrants() {
  grants.value = (await listMemberBenefitGrants({ page: 1, pageSize: 100, status: grantStatus.value })).items;
}

function openCreate() {
  Object.assign(form, { id: "", levelId: levelId.value || levels.value[0]?.id || "", title: "", description: "", type: "TEXT", iconUrl: "", autoGrant: false, visible: true, grantRule: "", sortOrder: 0, enabled: true });
  dialogVisible.value = true;
}

function openEdit(row: MemberBenefit) {
  Object.assign(form, {
    id: row.id,
    levelId: row.levelId,
    title: row.title,
    description: row.description || "",
    type: row.type,
    iconUrl: row.iconUrl || "",
    autoGrant: row.autoGrant,
    visible: row.visible,
    grantRule: row.grantRule || "",
    sortOrder: row.sortOrder,
    enabled: row.enabled
  });
  dialogVisible.value = true;
}

async function save() {
  const payload = {
    levelId: form.levelId,
    title: form.title,
    description: form.description || null,
    type: form.type,
    iconUrl: form.iconUrl || null,
    autoGrant: form.autoGrant,
    visible: form.visible,
    grantRule: form.grantRule || null,
    sortOrder: form.sortOrder,
    enabled: form.enabled
  };
  if (form.id) await updateMemberBenefit(form.id, payload);
  else await createMemberBenefit(payload);
  dialogVisible.value = false;
  await load();
  ElMessage.success("会员权益已保存");
}

async function revoke(id: string) {
  await revokeMemberBenefitGrant(id, "后台撤销权益");
  await loadGrants();
  ElMessage.success("权益发放记录已撤销");
}

function userName(user: AdminAppUser) {
  return user.nickname || user.wechatNickname || user.openid || user.id;
}

function typeText(value: string) {
  return benefitTypes.find((item) => item.value === value)?.label || value;
}

function grantStatusText(value: string) {
  return ({ GRANTED: "已发放", USED: "已使用", EXPIRED: "已过期", REVOKED: "已撤销", FAILED: "失败" } as Record<string, string>)[value] || value;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return value.slice(0, 10);
}
</script>
