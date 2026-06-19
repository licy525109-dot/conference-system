<template>
  <section class="admin-page ai-page">
    <AdminPageHeader title="AI 知识库" eyebrow="AI 知识库" subtitle="按会议维护资料、推荐问题和问答日志；当前检索策略为本地关键词检索，后续可接向量检索。">
      <template #actions>
        <el-button :loading="loading" @click="loadCurrent">刷新</el-button>
      </template>
    </AdminPageHeader>

    <el-alert v-if="section !== 'config'" type="info" :closable="false" show-icon title="会议助手只基于当前会议知识库回答；未命中资料时会明确兜底，不编造答案。" />

    <section v-if="section === 'knowledge-bases'" class="table-panel">
      <div class="panel-heading">
        <div>
          <h3>知识库列表</h3>
          <p>一个会议最多一个知识库，支持启停、统计文档数、分块数和问答数。</p>
        </div>
        <div class="action-row">
          <el-input v-model="filters.keyword" clearable placeholder="搜索知识库 / 会议" @keyup.enter="loadKnowledgeBases" />
          <ConferenceSelect v-model="filters.conferenceId" placeholder="筛选会议" />
          <el-button type="primary" @click="createVisible = true">创建知识库</el-button>
        </div>
      </div>
      <el-table v-loading="loading" :data="knowledgeBases" empty-text="暂无知识库">
        <el-table-column prop="title" label="知识库" min-width="180" />
        <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
        <el-table-column label="启用" width="90"><template #default="{ row }"><AdminStatusBadge :status="row.enabled" /></template></el-table-column>
        <el-table-column prop="documentCount" label="文档" width="90" />
        <el-table-column prop="chunkCount" label="分块" width="90" />
        <el-table-column prop="questionCount" label="问答" width="90" />
        <el-table-column prop="updatedAt" label="最近更新" min-width="170" />
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" @click="selectConference(String(row.conferenceId), 'conference-knowledge')">配置</el-button>
            <el-button size="small" :type="row.enabled ? 'warning' : 'success'" @click="toggleKnowledgeBase(row)">{{ row.enabled ? "停用" : "启用" }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination class="pager" background layout="prev, pager, next, total" :current-page="pager.knowledgePage" :page-size="pageSize" :total="pager.knowledgeTotal" @current-change="changeKnowledgePage" />
    </section>

    <section v-else-if="section === 'conference-knowledge'" class="table-panel">
      <div class="panel-heading">
        <div><h3>会议知识库</h3><p>配置当前会议的回答范围、兜底提示和引用来源开关。</p></div>
        <ConferenceSelect v-model="conferenceId" placeholder="选择会议" />
      </div>
      <el-empty v-if="!conferenceId" description="请选择会议" />
      <el-form v-else :model="kbForm" label-position="top" class="config-form">
        <el-form-item><template #label>知识库启用<FieldHelp content="关闭后用户端不会使用该会议知识库回答问题。" /></template><el-switch v-model="kbForm.enabled" active-text="启用" inactive-text="停用" /></el-form-item>
        <el-form-item label="知识库名称"><el-input v-model="kbForm.title" /></el-form-item>
        <el-form-item label="回答范围说明"><el-input v-model="kbForm.scopeDescription" type="textarea" :rows="3" placeholder="例如：仅回答会议议程、嘉宾、交通和报名相关问题。" /></el-form-item>
        <el-form-item><template #label>兜底回答<FieldHelp content="当当前会议资料没有命中答案时展示给用户。" /></template><el-input v-model="kbForm.fallbackText" type="textarea" :rows="3" /></el-form-item>
        <el-form-item><template #label>引用来源<FieldHelp content="开启后用户端回答会展示命中文档和片段摘要。" /></template><el-switch v-model="kbForm.citationsEnabled" active-text="展示引用" inactive-text="不展示" /></el-form-item>
        <el-form-item><template #label>问答日志<FieldHelp content="开启后记录用户问题、命中资料、兜底状态和错误原因。" /></template><el-switch v-model="kbForm.loggingEnabled" active-text="记录" inactive-text="不记录" /></el-form-item>
        <el-form-item><el-button type="primary" :loading="saving" @click="saveConferenceKnowledge">保存会议知识库</el-button></el-form-item>
      </el-form>
      <div v-if="conferenceId" class="shortcut-row">
        <el-button @click="selectConference(conferenceId, 'documents')">文档管理</el-button>
        <el-button @click="selectConference(conferenceId, 'suggestions')">推荐问题</el-button>
        <el-button @click="selectConference(conferenceId, 'question-logs')">问答日志</el-button>
      </div>
    </section>

    <section v-else-if="section === 'documents'" class="table-panel">
      <div class="panel-heading">
        <div><h3>文档管理</h3><p>支持 txt / md / pdf。PDF 上传后由后端解析文本并分块；扫描件或加密 PDF 会显示失败原因。</p></div>
        <div class="action-row"><ConferenceSelect v-model="conferenceId" placeholder="选择会议" /><el-button type="primary" :disabled="!conferenceId" @click="docVisible = true">新增资料</el-button></div>
      </div>
      <AdminFilterBar>
        <el-input v-model="filters.keyword" clearable placeholder="搜索文档标题 / 内容" @keyup.enter="loadDocuments" />
        <el-select v-model="filters.status" clearable placeholder="状态" style="width: 150px">
          <el-option label="草稿" value="DRAFT" />
          <el-option label="处理中" value="PROCESSING" />
          <el-option label="启用" value="ACTIVE" />
          <el-option label="解析失败" value="FAILED" />
          <el-option label="停用" value="DISABLED" />
        </el-select>
        <template #actions><el-button :disabled="!conferenceId" @click="loadDocuments">查询</el-button></template>
      </AdminFilterBar>
      <el-table v-loading="loading" :data="documents" empty-text="暂无文档">
        <el-table-column prop="title" label="文档标题" min-width="180" />
        <el-table-column prop="sourceType" label="类型" width="90"><template #default="{ row }">{{ sourceTypeText(row.sourceType) }}</template></el-table-column>
        <el-table-column prop="status" label="状态" width="100"><template #default="{ row }">{{ documentStatusText(row.status) }}</template></el-table-column>
        <el-table-column prop="chunkCount" label="分块" width="90" />
        <el-table-column prop="indexedAt" label="最后处理" min-width="170" />
        <el-table-column prop="lastError" label="失败原因" min-width="180" />
        <el-table-column label="操作" width="300">
          <template #default="{ row }">
            <el-button size="small" @click="editDocument(row)">编辑</el-button>
            <el-button size="small" @click="rebuildDocument(row.id)">重建分块</el-button>
            <el-button size="small" :type="row.status === 'ACTIVE' ? 'warning' : 'success'" @click="toggleDocument(row)">{{ row.status === "ACTIVE" ? "停用" : "启用" }}</el-button>
            <el-button size="small" type="danger" @click="removeDocument(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination class="pager" background layout="prev, pager, next, total" :current-page="pager.documentPage" :page-size="pageSize" :total="pager.documentTotal" @current-change="changeDocumentPage" />
    </section>

    <section v-else-if="section === 'suggestions'" class="table-panel">
      <div class="panel-heading">
        <div><h3>推荐问题</h3><p>按会议维护，用户端只展示当前会议推荐问题。</p></div>
        <ConferenceSelect v-model="conferenceId" placeholder="选择会议" />
      </div>
      <el-form class="inline-form" @submit.prevent>
        <el-input v-model="suggestionText" type="textarea" :rows="4" placeholder="每行一个推荐问题，可批量添加" />
        <el-button type="primary" :disabled="!conferenceId || !suggestionText.trim()" @click="saveSuggestions">批量添加</el-button>
      </el-form>
      <el-table :data="suggestions" empty-text="暂无推荐问题">
        <el-table-column prop="question" label="问题" min-width="260">
          <template #default="{ row }"><el-input v-model="row.question" /></template>
        </el-table-column>
        <el-table-column label="排序" width="120"><template #default="{ row }"><el-input-number v-model="row.sortOrder" :min="0" :controls="false" style="width: 88px" /></template></el-table-column>
        <el-table-column label="启用" width="100"><template #default="{ row }"><el-switch v-model="row.enabled" /></template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" type="primary" @click="saveSuggestion(row)">保存</el-button></template></el-table-column>
      </el-table>
    </section>

    <section v-else-if="section === 'question-logs'" class="table-panel">
      <div class="panel-heading">
        <div><h3>问答日志</h3><p>记录用户、会议、知识库、命中文档、兜底状态、provider、model 和错误原因。</p></div>
        <ConferenceSelect v-model="conferenceId" placeholder="选择会议" />
      </div>
      <AdminFilterBar>
        <el-input v-model="filters.keyword" clearable placeholder="用户 / 问题 / 回答关键词" @keyup.enter="loadLogs" />
        <el-select v-model="filters.fallback" clearable placeholder="兜底状态" style="width: 150px">
          <el-option label="兜底" value="true" />
          <el-option label="命中" value="false" />
        </el-select>
        <template #actions><el-button :disabled="!conferenceId" @click="loadLogs">查询</el-button></template>
      </AdminFilterBar>
      <el-table v-loading="loading" :data="logs" empty-text="暂无问答日志">
        <el-table-column prop="question" label="问题" min-width="220" show-overflow-tooltip />
        <el-table-column prop="answer" label="回答" min-width="260" show-overflow-tooltip />
        <el-table-column prop="userId" label="用户" min-width="140" show-overflow-tooltip />
        <el-table-column prop="hit" label="命中" width="80" />
        <el-table-column prop="fallback" label="兜底" width="80" />
        <el-table-column prop="matchedDocumentTitle" label="命中文档" min-width="160" />
        <el-table-column prop="provider" label="来源" width="150"><template #default="{ row }">{{ aiProviderText(row.provider) }}</template></el-table-column>
        <el-table-column prop="model" label="模型" width="130" />
        <el-table-column prop="errorReason" label="错误原因" min-width="150" />
        <el-table-column prop="createdAt" label="创建时间" min-width="170" />
      </el-table>
      <el-pagination class="pager" background layout="prev, pager, next, total" :current-page="pager.logPage" :page-size="pageSize" :total="pager.logTotal" @current-change="changeLogPage" />
    </section>

    <section v-else class="table-panel">
      <div class="panel-heading">
        <div>
          <h3>AI 配置</h3>
          <p>选择 provider 后按提示填写 Base URL、模型和 API Key；本地关键词检索不调用外部 LLM。</p>
        </div>
        <el-button :loading="testingConfig" @click="testConfig">测试连接</el-button>
      </div>
      <el-form :model="configForm" label-position="top" class="config-form">
        <el-form-item><template #label>启用开关<FieldHelp content="关闭后用户端会议助手返回未启用提示。" /></template><el-switch v-model="configForm.enabled" active-text="启用" inactive-text="停用" /></el-form-item>
        <el-form-item>
          <template #label>AI provider<FieldHelp content="本地关键词检索不是真实 LLM；外部 provider 可使用后台加密 API Key 或服务器环境变量。" /></template>
          <el-select v-model="configForm.provider" style="width: 100%" @change="applyProviderDefaults">
            <el-option label="本地关键词检索" value="LOCAL_FALLBACK" />
            <el-option label="DEEPSEEK：DeepSeek API" value="DEEPSEEK" />
            <el-option label="OPENAI_COMPATIBLE：OpenAI 兼容接口" value="OPENAI_COMPATIBLE" />
            <el-option label="CUSTOM：自定义兼容接口" value="CUSTOM" />
          </el-select>
        </el-form-item>
        <el-alert class="config-source" type="info" :closable="false" :title="providerHelp" />
        <el-form-item><template #label>Base URL<FieldHelp content="外部 provider 的 API baseURL；本地关键词检索可留空。" /></template><el-input v-model="configForm.baseUrl" placeholder="https://api.example.com/v1" /></el-form-item>
        <el-form-item><template #label>模型名称<FieldHelp content="本地降级模式使用 local-keyword；真实 provider 可填服务端实际模型名。" /></template><el-input v-model="configForm.model" placeholder="local-keyword" /></el-form-item>
        <el-form-item><template #label>API Key<FieldHelp content="保存后加密入库，接口只返回 configured/masked，不返回明文。" /></template><el-input v-model="configForm.apiKey" show-password :placeholder="aiKeyPlaceholder" /></el-form-item>
        <el-form-item label="回答温度"><el-input-number v-model="configForm.temperature" :min="0" :max="200" /></el-form-item>
        <el-form-item label="最大输出长度"><el-input-number v-model="configForm.maxOutputTokens" :min="120" :max="4000" /></el-form-item>
        <el-form-item><template #label>兜底回答<FieldHelp content="未命中当前会议资料时返回兜底，不编造。" /></template><el-switch v-model="configForm.fallbackEnabled" active-text="启用" inactive-text="停用" /></el-form-item>
        <el-form-item><template #label>引用来源<FieldHelp content="开启后回答返回命中文档与摘要。" /></template><el-switch v-model="configForm.citationsEnabled" active-text="启用" inactive-text="停用" /></el-form-item>
        <el-form-item><template #label>问答日志<FieldHelp content="开启后记录问题、答案、命中来源、兜底状态和错误原因。" /></template><el-switch v-model="configForm.questionLogEnabled" active-text="启用" inactive-text="停用" /></el-form-item>
        <el-alert type="warning" :closable="false" :title="configNotice" />
        <el-alert class="config-source" type="info" :closable="false" :title="`当前生效来源：${sourceText(configForm.source)}；当前是否真实 LLM：${isRealLlm ? '是' : '否'}。${configForm.runtimeNotice || ''}`" />
        <pre v-if="testResult" class="test-result">{{ testResult }}</pre>
        <el-form-item><el-button type="primary" :loading="saving" @click="saveConfig">保存 AI 配置</el-button></el-form-item>
      </el-form>
    </section>

    <el-dialog v-model="createVisible" title="创建知识库" width="560px">
      <el-form :model="createForm" label-position="top">
        <el-form-item label="绑定会议"><ConferenceSelect v-model="createForm.conferenceId" placeholder="选择会议" /></el-form-item>
        <el-form-item label="知识库名称"><el-input v-model="createForm.title" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="createVisible = false">取消</el-button><el-button type="primary" @click="saveNewKnowledgeBase">创建</el-button></template>
    </el-dialog>

    <el-dialog v-model="docVisible" :title="docForm.id ? '编辑文档' : '新增文档'" width="760px">
      <el-form :model="docForm" label-position="top">
        <el-form-item label="文档标题"><el-input v-model="docForm.title" /></el-form-item>
        <el-form-item label="文档类型"><el-select v-model="docForm.sourceType"><el-option label="文本" value="TEXT" /><el-option label="Markdown" value="MD" /><el-option label="PDF" value="PDF" /></el-select></el-form-item>
        <el-form-item><template #label>文档状态<FieldHelp content="草稿不建议对用户回答；启用会参与检索；解析失败会保留失败原因；停用不参与检索。" /></template><el-select v-model="docForm.status"><el-option label="草稿" value="DRAFT" /><el-option label="处理中" value="PROCESSING" /><el-option label="启用" value="ACTIVE" /><el-option label="解析失败" value="FAILED" /><el-option label="停用" value="DISABLED" /></el-select></el-form-item>
        <el-form-item label="上传资料文件"><input type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" @change="readDocumentFile" /><p class="muted-text">txt/md 由浏览器读取；PDF 单个不超过 10MB，由后端解析文本。扫描图片 PDF 可能无法解析。</p></el-form-item>
        <el-form-item label="资料内容"><el-input v-model="docForm.contentText" type="textarea" :rows="10" :placeholder="docForm.sourceType === 'PDF' ? 'PDF 将由后端解析，解析结果保存后可在列表查看分块数；也可改为 TEXT/MD 粘贴文本。' : '粘贴会议介绍、议程、嘉宾、交通、报名须知等资料'" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="docVisible = false">取消</el-button><el-button type="primary" :disabled="!canSaveDocument" @click="saveDocument">保存</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import FieldHelp from "../../components/FieldHelp.vue";
import ConferenceSelect from "../../components/selectors/ConferenceSelect.vue";
import { currentRoute, navigateTo } from "../../router";
import {
  createAiSuggestions,
  createKnowledgeBase,
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  getAiConfig,
  getKnowledgeBase,
  listAiQuestionLogs,
  listAiSuggestions,
  listKnowledgeBases,
  listKnowledgeDocuments,
  rebuildKnowledgeDocument,
  testAiConfig,
  updateAiConfig,
  updateAiSuggestion,
  updateConferenceKnowledgeBase,
  updateKnowledgeBase,
  updateKnowledgeDocument
} from "../../services/admin";

const section = computed(() => currentRoute.value.path.split("/").pop() || "knowledge-bases");
const loading = ref(false);
const saving = ref(false);
const testingConfig = ref(false);
const conferenceId = ref("");
const knowledgeBases = ref<Record<string, any>[]>([]);
const documents = ref<Record<string, any>[]>([]);
const suggestions = ref<Record<string, any>[]>([]);
const logs = ref<Record<string, any>[]>([]);
const pageSize = 50;
const createVisible = ref(false);
const docVisible = ref(false);
const suggestionText = ref("");
const filters = reactive({ keyword: "", conferenceId: "", status: "", fallback: "" });
const pager = reactive({ knowledgePage: 1, knowledgeTotal: 0, documentPage: 1, documentTotal: 0, logPage: 1, logTotal: 0 });
const createForm = reactive({ conferenceId: "", title: "会议知识库" });
const kbForm = reactive({ id: "", title: "", enabled: false, scopeDescription: "", fallbackText: "当前会议资料中未找到相关信息，请联系会务人员确认。", citationsEnabled: true, loggingEnabled: true });
const docForm = reactive({ id: "", title: "", sourceType: "TEXT", status: "ACTIVE", contentText: "", fileBase64: "" });
const configForm = reactive({ enabled: false, provider: "LOCAL_FALLBACK", baseUrl: "", model: "local-keyword", apiKey: "", temperature: 0, maxOutputTokens: 800, fallbackEnabled: true, citationsEnabled: true, questionLogEnabled: true, source: "LOCAL_FALLBACK", runtimeNotice: "", env: {} as Record<string, any>, secret: {} as Record<string, any> });
const testResult = ref("");
const configNotice = computed(() => {
  const secret = configForm.secret?.apiKey;
  if (String(configForm.provider || "").toUpperCase() !== "LOCAL_FALLBACK" && !secret?.configured) return "当前 AI provider key 未在服务器环境变量中配置，用户端会显示 provider 未配置提示。";
  return "本地关键词检索不是真实 LLM；未命中当前会议资料时返回兜底，不编造答案。";
});
const providerHelp = computed(() => {
  const provider = String(configForm.provider || "LOCAL_FALLBACK").toUpperCase();
  if (provider === "DEEPSEEK") return "DEEPSEEK：Base URL 可填 https://api.deepseek.com 或 https://api.deepseek.com/v1；模型示例 deepseek-chat / deepseek-reasoner。";
  if (provider === "OPENAI_COMPATIBLE") return "OPENAI_COMPATIBLE：Base URL 和模型名称由服务商提供，例如 https://api.example.com/v1。";
  if (provider === "CUSTOM") return "CUSTOM：用于兼容 OpenAI API 形态的自定义服务，请确认 /models 或 chat 接口可访问。";
  return "本地关键词检索：无需 API Key，只检索当前会议资料，不是真实大模型。";
});
const isRealLlm = computed(() => String(configForm.provider || configForm.source || "LOCAL_FALLBACK").toUpperCase() !== "LOCAL_FALLBACK");
const aiKeyPlaceholder = computed(() => (configForm.secret?.apiKey?.configured ? `已配置：${configForm.secret.apiKey.masked || "******"}；留空不修改` : "未配置，填写后加密保存"));
const canSaveDocument = computed(() => Boolean(docForm.title && (docForm.sourceType === "PDF" ? docForm.fileBase64 || docForm.contentText : docForm.contentText)));

onMounted(() => void loadCurrent());
watch(section, () => void loadCurrent());
watch(conferenceId, () => {
  if (["conference-knowledge", "documents", "suggestions", "question-logs"].includes(section.value)) void loadCurrent();
});

async function loadCurrent() {
  if (section.value === "knowledge-bases") return loadKnowledgeBases();
  if (section.value === "conference-knowledge") return loadConferenceKnowledge();
  if (section.value === "documents") return loadDocuments();
  if (section.value === "suggestions") return loadSuggestions();
  if (section.value === "question-logs") return loadLogs();
  return loadConfig();
}

async function loadKnowledgeBases() {
  loading.value = true;
  try {
    const data = await listKnowledgeBases({ page: pager.knowledgePage, pageSize, keyword: filters.keyword, conferenceId: filters.conferenceId });
    knowledgeBases.value = data.items;
    pager.knowledgeTotal = data.total;
  } finally {
    loading.value = false;
  }
}

async function loadConferenceKnowledge() {
  if (!conferenceId.value) return;
  const kb = await getKnowledgeBase(conferenceId.value);
  Object.assign(kbForm, {
    id: String(kb.id || ""),
    title: String(kb.title || "会议知识库"),
    enabled: Boolean(kb.enabled),
    scopeDescription: String(kb.scopeDescription || ""),
    fallbackText: String(kb.fallbackText || "当前会议资料中未找到相关信息，请联系会务人员确认。"),
    citationsEnabled: kb.citationsEnabled !== false,
    loggingEnabled: kb.loggingEnabled !== false
  });
}

async function loadDocuments() {
  if (!conferenceId.value) return;
  loading.value = true;
  try {
    const data = await listKnowledgeDocuments(conferenceId.value, { page: pager.documentPage, pageSize, keyword: filters.keyword, status: filters.status });
    documents.value = data.items;
    pager.documentTotal = data.total;
  } finally {
    loading.value = false;
  }
}

async function loadSuggestions() {
  if (!conferenceId.value) return;
  suggestions.value = (await listAiSuggestions(conferenceId.value)).items.map((item) => ({ ...item }));
}

async function loadLogs() {
  if (!conferenceId.value) return;
  loading.value = true;
  try {
    const data = await listAiQuestionLogs(conferenceId.value, { page: pager.logPage, pageSize, keyword: filters.keyword, fallback: filters.fallback });
    logs.value = data.items;
    pager.logTotal = data.total;
  } finally {
    loading.value = false;
  }
}

async function loadConfig() {
  Object.assign(configForm, await getAiConfig());
}

async function saveNewKnowledgeBase() {
  await createKnowledgeBase({ conferenceId: createForm.conferenceId, title: createForm.title });
  createVisible.value = false;
  await loadKnowledgeBases();
  ElMessage.success("知识库已创建");
}

async function toggleKnowledgeBase(row: Record<string, any>) {
  await updateKnowledgeBase(String(row.id), { enabled: !row.enabled });
  await loadKnowledgeBases();
}

async function saveConferenceKnowledge() {
  saving.value = true;
  try {
    await updateConferenceKnowledgeBase(conferenceId.value, { ...kbForm });
    ElMessage.success("会议知识库已保存");
  } finally {
    saving.value = false;
  }
}

function editDocument(row: Record<string, any>) {
  Object.assign(docForm, { id: row.id, title: row.title, sourceType: row.sourceType || "TEXT", status: row.status || "ACTIVE", contentText: row.contentText || "", fileBase64: "" });
  docVisible.value = true;
}

async function saveDocument() {
  const payload = { title: docForm.title, sourceType: docForm.sourceType, status: docForm.status, contentText: docForm.contentText, fileBase64: docForm.fileBase64 };
  if (docForm.id) await updateKnowledgeDocument(docForm.id, payload);
  else await createKnowledgeDocument(conferenceId.value, payload);
  Object.assign(docForm, { id: "", title: "", sourceType: "TEXT", status: "ACTIVE", contentText: "", fileBase64: "" });
  docVisible.value = false;
  await loadDocuments();
  ElMessage.success("文档已保存并完成分块");
}

async function readDocumentFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (!/\.(txt|md|pdf)$/i.test(file.name)) {
    ElMessage.warning("仅支持 txt / md / pdf 文件");
    return;
  }
  docForm.title ||= file.name.replace(/\.(txt|md|pdf)$/i, "");
  if (/\.pdf$/i.test(file.name)) {
    if (file.size > 10 * 1024 * 1024) {
      ElMessage.error("PDF 文件过大，单个不超过 10MB");
      return;
    }
    docForm.sourceType = "PDF";
    docForm.fileBase64 = await readAsDataUrl(file);
    docForm.contentText = "";
    ElMessage.info("PDF 已读取，保存后由后端解析文本并分块");
    return;
  }
  docForm.sourceType = /\.md$/i.test(file.name) ? "MD" : "TEXT";
  docForm.fileBase64 = "";
  docForm.contentText = await file.text();
}

