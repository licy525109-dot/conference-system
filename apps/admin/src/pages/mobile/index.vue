<template>
  <section class="mobile-workspace">
    <header><div><h1>会务工作台</h1><span>{{ admin?.displayName || admin?.username }}</span></div><el-button :icon="Refresh" circle aria-label="刷新" :loading="loading" @click="load" /></header>
    <form class="search" @submit.prevent="page = 1; load()"><el-input v-model="keyword" placeholder="姓名、手机、报名号或订单号" clearable :prefix-icon="Search" /><el-button native-type="submit" type="primary">查找</el-button></form>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-skeleton v-if="loading && !items.length" :rows="5" animated />
    <el-empty v-else-if="!items.length" description="暂无报名记录" />
    <article v-for="item in items" :key="item.id" class="registration-item" @click="showDetail(item.id)">
      <div class="item-top"><h2>{{ item.attendeeName || '参会人' }}</h2><AdminStatusBadge :status="item.status" /></div>
      <p>{{ item.conferenceTitle }}</p><p>{{ item.skuName }} · {{ item.attendeeCount }} 人</p>
      <div class="item-bottom"><strong>{{ item.complimentary ? '主办方邀请' : `实付 ¥${formatCent(item.paidAmountCent)}` }}</strong><el-button link type="primary" @click.stop="showDetail(item.id)">查看报名详情</el-button></div>
    </article>
    <el-pagination size="small" layout="prev, pager, next" :total="total" :page-size="20" v-model:current-page="page" @current-change="load" />
    <el-drawer v-model="detailVisible" title="报名详情" size="min(700px, 100vw)" destroy-on-close>
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
      <el-skeleton v-if="detailLoading" :rows="5" animated />
      <template v-else-if="detail">
        <h2>{{ detail.conferenceTitle }}</h2><p class="muted">{{ detail.registrationNo }}</p>
        <div v-for="guest in detail.attendees" :key="guest.id" class="guest">
          <h3>{{ guest.name }}</h3><a :href="`tel:${guest.phone}`">{{ guest.phone }}</a>
          <p v-if="guest.company || guest.title">{{ guest.company }} {{ guest.title }}</p>
          <AdminStatusBadge :status="guest.checkInStatus" :label="guest.checkInStatus === 'PENDING' ? '待签到' : undefined" />
        </div>
        <h3>订单与支付</h3><p>{{ detail.orderNo }}</p><p>实付：¥{{ formatCent(detail.paidAmountCent) }}</p>
        <el-button v-if="detail.user && hasPermission('member:view')" @click="navigateTo('/users/detail', { id: detail.user.id }); detailVisible = false">查看报名账号</el-button>
        <GuestIdentityPanel v-if="hasPermission('member:view')" :registration-id="detail.id" @changed="showDetail(detail.id)" />
        <h3>内部备注</h3><el-input v-model="remark" type="textarea" :rows="3" :disabled="!hasPermission('registration:write')" />
        <el-button v-if="hasPermission('registration:write')" type="primary" :loading="saving" @click="saveRemark">保存备注</el-button>
        <p><el-button v-if="hasPermission('refund:view')" @click="navigateTo('/refunds'); detailVisible = false">进入退款管理</el-button><el-button @click="navigateTo('/registrations/detail', { id: detail.id }); detailVisible = false">完整管理页</el-button></p>
      </template>
    </el-drawer>
  </section>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Refresh, Search } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import GuestIdentityPanel from "../../components/GuestIdentityPanel.vue";
import { listRegistrations, getRegistrationDetail, updateRegistrationRemark } from "../../services/admin";
import type { AdminRegistration, AdminRegistrationFullDetail } from "../../services/types";
import { useAdminSession } from "../../stores/admin-session";
import { navigateTo, routeQuery } from "../../router";
const { admin, hasPermission } = useAdminSession();
const items = ref<AdminRegistration[]>([]); const total = ref(0); const page = ref(1); const keyword = ref(""); const loading = ref(false); const error = ref("");
const detailVisible = ref(false); const detail = ref<AdminRegistrationFullDetail>(); const detailLoading = ref(false); const detailError = ref(""); const remark = ref(""); const saving = ref(false);
const formatCent = (n: number) => (n / 100).toFixed(2);
let listVersion = 0; let detailVersion = 0;
async function load() { const v = ++listVersion; loading.value = true; error.value = ""; try { const result = await listRegistrations({ keyword: keyword.value, page: page.value, pageSize: 20 }); if (v === listVersion) { items.value = result.items; total.value = result.total; } } catch(e) { error.value = e instanceof Error ? e.message : "加载失败"; } finally { if (v === listVersion) loading.value = false; } }
async function showDetail(id: string) { const v = ++detailVersion; detailVisible.value = true; detailLoading.value = true; detailError.value = ""; try { const result = await getRegistrationDetail(id); if (v === detailVersion) { detail.value = result; remark.value = result.adminRemark || ''; } } catch(e) { detailError.value = e instanceof Error ? e.message : "加载失败"; } finally { if (v === detailVersion) detailLoading.value = false; } }
async function saveRemark() { if (!detail.value) return; saving.value = true; try { await updateRegistrationRemark(detail.value.id, remark.value || null); ElMessage.success("已保存备注"); } catch(e) { ElMessage.error(e instanceof Error ? e.message : "保存失败"); } finally { saving.value = false; } }
onMounted(() => { void load(); if (routeQuery.value.registrationId) void showDetail(routeQuery.value.registrationId); });
</script>
<style scoped>
.mobile-workspace { width: 100%; max-width: 900px; margin: 0 auto; font-size: 16px; line-height: 1.6; }
header, .item-top, .item-bottom, .search { display: flex; gap: 12px; justify-content: space-between; align-items: center; } h1 { font-size: 24px; margin: 0; } h2 { font-size: 20px; margin: 0; overflow-wrap: anywhere; } p { margin: 10px 0; overflow-wrap: anywhere; }
.search { margin: 24px 0; }.registration-item { border: 1px solid #d8e1e6; background: white; padding: 18px; margin: 12px 0; border-radius: 8px; cursor: pointer; }
.item-bottom { flex-wrap: wrap; }.guest { padding: 16px 0; border-bottom: 1px solid #d8e1e6; }.guest h3 { margin: 0; }.guest a { color: #24566b; }.muted { color: #586974; }
:deep(.el-drawer__body) { overflow-wrap: anywhere; }:deep(.el-button) { min-height: 40px; }:deep(.el-input__inner) { font-size: 16px; }
</style>
