<template>
  <div class="j-tools">
    <el-radio-group v-model="section" aria-label="名单与排场">
      <el-radio-button v-for="k in sections" :key="k" :value="k">
        {{ k === "rooms" ? "教室与轮次" : spec[k].label }} {{ config[k].length }}
      </el-radio-button>
    </el-radio-group>
  </div>
  <div class="j-tools">
    <el-input
      v-if="config[section].length"
      v-model="search"
      :placeholder="'搜索' + spec[section].label"
      clearable
      style="width: 185px"
    />
    <el-button @click="rosterTemplate(config)">下载名单模板</el-button>
    <template v-if="editable">
      <RegistrationSource
        v-if="section === 'judges' && roles.length && hasPermission('registration:export')"
        :event-id="id"
        :config="config"
      />
      <el-button @click="file?.click()">导入 Excel / CSV</el-button>
      <el-button type="primary" plain :disabled="needsType" @click="edit()"
        >添加{{ spec[section].label }}</el-button
      >
      <el-button v-if="section === 'sessions'" @click="arrange">按选手顺序排场</el-button>
      <el-button v-if="rehearsal && !config.teachers.length" @click="demo">载入单室联排样本</el-button>
    </template>
  </div>
  <input ref="file" hidden type="file" accept=".xlsx,.xls,.csv,.tsv" @change="read" />
  <p v-if="section === 'rooms' || section === 'sessions'" class="j-note">
    共 <strong>{{ capacity }}</strong> 个课堂时段，已录入 {{ config.teachers.length }} 位选手。{{
      section === "rooms"
        ? "每间教室可以设置不同的课堂轮数。"
        : "排场会为每位选手安排一场课堂和一场 TED，空位可保留。"
    }}
  </p>
  <p v-else-if="needsType" class="j-note">请先在「评分表与规则」新增评委类型，再分配名单。</p>
  <p v-else-if="section === 'judges'" class="j-note">
    每位评委使用独立编号。姓名可以相同，请填写各自的机构，方便本人扫码后辨认。
  </p>
  <el-table :data="filtered" max-height="480" empty-text="尚无记录，可手工添加或导入名单">
    <el-table-column
      v-for="f in visible"
      :key="f.key"
      :label="f.label"
      :min-width="f.key === 'topic' ? 160 : 94"
      show-overflow-tooltip
    >
      <template #default="{ row }">
        <template v-if="f.key === 'rounds'">
          <el-input-number
            v-if="editable"
            :model-value="classroomRounds(row, config.sessions)"
            :aria-label="row.name + '课堂轮数'"
            :min="1"
            :max="250"
            :step-strictly="true"
            :value-on-clear="1"
            controls-position="right"
            size="small"
            style="width: 96px"
            @update:model-value="setRounds(row, $event)"
          />
          <span v-else>{{ classroomRounds(row, config.sessions) }}</span>
        </template>
        <template v-else>{{ displayField(f, row[f.key], config) }}</template>
      </template>
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
        <el-form-item
          v-for="f in spec[section].fields.filter((field) => !field.legacy)"
          :key="f.key"
          :label="f.label"
        >
          <el-input-number
            v-if="f.kind === 'num' || f.kind === 'optionalNum'"
            v-model="row[f.key]"
            :min="f.key === 'rounds' || f.key === 'round' ? 1 : 0"
            :max="f.key === 'rounds' || f.key === 'round' ? 250 : undefined"
            :step-strictly="f.key === 'rounds' || f.key === 'round'"
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
import { computed, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { classroomRounds, judgingRoles, type JudgingConfig, type JudgingRoom } from "@conference/shared";
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
const section = ref<Section>("rooms"),
  search = ref(""),
  row = ref<Row>({}),
  original = ref(""),
  editing = ref(false),
  file = ref<HTMLInputElement>(),
  importing = ref(false);
const roles = computed(() => judgingRoles(props.config));
function setRounds(room: JudgingRoom, value: number | null | undefined) {
  if (typeof value === "number") room.rounds = value;
}
const capacity = computed(() =>
  props.config.rooms.reduce((sum, room) => sum + classroomRounds(room, props.config.sessions), 0)
);
watch(section, () => {
  search.value = "";
});
const needsType = computed(() => section.value === "judges" && !roles.value.length);
const preview = ref<{
  next: JudgingConfig;
  changes: { name: string; count: number }[];
  messages: string[];
  sample: { id: string; name: string }[];
} | null>(null);
const filtered = computed(() =>
    (props.config[section.value] as Row[]).filter((o) => Object.values(o).join(" ").includes(search.value))
  ),
  visible = computed(() =>
    spec[section.value].fields.filter((f) => !f.legacy && f.kind !== "image").slice(0, 8)
  );
function edit(current?: Row) {
  original.value = current?.id || "";
  row.value = { ...emptyRow(section.value, props.config), ...current };
  if (section.value === "rooms") {
    if (current) row.value.rounds = classroomRounds(current as JudgingRoom, props.config.sessions);
    else {
      let number = props.config.rooms.length + 1;
      const used = new Set(props.config.rooms.map((r) => r.id));
      while (used.has("R" + number)) number++;
      const last = props.config.rooms.at(-1);
      Object.assign(row.value, {
        id: "R" + number,
        name: number + " 号教室",
        rounds: last ? classroomRounds(last, props.config.sessions) : 1,
        experience: last?.experience ?? 16,
        observer: last?.observer ?? 16
      });
    }
  }
  if (!current && section.value === "judges") {
    const used = new Set(props.config.judges.map((j) => j.id));
    let number = 1;
    while (used.has("J" + String(number).padStart(3, "0"))) number++;
    row.value.id = "J" + String(number).padStart(3, "0");
  }
  editing.value = true;
}
function options(f: Field) {
  if (f.kind === "role") return roles.value.map(({ id, label }) => ({ id, name: label }));
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
  if (section.value === "rooms" && (!Number.isInteger(r.rounds) || r.rounds < 1 || r.rounds > 250)) {
    ElMessage.warning("请填写 1 至 250 的整数轮数");
    return;
  }
  if (section.value === "judges" && !roles.value.some((option) => option.id === r.role)) {
    ElMessage.warning("请选择本赛事的评委类型");
    return;
  }
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
  if (
    section.value === "rooms" &&
    (props.config.sessions.some((s) => s.room === r.id) || props.config.judges.some((j) => j.room === r.id))
  ) {
    ElMessage.warning("请先将该教室的场次和评委移至其他教室，再移除教室");
    return;
  }
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
    const next = schedule(props.config);
    if (props.config.sessions.length)
      await ElMessageBox.confirm("将按当前选手顺序覆盖草稿排场。", "重新排场");
    props.config.sessions = next;
    ElMessage.success("已生成课堂和 TED 场次，请核对抽签结果");
  } catch (e) {
    if (e instanceof Error) ElMessage.error(e.message);
  }
}
function demo() {
  const c = rehearsalRoster(props.id, props.config);
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
