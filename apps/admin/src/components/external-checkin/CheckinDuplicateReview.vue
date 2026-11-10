<template>
  <section v-if="plan.duplicates.length" class="duplicate-review" aria-label="重复记录对比">
    <div class="review-heading">
      <div><h3>有差异的重复记录 · {{ plan.duplicates.length }} 组</h3><p>按核验字段分组，每组保留一条或删除本次导入记录。确认提交前不会修改名单。</p></div>
      <el-checkbox v-model="pendingOnly" :disabled="busy" @change="groupPage = 1">只看待处理（{{ plan.unresolved }}）</el-checkbox>
    </div>
    <el-empty v-if="!filteredGroups.length" description="所有重复组均已处理" :image-size="56" />
    <article v-for="group in visibleGroups" :key="group.id" class="duplicate-group" :class="{ resolved: group.resolved }">
      <header class="group-heading">
        <div><h4>重复组 {{ groupNumbers.get(group.id) }} <el-tag size="small" :type="group.resolved ? 'success' : 'warning'">{{ group.resolved ? '已处理' : '待处理' }}</el-tag></h4>
          <p class="matching-values"><span v-for="field in matchingFields" :key="field.key">{{ field.label }}：<strong>{{ group.matchValues[field.key] }}</strong></span></p>
        </div>
        <span class="difference-summary">{{ group.differingFields.length ? `差异列：${fields.filter(field => group.differingFields.includes(field.key)).map(field => field.label).join('、')}` : '全部字段内容相同' }}</span>
      </header>
      <el-table :data="visibleCandidates(group)" border :row-class-name="candidateRowClass(group)">
        <el-table-column label="记录来源" width="176" fixed>
          <template #default="{ row }">
            <strong class="source-label">{{ sourceLabel(row) }}</strong>
            <template v-if="row.source === 'existing'"><el-tag size="small" :type="row.checkedInAt ? 'success' : 'info'">{{ row.checkedInAt ? '已签到' : '未签到' }}</el-tag><time v-if="row.checkedInAt">{{ formatTime(row.checkedInAt) }}</time></template>
            <small v-else>{{ isDiscarded(group.id, row.id) ? '已删除，确认后不导入' : hasExisting(group) ? '保留本条时更新已有资料' : '本次待录入' }}</small>
          </template>
        </el-table-column>
        <el-table-column v-for="field in fields" :key="field.key" :min-width="160" :class-name="group.differingFields.includes(field.key) ? 'different-column' : ''">
          <template #header><div class="column-heading"><strong>{{ field.label }}</strong><el-tag v-if="field.match" size="small" type="info">核验</el-tag><el-tag v-if="group.differingFields.includes(field.key)" size="small" type="warning">差异</el-tag></div><small v-if="sourceColumns?.[field.key] && sourceColumns[field.key] !== field.label" class="mapped-column">文件列：{{ sourceColumns[field.key] }}</small></template>
          <template #default="{ row }"><span class="candidate-value">{{ row.values[field.key] || '—' }}</span></template>
        </el-table-column>
        <el-table-column label="保留 / 删除" width="198" fixed="right"><template #default="{ row }"><div class="candidate-actions"><el-button :type="row.id === group.selectedCandidateId ? 'success' : 'primary'" :plain="row.id !== group.selectedCandidateId" :disabled="busy || row.id === group.selectedCandidateId || isDiscarded(group.id, row.id)" :aria-label="`重复组 ${groupNumbers.get(group.id)}：保留${sourceLabel(row)}`" @click="$emit('select', group.id, row.id)">{{ row.id === group.selectedCandidateId ? '已选择保留' : '保留这条' }}</el-button><el-button v-if="row.source === 'incoming'" link :type="isDiscarded(group.id, row.id) ? 'primary' : 'danger'" :disabled="busy" :aria-label="`重复组 ${groupNumbers.get(group.id)}：${isDiscarded(group.id, row.id) ? '恢复' : '删除'}${sourceLabel(row)}`" @click="$emit('discard', group.id, row.id)">{{ isDiscarded(group.id, row.id) ? '恢复' : '删除' }}</el-button></div></template></el-table-column>
      </el-table>
      <el-pagination v-if="incomingCandidates(group).length > candidatePageSize" :current-page="candidatePages[group.id] || 1" :page-size="candidatePageSize" :total="incomingCandidates(group).length" layout="total, prev, pager, next" @current-change="candidatePages[group.id] = $event" />
      <div class="group-footer"><p v-if="group.selectedCandidateId">已选择：<strong>{{ sourceLabel(group.candidates.find(candidate => candidate.id === group.selectedCandidateId)!) }}</strong><el-button link :disabled="busy" @click="$emit('select', group.id, null)">撤销选择</el-button></p><p v-else-if="group.resolved">本组导入记录已全部删除，确认后不新增名单。</p><p v-else>请选择保留的记录，或删除不需要导入的记录。</p><el-button link type="danger" :disabled="busy || incomingCandidates(group).every(candidate => isDiscarded(group.id, candidate.id))" :aria-label="`重复组 ${groupNumbers.get(group.id)}：删除本组导入记录`" @click="$emit('discard-group', group.id)">删除本组导入记录</el-button><small v-if="hasExisting(group)">已有签到状态、首次签到时间及现场填写资料都会保留。</small></div>
    </article>
    <el-pagination v-if="filteredGroups.length > groupPageSize" v-model:current-page="groupPage" :page-size="groupPageSize" :total="filteredGroups.length" layout="total, prev, pager, next" />
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { ExternalCheckinDuplicateGroup, ExternalCheckinField, ExternalCheckinImportCandidate, ExternalCheckinImportPlan } from "@conference/shared";
const props = defineProps<{ plan: ExternalCheckinImportPlan; fields: ExternalCheckinField[]; mode: "file" | "manual"; busy: boolean; sourceColumns?: Record<string, string>; discarded: Record<string, string[]> }>();
defineEmits<{ (event: "select", groupId: string, candidateId: string | null): void; (event: "discard", groupId: string, candidateId: string): void; (event: "discard-group", groupId: string): void }>();
const pendingOnly = ref(false), groupPage = ref(1), candidatePages = reactive<Record<string, number>>({});
const groupPageSize = 5, candidatePageSize = 8;
const matchingFields = computed(() => props.fields.filter(field => field.match));
const groupNumbers = computed(() => new Map(props.plan.duplicates.map((group, index) => [group.id, index + 1])));
const filteredGroups = computed(() => props.plan.duplicates.filter(group => !pendingOnly.value || !group.resolved));
const visibleGroups = computed(() => filteredGroups.value.slice((groupPage.value - 1) * groupPageSize, groupPage.value * groupPageSize));
watch(() => filteredGroups.value.length, length => { groupPage.value = Math.min(groupPage.value, Math.max(1, Math.ceil(length / groupPageSize))); });
const incomingCandidates = (group: ExternalCheckinDuplicateGroup) => group.candidates.filter(candidate => candidate.source === "incoming");
const hasExisting = (group: ExternalCheckinDuplicateGroup) => group.candidates.some(candidate => candidate.source === "existing");
const isDiscarded = (groupId: string, candidateId: string) => props.discarded[groupId]?.includes(candidateId) || false;
const candidateRowClass = (group: ExternalCheckinDuplicateGroup) => ({ row }: { row: ExternalCheckinImportCandidate }) => isDiscarded(group.id, row.id) ? "discarded-row" : row.id === group.selectedCandidateId ? "kept-row" : "";
function visibleCandidates(group: ExternalCheckinDuplicateGroup) {
  const start = ((candidatePages[group.id] || 1) - 1) * candidatePageSize;
  const page = incomingCandidates(group).slice(start, start + candidatePageSize);
  const selected = group.candidates.find(candidate => candidate.id === group.selectedCandidateId && candidate.source === "incoming");
  return [...group.candidates.filter(candidate => candidate.source === "existing"), ...page, ...(selected && !page.some(candidate => candidate.id === selected.id) ? [selected] : [])];
}
const sourceLabel = (candidate: ExternalCheckinImportCandidate) => candidate.source === "existing" ? "已有名单" : props.mode === "manual" ? "本次填写" : `文件第 ${candidate.row} 行`;
const formatTime = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "medium", hour12: false }).format(new Date(value));
</script>

