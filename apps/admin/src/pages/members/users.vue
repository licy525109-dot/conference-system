<template>
  <section class="admin-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">用户与会员</h1>
        <p class="page-subtitle">查看小程序用户，手动授予会员等级；会员优惠暂不接入报名定价。</p>
      </div>
      <el-button type="primary" @click="openAssign">授予会员</el-button>
    </div>

    <div class="toolbar">
      <el-input v-model="keyword" placeholder="昵称 / 手机 / openid" style="width: 260px" @keyup.enter="loadUsers" />
      <el-button :loading="loading" @click="loadUsers">查询</el-button>
    </div>

    <section class="table-panel">
      <el-table :data="users" empty-text="暂无用户">
        <el-table-column label="用户" min-width="220">
          <template #default="{ row }">
            <strong>{{ row.nickname || row.wechatNickname || "未命名用户" }}</strong>
            <div class="muted-text">{{ row.openid || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="140" />
        <el-table-column label="会员" min-width="220">
          <template #default="{ row }">
            <el-tag v-if="row.memberships?.length">{{ row.memberships[0].level.name }}</el-tag>
            <span v-else class="muted-text">非会员</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="注册时间" width="190" />
        <el-table-column label="操作" width="110">
          <template #default="{ row }"><el-button size="small" @click="openAssign(row.id)">授予</el-button></template>
        </el-table-column>
      </el-table>
    </section>

    <section class="data-panel">
      <h2 class="page-title">会员记录</h2>
      <el-table :data="memberships" empty-text="暂无会员记录">
        <el-table-column label="用户" min-width="180">
          <template #default="{ row }">{{ row.user.nickname || row.user.wechatNickname || row.user.openid || row.userId }}</template>
        </el-table-column>
        <el-table-column label="等级" width="140"><template #default="{ row }">{{ row.level.name }}</template></el-table-column>
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column prop="startsAt" label="开始时间" width="190" />
        <el-table-column prop="endsAt" label="结束时间" width="190" />
        <el-table-column prop="source" label="来源" width="120" />
      </el-table>
    </section>

    <el-dialog v-model="dialogVisible" title="授予会员" width="560px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="用户 ID"><el-input v-model="form.userId" /></el-form-item>
        <el-form-item label="会员等级">
          <el-select v-model="form.levelId" placeholder="请选择">
            <el-option v-for="item in levels" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="有效天数"><el-input-number v-model="form.durationDays" :min="1" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveAssign">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { assignMembership, listMemberLevels, listMemberships, listUsers } from "../../services/admin";
import type { AdminAppUser, MemberLevel, UserMembership } from "../../services/types";

const users = ref<AdminAppUser[]>([]);
const levels = ref<MemberLevel[]>([]);
const memberships = ref<UserMembership[]>([]);
const keyword = ref("");
const loading = ref(false);
const dialogVisible = ref(false);
const form = reactive({ userId: "", levelId: "", durationDays: 365, remark: "" });

onMounted(async () => {
  await Promise.all([loadUsers(), loadLevels(), loadMemberships()]);
});

async function loadUsers() {
  loading.value = true;
  try {
    users.value = (await listUsers({ page: 1, pageSize: 100, keyword: keyword.value })).items;
  } finally {
    loading.value = false;
  }
}

async function loadLevels() {
  levels.value = (await listMemberLevels()).items;
}

async function loadMemberships() {
  memberships.value = (await listMemberships({ page: 1, pageSize: 100 })).items;
}

function openAssign(userId = "") {
  Object.assign(form, { userId, levelId: levels.value[0]?.id ?? "", durationDays: 365, remark: "" });
  dialogVisible.value = true;
}

async function saveAssign() {
  await assignMembership({
    userId: form.userId,
    levelId: form.levelId,
    durationDays: form.durationDays,
    remark: form.remark || undefined
  });
  dialogVisible.value = false;
  await Promise.all([loadUsers(), loadMemberships()]);
  ElMessage.success("会员已授予");
}
</script>
