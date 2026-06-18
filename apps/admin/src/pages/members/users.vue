<template>
  <section class="admin-page">
    <AdminPageHeader
      title="会员管理"
      eyebrow="会员"
      subtitle="按用户、等级、状态和到期时间管理会员；购买支付暂未开放，会员开通以后台授予、续期和调整为准。"
    >
      <AdminFeatureBadge label="已可运营" description="授予、续期、停用、调级和权益自动发放均写审计日志。" tone="success" />
      <AdminFeatureBadge label="购买支付未开放" description="本轮不接会员购买真实支付，也不创建会员支付订单。" tone="neutral" />
      <template #actions>
        <el-button type="primary" @click="openGrant">授予会员</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-input v-model="keyword" clearable placeholder="昵称 / 手机 / 等级" style="width: 240px" @keyup.enter="loadMemberships" />
      <el-select v-model="levelId" clearable placeholder="会员等级" style="width: 180px">
        <el-option v-for="item in levels" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <el-select v-model="status" clearable placeholder="会员状态" style="width: 150px">
        <el-option label="有效" value="ACTIVE" />
        <el-option label="已过期" value="EXPIRED" />
        <el-option label="已停用" value="DISABLED" />
        <el-option label="已取消" value="CANCELLED" />
      </el-select>
      <template #actions>
        <el-button :loading="loading" type="primary" @click="loadMemberships">查询</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table v-loading="loading" :data="memberships" empty-text="暂无会员记录">
        <el-table-column label="用户" min-width="210">
          <template #default="{ row }">
            <strong>{{ userName(row.user) }}</strong>
            <div class="muted-text">{{ row.user.phone || row.user.openid || row.userId }}</div>
          </template>
        </el-table-column>
        <el-table-column label="等级" min-width="160">
          <template #default="{ row }">
            <el-tag>{{ row.level.name }}</el-tag>
            <div class="muted-text">{{ row.level.code }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }"><AdminStatusBadge :status="row.effectiveStatus || row.status" :label="statusText(row.effectiveStatus || row.status)" /></template>
        </el-table-column>
        <el-table-column label="有效期" min-width="190">
          <template #default="{ row }">
            <div>{{ formatDate(row.startsAt) }}</div>
            <div class="muted-text">至 {{ row.endsAt ? formatDate(row.endsAt) : "长期有效" }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="source" label="来源" width="140" />
        <el-table-column label="权益" width="100">
          <template #default="{ row }">{{ row.benefitGrants?.length || 0 }}</template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openRenew(row)">续期</el-button>
            <el-button size="small" @click="openChangeLevel(row)">调级</el-button>
            <el-button size="small" @click="openGrantLog(row)">权益</el-button>
            <el-button size="small" type="danger" plain :disabled="row.status === 'DISABLED'" @click="openDisable(row)">停用</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <AdminSectionCard title="用户选择器" subtitle="授予会员时请通过用户搜索选择，不手输用户 ID。">
      <AdminFilterBar>
        <el-input v-model="userKeyword" clearable placeholder="昵称 / 手机 / openid" style="width: 280px" @keyup.enter="loadUsers" />
        <template #actions><el-button :loading="userLoading" @click="loadUsers">搜索用户</el-button></template>
      </AdminFilterBar>
      <el-table v-loading="userLoading" :data="users" empty-text="暂无用户">
        <el-table-column label="用户" min-width="220">
          <template #default="{ row }">
            <strong>{{ userName(row) }}</strong>
            <div class="muted-text">{{ row.openid || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column label="当前会员" min-width="180">
          <template #default="{ row }">
            <span v-if="row.memberships?.length">{{ row.memberships[0].level.name }} / {{ statusText(row.memberships[0].effectiveStatus || row.memberships[0].status) }}</span>
            <span v-else class="muted-text">非会员</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }"><el-button size="small" @click="openGrant(row.id)">授予</el-button></template>
        </el-table-column>
      </el-table>
    </AdminSectionCard>

    <el-dialog v-model="grantVisible" title="授予会员" width="620px">
      <el-form :model="grantForm" label-width="130px">
        <el-form-item>
          <template #label>用户<FieldHelp content="通过下方用户选择器带入用户 ID，避免误授予。" /></template>
          <el-input v-model="grantForm.userId" placeholder="请从用户列表选择" />
        </el-form-item>
        <el-form-item>
          <template #label>会员等级<FieldHelp content="停用等级不会出现在可授予选择中。" /></template>
          <el-select v-model="grantForm.levelId" filterable placeholder="请选择会员等级">
            <el-option v-for="item in enabledLevels" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <template #label>有效天数<FieldHelp content="留空时使用会员等级默认有效期；等级也未配置则长期有效。" /></template>
          <el-input-number v-model="grantForm.durationDays" :min="1" placeholder="可留空" />
        </el-form-item>
        <el-form-item label="来源">
          <el-select v-model="grantForm.source">
            <el-option label="后台授予" value="ADMIN_GRANT" />
            <el-option label="导入" value="IMPORT" />
            <el-option label="报名奖励" value="REGISTRATION_REWARD" />
            <el-option label="人工调整" value="MANUAL_ADJUST" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="grantForm.remark" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="grantVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!grantForm.userId || !grantForm.levelId" @click="saveGrant">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="actionVisible" :title="actionTitle" width="560px">
      <el-form :model="actionForm" label-width="120px">
        <el-form-item v-if="actionMode === 'renew'">
          <template #label>续期天数<FieldHelp content="从当前到期日和今天中较晚时间开始延长。" /></template>
          <el-input-number v-model="actionForm.durationDays" :min="1" />
        </el-form-item>
        <el-form-item v-if="actionMode === 'changeLevel'">
          <template #label>新等级<FieldHelp content="调级后会按新等级自动发放已启用且自动发放的权益。" /></template>
          <el-select v-model="actionForm.levelId" filterable>
            <el-option v-for="item in enabledLevels" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="actionMode === 'disable'">
          <template #label>停用原因<FieldHelp content="停用会员会撤销该会员记录下仍处于已发放状态的权益。" /></template>
          <el-input v-model="actionForm.reason" />
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="actionForm.remark" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="actionVisible = false">取消</el-button>
        <el-button type="primary" @click="saveAction">确认</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="grantsVisible" title="会员权益发放记录" width="860px">
      <el-table :data="selectedMembership?.benefitGrants || []" empty-text="暂无权益发放记录">
        <el-table-column label="权益" min-width="180"><template #default="{ row }">{{ row.benefit?.title }}</template></el-table-column>
        <el-table-column label="状态" width="110"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="grantStatusText(row.status)" /></template></el-table-column>
        <el-table-column prop="source" label="来源" width="130" />
        <el-table-column label="发放时间" width="170"><template #default="{ row }">{{ formatDate(row.grantedAt) }}</template></el-table-column>
        <el-table-column label="过期时间" width="170"><template #default="{ row }">{{ formatDate(row.expiredAt) }}</template></el-table-column>
      </el-table>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminSectionCard from "../../components/AdminSectionCard.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import FieldHelp from "../../components/FieldHelp.vue";
import { changeMembershipLevel, disableMembership, grantMembership, listMemberLevels, listMemberships, listUsers, renewMembership } from "../../services/admin";
import type { AdminAppUser, MemberLevel, UserMembership } from "../../services/types";

const users = ref<AdminAppUser[]>([]);
const levels = ref<MemberLevel[]>([]);
const memberships = ref<UserMembership[]>([]);
const keyword = ref("");
const levelId = ref("");
const status = ref("");
const userKeyword = ref("");
const loading = ref(false);
const userLoading = ref(false);
const grantVisible = ref(false);
const actionVisible = ref(false);
const grantsVisible = ref(false);
const selectedMembership = ref<UserMembership | null>(null);
const actionMode = ref<"renew" | "disable" | "changeLevel">("renew");
const grantForm = reactive({ userId: "", levelId: "", durationDays: undefined as number | undefined, source: "ADMIN_GRANT", remark: "" });
const actionForm = reactive({ durationDays: 365, levelId: "", reason: "", remark: "" });
const enabledLevels = computed(() => levels.value.filter((item) => item.enabled));
const actionTitle = computed(() => (actionMode.value === "renew" ? "续期会员" : actionMode.value === "disable" ? "停用会员" : "调整会员等级"));

onMounted(async () => {
  await Promise.all([loadLevels(), loadMemberships(), loadUsers()]);
});

async function loadUsers() {
  userLoading.value = true;
  try {
    users.value = (await listUsers({ page: 1, pageSize: 50, keyword: userKeyword.value })).items;
  } finally {
    userLoading.value = false;
  }
}

async function loadLevels() {
  levels.value = (await listMemberLevels()).items;
}

async function loadMemberships() {
  loading.value = true;
  try {
    memberships.value = (await listMemberships({ page: 1, pageSize: 100, keyword: keyword.value, levelId: levelId.value, status: status.value })).items;
  } finally {
    loading.value = false;
  }
}

function openGrant(userId = "") {
  Object.assign(grantForm, { userId, levelId: enabledLevels.value[0]?.id ?? "", durationDays: undefined, source: "ADMIN_GRANT", remark: "" });
  grantVisible.value = true;
}

async function saveGrant() {
  await grantMembership({
    userId: grantForm.userId,
    levelId: grantForm.levelId,
    durationDays: grantForm.durationDays,
    source: grantForm.source,
    remark: grantForm.remark || undefined
  });
  grantVisible.value = false;
  await Promise.all([loadMemberships(), loadUsers()]);
  ElMessage.success("会员已授予，自动权益已按规则发放");
}

function openRenew(row: UserMembership) {
  selectedMembership.value = row;
  actionMode.value = "renew";
  Object.assign(actionForm, { durationDays: row.level.defaultDays || 365, levelId: row.levelId, reason: "", remark: "" });
  actionVisible.value = true;
}

function openDisable(row: UserMembership) {
  selectedMembership.value = row;
  actionMode.value = "disable";
  Object.assign(actionForm, { durationDays: 365, levelId: row.levelId, reason: "后台停用会员", remark: "" });
  actionVisible.value = true;
}

function openChangeLevel(row: UserMembership) {
  selectedMembership.value = row;
  actionMode.value = "changeLevel";
  Object.assign(actionForm, { durationDays: 365, levelId: row.levelId, reason: "", remark: "" });
  actionVisible.value = true;
}

function openGrantLog(row: UserMembership) {
  selectedMembership.value = row;
  grantsVisible.value = true;
}

async function saveAction() {
  if (!selectedMembership.value) return;
  if (actionMode.value === "renew") await renewMembership(selectedMembership.value.id, { durationDays: actionForm.durationDays, remark: actionForm.remark || undefined });
  if (actionMode.value === "disable") await disableMembership(selectedMembership.value.id, { reason: actionForm.reason, remark: actionForm.remark || undefined });
  if (actionMode.value === "changeLevel") await changeMembershipLevel(selectedMembership.value.id, { levelId: actionForm.levelId, remark: actionForm.remark || undefined });
  actionVisible.value = false;
  await Promise.all([loadMemberships(), loadUsers()]);
  ElMessage.success("会员状态已更新");
}

function userName(user: AdminAppUser) {
  return user.nickname || user.wechatNickname || "未命名用户";
}

function statusText(value: string) {
  return ({ ACTIVE: "有效", EXPIRED: "已过期", DISABLED: "已停用", CANCELLED: "已取消" } as Record<string, string>)[value] || value;
}

function grantStatusText(value: string) {
  return ({ GRANTED: "已发放", USED: "已使用", EXPIRED: "已过期", REVOKED: "已撤销", FAILED: "失败" } as Record<string, string>)[value] || value;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
</script>
