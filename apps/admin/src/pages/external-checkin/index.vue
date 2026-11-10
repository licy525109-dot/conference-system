<template>
  <el-config-provider :locale="zhCn">
  <main class="admin-page external-checkin" v-loading="busy">
    <header class="page-header">
      <div><p class="eyebrow">会议管理 / 外部协同</p><h1>{{ event?.title || '外部会议签到' }}</h1><p class="muted">{{ event ? '导入名单，配置嘉宾填写内容，扫码完成签到。' : '集中管理外部会议名单与现场签到。' }}</p></div>
      <div class="toolbar"><el-button v-if="event" @click="back">返回会议列表</el-button><el-button v-if="canWrite" type="primary" @click="openConfig(!event)">{{ event ? '配置会议与字段' : '新建签到会议' }}</el-button></div>
    </header>
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
    <template v-if="!event">
      <el-empty v-if="!events.length && !busy" description="还没有外部签到会议，创建后即可配置字段并导入名单" />
      <el-table v-else :data="events" @row-click="openEventRow" class="event-table">
        <el-table-column prop="title" label="会议名称" min-width="240" /><el-table-column label="名单人数" width="130"><template #default="{ row }">{{ row._count?.attendees || 0 }}</template></el-table-column>
        <el-table-column label="签到开关" width="130"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '已开启' : '已暂停' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="120"><template #default="{ row }"><el-button link type="primary" @click.stop="openEvent(row.id)">管理签到</el-button></template></el-table-column>
      </el-table><el-pagination v-if="eventTotal > 20" v-model:current-page="eventPage" :page-size="20" :total="eventTotal" layout="prev, pager, next" @current-change="loadEvents" />
    </template>
    <template v-else>
      <section class="stats" aria-label="签到统计"><div><span>名单总人数</span><strong>{{ event.statistics.total }}</strong></div><div><span>已签到</span><strong class="success-text">{{ event.statistics.checkedIn }}</strong></div><div><span>未签到</span><strong>{{ event.statistics.pending }}</strong></div></section>
      <section class="checkin-overview">
        <div><el-tag :type="event.enabled ? 'success' : 'info'">{{ event.enabled ? '签到已开启' : '签到已暂停' }}</el-tag><h2>嘉宾需要填写</h2><p>{{ event.fields.filter(f => f.input).map(f => f.label).join('、') }}</p><p class="muted">仅核验：{{ event.fields.filter(f => f.match).map(f => f.label).join(' ＋ ') }}。其余填写内容作为现场补充资料保存。{{ event.startsAt || event.endsAt ? `签到时间：${formatTime(event.startsAt)} 至 ${formatTime(event.endsAt)}` : '未设置时间限制' }}</p><div class="toolbar"><el-button v-if="canWrite" :type="event.enabled ? 'default' : 'success'" @click="toggle">{{ event.enabled ? '暂停签到' : '开启签到' }}</el-button><el-button @click="showQr">签到二维码</el-button><el-button @click="refresh">刷新状态</el-button></div></div>
      </section>
      <section class="roster"><div class="section-heading"><h2>嘉宾名单</h2><div class="toolbar"><el-button v-if="canWrite" type="primary" @click="openImport">导入名单</el-button><el-button @click="exportRoster">导出签到名单</el-button></div></div>
        <div class="toolbar filters"><el-input v-model="keyword" placeholder="搜索名单资料" clearable @keyup.enter="search" @clear="search" style="width:260px" /><el-select v-model="status" aria-label="签到状态" placeholder="全部状态" style="width:150px" @change="search"><el-option value="" label="全部状态" /><el-option value="PENDING" label="未签到" /><el-option value="CHECKED_IN" label="已签到" /></el-select><el-button @click="search">查询</el-button></div>
        <el-table :data="attendees" empty-text="暂无名单，请先导入外部会议名单" stripe><el-table-column v-for="field in event.fields" :key="field.key" :label="field.label" min-width="150"><template #default="{ row }">{{ row.values[field.key] || '—' }}</template></el-table-column><el-table-column v-for="field in event.fields.filter(f => f.input && !f.match)" :key="`submitted-${field.key}`" :label="`${field.label}（现场填写）`" min-width="170"><template #default="{ row }">{{ row.submittedValues?.[field.key] || '—' }}</template></el-table-column><el-table-column label="签到状态" width="110"><template #default="{ row }"><el-tag :type="row.checkedInAt ? 'success' : 'info'">{{ row.checkedInAt ? '已签到' : '未签到' }}</el-tag></template></el-table-column><el-table-column label="首次签到时间（北京时间）" min-width="210"><template #default="{ row }">{{ formatTime(row.checkedInAt) }}</template></el-table-column></el-table>
        <el-pagination v-if="attendeeTotal" v-model:current-page="page" :total="attendeeTotal" :page-size="50" layout="total, prev, pager, next" @current-change="loadAttendees" />
      </section>
    </template>

    <el-dialog v-model="configVisible" :title="creating ? '新建签到会议' : '会议与签到字段'" width="min(900px, calc(100vw - 24px))" :close-on-click-modal="false">
      <el-alert v-if="dialogError" :title="dialogError" type="error" :closable="false" />
      <el-form label-position="top"><el-form-item label="会议名称"><el-input v-model="draft.title" maxlength="120" placeholder="请输入外部会议名称" /></el-form-item><el-form-item label="签到说明"><el-input v-model="draft.description" type="textarea" :rows="2" maxlength="1000" placeholder="可填写现场指引或联系人说明" /></el-form-item><div class="date-grid"><el-form-item label="签到开始时间（可选，北京时间）"><el-input v-model="startLocal" type="datetime-local" /></el-form-item><el-form-item label="签到结束时间（可选，北京时间）"><el-input v-model="endLocal" type="datetime-local" /></el-form-item></div>
        <h3>名单字段与嘉宾填写内容</h3><p class="muted">“嘉宾填写”决定签到表单内容；“用于核验”决定哪些信息参与名单匹配。其他填写内容会单独保存，可设为必填或选填。</p>
        <div v-for="(field, index) in draft.fields" :key="field.key" class="field-row"><el-input v-model="field.label" :aria-label="`第 ${index + 1} 个字段名称`" maxlength="40" placeholder="字段名称，如姓名、单位、报名编号" /><el-checkbox v-model="field.input" @change="syncField(field, 'input')">嘉宾填写</el-checkbox><el-checkbox v-model="field.required" :disabled="!field.input || field.match">必填</el-checkbox><el-checkbox v-model="field.match" @change="syncField(field, 'match')">用于核验</el-checkbox><el-button text type="danger" :disabled="draft.fields.length === 1" @click="draft.fields.splice(index, 1)">移除</el-button></div>
        <el-button :disabled="draft.fields.length >= 20" @click="addField">添加字段</el-button><p v-if="!creating" class="muted">调整嘉宾填写字段前需暂停签到。保存时会检查现有名单是否仍能唯一匹配。</p>
      </el-form><template #footer><el-button @click="configVisible = false">取消</el-button><el-button type="primary" :loading="busy" @click="saveConfig">{{ creating ? '创建会议' : '保存配置' }}</el-button></template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="导入外部会议名单" width="min(900px, calc(100vw - 24px))" :close-on-click-modal="false">
      <el-alert v-if="dialogError" :title="dialogError" type="error" :closable="false" /><p class="muted">Excel / CSV 首行需为列名。每批最多 5,000 人、10 MB。手机号和编号请使用文本格式，保留前导零。</p>
      <div class="toolbar"><label class="file-button">选择名单文件<input type="file" accept=".xlsx,.xls,.csv,.tsv" @change="readFile" /></label><el-button @click="downloadTemplate">下载当前字段模板</el-button><el-select v-if="sheets.length > 1" v-model="sheetIndex" aria-label="选择工作表" @change="mapHeaders"><el-option v-for="(sheet, index) in sheets" :key="index" :value="index" :label="sheet.name" /></el-select></div>
      <template v-if="sheet.length"><p>读取 {{ Math.max(0, sheet.length - 1) }} 行资料，请确认对应关系。</p><div class="mapping-grid"><el-form-item v-for="field in event?.fields" :key="field.key" :label="field.label + (field.match ? '（需核对）' : '')"><el-select v-model="mapping[field.key]" clearable placeholder="选择名单列" @change="plan = null"><el-option v-for="(header, index) in sheet[0]" :key="index" :value="String(index)" :label="header || `第 ${index + 1} 列`" /></el-select></el-form-item></div>
        <el-table :data="sheet.slice(1, 6)" max-height="220"><el-table-column v-for="(header, index) in sheet[0]" :key="index" :label="header || `第 ${index + 1} 列`" min-width="130"><template #default="{ row }">{{ row[index] }}</template></el-table-column></el-table><p class="muted">上方展示前 5 行。完全相同的记录会跳过，已有签到状态和时间会保留。</p><el-button :loading="busy" @click="previewImport">预检导入</el-button>
      </template>
      <section v-if="plan" class="import-result"><strong>新增 {{ plan.added }} 人 · 重复跳过 {{ plan.skipped }} 人 · 错误 {{ plan.errors.length }} 条</strong><el-table v-if="plan.errors.length" :data="plan.errors" max-height="230"><el-table-column prop="row" label="数据行" width="100" /><el-table-column prop="message" label="问题" /></el-table><p v-if="plan.errors.length" class="muted">存在错误时整批不写入，请修正文件后重新选择并预检。</p></section>
      <template #footer><el-button @click="importVisible = false">取消</el-button><el-button type="primary" :loading="busy" :disabled="!plan || !!plan.errors.length" @click="commitImport">确认导入</el-button></template>
    </el-dialog>
    <el-dialog v-model="qrVisible" title="现场签到二维码" width="min(440px, calc(100vw - 24px))"><div class="qr-content"><h3>{{ event?.title }}</h3><img v-if="qrImage" :src="qrImage" alt="嘉宾扫描此二维码填写信息并签到" width="280" height="280" /><p>微信或手机扫码，填写信息完成签到</p><p v-if="!event?.enabled" class="muted">当前已暂停，开启签到后嘉宾才可提交。</p><a :href="publicUrl" target="_blank" rel="noopener">打开签到页</a><el-input :model-value="publicUrl" readonly aria-label="签到链接" /></div><template #footer><el-button @click="qrVisible = false">关闭</el-button><el-button type="primary" @click="downloadQr">下载二维码</el-button></template></el-dialog>
  </main>
  </el-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import type { ExternalCheckinField } from "@conference/shared";
