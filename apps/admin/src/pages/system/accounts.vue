<template>
  <section class="admin-page">
    <AdminPageHeader title="账号管理" eyebrow="系统管理" subtitle="创建后台账号并分配角色，账号启停会影响后台登录和运营操作。">
      <template #actions>
        <el-button type="primary" @click="openCreate">新增账号</el-button>
      </template>
    </AdminPageHeader>
    <section class="table-panel">
      <el-table :data="accounts" empty-text="暂无账号">
        <el-table-column prop="username" label="用户名" min-width="160" />
        <el-table-column prop="displayName" label="显示名" min-width="160" />
        <el-table-column label="角色" min-width="220"><template #default="{ row }">{{ rolesText(row) }}</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.enabled" /></template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openEdit(row)">编辑</el-button></template></el-table-column>
      </el-table>
    </section>
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑账号' : '新增账号'" width="560px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="用户名"><el-input v-model="form.username" :disabled="Boolean(form.id)" /></el-form-item>
        <el-form-item label="显示名"><el-input v-model="form.displayName" /></el-form-item>
        <el-form-item label="密码"><el-input v-model="form.password" type="password" show-password :placeholder="form.id ? '留空则不修改' : '请输入密码'" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.roleIds" multiple style="width: 100%">
            <el-option v-for="role in roles" :key="role.id" :label="role.name" :value="role.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { createAccount, listAccounts, listRoles, updateAccount } from "../../services/admin";
import type { AdminAccount, Role } from "../../services/types";

const accounts = ref<AdminAccount[]>([]);
const roles = ref<Role[]>([]);
const dialogVisible = ref(false);
const form = reactive({ id: "", username: "", displayName: "", password: "", roleIds: [] as string[], enabled: true });

onMounted(() => void load());

async function load() {
  roles.value = (await listRoles()).items;
  accounts.value = (await listAccounts()).items;
}

function openCreate() {
  Object.assign(form, { id: "", username: "", displayName: "", password: "", roleIds: [], enabled: true });
  dialogVisible.value = true;
}

function openEdit(row: AdminAccount) {
  Object.assign(form, {
    id: row.id,
    username: row.username,
    displayName: row.displayName ?? "",
    password: "",
    roleIds: row.roles.map((role) => role.id),
    enabled: row.enabled
  });
  dialogVisible.value = true;
}

async function save() {
  const payload = {
    username: form.username,
    displayName: form.displayName || null,
    password: form.password,
    roleIds: form.roleIds,
    enabled: form.enabled
  };
  if (form.id) await updateAccount(form.id, payload);
  else await createAccount(payload);
  dialogVisible.value = false;
  await load();
  ElMessage.success("账号已保存");
}

function rolesText(row: AdminAccount) {
  return row.roles.map((role) => role.name).join("、") || "-";
}
</script>
