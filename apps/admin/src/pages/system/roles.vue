<template>
  <section class="admin-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">角色权限</h1>
        <p class="page-subtitle">配置后台功能权限。超级管理员角色为系统内置。</p>
      </div>
      <el-button type="primary" @click="openCreate">新增角色</el-button>
    </div>
    <section class="table-panel">
      <el-table :data="roles" empty-text="暂无角色">
        <el-table-column prop="name" label="角色" min-width="160" />
        <el-table-column prop="code" label="编码" min-width="160" />
        <el-table-column label="权限数" width="100"><template #default="{ row }">{{ row.permissions.length }}</template></el-table-column>
        <el-table-column label="系统角色" width="100"><template #default="{ row }">{{ row.system ? "是" : "否" }}</template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }">{{ row.enabled ? "启用" : "停用" }}</template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openEdit(row)">编辑</el-button></template></el-table-column>
      </el-table>
    </section>
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑角色' : '新增角色'" width="680px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="编码"><el-input v-model="form.code" :disabled="form.system" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" :disabled="form.system" /></el-form-item>
        <el-form-item label="权限">
          <el-checkbox-group v-model="form.permissionIds">
            <div v-for="group in permissionGroups" :key="group.name" style="margin-bottom: 12px">
              <strong>{{ group.name }}</strong>
              <div>
                <el-checkbox v-for="permission in group.items" :key="permission.id" :label="permission.id">
                  {{ permission.name }}
                </el-checkbox>
              </div>
            </div>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { createRole, listPermissions, listRoles, updateRole } from "../../services/admin";
import type { Permission, Role } from "../../services/types";

const roles = ref<Role[]>([]);
const permissions = ref<Permission[]>([]);
const dialogVisible = ref(false);
const form = reactive({
  id: "",
  code: "",
  name: "",
  description: "",
  system: false,
  enabled: true,
  permissionIds: [] as string[]
});

const permissionGroups = computed(() => {
  const groups = new Map<string, Permission[]>();
  for (const permission of permissions.value) {
    groups.set(permission.group, [...(groups.get(permission.group) ?? []), permission]);
  }
  return Array.from(groups.entries()).map(([name, items]) => ({ name, items }));
});

onMounted(() => void load());

async function load() {
  permissions.value = (await listPermissions()).items;
  roles.value = (await listRoles()).items;
}

function openCreate() {
  Object.assign(form, { id: "", code: "", name: "", description: "", system: false, enabled: true, permissionIds: [] });
  dialogVisible.value = true;
}

function openEdit(row: Role) {
  Object.assign(form, {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    system: row.system,
    enabled: row.enabled,
    permissionIds: row.permissions.map((permission) => permission.id)
  });
  dialogVisible.value = true;
}

async function save() {
  const payload = {
    code: form.code,
    name: form.name,
    description: form.description || null,
    enabled: form.enabled,
    permissionIds: form.permissionIds
  };
  if (form.id) await updateRole(form.id, payload);
  else await createRole(payload);
  dialogVisible.value = false;
  await load();
  ElMessage.success("角色已保存");
}
</script>