import { externalCheckins as api, type ExternalCheckinEvent, type ExternalCheckinAttendee, type ImportPlan } from "../../services/external-checkin";
import { useAdminSession } from "../../stores/admin-session";
import { downloadExternalCheckinSheet, mapExternalCheckinSheet, readExternalCheckinWorkbook } from "../../utils/external-checkin-sheet";

const session = useAdminSession(), canWrite = computed(() => session.hasPermission("external-checkin:write"));
const busy = ref(false), error = ref(""), dialogError = ref(""), event = ref<ExternalCheckinEvent | null>(null), events = ref<ExternalCheckinEvent[]>([]), eventPage = ref(1), eventTotal = ref(0);
const attendees = ref<ExternalCheckinAttendee[]>([]), page = ref(1), attendeeTotal = ref(0), keyword = ref(""), status = ref("");
const configVisible = ref(false), creating = ref(false), startLocal = ref(""), endLocal = ref("");
const draft = reactive({ title: "", description: "", fields: [] as ExternalCheckinField[] });
const importVisible = ref(false), sheets = ref<{ name: string; rows: string[][] }[]>([]), sheetIndex = ref(0), mapping = reactive<Record<string, string>>({}), plan = ref<ImportPlan | null>(null);
const sheet = computed(() => sheets.value[sheetIndex.value]?.rows || []), qrVisible = ref(false), qrImage = ref("");
const publicUrl = computed(() => event.value ? api.publicUrl(event.value) : "");
const message = (e: unknown) => e instanceof Error ? e.message : "操作失败，请重试";
async function run(fn: () => Promise<void>, dialog = false) { if (busy.value) return; busy.value = true; (dialog ? dialogError : error).value = ""; try { await fn(); } catch (e) { (dialog ? dialogError : error).value = message(e); } finally { busy.value = false; } }
async function fetchEvents() { const result = await api.list(eventPage.value); events.value = result.items; eventTotal.value = result.total; }
const loadEvents = () => run(fetchEvents);
async function fetchAttendees() { if (!event.value) return; const result = await api.attendees(event.value.id, { page: page.value, keyword: keyword.value, status: status.value }); attendees.value = result.items; attendeeTotal.value = result.total; }
const loadAttendees = () => run(fetchAttendees);
const search = () => { page.value = 1; void loadAttendees(); };
const openEventRow = (row: ExternalCheckinEvent) => openEvent(row.id);
const openEvent = (id: string) => run(async () => { event.value = await api.detail(id); page.value = 1; keyword.value = ""; status.value = ""; await fetchAttendees(); });
const back = () => run(async () => { event.value = null; await fetchEvents(); });
const refresh = () => run(async () => { if (event.value) event.value = await api.detail(event.value.id); await fetchAttendees(); });
const toLocal = (date: string | null) => date ? new Date(new Date(date).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16) : "";
const formatTime = (date: string | null) => date ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(date)) : "—";
function openConfig(create: boolean) { creating.value = create; dialogError.value = ""; const current = create ? null : event.value; draft.title = current?.title || ""; draft.description = current?.description || ""; draft.fields = current ? current.fields.map(f => ({ ...f })) : [{ key: "name", label: "姓名", input: true, required: true, match: false }, { key: "phone", label: "手机号", input: true, required: true, match: true }, { key: "organization", label: "单位", input: true, required: false, match: false }]; startLocal.value = toLocal(current?.startsAt || null); endLocal.value = toLocal(current?.endsAt || null); configVisible.value = true; }
function syncField(field: ExternalCheckinField, source: string) { if (source === "match" && field.match) { field.input = true; field.required = true; } if (source === "input" && !field.input) { field.match = false; field.required = false; } }
function addField() { draft.fields.push({ key: `f_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`, label: "", input: true, required: false, match: false }); }
const saveConfig = () => run(async () => { const body = { ...draft, startsAt: startLocal.value ? `${startLocal.value}:00+08:00` : null, endsAt: endLocal.value ? `${endLocal.value}:00+08:00` : null, enabled: creating.value ? false : event.value?.enabled, revision: event.value?.revision }; event.value = creating.value ? await api.create(body) : await api.save(event.value!.id, body); configVisible.value = false; page.value = 1; await fetchAttendees(); ElMessage.success("配置已保存"); }, true);
const toggle = () => run(async () => { if (event.value) event.value = await api.save(event.value.id, { ...event.value, enabled: !event.value.enabled }); });
function openImport() { sheets.value = []; sheetIndex.value = 0; plan.value = null; dialogError.value = ""; importVisible.value = true; }
function mapHeaders() { plan.value = null; for (const key of Object.keys(mapping)) delete mapping[key]; for (const field of event.value?.fields || []) { const index = sheet.value[0]?.findIndex(header => header.normalize("NFKC").trim() === field.label); mapping[field.key] = index === undefined || index < 0 ? "" : String(index); } }
async function readFile(e: Event) { const input = e.target as HTMLInputElement, file = input.files?.[0]; if (!file) return; plan.value = null; sheets.value = []; await run(async () => { sheets.value = await readExternalCheckinWorkbook(file); sheetIndex.value = 0; mapHeaders(); }, true); input.value = ""; }
function importBody() { const rows = mapExternalCheckinSheet(sheet.value, mapping, event.value!.fields); const body = { rows, revision: event.value!.revision }; if (new Blob([JSON.stringify(body)]).size > 3_900_000) throw new Error("名单内容较大，请拆分为更小批次导入"); return body; }
const previewImport = () => run(async () => { plan.value = null; plan.value = await api.preview(event.value!.id, importBody()); }, true);
const commitImport = () => run(async () => { event.value = await api.import(event.value!.id, { ...importBody(), digest: plan.value!.digest }); importVisible.value = false; page.value = 1; await fetchAttendees(); ElMessage.success("名单已导入"); }, true);
const downloadTemplate = () => run(async () => { await downloadExternalCheckinSheet(`${event.value!.title}-名单模板`, [event.value!.fields.map(field => field.label)]); }, true);
const exportRoster = () => run(async () => { const current = event.value!, result = await api.export(current.id); await downloadExternalCheckinSheet(`${current.title}-签到名单`, [current.fields.map(field => field.label).concat(current.fields.filter(field => field.input && !field.match).map(field => field.label + "（现场填写）"), "签到状态", "首次签到时间（北京时间）"), ...result.items.map(row => current.fields.map(field => row.values[field.key] || "").concat(current.fields.filter(field => field.input && !field.match).map(field => row.submittedValues?.[field.key] || ""), row.checkedInAt ? "已签到" : "未签到", row.checkedInAt ? formatTime(row.checkedInAt) : ""))]); });
const showQr = () => run(async () => { const qr = await import("qrcode"); qrImage.value = await qr.toDataURL(publicUrl.value, { width: 840, margin: 4, errorCorrectionLevel: "M" }); qrVisible.value = true; });
function downloadQr() { const a = document.createElement("a"); a.href = qrImage.value; a.download = `${event.value?.title || "会议"}-签到二维码.png`; a.click(); }
onMounted(loadEvents);
</script>

