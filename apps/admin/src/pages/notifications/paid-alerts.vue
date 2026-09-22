<template>
  <section class="admin-page">
    <AdminPageHeader title="管理员缴费提醒" eyebrow="通知中心"><template #actions><el-button @click="load">刷新</el-button></template></AdminPageHeader>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="config">
      <el-alert :type="config.workerEnabled && config.adminUrlConfigured ? 'success' : 'warning'" :title="config.workerEnabled && config.adminUrlConfigured ? '发送服务已启用；仅向下方已启用接收人发送新缴费提醒' : '发送服务尚未启用或缺少工作台地址，当前不会发送提醒'" :closable="false" />
      <el-form label-position="top" class="alert-form">
        <el-form-item label="管理员账号"><el-select v-model="form.adminUserId"><el-option v-for="a in config.admins" :key="a.id" :value="a.id" :label="a.displayName || a.username" /></el-select></el-form-item>
        <el-form-item label="企业微信自建应用"><el-select v-model="form.integrationId"><el-option v-for="i in config.integrations" :key="i.id" :value="i.id" :label="i.name" /></el-select></el-form-item>
        <el-form-item label="该管理员的企业微信成员 UserID"><el-input v-model="form.wecomUserId" maxlength="64" /></el-form-item>
        <el-form-item label="接收新报名缴费提醒"><el-switch v-model="form.enabled" /></el-form-item>
        <el-button v-if="canEdit" type="primary" :loading="saving" @click="save">保存接收设置</el-button>
      </el-form>
      <h3>接收人</h3>
      <el-table :data="config.recipients"><AdminTableIndex /><el-table-column label="管理员"><template #default="{ row }">{{ config.admins.find(a => a.id === row.adminUserId)?.displayName || config.admins.find(a => a.id === row.adminUserId)?.username || row.adminUserId }}</template></el-table-column><el-table-column prop="wecomUserId" label="企业微信 UserID" /><el-table-column label="状态"><template #default="{ row }">{{ row.enabled ? '已开启' : '已关闭' }}</template></el-table-column><el-table-column label="操作"><template #default="{ row }"><el-button @click="Object.assign(form, row)">编辑</el-button></template></el-table-column></el-table>
      <h3>最近发送记录</h3>
      <el-table :data="config.deliveries"><AdminTableIndex /><el-table-column label="报名"><template #default="{ row }"><el-button link @click="navigateTo('/registrations/detail', { id: row.registrationId })">查看报名</el-button></template></el-table-column><el-table-column label="状态"><template #default="{ row }">{{ statuses[row.status] || row.status }}</template></el-table-column><el-table-column prop="attempts" label="尝试次数" /><el-table-column prop="lastError" label="结果" /><el-table-column prop="sentAt" label="发送时间" /></el-table>
      <el-alert v-if="config.deliveries.some(item => item.status === 'REVIEW')" title="存在待人工核实的投递，自动重试已停止。请核实企业微信收件情况，避免重复通知。" type="warning" :closable="false" />
    </template>
  </section>
</template>
<script setup lang="ts">
import AdminTableIndex from "../../components/AdminTableIndex.vue";
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import { apiRequest } from "../../services/api";
import { useAdminSession } from "../../stores/admin-session";
import { navigateTo } from "../../router";
interface Recipient { id?: string; adminUserId: string; integrationId: string; wecomUserId: string; enabled: boolean }
interface Config { workerEnabled: boolean; adminUrlConfigured: boolean; recipients: Recipient[]; integrations: { id: string; name: string }[]; admins: { id: string; username: string; displayName: string | null }[]; deliveries: { id: string; registrationId: string; status: string; attempts: number; lastError: string | null; sentAt: string | null }[] }
const config = ref<Config>(); const error = ref(""); const saving = ref(false); const form = reactive<Recipient>({ adminUserId: "", integrationId: "", wecomUserId: "", enabled: false });
const { hasPermission } = useAdminSession(); const canEdit = computed(() => ["system:account", "notification:write", "wecom:send", "registration:view"].every(hasPermission));
const statuses: Record<string, string> = { PENDING: "等待发送", SENDING: "发送中", SENT: "已发送", CANCELLED: "已停止", REVIEW: "待人工核实" };
async function load() { try { config.value = await apiRequest<Config>("/admin/paid-alerts"); error.value = ""; } catch(e) { error.value = e instanceof Error ? e.message : "加载失败"; } }
async function save() {
  if (form.enabled) { try { await ElMessageBox.confirm("确认此企微 UserID 属于所选管理员，且允许其接收新缴费嘉宾信息？不会补发历史报名。", "启用提醒"); } catch { return; } }
  saving.value = true;
  try { await apiRequest("/admin/paid-alerts", { method: "PUT", body: JSON.stringify(form) }); await load(); ElMessage.success("接收设置已保存"); } catch(e) { ElMessage.error(e instanceof Error ? e.message : "保存失败"); } finally { saving.value = false; }
}
onMounted(load);
</script>
<style scoped>.alert-form { max-width: 600px; padding: 24px 0; }.alert-form :deep(.el-select) { width: 100%; }</style>
