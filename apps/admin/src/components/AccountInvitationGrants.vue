<template>
  <section class="invitation-grants" aria-label="邀请函授权">
    <div class="grant-heading"><strong>邀请函权限范围</strong><el-tag size="small" type="info" effect="plain">{{ unrestricted ? '全部邀请函' : `已选 ${modelValue.length} 场` }}</el-tag></div>
    <p class="grant-help">单独指定可操作的邀请函，支持小程序会议和外部会议。具体编辑、发布及生成权限由角色决定。</p>
    <el-alert v-if="unrestricted" title="当前角色拥有全部邀请函管理权限，此列表不限制其范围。如需限定场次，请移除角色中的“管理全部邀请会议及人员授权”权限。" type="warning" :closable="false" show-icon />
    <el-alert v-else-if="!available" title="未读取到原有邀请函授权，本次保存将保留原授权。请刷新页面后重试。" type="warning" :closable="false" show-icon />
    <template v-else>
      <el-select :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" multiple filterable clearable collapse-tags collapse-tags-tooltip :max-collapse-tags="3"
        aria-label="授权邀请函" placeholder="搜索并选择邀请函" :loading="loading" :disabled="loading || !!error" no-data-text="暂无邀请函，请先创建会议邀请函">
        <el-option-group v-for="group in groups" :key="group.label" :label="group.label">
          <el-option v-for="item in group.items" :key="item.id" :value="item.id" :label="item.title" :disabled="item.unavailable">
            <span class="grant-option">{{ item.title }}<small>{{ item.id.slice(-6) }}</small></span>
          </el-option>
        </el-option-group>
      </el-select>
      <div v-if="error" class="grant-error"><span role="alert">{{ error }}</span><el-button size="small" @click="load">重试</el-button></div>
      <p v-else-if="!loading" class="grant-footnote">共 {{ choices.length }} 场可授权邀请函。{{ modelValue.length ? '保存后生效，取消勾选即可撤销授权。' : '未选择时，该账号不能访问任何邀请函。' }}</p>
      <el-alert v-if="!canView" title="该账号的角色尚无邀请函查看权限。可在上方添加“邀请函编辑人员”角色，或到角色管理配置具体权限。" type="info" :closable="false" show-icon />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { listAccountInvitationOptions } from "../services/admin";
import type { InvitationGrantOption } from "../services/types";

const props = defineProps<{ modelValue: string[]; existing: InvitationGrantOption[]; available: boolean; unrestricted: boolean; canView: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]]; ready: [value: boolean] }>();
const choices = ref<InvitationGrantOption[]>([]);
const loading = ref(false);
const error = ref("");
let request = 0;
const groups = computed(() => {
  const items = choices.value.map(item => ({ ...item, unavailable: false }));
  const known = new Set(items.map(item => item.id));
  for (const id of props.modelValue) if (!known.has(id)) {
    const original = props.existing.find(item => item.id === id);
    items.push({ id, title: `${original?.title || id}（当前不可选）`, conferenceId: original?.conferenceId ?? null, unavailable: true });
  }
  return [
    { label: '小程序会议邀请函', items: items.filter(item => item.conferenceId) },
    { label: '外部会议邀请函', items: items.filter(item => !item.conferenceId) }
  ].filter(group => group.items.length);
});
onMounted(() => void load());
onBeforeUnmount(() => request++);
async function load() {
  const current = ++request;
  loading.value = true;
  error.value = "";
  emit('ready', false);
  try {
    const result = await listAccountInvitationOptions();
    if (current !== request) return;
    choices.value = result.items;
    emit('ready', true);
  } catch (cause) {
    if (current === request) error.value = cause instanceof Error ? cause.message : '邀请函列表加载失败，请重试';
  } finally { if (current === request) loading.value = false; }
}
</script>

<style scoped>
.invitation-grants { padding: 18px; border: 1px solid var(--el-border-color-lighter); border-radius: 12px; background: var(--el-fill-color-extra-light); margin: 6px 0 22px; }
.grant-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.grant-help, .grant-footnote { font-size: 13px; line-height: 1.7; color: var(--el-text-color-secondary); margin: 10px 0; }
.invitation-grants .el-select { width: 100%; }
.grant-option { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.grant-option small { color: var(--el-text-color-placeholder); }
.grant-error { display: flex; align-items: center; gap: 10px; margin-top: 12px; color: var(--el-color-danger); font-size: 13px; }
@media (max-width: 480px) { .invitation-grants { padding: 14px; } }
</style>
