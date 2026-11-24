<template>
  <div class="j-tools">
    <el-radio-group v-model="section">
      <el-radio-button v-for="k in sections" :key="k" :value="k">
        {{ spec[k].label }} {{ config[k].length }}
      </el-radio-button>
    </el-radio-group>
  </div>
  <div class="j-tools">
    <el-input v-model="search" placeholder="按编号、姓名或机构搜索" clearable style="width: 235px" />
    <el-button @click="rosterTemplate(config)">下载名单模板</el-button>
    <template v-if="editable">
      <RegistrationSource
        v-if="section === 'judges' && hasPermission('registration:export')"
        :event-id="id"
        :config="config"
      />
      <el-button @click="file?.click()">导入 Excel / CSV</el-button>
      <el-button type="primary" plain @click="edit()">添加{{ spec[section].label }}</el-button>
      <el-button v-if="section === 'sessions'" @click="arrange">按抽签顺序排场</el-button>
      <el-button v-if="rehearsal && !config.teachers.length" @click="demo">载入单室联排样本</el-button>
    </template>
  </div>
  <input ref="file" hidden type="file" accept=".xlsx,.xls,.csv,.tsv" @change="read" />
  <el-table :data="filtered" max-height="480" empty-text="尚无记录，可手工添加或导入名单">
    <el-table-column
      v-for="f in visible"
      :key="f.key"
      :label="f.label"
      :min-width="f.key === 'topic' ? 160 : 94"
      show-overflow-tooltip
    >
      <template #default="{ row }">{{ displayField(f, row[f.key], config) }}</template>
    </el-table-column>
    <el-table-column v-if="editable" label="操作" fixed="right" width="107">
      <template #default="{ row }">
        <el-button link type="primary" @click="edit(row)">编辑</el-button>
        <el-button link type="danger" @click="remove(row)">移除</el-button>
      </template>
    </el-table-column>
  </el-table>
  <el-dialog
    v-model="editing"
    :title="(original ? '编辑' : '添加') + spec[section].label"
    width="min(640px,94vw)"
    append-to-body
  >
    <el-form label-position="top">
      <div class="j-pair">
        <el-form-item v-for="f in spec[section].fields" :key="f.key" :label="f.label">
          <el-input-number
            v-if="f.kind === 'num' || f.kind === 'optionalNum'"
            v-model="row[f.key]"
            :min="0"
            :value-on-clear="null"
          />
          <el-select
            v-else-if="f.kind === 'role' || f.kind === 'stage' || f.kind === 'room' || f.kind === 'teacher'"
            v-model="row[f.key]"
            clearable
            filterable
          >
            <el-option v-for="o in options(f)" :key="o.id" :value="o.id" :label="o.name" />
          </el-select>
          <ImageField v-else-if="f.kind === 'image'" v-model="row[f.key]" />
          <el-input v-else v-model="row[f.key]" :disabled="!!original && f.key === 'id'" />
        </el-form-item>
      </div>
    </el-form>
    <template #footer>
      <el-button @click="editing = false">取消</el-button>
      <el-button type="primary" @click="apply">应用到草稿</el-button>
    </template>
  </el-dialog>
  <el-dialog v-model="importing" title="导入预览" width="min(680px,94vw)" append-to-body>
    <template v-if="preview">
      <p>按编号合并到当前草稿。相同编号的输入列将更新。</p>
      <p v-for="c in preview.changes" :key="c.name">{{ c.name }} · {{ c.count }} 行</p>
      <p v-for="m in preview.messages" :key="m">{{ m }}</p>
      <el-table :data="preview.sample" max-height="230">
        <el-table-column prop="id" label="编号" />
        <el-table-column prop="name" label="名称或教师编号" />
      </el-table>
    </template>
    <template #footer>
      <el-button @click="importing = false">取消</el-button>
      <el-button type="primary" @click="accept">应用预览到草稿</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { roleLabels, type JudgingConfig } from "@conference/shared";
