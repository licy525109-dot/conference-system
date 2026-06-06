<template>
  <main class="shell">
    <section class="dashboard">
      <p class="eyebrow">Conference Admin</p>
      <h1>后台 Dashboard</h1>
      <p class="summary">Hello from apps/admin. 后续这里会接入会议、规格、表单字段、订单和报名名单管理。</p>
      <el-row :gutter="16" class="stats">
        <el-col :span="8">
          <el-statistic title="MVP 状态" value="初始化" />
        </el-col>
        <el-col :span="8">
          <el-statistic title="后台范围" value="最小管理" />
        </el-col>
        <el-col :span="8">
          <el-tag type="success">Element Plus ready</el-tag>
        </el-col>
      </el-row>
    </section>
  </main>
</template>

<script setup lang="ts">
console.log("Admin dashboard ready");
</script>