async function rebuildDocument(id: string) {
  await rebuildKnowledgeDocument(String(id));
  await loadDocuments();
  ElMessage.success("分块已重建");
}

async function toggleDocument(row: Record<string, any>) {
  await updateKnowledgeDocument(String(row.id), { status: row.status === "ACTIVE" ? "DISABLED" : "ACTIVE" });
  await loadDocuments();
}

async function removeDocument(id: string) {
  await ElMessageBox.confirm("删除后该文档和分块不再参与回答，确认删除？", "删除文档", { type: "warning" });
  await deleteKnowledgeDocument(String(id));
  await loadDocuments();
}

async function saveSuggestions() {
  await createAiSuggestions(conferenceId.value, { questions: suggestionText.value.split("\n").map((item) => item.trim()).filter(Boolean) });
  suggestionText.value = "";
  await loadSuggestions();
  ElMessage.success("推荐问题已添加");
}

async function saveSuggestion(row: Record<string, any>) {
  await updateAiSuggestion(String(row.id), { question: row.question, sortOrder: row.sortOrder, enabled: row.enabled });
  await loadSuggestions();
  ElMessage.success("推荐问题已保存");
}

async function saveConfig() {
  saving.value = true;
  try {
    Object.assign(configForm, await updateAiConfig({ ...configForm }));
    configForm.apiKey = "";
    ElMessage.success("AI 配置已保存");
  } finally {
    saving.value = false;
  }
}

