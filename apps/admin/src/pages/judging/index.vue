<template>
  <div class="judging-workspace" v-loading="loading">
    <header class="j-header">
      <div>
        <span class="j-eyebrow">会议管理</span>
        <h1>赛课评审</h1>
      </div>
      <div class="j-tools">
        <el-select
          :model-value="event?.id"
          :disabled="busy || loading"
          @change="select"
          placeholder="选择赛事"
          filterable
          style="width: 260px"
        >
          <el-option
            v-for="item in events"
            :key="item.id"
            :label="(item.rehearsal ? '内部 · ' : '') + item.title"
            :value="item.id"
          />
        </el-select>
        <el-button v-if="canManageEvents" type="primary" :disabled="busy" @click="openCreate">
          新建赛事
        </el-button>
        <el-button
          v-if="event && canManageEvents"
          type="danger"
          plain
          :disabled="busy || loading"
          @click="removeEvent"
        >
          删除赛事
        </el-button>
      </div>
    </header>
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
    <el-empty v-if="!event && !loading && !error" description="暂无获授权的赛事">
      <el-button v-if="canManageEvents" @click="openCreate">创建第一场赛事</el-button>
    </el-empty>
    <template v-if="event && draft">
      <section class="j-overview">
        <div>
          <div class="j-overline">
            <span class="j-mode">{{ phaseNames[event.phase] }}</span>
            <span v-if="event.rehearsal">仅内部使用</span>
          </div>
          <h2>{{ event.title }}</h2>
        </div>
        <div class="j-counts">
          <span>
            <strong>{{ event.config.teachers.length }}</strong>
            参赛教师
          </span>
          <span>
            <strong>{{ event.config.rooms.length }}</strong>
            教室
          </span>
          <span>
            <strong>{{ event.config.sessions.length }}</strong>
            评分场次
          </span>
        </div>
      </section>
      <nav class="j-stage-nav" aria-label="赛事操作">
        <button
          v-for="item in navigation"
          :key="item.tab"
          type="button"
          :aria-current="group === item.group ? 'page' : undefined"
          @click="tab = item.tab"
        >
          {{ item.label }}
        </button>
      </nav>
      <template v-if="tab === 'home'">
        <EntryCard
          v-if="can('judging:floor') || can('judging:config')"
          :event="event"
          :can-publish="can('judging:floor')"
          :can-design="can('judging:config')"
          @design="tab = 'look'"
          :busy="busy"
          :operate="operate"
        />
        <section v-if="nextStep" class="j-next-step">
          <div>
            <h3>{{ nextStep.title }}</h3>
            <p>{{ nextStep.detail }}</p>
          </div>
          <el-button @click="tab = nextStep.tab">{{ nextStep.button }}</el-button>
        </section>
      </template>
      <section v-else-if="tab === 'live' && can('judging:floor')" class="j-tabs">
        <h3>现场收分</h3>
        <p class="j-note">选择要收分的场次并开放评分。已扫码的评委会在手机上看到自己负责的评分表。</p>
        <Operations
          :event="event"
          :operate="operate"
          :can-review="can('judging:results')"
          @review="openPeriodReview"
        />
      </section>
      <el-tabs v-else v-model="tab" class="j-tabs">
        <el-tab-pane v-if="group === 'prep' && can('judging:config')" label="名单与排场" name="roster">
          <div class="j-tools">
            <el-input
              v-model="draftTitle"
              :disabled="!setup"
              style="max-width: 410px"
              aria-label="赛事名称"
            />
            <el-button v-if="setup" type="primary" :loading="busy" @click="saveConfig">
              保存赛前配置
            </el-button>
            <el-button v-if="setup" @click="check">检查配置</el-button>
            <span v-if="dirty" class="j-note">草稿有未保存修改</span>
          </div>
          <Roster :key="event.id" :config="draft" :id="event.id" :editable="setup" :rehearsal="event.rehearsal" />
          <div v-if="['LIVE', 'REVIEW'].includes(event.phase)" class="j-tools">
            <el-button @click="handoverOpen = true">补录初复赛成绩与颁奖资料</el-button>
          </div>
        </el-tab-pane>
        <el-tab-pane v-if="group === 'prep' && can('judging:config')" label="评分页面设计" name="look">
          <Appearance
            v-if="tab === 'look'"
            :key="event.id"
            :event-id="event.id"
            :busy="busy"
            :changed="JSON.stringify(draft.look) !== JSON.stringify(event.config.look)"
            :config="draft"
            :title="event.title"
            :editable="['SETUP', 'LIVE', 'REVIEW'].includes(event.phase)"
            @save="saveLook"
          />
        </el-tab-pane>
        <el-tab-pane v-if="group === 'prep' && can('judging:config')" label="评分表与规则" name="forms">
          <Rubrics
            :key="event.id"
            :config="draft"
            :disabled="busy || (!setup && event.phase !== 'LIVE')"
            :rules-locked="!setup"
            :live="event.phase === 'LIVE'"
          />
          <div class="j-tools">
            <el-button v-if="setup" type="primary" :disabled="busy" @click="saveConfig">保存评分表与规则</el-button>
            <el-button v-if="event.phase === 'LIVE'" type="primary" :disabled="busy" @click="saveForms">
              对尚未开放的场次启用新版评分表
            </el-button>
          </div>
        </el-tab-pane>
        <el-tab-pane v-if="group === 'results' && can('judging:results')" label="成绩与复核" name="results">
          <Review
            v-if="tab === 'results'"
            :key="event.id"
            :initial-period="selectedReview?.event === event.id ? selectedReview.period : undefined"
            :event="event"
            :operate="operate"
            :allowed="can"
          />
        </el-tab-pane>
        <el-tab-pane
          v-if="group === 'results' && (can('judging:export') || can('judging:publish'))"
          label="颁奖与发布"
          name="awards"
        >
          <h3>已确认的名单版本</h3>
          <el-empty
            v-if="!event.editions.length"
            description="全天成绩锁定后，可在这里导出正式颁奖名单"
          />
          <template v-else>
            <el-table :data="event.editions">
              <el-table-column label="确认版本">
                <template #default="{ row }">第 {{ row.edition }} 版</template>
              </el-table-column>
              <el-table-column label="锁定时间">
                <template #default="{ row }">{{ new Date(row.confirmedAt).toLocaleString() }}</template>
              </el-table-column>
              <el-table-column label="操作">
                <template #default="{ row }">
                  <el-button v-if="can('judging:export')" link type="primary" @click="chooseExport(row)">
                    导出正式颁奖名单
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </template>
          <p v-if="event.rehearsal" class="j-note">本场成绩仅供内部使用。</p>
          <template v-else-if="can('judging:publish')">
            <h3>对外公布</h3>
            <p>可公布日期为 {{ event.config.publicDay }} 起。请选择本次公开字段并手动发布。</p>
            <el-checkbox-group v-model="fields">
              <el-checkbox
                v-for="k in event.config.publicFields"
                :value="k"
                :key="k"
                :disabled="k === 'name'"
              >
                {{ awardFieldOptions[k] }}
              </el-checkbox>
            </el-checkbox-group>
            <div class="j-tools">
              <el-button
                type="primary"
                :disabled="event.phase !== 'LOCKED'"
                @click="publish"
              >
                公布本版名单
              </el-button>
            </div>
          </template>
          <p v-if="event.publishedEdition">
            第 {{ event.publishedEdition }} 版已公布。
            <a
              :href="
                'https://m.guanchaohuiji.com/#/pages/judging/awards?event=' + encodeURIComponent(event.id)
              "
              target="_blank"
              rel="noopener noreferrer"
            >
              打开已公布的名单
            </a>
          </p>
        </el-tab-pane>
        <el-tab-pane
          v-if="group === 'prep' && can('system:account') && can('judging:config')"
          label="工作人员授权"
          name="access"
        >
          <h3>本赛事后台账号</h3>
          <p>在这里选择本场工作人员。每人可操作的内容由「系统管理 → 角色权限」决定。</p>
          <el-form label-position="top">
            <el-form-item label="授权工作人员">
              <el-select v-model="staff" multiple filterable style="width: min(560px, 100%)">
                <el-option
                  v-for="a in accounts"
                  :key="a.id"
                  :value="a.id"
                  :label="(a.displayName || a.username) + ' · ' + a.username"
                />
              </el-select>
            </el-form-item>
            <el-button
              type="primary"
              :disabled="!['SETUP', 'LIVE', 'REVIEW'].includes(event.phase)"
              @click="operate('access', { staffIds: staff })"
            >
              保存赛事授权
            </el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>
      <div class="j-bottom">
        <span>数据版本 {{ event.revision }}</span>
        <el-button link @click="refresh">刷新当前赛事</el-button>
      </div>
    </template>
    <el-dialog v-model="exportOpen" title="导出正式颁奖名单" width="min(480px,94vw)" append-to-body>
      <p>第 {{ exportEdition }} 版，选择本次颁奖文件包含的字段。</p>
      <el-checkbox-group v-model="exportFields">
        <el-checkbox v-for="f in exportOptions" :key="f" :value="f" :disabled="f === 'name'">
          {{ awardFieldOptions[f] }}
        </el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button type="primary" @click="awards(exportEdition)">下载 Excel</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="creating" title="新建赛事" width="min(470px,94vw)">
      <el-form label-position="top" @submit.prevent="create">
        <el-form-item label="赛事名称">
          <el-input v-model="title" aria-label="赛事名称" placeholder="请输入赛事名称" maxlength="120" />
        </el-form-item>
        <div class="j-pair">
          <el-form-item label="教室数量">
            <el-input-number v-model="roomCount" aria-label="教室数量" :min="1" :max="50" step-strictly :value-on-clear="1" />
          </el-form-item>
          <el-form-item label="每间教室的课堂轮数">
            <el-input-number
              v-model="roundsPerRoom"
              aria-label="每间教室的课堂轮数"
              :min="1"
              :max="250"
              step-strictly
              :value-on-clear="1"
            />
          </el-form-item>
        </div>
        <p class="j-note">共 {{ roomCount * roundsPerRoom }} 个课堂时段。创建后可单独调整每间教室的轮数。</p>
      </el-form>
      <template #footer>
        <el-button @click="creating = false">取消</el-button>
        <el-button type="primary" :disabled="!title.trim() || busy" @click="create">创建</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="handoverOpen" title="补录初复赛成绩及颁奖资料" width="min(850px,94vw)" append-to-body>
      <template v-if="draft">
        <el-table :data="draft.teachers" max-height="235">
          <el-table-column prop="name" label="选手" />
          <el-table-column v-if="draft.scoringPlan === 'withQualifiers'" label="初赛原分 /100">
            <template #default="{ row }"
              ><el-input-number
                v-model="row.preliminaryScore"
                :min="0"
                :max="100"
                :precision="2"
                :value-on-clear="null"
            /></template>
          </el-table-column>
          <el-table-column label="复赛成绩">
            <template #default="{ row }">
              <el-input-number
                v-model="row.prior"
                :min="0"
                :max="draft.scoringPlan === 'withQualifiers' ? 100 : 10000"
                :value-on-clear="null"
              />
            </template>
          </el-table-column>
          <el-table-column label="晋级名次">
            <template #default="{ row }"><el-input-number v-model="row.qualifierRank" :min="1" /></template>
          </el-table-column>
        </el-table>
        <h3>优秀奖名单</h3>
        <el-table :data="draft.merits" max-height="200">
          <el-table-column v-for="f in meritFields" :key="f.key" :label="f.label">
            <template #default="{ row }"><el-input v-model="row[f.key]" /></template>
          </el-table-column>
          <el-table-column width="65">
            <template #default="s">
              <el-button link @click="draft.merits.splice(s.$index, 1)">移除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-button @click="draft.merits.push({ id: '', name: '', org: '' })">添加优秀奖教师</el-button>
      </template>
      <template #footer><el-button type="primary" @click="handover">保存资料</el-button></template>
    </el-dialog>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  awardFieldOptions,
  defaultEntryDesign,
  defaultJudgingGuidance,
  type JudgingPeriod,
  type AwardField,
  type JudgingConfig
} from "@conference/shared";
import { useAdminSession } from "../../stores/admin-session";
import {
  judgingApi,
  phaseNames,
  downloadJudgingBook,
  type EventSummary,
  type EventDetail
} from "../../services/judging";
import Roster from "./Roster.vue";
import EntryCard from "./EntryCard.vue";
import { navigateTo, routeQuery } from "../../router";
import Appearance from "./Appearance.vue";
import Rubrics from "./Rubrics.vue";
import Operations from "./Operations.vue";
import Review from "./Review.vue";
const { admin, hasPermission: can } = useAdminSession(),
  canManageEvents = computed(() => can("judging:config") && admin.value?.conferenceScopeMode === "ALL");
