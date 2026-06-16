<template>
  <section class="admin-page">
    <AdminPageHeader title="底部导航配置" eyebrow="页面装修" subtitle="配置小程序底部导航，保存后按后台顺序动态展示，不写死导航入口。">
      <AdminFeatureBadge label="主线优先" description="建议第一版优先保留首页、会议列表、我的报名；会员和商城属于扩展能力。" tone="info" />
      <template #actions>
        <el-switch v-model="enabled" active-text="启用" inactive-text="停用" />
        <el-button @click="addItem">新增导航</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存发布</el-button>
      </template>
    </AdminPageHeader>

    <section class="data-panel">
      <el-table :data="items" empty-text="暂无导航">
        <el-table-column label="排序" width="90">
          <template #default="{ row }"><el-input-number v-model="row.sortOrder" :min="0" :controls="false" style="width: 64px" /></template>
        </el-table-column>
        <el-table-column label="标题" min-width="130">
          <template #default="{ row }"><el-input v-model="row.title" /></template>
        </el-table-column>
        <el-table-column label="绑定页面" min-width="170">
          <template #default="{ row }">
            <el-select v-model="row.pageKey" filterable allow-create default-first-option @change="syncPath(row)">
              <el-option label="首页" value="home" />
              <el-option label="会议列表" value="conference-list" />
              <el-option label="会议详情" value="conference-detail" />
              <el-option label="我的报名" value="my-registrations" />
              <el-option label="会员中心" value="member-center" />
              <el-option label="商城首页" value="mall" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="页面路径" min-width="220">
          <template #default="{ row }"><el-input v-model="row.path" placeholder="/pages/index/index" /></template>
        </el-table-column>
        <el-table-column label="普通图标" min-width="190">
          <template #default="{ row }">
            <el-input v-model="row.iconUrl" placeholder="素材 URL，可为空" />
            <el-select class="icon-library" placeholder="图标库" @change="(value: string) => applyIcon(row, value)">
              <el-option v-for="icon in iconLibrary" :key="icon.key" :label="icon.label" :value="icon.key" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="选中图标" min-width="190">
          <template #default="{ row }"><el-input v-model="row.selectedIconUrl" placeholder="素材 URL，可为空" /></template>
        </el-table-column>
        <el-table-column label="显示" width="80">
          <template #default="{ row }"><el-switch v-model="row.visible" /></template>
        </el-table-column>
        <el-table-column label="登录" width="80">
          <template #default="{ row }"><el-switch v-model="row.requireLogin" /></template>
        </el-table-column>
        <el-table-column label="操作" width="90">
          <template #default="{ $index }"><el-button type="danger" size="small" @click="items.splice($index, 1)">删除</el-button></template>
        </el-table-column>
      </el-table>
    </section>

    <section class="data-panel tabbar-preview">
      <div class="phone-nav">
        <div v-for="item in visibleItems" :key="item.pageKey + item.title" class="nav-item">
          <img v-if="item.iconUrl" :src="item.iconUrl" alt="" />
          <span v-else class="nav-dot" />
          <strong>{{ item.title }}</strong>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import { getTabbar, updateTabbar } from "../../services/admin";
import type { TabBarItem } from "../../services/types";

const enabled = ref(true);
const items = ref<TabBarItem[]>([]);
const saving = ref(false);
const iconLibrary = [
  { key: "home", label: "首页", glyph: "⌂" },
  { key: "ticket", label: "报名", glyph: "票" },
  { key: "cart", label: "购物车", glyph: "购" },
  { key: "member", label: "会员", glyph: "会" },
  { key: "mall", label: "商城", glyph: "商" }
];

const visibleItems = computed(() => [...items.value].filter((item) => item.visible).sort((a, b) => a.sortOrder - b.sortOrder));

onMounted(async () => {
  const config = await getTabbar();
  enabled.value = config.enabled;
  items.value = config.items.map((item) => ({ ...item }));
});

function addItem() {
  items.value.push({
    title: "自定义",
    pageKey: "custom:",
    path: "/pages/custom/index?pageKey=custom:",
    iconUrl: null,
    selectedIconUrl: null,
    visible: true,
    sortOrder: items.value.length * 10,
    requireLogin: false,
    badgeText: null
  });
}

function syncPath(row: TabBarItem) {
  const pathMap: Record<string, string> = {
    home: "/pages/index/index",
    "conference-list": "/pages/index/index",
    "conference-detail": "/pages/index/index",
    "my-registrations": "/pages/registrations/my",
    "member-center": "/pages/member/center",
    mall: "/pages/mall/index"
  };
  if (pathMap[row.pageKey]) {
    row.path = pathMap[row.pageKey];
  } else if (row.pageKey.startsWith("custom:")) {
    row.path = `/pages/custom/index?pageKey=${encodeURIComponent(row.pageKey)}`;
  }
}

function applyIcon(row: TabBarItem, key: string) {
  const icon = iconLibrary.find((item) => item.key === key);
  if (!icon) return;
  row.iconUrl = svgDataUrl(icon.glyph, "#9aa5b5", "#eef2f7");
  row.selectedIconUrl = svgDataUrl(icon.glyph, "#1f5fbf", "#e8f1ff");
}

function svgDataUrl(glyph: string, color: string, bg: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="28" fill="${bg}"/><text x="48" y="58" text-anchor="middle" font-size="38" font-family="Arial, sans-serif" font-weight="700" fill="${color}">${glyph}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function save() {
  saving.value = true;
  try {
    const config = await updateTabbar({
      enabled: enabled.value,
      items: items.value.map((item, index) => ({
        title: item.title,
        iconUrl: item.iconUrl || null,
        selectedIconUrl: item.selectedIconUrl || null,
        pageKey: item.pageKey,
        path: item.path,
        visible: item.visible,
        sortOrder: item.sortOrder ?? index,
        requireLogin: item.requireLogin,
        badgeText: item.badgeText || null
      }))
    });
    enabled.value = config.enabled;
    items.value = config.items.map((item) => ({ ...item }));
    ElMessage.success("底部导航已保存");
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.tabbar-preview {
  padding: 16px;
}

.phone-nav {
  width: min(420px, 100%);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--admin-color-border);
  border-radius: 18px;
  background: #ffffff;
  box-shadow: var(--admin-shadow);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--admin-color-muted);
  font-size: 12px;
}

.nav-item img,
.nav-dot {
  width: 24px;
  height: 24px;
  border-radius: 8px;
}

.nav-dot {
  display: block;
  background: var(--admin-color-primary);
}

.icon-library {
  margin-top: 6px;
}
</style>
