<template>
  <section class="admin-page account-detail">
    <AdminPageHeader title="用户详情" eyebrow="用户中心">
      <template #actions><el-button @click="goBack">返回</el-button><el-button :loading="loading" @click="load">刷新</el-button></template>
    </AdminPageHeader>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <section v-if="data" v-loading="loading">
      <h2>{{ data.user.realName || data.user.wechatNickname || data.user.nickname || '待完善姓名' }}</h2>
      <el-descriptions :column="smallScreen ? 1 : 2" border>
        <el-descriptions-item label="账号编号">{{ data.user.id }}</el-descriptions-item>
        <el-descriptions-item label="本人姓名">{{ data.user.realName || '待完善' }}</el-descriptions-item>
        <el-descriptions-item label="微信昵称">{{ data.user.wechatNickname || data.user.nickname || '未设置' }}</el-descriptions-item>
        <el-descriptions-item label="手机号">
          {{ fullPhone ?? data.user.phone ?? '未绑定' }}
          <el-button v-if="data.user.phone && fullPhone === null && hasPermission('member:phone:view')" link :loading="phoneLoading" @click="revealPhone">查看完整</el-button>
          <el-tag v-if="data.user.phone" size="small" :type="data.user.phoneVerified ? 'success' : 'info'">{{ data.user.phoneVerified ? '已验证' : '未验证' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="注册时间">{{ date(data.user.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="最近活跃">{{ date(data.user.lastActiveAt) }}</el-descriptions-item>
      </el-descriptions>
      <template v-if="hasPermission('registration:view')">
      <div class="section-heading"><h3>该账号关联的报名</h3><span>共 {{ data.registrations.total }} 条 · 下单 {{ data.orderCount }} 笔</span></div>
      <el-empty v-if="!data.registrations.total" description="暂无关联报名" />
      <div v-else class="registration-list">
        <article v-for="(item, index) in data.registrations.items" :key="item.id" class="registration-item">
          <span class="admin-record-index">序号 {{ tableRowNumber(index, page, 20) }}</span>
          <div class="record-head"><h4>{{ item.conference.title }}</h4><AdminStatusBadge :status="item.status" /></div>
          <dl>
            <div><dt>会议时间</dt><dd>{{ date(item.conference.startsAt) }}</dd></div>
            <div><dt>账号关系</dt><dd>{{ item.relationship === 'SUBMITTED' ? '提交报名的账号（不代表本人参会）' : item.relationship === 'ATTENDEE' ? '已绑定的参会人' : '订单业务联系人' }}</dd></div>
            <div><dt>实际参会人</dt><dd>{{ item.attendees.map(a => a.name).join('、') || item.attendeeName }}</dd></div>
            <div><dt>票种</dt><dd>{{ item.sku.name }}</dd></div>
            <div><dt>报名号</dt><dd>{{ item.registrationNo }}</dd></div>
            <div><dt>报名时间</dt><dd>{{ date(item.createdAt) }}</dd></div>
            <div><dt>支付情况</dt><dd>{{ item.source === 'ADMIN_COMPLIMENTARY' ? '免支付' : `实付 ¥${money(item.paidAmountCent)}` }}<span v-if="item.refundedAmountCent"> · 已退 ¥{{ money(item.refundedAmountCent) }}</span></dd></div>
          </dl>
          <div class="record-actions">
            <el-button type="primary" @click="navigateTo('/registrations/detail', { id: item.id, fromUser: data.user.id })">查看报名详情</el-button>
            <el-button v-if="hasPermission('order:view')" @click="navigateTo('/orders', { orderNo: item.order.orderNo, fromUser: data.user.id })">查看订单</el-button>
          </div>
        </article>
      </div>
      <el-pagination v-if="data.registrations.total > 20" v-model:current-page="page" :total="data.registrations.total" :page-size="20" layout="prev, pager, next" @current-change="load" />
      </template>
    </section>
    <el-skeleton v-else-if="loading" :rows="8" animated />
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { tableRowNumber } from '../../utils/table-index';
import AdminPageHeader from '../../components/AdminPageHeader.vue';
import AdminStatusBadge from '../../components/AdminStatusBadge.vue';
import { navigateTo, routeQuery } from '../../router';
import { getUserActivity, type UserActivity } from '../../services/user-activity';
import { revealUserPhone } from '../../services/admin';
import { useAdminSession } from '../../stores/admin-session';
const data = ref<UserActivity | null>(null);
const loading = ref(false), phoneLoading = ref(false), error = ref('');
const fullPhone = ref<string | null>(null), page = ref(1);
const smallScreen = window.matchMedia('(max-width: 600px)').matches;
const id = computed(() => routeQuery.value.id || '');
const { hasPermission } = useAdminSession();
let loadVersion = 0;
async function load() {
  const version = ++loadVersion;
  if (!id.value) { error.value = '缺少用户编号'; return; }
  loading.value = true; error.value = '';
  try { const result = await getUserActivity(id.value, page.value); if (version === loadVersion) data.value = result; }
  catch (e) { if (version === loadVersion) error.value = e instanceof Error ? e.message : '读取用户资料失败'; }
  finally { if (version === loadVersion) loading.value = false; }
}
async function revealPhone() {
  phoneLoading.value = true;
  try { fullPhone.value = (await revealUserPhone(id.value)).phone; }
  catch (e) { error.value = e instanceof Error ? e.message : '读取手机号失败'; }
  finally { phoneLoading.value = false; }
}
function date(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'; }
function money(value: number) { return (value / 100).toFixed(2); }
function goBack() { if (window.history.length > 1) window.history.back(); else navigateTo('/users'); }
watch(id, () => { data.value = null; fullPhone.value = null; page.value = 1; void load(); }, { immediate: true });
</script>
<style scoped>
.section-heading, .record-head, .record-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.section-heading { margin: 24px 0 12px; justify-content: space-between; }
.registration-list { display: grid; gap: 16px; }
.registration-item { background: #fff; border: 1px solid #dce3e8; border-radius: 8px; padding: 20px; }
.record-head { justify-content: space-between; }
h4 { margin: 0; font-size: 18px; line-height: 1.5; overflow-wrap: anywhere; }
dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; }
dl > div { display: flex; gap: 12px; min-width: 0; }
dt { flex: 0 0 84px; color: #627078; }
dd { margin: 0; overflow-wrap: anywhere; }
.record-actions { padding-top: 8px; }
.el-pagination { margin-top: 20px; }
@media (max-width: 640px) { dl { grid-template-columns: minmax(0, 1fr); } .registration-item { padding: 16px; } }
</style>
