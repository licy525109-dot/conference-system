<template>
  <div class="judging-workspace" v-loading="loading">
    <header class="j-header">
      <div>
        <span class="j-eyebrow">会议管理</span>
        <h1>赛事评审</h1>
      </div>
      <div class="j-tools">
        <el-select
          :model-value="event?.id"
          @change="select"
          placeholder="选择赛事"
          filterable
          style="width: 260px"
        >
          <el-option
            v-for="item in events"
            :key="item.id"
            :label="(item.rehearsal ? '联排 · ' : '') + item.title"
            :value="item.id"
          />
        </el-select>
        <el-button v-if="canCreate" type="primary" @click="creating = true">新建赛事</el-button>
      </div>
    </header>
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
    <el-empty v-if="!event" description="暂无获授权的赛事">
      <el-button v-if="canCreate" @click="creating = true">创建第一场赛事</el-button>
    </el-empty>
    <template v-if="event && draft">
      <section class="j-overview">
        <div>
          <div class="j-overline">
            <span class="j-mode">{{ event.rehearsal ? "联排测试" : "正式赛事" }}</span>
            <span>{{ phaseNames[event.phase] }} · 第 {{ event.edition }} 版</span>
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
      <el-tabs v-model="tab" class="j-tabs">
        <el-tab-pane v-if="can('judging:config')" label="名单与排场" name="roster">
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
          <Roster :config="draft" :id="event.id" :editable="setup" :rehearsal="event.rehearsal" />
          <div v-if="['LIVE', 'REVIEW'].includes(event.phase)" class="j-tools">
            <el-button @click="handoverOpen = true">补录颁奖与复赛资料</el-button>
          </div>
        </el-tab-pane>
        <el-tab-pane v-if="can('judging:config')" label="手机页面设计" name="look">
          <Appearance
            :config="draft"
            :title="draftTitle"
            :editable="['SETUP', 'LIVE', 'REVIEW'].includes(event.phase)"
            @save="saveLook"
          />
        </el-tab-pane>
        <el-tab-pane v-if="can('judging:config')" label="评分表与规则" name="forms">
          <Rubrics :config="draft" :disabled="!setup && event.phase !== 'LIVE'" :rules-locked="!setup" />
          <div class="j-tools">
            <el-button v-if="setup" type="primary" @click="saveConfig">保存评分表与规则</el-button>
            <el-button v-if="event.phase === 'LIVE'" type="primary" @click="saveForms">
              对尚未开放的场次启用新版评分表
            </el-button>
          </div>
        </el-tab-pane>
        <el-tab-pane v-if="can('judging:floor')" label="现场收分" name="live">
          <Operations v-if="tab === 'live'" :event="event" :operate="operate" />
        </el-tab-pane>
        <el-tab-pane v-if="can('judging:results')" label="成绩与复核" name="results">
          <Review
            v-if="tab === 'results'"
            :event="event"
            :operate="operate"
            :allowed="can"
            :admin-id="admin?.id || ''"
          />
        </el-tab-pane>
        <el-tab-pane v-if="can('judging:export') || can('judging:publish')" label="颁奖与发布" name="awards">
          <h3>已确认的名单版本</h3>
          <el-empty
            v-if="!event.editions.length"
            description="最终确认人锁定整份名单后，正式颁奖名单将在这里生成"
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
          <template v-if="can('judging:publish')">
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
                :disabled="event.rehearsal || event.phase !== 'LOCKED'"
                @click="publish"
              >
                公布本版名单
              </el-button>
            </div>
          </template>
          <p v-if="event.publishedEdition">
            第 {{ event.publishedEdition }} 版已公布。小程序路径
            <code>pages/judging/awards?event={{ event.id }}</code>
          </p>
        </el-tab-pane>
        <el-tab-pane v-if="can('system:account') && can('judging:config')" label="人员授权" name="access">
          <h3>本赛事后台账号</h3>
          <p>
            岗位权限来自「系统管理 →
            角色权限」。会议授权账号还需要在这里加入赛事。正式确认人请先在观潮会集小程序验证手机号、填写实名，并在「绑定后台账号」中绑定本人账号。
          </p>
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
            <el-form-item
              :label="event.rehearsal ? '联排最终确认人' : '最终确认人 · 王红丽老师本人实名后台账号'"
            >
              <el-select v-model="confirmer" clearable filterable style="width: min(440px, 100%)">
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
              @click="operate('access', { staffIds: staff, confirmerId: confirmer })"
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
      <el-form label-position="top">
        <el-form-item label="赛事名称"><el-input v-model="title" maxlength="120" /></el-form-item>
        <el-radio-group v-model="rehearsal">
          <el-radio :value="true">联排测试</el-radio>
          <el-radio :value="false">正式赛事</el-radio>
        </el-radio-group>
        <p>联排与正式赛事使用独立名单、原单和成绩版本。</p>
      </el-form>
      <template #footer>
        <el-button @click="creating = false">取消</el-button>
        <el-button type="primary" :disabled="!title.trim() || busy" @click="create">创建</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="handoverOpen" title="补录复赛成绩及颁奖资料" width="min(850px,94vw)" append-to-body>
      <template v-if="draft">
        <el-table :data="draft.teachers" max-height="235">
          <el-table-column prop="name" label="选手" />
          <el-table-column label="复赛成绩">
            <template #default="{ row }">
              <el-input-number v-model="row.prior" :min="0" :max="10000" />
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
import { awardFieldOptions, type AwardField, type JudgingConfig } from "@conference/shared";
import { useAdminSession } from "../../stores/admin-session";
import {
  judgingApi,
  phaseNames,
  downloadJudgingBook,
  type EventSummary,
  type EventDetail
} from "../../services/judging";
import Roster from "./Roster.vue";
import Appearance from "./Appearance.vue";
import Rubrics from "./Rubrics.vue";
import Operations from "./Operations.vue";
import Review from "./Review.vue";
const { admin, hasPermission: can } = useAdminSession(),
  canCreate = computed(() => can("judging:config") && admin.value?.conferenceScopeMode === "ALL");