<style scoped>
.candidate-actions{display:flex;align-items:center;gap:12px}.candidate-actions .el-button+.el-button{margin-left:0}.duplicate-review :deep(.discarded-row .candidate-value){text-decoration:line-through;opacity:.55}
.duplicate-review{margin-top:24px}.review-heading,.group-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.review-heading h3{margin:0;font-size:17px}.review-heading p,.group-footer p{font-size:13px;line-height:1.8;color:#5d7066;margin:8px 0}.duplicate-group{margin-top:18px;border:1px solid #dce4de;border-radius:8px;padding:18px;background:#fff}.duplicate-group.resolved{border-color:#a4c5af}.group-heading{margin-bottom:14px}.group-heading h4{font-size:15px;margin:0 0 9px}.group-heading h4 .el-tag{margin-left:8px}.matching-values{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0;font-size:13px;line-height:1.7;overflow-wrap:anywhere}.matching-values strong{font-weight:500}.difference-summary{font-size:12px;line-height:1.8;color:#8a6225;max-width:45%;overflow-wrap:anywhere}.column-heading{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.mapped-column{display:block;font-size:11px;font-weight:400;color:#657369;line-height:1.6}.candidate-value{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}.source-label{display:block;font-size:13px;margin:0 0 6px}.source-label~small,time{display:block;font-size:11px;line-height:1.7;color:#617069;margin-top:5px}.group-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:8px}.group-footer small{font-size:12px;line-height:1.7;color:#617069}.group-footer .el-button{margin-left:14px}.group-footer strong{color:#315640}.duplicate-review :deep(.different-column){background:#fff8e8}.duplicate-review :deep(.kept-row){--el-table-tr-bg-color:#eff8f1}.duplicate-review :deep(.kept-row .different-column){background:#e6f3e8}.duplicate-review :deep(.el-table .cell){line-height:1.7}.el-pagination{margin-top:14px;max-width:100%;overflow:auto}@media(max-width:700px){.review-heading,.group-heading{flex-direction:column;gap:8px}.duplicate-group{padding:12px}.difference-summary{max-width:100%}}
</style>
