<template>
  <main v-if="!ready" class="login-page">
    <el-card class="login-card" shadow="never">
      <h1>会议运营后台</h1>
      <p>正在恢复登录状态...</p>
    </el-card>
  </main>

  <main v-else-if="!admin" class="login-page">
    <el-card class="login-card" shadow="never">
      <h1>会议运营后台</h1>
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

  <AdminLayout v-else />
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminLayout from "./layouts/AdminLayout.vue";
import { useAdminSession } from "./stores/admin-session";

const { admin, ready, init, login } = useAdminSession();
const loading = ref(false);
const loginForm = reactive({ username: "admin", password: "" });

onMounted(() => {
  void init();
});

async function submitLogin() {
  loading.value = true;
  try {
    await login(loginForm.username, loginForm.password);
    ElMessage.success("登录成功");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "登录失败");
  } finally {
    loading.value = false;
  }
}
</script>