import { judgingApi } from "../../services/judging";
import ImageField from "./ImageField.vue";
import {
  spec,
  sections,
  emptyRow,
  displayField,
  prepareImport,
  rosterTemplate,
  rehearsalRoster,
  schedule,
  type Section,
  type Field,
  type Row
} from "./roster";
import RegistrationSource from "./RegistrationSource.vue";
import { useAdminSession } from "../../stores/admin-session";
const { hasPermission } = useAdminSession();
const props = defineProps<{ config: JudgingConfig; id: string; editable: boolean; rehearsal: boolean }>();
const section = ref<Section>("teachers"),
  search = ref(""),
  row = ref<Row>({}),
  original = ref(""),
  editing = ref(false),
  file = ref<HTMLInputElement>(),
  importing = ref(false);
const preview = ref<{
  next: JudgingConfig;
  changes: { name: string; count: number }[];
  messages: string[];
  sample: { id: string; name: string }[];
} | null>(null);
const filtered = computed(() =>
    (props.config[section.value] as Row[]).filter((o) => Object.values(o).join(" ").includes(search.value))
  ),
  visible = computed(() => spec[section.value].fields.filter((f) => f.kind !== "image").slice(0, 8));
function edit(current?: Row) {
  original.value = current?.id || "";
  row.value = { ...emptyRow(section.value), ...current };
  editing.value = true;
}
function options(f: Field) {
  if (f.kind === "role") return Object.entries(roleLabels).map(([id, name]) => ({ id, name }));
  if (f.kind === "stage")
    return [
      { id: "class", name: "课堂" },
      { id: "ted", name: "TED" }
    ];
  return f.kind === "room" ? props.config.rooms : props.config.teachers;
}
function apply() {
  const rows = props.config[section.value] as Row[],
    r = { ...row.value };
  if (!r.id || (!original.value && rows.some((x) => x.id === r.id))) {
    ElMessage.warning("请使用唯一编号");
    return;
  }
  if (original.value)
    rows.splice(
      rows.findIndex((x) => x.id === original.value),
      1,
      r
    );
  else rows.push(r);
  editing.value = false;
}
async function remove(r: Row) {
  try {
    await ElMessageBox.confirm("从当前草稿移除 " + r.id + "？", "移除记录");
    const a = props.config[section.value] as Row[];
    a.splice(
      a.findIndex((x) => x.id === r.id),
      1
    );
  } catch {}
}
async function arrange() {
  try {
    if (props.config.sessions.length)
      await ElMessageBox.confirm("将按当前选手顺序覆盖草稿排场。", "重新排场");
    props.config.sessions = schedule(props.config);
    ElMessage.success("已生成课堂和 TED 场次，请核对抽签结果");
  } catch (e) {
    if (e instanceof Error) ElMessage.error(e.message);
  }
}
function demo() {
  const c = rehearsalRoster();
  for (const k of sections) Object.assign(props.config, { [k]: c[k] });
}
async function read(ev: Event) {
  const inp = ev.target as HTMLInputElement,
    f = inp.files?.[0];
  if (!f) return;
  try {
    const p = await prepareImport(f, props.config, section.value);
    const check = await judgingApi.validate(props.id, p.next);
    const changed = sections.filter((k) => p.changes.some((x) => x.name === spec[k].label));
    preview.value = {
      ...p,
      messages: [...check.warnings, ...(check.readiness ? [check.readiness] : [])],
      sample: changed
        .flatMap((k) => (p.next[k] as Row[]).map((x) => ({ id: x.id, name: x.name || x.teacher || x.id })))
        .slice(0, 60)
    };
    importing.value = true;
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    inp.value = "";
  }
}
function accept() {
  if (preview.value) for (const k of sections) Object.assign(props.config, { [k]: preview.value.next[k] });
  importing.value = false;
}
</script>
