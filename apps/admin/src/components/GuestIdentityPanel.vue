<template>
  <section class="identity-panel">
    <h3>账号与参会归属</h3>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <template v-if="data">
      <p>原始下单账号：<el-button v-if="data.order.userId" link type="primary" @click="openUser(data.order.userId)">{{ data.order.userId }}</el-button><span v-else>无账号（后台添加）</span></p>
      <p>业务联系人：<el-button v-if="data.order.businessOwnerUserId" link type="primary" @click="openUser(data.order.businessOwnerUserId)">{{ data.order.businessOwnerUserId }}</el-button><span v-else>未单独指定</span><el-button v-if="canEdit" link @click="openEditor(null, 'owner')">调整</el-button></p>
      <div v-for="(attendee, index) in data.attendees" :key="attendee.id" class="attendee-row">
        <span class="admin-record-index">序号 {{ index + 1 }}</span>
        <strong>{{ attendee.name }} · {{ attendee.phone }}</strong>
        <span>实际参会账号：<el-button v-if="attendee.guestProfile?.userId" link type="primary" @click="openUser(attendee.guestProfile.userId)">{{ attendee.guestProfile.userId }}</el-button><template v-else>待认领</template></span>
        <div v-if="canEdit" class="actions">
          <el-button @click="openEditor(attendee, 'bind')">关联账号</el-button>
          <el-button @click="openEditor(attendee, 'invite')">生成专属邀请</el-button>
          <el-button @click="openEditor(attendee, 'replace')">更换参会人</el-button>
          <el-button v-if="attendee.guestProfile?.userId" type="danger" plain @click="openEditor(attendee, 'unbind')">解除关联</el-button>
        </div>
      </div>
      <el-collapse>
        <el-collapse-item title="报名前实际提交的信息（原始快照）">
          <div v-for="(entry, index) in originalForms" :key="index" class="original-form">
            <h4>参会人 {{ index + 1 }}</h4>
            <dl><template v-for="field in entry" :key="field.key"><dt>{{ field.label }}</dt><dd>{{ field.value }}</dd></template></dl>
          </div>
        </el-collapse-item>
      </el-collapse>
    </template>
    <el-dialog v-model="visible" :title="titles[action]" width="min(600px, 94vw)">
      <el-alert title="原始付款与退款归属保持不变。更换参会人将停用旧凭证并归档旧会务安排。" type="warning" :closable="false" />
      <el-alert v-if="action === 'invite' && selected?.guestProfile?.userId" title="此参会人已有绑定账号。生成新邀请将解除原账号关联并停用旧签到凭证，请确认确需重新邀请本人。" type="warning" :closable="false" class="editor" />
      <el-form label-position="top" class="editor">
        <el-form-item v-if="action === 'bind' || action === 'owner'" label="选择账号（姓名 / 手机 / 报名号）">
          <el-select v-model="userId" filterable remote :remote-method="search" :loading="searching" style="width:100%">
            <el-option v-for="user in users" :key="user.id" :value="user.id" :label="`${user.realName || user.wechatNickname || user.nickname || '未完善资料'} · ${user.phone || '未验证'} · ${user.id}`" />
          </el-select>
        </el-form-item>
        <template v-if="action === 'replace'"><el-form-item label="新参会人姓名"><el-input v-model="name" maxlength="80" /></el-form-item><el-form-item label="新参会人手机"><el-input v-model="phone" maxlength="11" /></el-form-item></template>
        <el-form-item label="核实依据 / 操作原因（必填）"><el-input v-model="reason" type="textarea" maxlength="200" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">确认保存</el-button></template>
    </el-dialog>
    <el-dialog v-model="claimVisible" title="专属参会邀请" width="min(600px, 94vw)" @closed="clearInvitation">
      <p>请私下发送给对应参会人，仅限本人验证相同手机号后确认参会，邀请有效期 24 小时。</p>
      <el-alert v-if="claimError" :title="claimError" type="warning" :closable="false" />
      <el-input v-if="claimUrl" :model-value="claimUrl" readonly aria-label="专属邀请链接" />
      <p v-if="claimExpiresAt">到期时间：{{ new Date(claimExpiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) }}</p>
      <template #footer>
        <el-button v-if="claimUrl" type="primary" :icon="CopyDocument" @click="copyInvitation">复制邀请链接</el-button>
        <el-button v-else type="primary" :loading="claimLoading" @click="generateLink">{{ claimError ? '重试生成链接' : '正在生成链接' }}</el-button>
      </template>
    </el-dialog>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { CopyDocument } from "@element-plus/icons-vue";
