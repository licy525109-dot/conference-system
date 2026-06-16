<template>
  <el-container class="admin-shell">
    <el-aside width="264px" class="admin-aside">
      <div class="admin-brand">
        <img v-if="brandLogoUrl" class="brand-mark brand-mark--image" :src="brandLogoUrl" alt="" />
        <span v-else class="brand-mark">{{ brandMarkText }}</span>
        <div>
          <strong>{{ brandTitle }}</strong>
          <span>{{ brandSubtitle }}</span>
        </div>
      </div>
      <el-scrollbar class="admin-menu-scroll">
        <el-menu :default-active="currentRoute.path" class="admin-menu" @select="handleSelect">
          <el-menu-item-group v-for="group in menuGroups" :key="group.name" :class="group.className">
            <template #title>
              <span class="menu-group-title">
                {{ group.name }}
                <small v-if="group.badge">{{ group.badge }}</small>
              </span>
            </template>
            <el-menu-item v-for="item in group.items" :key="item.path" :index="item.path" :class="{ 'is-muted-route': isMutedRoute(item) }">
              <span class="menu-dot" />
              <span class="menu-item-copy">
                <span>{{ item.menuTitle }}</span>
                <small v-if="item.badge">{{ item.badge }}</small>
              </span>
            </el-menu-item>
          </el-menu-item-group>
        </el-menu>
      </el-scrollbar>
    </el-aside>
    <el-container>
      <el-header class="admin-header">
        <div class="admin-header__copy">
          <div class="breadcrumb-title">后台管理 / {{ currentRoute.group }} / {{ currentRoute.title }}</div>
          <strong>{{ currentRoute.title }}</strong>
          <span v-if="currentRoute.description">{{ currentRoute.description }}</span>
        </div>
        <div class="admin-header__quick">
          <el-button v-for="item in currentGroupQuickRoutes" :key="item.path" size="small" :type="item.path === currentRoute.path ? 'primary' : 'default'" @click="quickGo(item.path)">
            {{ item.menuTitle }}
          </el-button>
        </div>
        <div class="admin-user">
          <span class="admin-user__role">当前账号</span>
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
import { computed, onMounted, ref } from "vue";
import { currentRoute, navigateTo, routes, type AdminRoute } from "../router";
import { getTheme } from "../services/admin";
import { useAdminSession } from "../stores/admin-session";

const { admin, hasPermission, logout } = useAdminSession();
const brandTitle = ref("会务运营平台");
const brandSubtitle = ref("报名、支付与页面配置中心");
const brandLogoUrl = ref("");

const brandMarkText = computed(() => brandTitle.value.trim().slice(0, 1) || "会");

const GROUP_META: Record<string, { order: number; badge?: string; className?: string }> = {
  工作台: { order: 0 },
  会议业务: { order: 10 },
  营销配置: { order: 20, badge: "灰度" },
  页面装修: { order: 30 },
  扩展能力: { order: 40, badge: "预留", className: "is-extension-group" },
  系统管理: { order: 50 }
};

const menuRoutes = computed(() => routes.filter((route) => !route.hidden && hasPermission(route.permission)));
const currentGroupQuickRoutes = computed(() =>
  menuRoutes.value.filter((route) => route.group === currentRoute.value.group).slice(0, 6)
);
const menuGroups = computed(() => {
  const groups = new Map<string, AdminRoute[]>();
  for (const route of menuRoutes.value) {
    groups.set(route.group, [...(groups.get(route.group) ?? []), route]);
  }
  return Array.from(groups.entries())
    .map(([name, items]) => ({
      name,
      items,
      badge: GROUP_META[name]?.badge,
      className: GROUP_META[name]?.className ?? "",
      order: GROUP_META[name]?.order ?? 999
    }))
    .sort((a, b) => a.order - b.order);
});

onMounted(async () => {
  try {
    const theme = await getTheme();
    const config = theme.config as Record<string, unknown>;
    brandTitle.value = typeof config.adminBrandTitle === "string" && config.adminBrandTitle.trim() ? config.adminBrandTitle.trim() : brandTitle.value;
    brandSubtitle.value = typeof config.adminBrandSubtitle === "string" && config.adminBrandSubtitle.trim() ? config.adminBrandSubtitle.trim() : brandSubtitle.value;
    brandLogoUrl.value = typeof config.adminBrandLogoUrl === "string" ? config.adminBrandLogoUrl : "";
  } catch {
    // Keep local defaults when theme config is unavailable.
  }
});

function handleSelect(path: string) {
  navigateTo(path);
}

function quickGo(path: string) {
  navigateTo(path);
}

function isMutedRoute(route: AdminRoute): boolean {
  return route.group === "扩展能力" || route.badge === "后续" || route.badge === "辅助" || route.badge === "高级";
}
</script>
