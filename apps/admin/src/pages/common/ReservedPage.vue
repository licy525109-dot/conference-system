<template>
  <section class="admin-page">
    <AdminPageHeader
      :title="currentRoute.title"
      :eyebrow="currentRoute.group"
      badge="预留"
      badge-tone="neutral"
      :subtitle="subtitle"
    >
      <AdminFeatureBadge label="预留页面" :description="description" tone="neutral" />
    </AdminPageHeader>

    <section class="data-panel">
      <h2 class="page-title">功能建设中</h2>
      <p class="page-subtitle">
        该入口已按业务域放入菜单，正式上线前会补齐列表、筛选、权限和审计记录；当前页面不提供假操作按钮。
      </p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import { currentRoute } from "../../router";

const subtitle = computed(() => currentRoute.value.description || "该能力已规划为独立后台入口，当前仅展示上线预留状态。");
const description = computed(() => `${currentRoute.value.title}尚未接入正式操作流程。`);
</script>