async function testConfig() {
  testingConfig.value = true;
  try {
    const result = await testAiConfig({ provider: configForm.provider, baseUrl: configForm.baseUrl, model: configForm.model, apiKey: configForm.apiKey });
    testResult.value = JSON.stringify(result, null, 2);
    if (result.success) ElMessage.success("AI 配置测试通过");
    else ElMessage.warning(String(result.reason || "AI 配置测试失败"));
  } finally {
    testingConfig.value = false;
  }
}

function applyProviderDefaults() {
  const provider = String(configForm.provider || "").toUpperCase();
  if (provider === "LOCAL_FALLBACK") {
    configForm.baseUrl = "";
    configForm.model = "local-keyword";
  } else if (provider === "DEEPSEEK") {
    configForm.baseUrl ||= "https://api.deepseek.com/v1";
    if (!configForm.model || configForm.model === "local-keyword") configForm.model = "deepseek-chat";
  } else if (!configForm.model || configForm.model === "local-keyword") {
    configForm.model = "gpt-compatible";
  }
}

function sourceText(value: unknown) {
  return ({ DB: "后台配置", ENV: "环境变量", LOCAL_FALLBACK: "本地关键词检索" } as Record<string, string>)[String(value || "LOCAL_FALLBACK")] ?? String(value || "LOCAL_FALLBACK");
}

