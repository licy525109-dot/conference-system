<template>
  <el-dialog :model-value="modelValue" :title="canEdit ? '编辑下单账号' : '下单账号资料'" width="min(560px, 94vw)" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @update:model-value="close">
    <el-skeleton v-if="loading" :rows="4" animated />
    <el-alert v-else-if="loadError" :title="loadError" type="error" :closable="false" />
    <el-form v-else-if="account" label-position="top" @submit.prevent="save">
      <div class="account-context">账号编号：{{ account.id }}</div>
      <el-form-item label="本人姓名"><el-input v-model="form.realName" :disabled="!canEdit || saving" maxlength="80" /></el-form-item>
      <el-form-item label="账号昵称"><el-input v-model="form.nickname" :disabled="!canEdit || saving" maxlength="80" /></el-form-item>
      <div class="account-phone">当前手机号：{{ fullPhone ?? account.phone ?? '未绑定' }}
        <el-button v-if="account.phone && fullPhone === null && hasPermission('member:phone:view')" link :loading="phoneLoading" @click="reveal">查看完整号码</el-button>
      </div>
      <el-form-item v-if="canEdit" label="更换手机号"><el-input v-model="form.phone" :disabled="saving || form.clearPhone" maxlength="30" placeholder="留空保留当前手机号" /></el-form-item>
      <el-checkbox v-if="canEdit && account.phone" v-model="form.clearPhone" :disabled="saving">清空当前手机号</el-checkbox>
      <p v-if="canEdit" class="account-note">仅修改下单账号资料，不改变实际参会人、订单归属或报名表单。修改手机号后需由用户重新验证。</p>
      <el-alert v-if="saveError" :title="saveError" type="error" :closable="false" />
    </el-form>
    <template #footer>
      <el-button v-if="loadError" @click="load">重试</el-button>
      <el-button :disabled="saving" @click="close(false)">关闭</el-button>
      <el-button v-if="canEdit" type="primary" :disabled="!account || loading" :loading="saving" @click="save">保存资料</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { getUserActivity, type UserActivity } from '../services/user-activity';
import { revealUserPhone, updateUser } from '../services/admin';
import { useAdminSession } from '../stores/admin-session';
const props = defineProps<{ modelValue: boolean; userId: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [userId: string] }>();
const { hasPermission } = useAdminSession();
const canEdit = computed(() => hasPermission('member:write'));
const account = ref<UserActivity['user'] | null>(null);
const loading = ref(false), saving = ref(false), phoneLoading = ref(false);
const loadError = ref(''), saveError = ref(''), fullPhone = ref<string | null>(null);
const form = reactive({ realName: '', nickname: '', phone: '', clearPhone: false });
let version = 0;
async function load() {
  const current = ++version, id = props.userId;
  account.value = null; loadError.value = ''; saveError.value = ''; fullPhone.value = null;
  if (!props.modelValue || !id) return;
  loading.value = true;
  try {
    const data = await getUserActivity(id);
    if (current !== version) return;
    account.value = data.user;
    Object.assign(form, { realName: data.user.realName || '', nickname: data.user.nickname || '', phone: '', clearPhone: false });
  } catch (e) { if (current === version) loadError.value = message(e, '账号资料加载失败'); }
  finally { if (current === version) loading.value = false; }
}
async function reveal() {
  const current = version;
  phoneLoading.value = true;
  try { const data = await revealUserPhone(props.userId); if (version === current) fullPhone.value = data.phone ?? ''; }
  catch (e) { if (version === current) saveError.value = message(e, '读取手机号失败'); }
  finally { phoneLoading.value = false; }
}
async function save() {
  if (!account.value || saving.value || !canEdit.value) return;
  const user = account.value;
  const input: { realName?: string | null; nickname?: string | null; phone?: string | null } = {};
  if (form.realName.trim() !== (user.realName || '')) input.realName = form.realName.trim() || null;
  if (form.nickname.trim() !== (user.nickname || '')) input.nickname = form.nickname.trim() || null;
  if (form.clearPhone) input.phone = null;
  else if (form.phone.trim()) input.phone = form.phone.trim();
  if (!Object.keys(input).length) { close(false); return; }
  saving.value = true; saveError.value = '';
  try { await updateUser(user.id, input); emit('saved', user.id); emit('update:modelValue', false); ElMessage.success('账号资料已更新'); }
  catch (e) { saveError.value = message(e, '保存失败，请重试'); }
  finally { saving.value = false; }
}
function close(value: boolean) { if (!saving.value) emit('update:modelValue', value); }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
watch(() => [props.modelValue, props.userId], load, { immediate: true });
</script>
<style scoped>
.account-context, .account-phone, .account-note { color: var(--admin-color-text-secondary, #606773); font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; margin: 0 0 16px; }
.account-phone { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.account-note { margin-top: 16px; }
</style>