<style scoped>
.external-checkin{max-width:1480px;margin:auto;color:#26342f}.page-header,.section-heading{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:24px}.page-header h1{font-size:28px;margin:7px 0}.eyebrow{font-size:12px;color:#6a7b72;letter-spacing:1px}.muted{color:#68766f;font-size:13px;line-height:1.8}.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.toolbar :deep(.el-button+.el-button){margin-left:0}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#dfe6e1;border:1px solid #dfe6e1;border-radius:10px;overflow:hidden;margin:24px 0}.stats>div{background:#fff;padding:23px 28px}.stats span{font-size:13px;color:#65756b;display:block}.stats strong{font-size:36px;line-height:1.6;font-variant-numeric:tabular-nums}.success-text{color:#217453}.checkin-overview,.roster{background:#fff;border:1px solid #e0e6e2;border-radius:10px;padding:24px;margin-bottom:24px}.checkin-overview h2{font-size:17px;margin:18px 0 10px}.section-heading h2{font-size:18px;margin:0}.filters{margin-bottom:18px}.field-row{display:grid;grid-template-columns:minmax(150px,1fr) auto auto auto auto;align-items:center;gap:14px;margin-bottom:12px}.date-grid,.mapping-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.import-result{background:#f3f7f4;padding:18px;margin-top:20px}.file-button{display:inline-block;position:relative;background:#eef4ef;color:#2b6e4e;border:1px solid #c7d9ce;border-radius:4px;padding:8px 16px;cursor:pointer}.file-button input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.qr-content{text-align:center}.qr-content img{display:block;max-width:100%;height:auto;margin:0 auto}.qr-content :deep(.el-input){margin-top:18px}.event-table :deep(.el-table__row){cursor:pointer}:deep(.el-pagination){margin-top:20px}:deep(.el-alert){margin-bottom:18px}@media(max-width:800px){.page-header{align-items:flex-start;flex-direction:column}.stats>div{padding:15px}.stats strong{font-size:30px}.date-grid,.mapping-grid{grid-template-columns:1fr}.field-row{grid-template-columns:1fr auto}.field-row :deep(.el-input){grid-column:1/-1}.section-heading{align-items:flex-start;flex-direction:column}}
</style>