function documentStatusText(value: unknown) {
  return ({ DRAFT: "草稿", PROCESSING: "处理中", ACTIVE: "启用", FAILED: "解析失败", DISABLED: "停用" } as Record<string, string>)[String(value || "")] ?? String(value || "-");
}

function sourceTypeText(value: unknown) {
  return ({ TEXT: "文本", MD: "Markdown", PDF: "PDF" } as Record<string, string>)[String(value || "")] ?? String(value || "-");
}

function aiProviderText(value: unknown) {
  return ({ LOCAL_FALLBACK: "本地关键词检索", DEEPSEEK: "DeepSeek", OPENAI_COMPATIBLE: "OpenAI 兼容接口", CUSTOM: "自定义接口" } as Record<string, string>)[String(value || "")] ?? String(value || "-");
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function selectConference(id: string, target: string) {
  conferenceId.value = id;
  navigateTo(`/ai/${target}`);
}

function changeKnowledgePage(page: number) {
  pager.knowledgePage = page;
  void loadKnowledgeBases();
}

function changeDocumentPage(page: number) {
  pager.documentPage = page;
  void loadDocuments();
}

function changeLogPage(page: number) {
  pager.logPage = page;
  void loadLogs();
}
</script>

<style scoped>
.ai-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.table-panel {
  padding: 18px;
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  background: #fff;
}

.panel-heading,
.action-row,
.shortcut-row,
.inline-form {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
}

.panel-heading h3 {
  margin: 0 0 6px;
}

.panel-heading p,
.muted-text {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.action-row {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.action-row :deep(.el-input),
.action-row :deep(.el-select) {
  width: 220px;
}

.config-form {
  max-width: 760px;
}

.config-source {
  margin-bottom: 12px;
}

.test-result {
  max-height: 260px;
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  white-space: pre-wrap;
}

.inline-form {
  align-items: center;
}

.inline-form :deep(.el-textarea) {
  flex: 1;
}

.pager {
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