const events = ref<EventSummary[]>([]),
  event = ref<EventDetail | null>(null),
  draft = ref<JudgingConfig | null>(null),
  draftTitle = ref(""),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  creating = ref(false),
  title = ref(""),
  roomCount = ref(1),
  roundsPerRoom = ref(1);
const tab = ref("home"),
  staff = ref<string[]>([]),
  accounts = ref<{ id: string; username: string; displayName: string | null }[]>([]),
  fields = ref<AwardField[]>([]),
  handoverOpen = ref(false);
const selectedReview = ref<{ event: string; period: JudgingPeriod }>();
function openPeriodReview(period: JudgingPeriod) {
  if (!event.value) return;
  selectedReview.value = { event: event.value.id, period };
  tab.value = "results";
}
const resultsTab = computed(() => (can("judging:results") ? "results" : "awards"));
const navigation = computed(() => [
  { label: "操作首页", group: "home", tab: "home" },
  ...(can("judging:config") ? [{ label: "赛前设置", group: "prep", tab: "roster" }] : []),
  ...(can("judging:floor") ? [{ label: "现场收分", group: "live", tab: "live" }] : []),
  ...(can("judging:results") || can("judging:export") || can("judging:publish")
    ? [{ label: "成绩与颁奖", group: "results", tab: resultsTab.value }]
    : [])
]);
const group = computed(() => {
  if (tab.value === "home" || tab.value === "live") return tab.value;
  return ["results", "awards"].includes(tab.value) ? "results" : "prep";
});
const nextStep = computed(() => {
  const e = event.value;
  if (!e) return null;
  if (e.phase === "SETUP" && can("judging:config") && (!e.config.judges.length || !e.config.sessions.length))
    return {
      title: "准备本场名单和排场",
      detail: "设置教室和课堂轮数，录入选手与评委，再按名单顺序生成场次。",
      button: "打开名单与排场",
      tab: "roster"
    };
  if (["SETUP", "LIVE"].includes(e.phase) && can("judging:floor"))
    return {
      title: e.phase === "LIVE" ? "管理正在进行的评分" : "准备开场",
      detail: "进入现场收分，选择场次并开放。可随时查看谁已交分、谁还待交。",
      button: "进入现场收分",
      tab: "live"
    };
  if (["REVIEW", "SUBMITTED"].includes(e.phase) && can("judging:results"))
    return {
      title: "核对本场成绩",
      detail: "完成各场评分复核后，在「全天成绩」确认并锁定排名和奖项。",
      button: "查看成绩与复核",
      tab: "results"
    };
  if (e.phase === "LOCKED" && (can("judging:export") || can("judging:publish")))
    return {
      title: "查看已确认的颁奖名单",
      detail: "选择已确认的版本，即可准备颁奖资料。",
      button: "查看颁奖名单",
      tab: "awards"
    };
  if (can("judging:results"))
    return {
      title: "查看评审成绩",
      detail: "按参赛教师查看收分情况、原单和复核记录。",
      button: "查看成绩",
      tab: "results"
    };
  if (can("judging:config"))
    return {
      title: "查看赛前设置",
      detail: "在这里管理名单、场次、手机页面和评分规则。",
      button: "查看设置",
      tab: "roster"
    };
  return null;
});
const meritFields = [
  { key: "id", label: "教师编号" },
  { key: "name", label: "姓名" },
  { key: "org", label: "机构" }
];
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const setup = computed(() => event.value?.phase === "SETUP" && can("judging:config")),
  dirty = computed(
    () =>
      event.value &&
      draft.value &&
      (JSON.stringify(draft.value) !== JSON.stringify(event.value.config) ||
        event.value.title !== draftTitle.value)
  );
