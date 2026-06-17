<template>
  <section class="admin-page">
    <AdminPageHeader
      title="角色权限"
      eyebrow="系统管理"
      badge="高级权限"
      badge-tone="danger"
      subtitle="配置后台功能权限。超级管理员角色为系统内置，权限变更会直接影响运营后台可见范围。"
    >
      <AdminFeatureBadge label="高级权限，谨慎调整" description="建议只由管理员维护角色和权限。" tone="danger" />
      <template #actions>
        <el-button type="primary" @click="openCreate">新增角色</el-button>
      </template>
    </AdminPageHeader>
    <section class="table-panel">
      <el-table :data="roles" empty-text="暂无角色">
        <el-table-column prop="name" label="角色" min-width="160" />
        <el-table-column prop="code" label="编码" min-width="160" />
        <el-table-column label="权限数" width="100"><template #default="{ row }">{{ row.permissions.length }}</template></el-table-column>
        <el-table-column label="系统角色" width="110"><template #default="{ row }"><AdminStatusBadge :status="row.system" :label="row.system ? '系统内置' : '自定义'" :tone="row.system ? 'warning' : 'neutral'" /></template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.enabled" /></template></el-table-column>
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
            <div v-for="group in permissionGroups" :key="group.name" class="permission-group">
              <strong>{{ group.name }}</strong>
              <div class="permission-grid">
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
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { routes } from "../../router";
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
    const groupName = permissionMenuGroup(permission);
    groups.set(groupName, [...(groups.get(groupName) ?? []), permission]);
  }
  const order = [
    "控制台",
    "会议管理",
    "订单交易",
    "营销活动",
    "通知中心",
    "企微客户群",
    "AI 知识库",
    "会员",
    "商城",
    "财务管理",
    "页面装修",
    "系统管理",
    "其他权限"
  ];
  return Array.from(groups.entries())
    .map(([name, items]) => ({ name, items }))
    .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
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

function permissionMenuGroup(permission: Permission): string {
  const route = routes.find((item) => item.permission === permission.code);
  if (route) return route.group;
  if (permission.code.startsWith("conference:") || permission.code.startsWith("registration:") || permission.code.startsWith("checkin:") || permission.code.startsWith("inventory:")) return "会议管理";
  if (permission.code.startsWith("order:") || permission.code.startsWith("payment:")) return "订单交易";
  if (permission.code.startsWith("coupon:") || permission.code.startsWith("promotion:")) return "营销活动";
  if (permission.code.startsWith("notification:") || permission.code.startsWith("sms:")) return "通知中心";
  if (permission.code.startsWith("wecom:")) return "企微客户群";
  if (permission.code.startsWith("ai:") || permission.code.startsWith("knowledge:")) return "AI 知识库";
  if (permission.code.startsWith("member:")) return "会员";
  if (permission.code.startsWith("mall:")) return "商城";
  if (permission.code.startsWith("finance:") || permission.code.startsWith("refund:") || permission.code.startsWith("invoice:")) return "财务管理";
  if (permission.code.startsWith("page:") || permission.code.startsWith("theme:") || permission.code.startsWith("tabbar:") || permission.code.startsWith("material:")) return "页面装修";
  if (permission.code.startsWith("system:")) return "系统管理";
  return "其他权限";
}
</script>

<style scoped>
.permission-group {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--admin-color-border);
}

.permission-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, 1fr));
  gap: 8px 14px;
  margin-top: 8px;
}
</style>
