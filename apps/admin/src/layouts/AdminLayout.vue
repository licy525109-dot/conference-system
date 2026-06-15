<template>
  <el-container class="admin-shell">
    <el-aside width="264px" class="admin-aside">
      <div class="admin-brand">
        <span class="brand-mark">会</span>
        <div>
          <strong>会议运营后台</strong>
          <span>运营管理中心</span>
        </div>
      </div>
      <el-scrollbar class="admin-menu-scroll">
        <el-menu :default-active="currentRoute.path" class="admin-menu" @select="handleSelect">
          <el-menu-item-group v-for="group in menuGroups" :key="group.name" :title="group.name">
            <el-menu-item v-for="item in group.items" :key="item.path" :index="item.path">
              <span class="menu-dot" />
              <span>{{ item.menuTitle }}</span>
            </el-menu-item>
          </el-menu-item-group>
        </el-menu>
      </el-scrollbar>
    </el-aside>
    <el-container>
      <el-header class="admin-header">
        <div>
          <div class="breadcrumb-title">后台管理 / {{ currentRoute.group }} / {{ currentRoute.title }}</div>
          <strong>{{ currentRoute.title }}</strong>
        </div>
        <div class="admin-user">
          <span class="admin-user__name">{{ admin?.displayName || admin?.username }}</span>
          <el-button plain @click="logout">退出登录</el-button>
        </div>
      </el-header>
      <el-main class="admin-main">
        <section v-if="!hasPermission(currentRoute.permission)" class="data-panel">
          <h2 class="page-title">无权限访问</h2>
          <p class="page-subtitle">当前账号没有打开该功能的权限，请联系超级管理员调整角色。</p>
        </section>
        <component :is="currentRoute.component" v-else />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { currentRoute, navigateTo, routes, type AdminRoute } from "../router";
import { useAdminSession } from "../stores/admin-session";

const { admin, hasPermission, logout } = useAdminSession();

const menuRoutes = computed(() => routes.filter((route) => !route.hidden && hasPermission(route.permission)));
const menuGroups = computed(() => {
  const groups = new Map<string, AdminRoute[]>();
  for (const route of menuRoutes.value) {
    groups.set(route.group, [...(groups.get(route.group) ?? []), route]);
  }
  return Array.from(groups.entries()).map(([name, items]) => ({ name, items }));
});

function handleSelect(path: string) {
  navigateTo(path);
}
</script>
