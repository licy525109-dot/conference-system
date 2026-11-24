<template>
  <main v-if="!ready" class="login-page">
    <el-card class="login-card" shadow="never">
      <h1>会务运营平台</h1>
      <p>正在恢复登录状态...</p>
    </el-card>
  </main>

  <main v-else-if="!admin" class="login-page">
    <el-card class="login-card" shadow="never">
      <h1>{{ browserTitle }}</h1>
      <p>请使用后台账号登录。</p>
      <el-form :model="loginForm" label-position="top" @submit.prevent>
        <el-form-item label="用户名">
          <el-input v-model="loginForm.username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="loginForm.password" type="password" autocomplete="current-password" show-password />
        </el-form-item>
        <el-button type="primary" class="full-button" :loading="loading" @click="submitLogin">登录</el-button>
      </el-form>
    </el-card>
  </main>

  <div v-else-if="admin.conferenceScopeMode === 'ASSIGNED' && (currentRoute.path === '/judging' || (currentRoute.path === '/dashboard' && hasPermission('judging:view') && !hasPermission('conference:view') && !hasPermission('invitation:view')))" class="scoped-judging-page">
    <el-button v-if="hasPermission('conference:view')" @click="navigateTo('/dashboard')">返回授权会议工作台</el-button>
    <el-button v-if="hasPermission('invitation:view')" @click="navigateTo('/invitations')">专属邀请函</el-button>
    <el-button v-if="hasPermission('certificate:view')" @click="navigateTo('/certificates')">证书管理</el-button>
    <el-button @click="logout">退出登录</el-button><JudgingPage v-if="hasPermission('judging:view')" />
  </div>
  <div v-else-if="admin.conferenceScopeMode === 'ASSIGNED' && currentRoute.path === '/certificates'" class="scoped-certificate-page">
    <el-button @click="navigateTo('/dashboard')">返回授权会议工作台</el-button>
    <CertificatesPage v-if="hasPermission('certificate:view')" />
    <el-result v-else icon="warning" title="无证书管理权限" />
  </div>
  <div v-else-if="admin.conferenceScopeMode === 'ASSIGNED' && (currentRoute.path === '/invitations' || (hasPermission('invitation:view') && !hasPermission('conference:view')))" class="scoped-invitation-page">
    <nav class="scoped-invitation-nav" aria-label="工作台导航">
      <el-button v-if="hasPermission('judging:view')" @click="navigateTo('/judging')">赛课评审</el-button>
      <el-button v-if="hasPermission('conference:view')" @click="navigateTo('/dashboard')">返回授权会议工作台</el-button>
      <el-button v-if="hasPermission('certificate:view')" @click="navigateTo('/certificates')">证书管理</el-button>
      <span>{{ admin.displayName || admin.username }}</span><el-button @click="logout">退出登录</el-button>
    </nav>
    <InvitationsPage v-if="hasPermission('invitation:view')" />
    <el-result v-else icon="warning" title="无邀请函管理权限" />
  </div>
  <ScopedConferenceWorkspace v-else-if="admin.conferenceScopeMode === 'ASSIGNED'" />
  <AdminLayout v-else />
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminLayout from "./layouts/AdminLayout.vue";
import ScopedConferenceWorkspace from "./pages/conferences/ScopedConferenceWorkspace.vue";
const JudgingPage = defineAsyncComponent(() => import("./pages/judging/index.vue"));
const CertificatesPage = defineAsyncComponent(() => import("./pages/certificates/index.vue"));
const InvitationsPage = defineAsyncComponent(() => import("./pages/invitations/index.vue"));
import { currentRoute, navigateTo } from "./router";
import { getTheme } from "./services/admin";
import { useAdminSession } from "./stores/admin-session";

const { admin, ready, init, login, logout, hasPermission } = useAdminSession();
const loading = ref(false);
const loginForm = reactive({ username: "admin", password: "" });
const browserTitle = ref("会务运营平台");

onMounted(async () => {
  await init();
  await loadBrand();
});

async function loadBrand() {
  if (!admin.value || admin.value.conferenceScopeMode === "ASSIGNED") {
    document.title = browserTitle.value;
    return;
  }
  try {
    const theme = await getTheme();
    const config = theme.config as Record<string, unknown>;
    const nextTitle = typeof config.browserTitle === "string" && config.browserTitle.trim() ? config.browserTitle.trim() : browserTitle.value;
    const iconUrl = typeof config.browserIconUrl === "string" ? config.browserIconUrl.trim() : "";
    browserTitle.value = nextTitle;
    document.title = nextTitle;
    if (iconUrl) {
      setFavicon(iconUrl);
    }
  } catch {
    document.title = browserTitle.value;
  }
}

function setFavicon(url: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}

async function submitLogin() {
  loading.value = true;
  try {
    await login(loginForm.username, loginForm.password);
    await loadBrand();
    ElMessage.success("登录成功");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "登录失败");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.scoped-invitation-page { padding: 24px; max-width: 1600px; margin: auto; }
.scoped-invitation-nav { display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
@media (max-width: 640px) { .scoped-invitation-page { padding: 16px; } }
</style>