import { apiRequest } from "../services/api";
import { listUsers } from "../services/admin";
import type { AdminAppUser } from "../services/types";
import { navigateTo } from "../router";
import { useAdminSession } from "../stores/admin-session";
const props = defineProps<{ registrationId: string }>();
const emit = defineEmits<{ changed: [] }>();
type Attendee = { id: string; name: string; phone: string; updatedAt: string; guestProfile: { userId: string | null } | null };
type Identity = { order: { id: string; userId: string | null; businessOwnerUserId: string | null; submittedFormJson: Record<string, unknown>; registrationSnapshotJson: { fields?: Array<{ key: string; label: string }> } }; attendees: Attendee[] };
const data = ref<Identity>(); const error = ref(""); const saving = ref(false); const visible = ref(false);
const users = ref<AdminAppUser[]>([]); const searching = ref(false); const selected = ref<Attendee | null>(null);
const action = ref("bind"); const reason = ref(""); const userId = ref(""); const name = ref(""); const phone = ref("");
const claimToken = ref(""); const claimVisible = ref(false);
const claimUrl = ref(""); const claimError = ref(""); const claimLoading = ref(false); const claimExpiresAt = ref("");
let claimRequest = 0;
const titles: Record<string, string> = { bind: "关联实际参会账号", unbind: "解除参会账号关联", replace: "更换实际参会人", invite: "生成专属参会邀请", owner: "调整业务联系人" };
const { hasPermission } = useAdminSession();
const canEdit = computed(() => hasPermission("registration:write") && hasPermission("member:write"));
const originalForms = computed(() => {
  const snapshot = data.value?.order.submittedFormJson ?? {};
  const attendees = Array.isArray(snapshot.attendees) ? snapshot.attendees : [{ formData: snapshot }];
  const labels = new Map(data.value?.order.registrationSnapshotJson?.fields?.map(f => [f.key, f.label]));
  return attendees.map((a: any) => Object.entries(a.formData ?? a).map(([key, value]) => ({ key, label: labels.get(key) || key, value: typeof value === "object" ? JSON.stringify(value) : String(value ?? "") })));
});
async function load() { try { data.value = await apiRequest<Identity>(`/admin/guest-identities/registrations/${encodeURIComponent(props.registrationId)}`); error.value = ""; } catch(e) { error.value = e instanceof Error ? e.message : "归属加载失败"; } }
watch(() => props.registrationId, load, { immediate: true });
const openUser = (id: string) => navigateTo("/users/detail", { id });
function openEditor(attendee: Attendee | null, operation: string) { selected.value = attendee; action.value = operation; reason.value = ""; userId.value = ""; name.value = ""; phone.value = ""; users.value = []; visible.value = true; }
let searchVersion = 0;
async function search(keyword: string) {
  const v = ++searchVersion;
  if (!keyword.trim()) { users.value = []; searching.value = false; return; }
  searching.value = true;
  try { const result = await listUsers({ keyword, pageSize: 20 }); if (v === searchVersion) users.value = result.items; }
  catch (e) { if (v === searchVersion) { users.value = []; ElMessage.error(e instanceof Error ? e.message : "账号查询失败"); } }
  finally { if (v === searchVersion) searching.value = false; }
}
async function save() {
  if (!reason.value.trim() || (["bind", "owner"].includes(action.value) && !userId.value)) { ElMessage.warning("请填写目标账号与操作原因"); return; }
  saving.value = true;
  try {
    const path = action.value === "owner" ? `orders/${data.value!.order.id}/business-owner` : `attendees/${selected.value!.id}`;
    const result = await apiRequest<{ claimToken?: string }>(`/admin/guest-identities/${path}`, { method: "PATCH", body: JSON.stringify({ action: action.value, userId: userId.value, reason: reason.value, name: name.value, phone: phone.value, expectedUpdatedAt: selected.value?.updatedAt, expectedUserId: data.value!.order.businessOwnerUserId }) });
    visible.value = false; await load(); emit("changed");
    if (result.claimToken) { clearInvitation(); claimToken.value = result.claimToken; claimVisible.value = true; void generateLink(); }
    ElMessage.success("已保存，原付款记录保持不变");
  } catch(e) { ElMessage.error(e instanceof Error ? e.message : "保存失败"); } finally { saving.value = false; }
}
function clearInvitation() { claimRequest += 1; claimToken.value = ""; claimUrl.value = ""; claimExpiresAt.value = ""; claimError.value = ""; claimLoading.value = false; }
async function generateLink() {
  if (!claimToken.value || claimLoading.value) return;
  const request = ++claimRequest;
  claimLoading.value = true; claimError.value = "";
  try {
    const result = await apiRequest<{ url: string; expiresAt: string }>("/admin/guest-identities/claim-link", { method: "POST", body: JSON.stringify({ token: claimToken.value }) });
    if (request !== claimRequest) return;
    claimUrl.value = result.url; claimExpiresAt.value = result.expiresAt;
  } catch(e) { if (request === claimRequest) claimError.value = e instanceof Error ? e.message : "邀请链接生成失败，请重试"; }
  finally { if (request === claimRequest) claimLoading.value = false; }
}
async function copyInvitation() {
  try { await navigator.clipboard.writeText(claimUrl.value); ElMessage.success("邀请链接已复制，请私下发送给本人"); }
  catch { ElMessage.warning("无法自动复制，请选中上方邀请链接复制"); }
}
</script>
<style scoped>
.identity-panel { padding: 20px 0; border-top: 1px solid #dce3e8; min-width: 0; }
.attendee-row { display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid #dce3e8; padding: 16px 0; overflow-wrap: anywhere; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }.actions :deep(.el-button) { margin-left: 0; }
.editor { margin-top: 20px; } dl { display: grid; grid-template-columns: minmax(80px, 1fr) minmax(0, 3fr); gap: 12px; } dd { margin: 0; overflow-wrap: anywhere; }
</style>