const events = ref<EventSummary[]>([]),
  event = ref<EventDetail | null>(null),
  draft = ref<JudgingConfig | null>(null),
  draftTitle = ref(""),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  creating = ref(false),
  title = ref("绘本舞蹈教师赛课总决赛 · 杭州站"),
  rehearsal = ref(true);
const tab = ref(
    can("judging:config")
      ? "roster"
      : can("judging:floor")
        ? "live"
        : can("judging:results")
          ? "results"
          : "awards"
  ),
  staff = ref<string[]>([]),
  confirmer = ref(""),
  accounts = ref<{ id: string; username: string; displayName: string | null }[]>([]),
  fields = ref<AwardField[]>([]),
  handoverOpen = ref(false);
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
  event.value = data;
  if (!keep) {
    draft.value = clone(data.config);
    draftTitle.value = data.title;
  }
  staff.value = [...data.staffIds];
  confirmer.value = data.confirmerId || "";
  fields.value = [...data.config.publicFields];
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
async function create() {
  if (busy.value) return;
  busy.value = true;
  try {
    const e = await judgingApi.create(title.value, rehearsal.value);
    events.value = await judgingApi.list();
    await read(e.id);
    creating.value = false;
    tab.value = "roster";
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
const saveForms = () =>
  operate("forms", {
    rubrics: draft.value?.rubrics,
    sameAudienceForm: draft.value?.sameAudienceForm,
    approvedForms: draft.value?.approvedForms
  });
const saveConfig = () => operate("config", { title: draftTitle.value, config: draft.value });
const saveLook = () => operate("appearance", { look: draft.value?.look });
async function handover() {
  if (
    await operate("handover", {
      teachers: draft.value?.teachers.map((t) => ({
        id: t.id,
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
    events.value = await judgingApi.list();
    if (events.value[0]) await read(events.value[0].id);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});
</script>
<style src="./workspace.css"></style>