async function read(id: string, keep = false) {
  const data = await judgingApi.detail(id);
  data.config.guidance ??= { ...defaultJudgingGuidance };
  data.config.look.entry = { ...defaultEntryDesign, ...data.config.look.entry };
  event.value = data;
  if (!keep) {
    draft.value = clone(data.config);
    draftTitle.value = data.title;
  }
  staff.value = [...data.staffIds];
  fields.value = [...data.config.publicFields];
}
async function loadEvents(preferred?: string) {
  events.value = await judgingApi.list();
  const selected =
    events.value.find((e) => e.id === preferred) ||
    events.value.find((e) => e.phase === "LIVE") ||
    events.value[0];
  if (selected) await read(selected.id);
}
async function discard() {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm("当前草稿有未保存修改，继续将重新载入已保存的配置。", "离开草稿");
    return true;
  } catch {
    return false;
  }
}
async function select(id: string) {
  if (!(await discard())) return;
  loading.value = true;
  try {
    await read(id);
    error.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
async function refresh() {
  if (event.value) await select(event.value.id);
}
async function removeEvent() {
  const target = event.value;
  if (!target || !canManageEvents.value || busy.value || loading.value) return;
  const phase = (target.rehearsal ? "仅内部使用 · " : "") + phaseNames[target.phase];
  const unsaved = dirty.value ? "当前未保存的修改也会丢失。" : "";
  busy.value = true;
  try {
    const confirmed = await ElMessageBox.confirm(
      `确定删除「${target.title}」（${phase}）吗？删除后，赛事将从列表移除，评分二维码和已公布的颁奖链接均会失效。已交评分和锁定版本将留档。${unsaved}`,
      "确认删除赛事",
      { type: "warning", confirmButtonText: "删除赛事", cancelButtonText: "取消", confirmButtonType: "danger" }
    ).catch(() => false);
    if (!confirmed) return;
    loading.value = true;
    await judgingApi.change(target.id, target.revision, { action: "delete" });
    events.value = events.value.filter((e) => e.id !== target.id);
    event.value = null;
    draft.value = null;
    tab.value = "home";
    error.value = "";
    if (routeQuery.value.event === target.id && window.location.hash.startsWith("#/judging?")) {
      navigateTo("/judging");
    }
    ElMessage.success(`已删除「${target.title}」`);
    await loadEvents(routeQuery.value.event);
  } catch (e) {
    error.value = (e as Error).message;
    ElMessage.error(error.value);
  } finally {
    busy.value = false;
    loading.value = false;
  }
}
function openCreate() {
  title.value = "";
  roomCount.value = 1;
  roundsPerRoom.value = 1;
  creating.value = true;
}
async function create() {
  if (!title.value.trim() || busy.value) return;
  busy.value = true;
  try {
    if (!(await discard())) return;
    const e = await judgingApi.create(title.value.trim(), roomCount.value, roundsPerRoom.value);
    events.value = [e, ...events.value.filter((item) => item.id !== e.id)];
    creating.value = false;
    await read(e.id);
    tab.value = "roster";
    if (window.location.hash.startsWith("#/judging")) navigateTo("/judging", { event: e.id, tab: "roster" });
    ElMessage.success("赛事已创建");
  } catch (e) {
    ElMessage.error((e as Error).message);
  } finally {
    busy.value = false;
  }
}
async function operate(action: string, data: Record<string, unknown> = {}) {
  const e = event.value;
  if (!e || busy.value) return false;
  busy.value = true;
  try {
    const keep = !!dirty.value && !["config", "handover", "forms"].includes(action);
    const { observedRevision, ...body } = data;
    const update = await judgingApi.change(
      e.id,
      typeof observedRevision === "number" ? observedRevision : e.revision,
      { action, ...body }
    );
    error.value = "";
    await read(e.id, keep);
    events.value = events.value.map((x) => (x.id === update.id ? update : x));
    ElMessage.success("已保存");
    return true;
  } catch (err) {
    error.value = (err as Error).message;
    ElMessage.error(error.value);
    return false;
  } finally {
    busy.value = false;
  }
}
async function check() {
  if (!draft.value || !event.value) return;
  try {
    const r = await judgingApi.validate(event.value.id, draft.value);
    await ElMessageBox.alert(
      [
        "教师 " + r.teachers + " 人，评委 " + r.judges + " 人，" + r.sessions + " 个场次",
        ...r.warnings,
        r.readiness || "已满足开场检查"
      ].join("　"),
      "配置检查"
    );
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}
function saveForms() {
  if (!event.value || !draft.value) return;
  const saved = new Map(event.value.config.judges.map((j) => [j.id, j.role]));
  const roleTransfers = Object.fromEntries(
    draft.value.judges.filter((j) => saved.get(j.id) !== j.role).map((j) => [j.id, j.role])
  );
  return operate("forms", {
    guidance: draft.value.guidance,
    rubrics: draft.value.rubrics,
    roleOptions: draft.value.roleOptions,
    roleTransfers,
    sameAudienceForm: draft.value.sameAudienceForm,
    approvedForms: draft.value.approvedForms
  });
}
const saveConfig = () => operate("config", { title: draftTitle.value, config: draft.value });
const saveLook = () => operate("appearance", { look: draft.value?.look });
async function handover() {
  if (
    await operate("handover", {
      teachers: draft.value?.teachers.map((t) => ({
        id: t.id,
        preliminaryScore: t.preliminaryScore,
        prior: t.prior,
        qualifierRank: t.qualifierRank
      })),
      merits: draft.value?.merits
    })
  )
    handoverOpen.value = false;
}
const exportOpen = ref(false),
  exportEdition = ref(0),
  exportFields = ref<AwardField[]>([]),
  exportOptions = ref<AwardField[]>([]);
function chooseExport(edition: EventDetail["editions"][number]) {
  exportEdition.value = edition.edition;
  exportOptions.value = edition.fields;
  exportFields.value = edition.fields.filter((f) => fields.value.includes(f));
  exportOpen.value = true;
}
async function awards(version: number) {
  if (!event.value) return;
  try {
    const v = await judgingApi.export(event.value.id, "awards", version, exportFields.value);
    const group = (name: string, a: Record<string, unknown>[]) => ({
      name,
      rows: a.map((r) =>
        Object.fromEntries(
          Object.entries(r).map(([k, val]) => [awardFieldOptions[k as AwardField] || k, val])
        )
      )
    });
    await downloadJudgingBook(event.value.title + "-正式颁奖名单-V" + version, [
      group("总决赛", v.teachers),
      group("优秀奖", v.merits),
      group("教学示范校", v.schools)
    ]);
    exportOpen.value = false;
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}
async function publish() {
  try {
    await ElMessageBox.confirm("将把已确认版本所选字段对外公布。", "公布颁奖名单");
    await operate("publish", { fields: fields.value });
  } catch {}
}
watch(tab, async (t) => {
  if (t === "access") {
    try {
      accounts.value = await judgingApi.accounts();
    } catch (e) {
      ElMessage.error((e as Error).message);
    }
  }
});
onMounted(async () => {
  loading.value = true;
  try {
    await loadEvents(routeQuery.value.event);
    if (event.value && ["look", "roster"].includes(routeQuery.value.tab || "") && can("judging:config"))
      tab.value = routeQuery.value.tab!;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});
</script>
<style src="./workspace.css"></style>
