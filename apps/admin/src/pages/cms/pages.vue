<template>
  <section class="admin-page cms-dsl-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">页面装修 DSL 控制台</h1>
        <p class="page-subtitle">CMS 只编辑 P9 DSL；预览、H5 和小程序共用 Render Governor 与 Runtime。</p>
      </div>
      <div class="inline-actions">
        <el-button @click="createVisible = true">新增页面</el-button>
        <el-button :disabled="!version" :loading="saving" @click="saveDraft">保存 DSL</el-button>
        <el-button :disabled="!version" type="primary" :loading="publishing" @click="publish">发布 DSL</el-button>
      </div>
    </div>

    <section class="dsl-workbench">
      <aside class="dsl-sidebar">
        <section class="data-panel">
          <div class="panel-head">
            <div>
              <strong>页面</strong>
              <span>选择一个 CMS DSL 文档</span>
            </div>
            <el-button link type="primary" @click="loadPages">刷新</el-button>
          </div>
          <div class="page-list">
            <button
              v-for="page in pages"
              :key="page.id"
              :class="['page-item', selectedPage?.id === page.id ? 'active' : '']"
              type="button"
              @click="selectPage(page)"
            >
              <strong>{{ page.title }}</strong>
              <span>{{ page.pageKey }}</span>
              <small>{{ page.publishedVersionId ? "已发布" : "草稿" }} · {{ page.versions.length }} 个版本</small>
            </button>
          </div>
        </section>

        <section class="data-panel">
          <div class="panel-head">
            <div>
              <strong>版本</strong>
              <span>编辑草稿或从发布版创建草稿</span>
            </div>
          </div>
          <el-select v-model="selectedVersionId" placeholder="选择版本" @change="loadVersion">
            <el-option
              v-for="item in selectedPage?.versions ?? []"
              :key="item.id"
              :label="`v${item.versionNo} ${item.status}`"
              :value="item.id"
            />
          </el-select>
          <el-button class="full-button" :disabled="!selectedPage" @click="rollback">从已发布版回滚</el-button>
        </section>

        <section class="data-panel">
          <div class="panel-head">
            <div>
              <strong>新增节点</strong>
              <span>所有操作都会生成 DSL AST</span>
            </div>
          </div>
          <div class="node-type-grid">
            <button v-for="type in dslTypes" :key="type" type="button" @click="addNode(type)">
              {{ type }}
            </button>
          </div>
        </section>
      </aside>

      <main class="dsl-main">
        <section class="data-panel">
          <div class="panel-head">
            <div>
              <strong>DSL AST</strong>
              <span>{{ currentDsl.schemaVersion }} · {{ currentDsl.page }} · {{ currentDsl.dsl.nodes.length }} nodes</span>
            </div>
            <el-tag type="success">DSL Only</el-tag>
          </div>

          <el-empty v-if="!version" description="请选择页面版本" />
          <template v-else>
            <div class="version-row">
              <el-input v-model="versionTitle" placeholder="DSL 版本标题" />
              <el-input v-model="currentDsl.page" placeholder="page key" />
            </div>

            <div class="node-list">
              <button
                v-for="(node, index) in currentDsl.dsl.nodes"
                :key="node.id"
                type="button"
                :class="['node-row', selectedNodeId === node.id ? 'active' : '']"
                @click="selectNode(node.id)"
              >
                <span>
                  <strong>{{ index + 1 }}. {{ node.type }}</strong>
                  <small>{{ node.id }} · {{ node.enabled === false ? "hidden" : "enabled" }}</small>
                </span>
                <span class="node-actions">
                  <i @click.stop="moveNode(index, -1)">上移</i>
                  <i @click.stop="moveNode(index, 1)">下移</i>
                  <i @click.stop="duplicateNode(node)">复制</i>
                  <i class="danger" @click.stop="removeNode(node.id)">删除</i>
                </span>
              </button>
            </div>
          </template>
        </section>

        <section v-if="selectedNode" class="data-panel">
          <div class="panel-head">
            <div>
              <strong>节点属性</strong>
              <span>{{ selectedNode.id }}</span>
            </div>
            <el-switch v-model="selectedNode.enabled" active-text="启用" inactive-text="隐藏" />
          </div>
          <div class="editor-grid">
            <el-input v-model="selectedNode.id" label="id" placeholder="node id" />
            <el-select v-model="selectedNode.type">
              <el-option v-for="type in dslTypes" :key="type" :label="type" :value="type" />
            </el-select>
            <el-input-number v-model="selectedNode.sortOrder" :min="0" :step="10" />
          </div>
          <el-tabs v-model="activeEditorTab">
            <el-tab-pane label="props" name="props">
              <el-input v-model="propsJson" type="textarea" :rows="10" spellcheck="false" @blur="applyJson('props')" />
            </el-tab-pane>
            <el-tab-pane label="style" name="style">
              <el-input v-model="styleJson" type="textarea" :rows="8" spellcheck="false" @blur="applyJson('style')" />
            </el-tab-pane>
            <el-tab-pane label="action" name="action">
              <el-input v-model="actionJson" type="textarea" :rows="8" spellcheck="false" @blur="applyJson('action')" />
            </el-tab-pane>
          </el-tabs>
        </section>

        <section class="data-panel">
          <div class="panel-head">
            <div>
              <strong>Raw DSL</strong>
              <span>保存前可直接编辑完整 DSL JSON</span>
            </div>
            <el-button @click="applyRawDsl">应用 JSON</el-button>
          </div>
          <el-input v-model="rawDslJson" type="textarea" :rows="14" spellcheck="false" />
        </section>
      </main>

      <aside class="dsl-preview">
        <section class="data-panel preview-shell">
          <div class="panel-head">
            <div>
              <strong>Runtime 预览</strong>
              <span>Render Governor → Runtime → Design System</span>
            </div>
            <el-tag v-if="renderWarnings.length" type="warning">{{ renderWarnings.length }} warnings</el-tag>
          </div>
          <el-alert
            v-for="warning in renderWarnings"
            :key="`${warning.code}-${warning.nodeId || warning.type || warning.message}`"
            class="warning-alert"
            type="warning"
            :closable="false"
            :title="warning.message"
          />
          <div class="phone-window">
            <AdminDslRenderTree :nodes="renderTree.nodes" />
          </div>
        </section>
      </aside>
    </section>

    <el-dialog v-model="createVisible" title="新增 DSL 页面" width="520px">
      <el-form label-width="92px">
        <el-form-item label="页面 Key">
          <el-input v-model="createForm.pageKey" placeholder="custom:landing" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="createForm.title" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="createForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createDslPage">创建</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { PageDsl } from "@conference/dsl-runtime";
import { createGovernedRuntimeContext, governRender, type RenderGovernorWarning } from "@conference/render-governor";
import AdminDslRenderTree from "../../components/design-system/AdminDslRenderTree.vue";
import {
  createPage,
  getPageVersion,
  listPages,
  publishPageVersion,
  rollbackPage,
  updatePageVersion
} from "../../services/admin";
import type { DslEditorNode, PageTemplate, PageVersion } from "../../services/types";

const dslTypes = ["ds-banner", "ds-grid", "ds-card", "ds-list", "ds-section", "ds-button", "ds-tag", "ds-image", "ds-carousel"];

const pages = ref<PageTemplate[]>([]);
const selectedPage = ref<PageTemplate | null>(null);
const selectedVersionId = ref("");
const version = ref<PageVersion | null>(null);
const versionTitle = ref("");
const selectedNodeId = ref("");
const activeEditorTab = ref("props");
const saving = ref(false);
const publishing = ref(false);
const creating = ref(false);
const createVisible = ref(false);
const createForm = reactive({ pageKey: "", title: "", description: "" });

const currentDsl = reactive<PageDsl>({
  schemaVersion: "p9",
  page: "cms",
  dsl: {
    nodes: []
  }
});

const propsJson = ref("{}");
const styleJson = ref("{}");
const actionJson = ref("{}");
const rawDslJson = ref("{}");

const selectedNode = computed(() => currentDsl.dsl.nodes.find((node) => node.id === selectedNodeId.value) as DslEditorNode | undefined);
const runtimeContext = computed(() =>
  createGovernedRuntimeContext({
    page: currentDsl.page,
    platform: "admin",
    data: {},
    theme: { id: "admin-preview", name: "Admin Preview" }
  })
);
const governed = computed(() => governRender(cloneDsl(currentDsl), { context: runtimeContext.value, allowLegacyDslFallback: false }));
const renderTree = computed(() => governed.value.tree);
const renderWarnings = computed<RenderGovernorWarning[]>(() => governed.value.warnings);

watch(selectedNode, (node) => {
  propsJson.value = formatJson(node?.props ?? {});
  styleJson.value = formatJson(node?.style ?? {});
  actionJson.value = formatJson(node?.action ?? {});
});

watch(
  currentDsl,
  () => {
    rawDslJson.value = formatJson(cloneDsl(currentDsl));
  },
  { deep: true }
);

onMounted(loadPages);

async function loadPages(): Promise<void> {
  const response = await listPages();
  pages.value = response.items;
  if (!selectedPage.value && pages.value.length > 0) {
    await selectPage(pages.value[0]);
  }
}

async function selectPage(page: PageTemplate): Promise<void> {
  selectedPage.value = page;
  const editable = page.versions.find((item) => item.status === "DRAFT") ?? page.versions[0];
  selectedVersionId.value = editable?.id ?? "";
  if (selectedVersionId.value) {
    await loadVersion(selectedVersionId.value);
  } else {
    resetDsl(page.pageKey, []);
  }
}

async function loadVersion(id = selectedVersionId.value): Promise<void> {
  if (!id) return;
  const response = await getPageVersion(id);
  version.value = response;
  versionTitle.value = response.title;
  const dsl = normalizeDsl(response.dsl, response.template.pageKey);
  resetDsl(dsl.page, dsl.dsl.nodes);
}

function resetDsl(page: string, nodes: DslEditorNode[]): void {
  currentDsl.schemaVersion = "p9";
  currentDsl.page = page;
  currentDsl.dsl.nodes = nodes.map((node, index) => normalizeNode(node, index));
  selectedNodeId.value = currentDsl.dsl.nodes[0]?.id ?? "";
  rawDslJson.value = formatJson(cloneDsl(currentDsl));
}

function addNode(type: string): void {
  const node = normalizeNode({
    id: `${type}-${Date.now().toString(36)}`,
    type,
    enabled: true,
    sortOrder: currentDsl.dsl.nodes.length * 10,
    props: defaultPropsFor(type),
    style: {},
    action: {}
  }, currentDsl.dsl.nodes.length);
  currentDsl.dsl.nodes.push(node);
  selectedNodeId.value = node.id;
}

function selectNode(id: string): void {
  selectedNodeId.value = id;
}

function moveNode(index: number, direction: -1 | 1): void {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= currentDsl.dsl.nodes.length) return;
  const [node] = currentDsl.dsl.nodes.splice(index, 1);
  if (!node) return;
  currentDsl.dsl.nodes.splice(nextIndex, 0, node);
  resequenceNodes();
}

function duplicateNode(node: DslEditorNode): void {
  const copy = normalizeNode({ ...deepClone(node), id: `${node.id}-copy-${Date.now().toString(36)}` }, currentDsl.dsl.nodes.length);
  currentDsl.dsl.nodes.push(copy);
  selectedNodeId.value = copy.id;
}

function removeNode(id: string): void {
  const index = currentDsl.dsl.nodes.findIndex((node) => node.id === id);
  if (index < 0) return;
  currentDsl.dsl.nodes.splice(index, 1);
  selectedNodeId.value = currentDsl.dsl.nodes[Math.max(index - 1, 0)]?.id ?? "";
  resequenceNodes();
}

function resequenceNodes(): void {
  currentDsl.dsl.nodes.forEach((node, index) => {
    node.sortOrder = index * 10;
  });
}

function applyJson(target: "props" | "style" | "action"): void {
  if (!selectedNode.value) return;
  const source = target === "props" ? propsJson.value : target === "style" ? styleJson.value : actionJson.value;
  try {
    const parsed = parseJsonObject(source);
    selectedNode.value[target] = parsed;
    if (target === "action") {
      selectedNode.value.props = { ...(selectedNode.value.props ?? {}), action: parsed };
    }
    ElMessage.success(`${target} 已应用`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "JSON 不合法");
  }
}

function applyRawDsl(): void {
  try {
    const parsed = JSON.parse(rawDslJson.value) as unknown;
    const dsl = normalizeDsl(parsed, currentDsl.page);
    resetDsl(dsl.page, dsl.dsl.nodes);
    ElMessage.success("DSL JSON 已应用");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "DSL JSON 不合法");
  }
}

async function saveDraft(): Promise<void> {
  if (!version.value) return;
  saving.value = true;
  try {
    const response = await updatePageVersion(version.value.id, {
      title: versionTitle.value,
      dsl: cloneDsl(currentDsl),
      themeJson: version.value.themeJson ?? null
    });
    version.value = response;
    ElMessage.success("DSL 草稿已保存");
    await loadPages();
  } finally {
    saving.value = false;
  }
}

async function publish(): Promise<void> {
  if (!version.value) return;
  await saveDraft();
  publishing.value = true;
  try {
    const response = await publishPageVersion(version.value.id);
    version.value = response;
    ElMessage.success("DSL 已发布");
    await loadPages();
  } finally {
    publishing.value = false;
  }
}

async function rollback(): Promise<void> {
  if (!selectedPage.value) return;
  await ElMessageBox.confirm("将从最近发布或归档版本创建新的发布版本，是否继续？", "回滚页面", { type: "warning" });
  const response = await rollbackPage(selectedPage.value.id);
  version.value = response;
  selectedVersionId.value = response.id;
  resetDsl(response.dsl?.page ?? selectedPage.value.pageKey, response.dsl?.dsl.nodes ?? []);
  await loadPages();
}

async function createDslPage(): Promise<void> {
  const pageKey = createForm.pageKey.trim();
  const title = createForm.title.trim();
  if (!pageKey || !title) {
    ElMessage.warning("请填写页面 Key 和标题");
    return;
  }
  creating.value = true;
  try {
    await createPage({
      pageKey,
      title,
      description: createForm.description.trim(),
      dsl: { schemaVersion: "p9", page: pageKey, dsl: { nodes: [] } }
    });
    createVisible.value = false;
    Object.assign(createForm, { pageKey: "", title: "", description: "" });
    await loadPages();
    ElMessage.success("DSL 页面已创建");
  } finally {
    creating.value = false;
  }
}

function normalizeDsl(value: unknown, fallbackPage: string): PageDsl {
  if (!isRecord(value)) return { schemaVersion: "p9", page: fallbackPage, dsl: { nodes: [] } };
  const source = isRecord(value.dsl) ? value.dsl : value;
  return {
    schemaVersion: "p9",
    page: typeof value.page === "string" && value.page.trim() ? value.page : fallbackPage,
    dsl: {
      nodes: Array.isArray(source.nodes) ? source.nodes.map((node, index) => normalizeNode(node, index)) : []
    }
  };
}

function normalizeNode(value: unknown, index: number): DslEditorNode {
  const record = isRecord(value) ? value : {};
  const type = typeof record.type === "string" && record.type.trim() ? record.type : "ds-section";
  const action = isRecord(record.action) ? record.action : (isRecord(record.props) && isRecord(record.props.action) ? record.props.action : {});
  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id : `${type}-${index + 1}`,
    type,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    sortOrder: Number.isFinite(Number(record.sortOrder)) ? Number(record.sortOrder) : index * 10,
    props: isRecord(record.props) ? { ...record.props, ...(Object.keys(action).length > 0 ? { action } : {}) } : defaultPropsFor(type),
    style: isRecord(record.style) ? record.style : {},
    action,
    children: Array.isArray(record.children) ? record.children.map((child, childIndex) => normalizeNode(child, childIndex)) : [],
    meta: isRecord(record.meta) ? record.meta : {}
  };
}

function defaultPropsFor(type: string): Record<string, unknown> {
  if (type === "ds-banner") return { title: "主视觉标题", subtitle: "活动推荐", description: "在这里填写页面主视觉文案", buttonText: "查看详情" };
  if (type === "ds-grid") return { title: "入口宫格", columns: 4, items: [{ id: "entry-1", title: "入口", subtitle: "说明" }] };
  if (type === "ds-list") return { title: "内容列表", emptyText: "暂无内容", items: [{ id: "item-1", title: "列表项", description: "列表描述" }] };
  if (type === "ds-button") return { text: "立即行动", action: { type: "page", pageKey: "home" } };
  if (type === "ds-carousel") return { images: [] };
  return { title: "模块标题", description: "模块说明" };
}

function cloneDsl(dsl: PageDsl): PageDsl {
  return deepClone(dsl);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value || "{}") as unknown;
  if (!isRecord(parsed)) throw new Error("必须是 JSON 对象");
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
</script>

<style scoped>
.cms-dsl-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.page-header,
.data-panel {
  border: 1px solid #dbe4e1;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 10px 28px rgb(23 32 38 / 6%);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
}

.page-title {
  margin: 0;
  color: #172026;
  font-size: 22px;
}

.page-subtitle {
  margin: 6px 0 0;
  color: #5f6d76;
}

.inline-actions {
  display: flex;
  gap: 10px;
}

.dsl-workbench {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 390px;
  gap: 18px;
  align-items: start;
}

.dsl-sidebar,
.dsl-main,
.dsl-preview {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 16px;
}

.data-panel {
  padding: 16px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.panel-head strong,
.panel-head span {
  display: block;
}

.panel-head span {
  color: #5f6d76;
  font-size: 12px;
}

.page-list,
.node-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.page-item,
.node-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border: 1px solid #dbe4e1;
  border-radius: 8px;
  background: #f8faf9;
  color: #172026;
  text-align: left;
}

.page-item.active,
.node-row.active {
  border-color: #315d7d;
  background: #e6eef4;
}

.page-item span,
.page-item small,
.node-row small {
  display: block;
  color: #5f6d76;
}

.node-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  color: #315d7d;
  font-size: 12px;
}

.node-actions i {
  font-style: normal;
}

.node-actions .danger {
  color: #c14242;
}

.node-type-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.node-type-grid button,
.full-button {
  width: 100%;
  margin-top: 10px;
}

.node-type-grid button {
  height: 34px;
  border: 1px solid #dbe4e1;
  border-radius: 8px;
  background: #fff;
  color: #315d7d;
}

.version-row,
.editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.editor-grid {
  grid-template-columns: minmax(0, 1fr) 180px 140px;
}

.warning-alert {
  margin-bottom: 10px;
}

.preview-shell {
  position: sticky;
  top: 16px;
}

.phone-window {
  min-height: 620px;
  padding: 16px;
  border: 10px solid #172026;
  border-radius: 28px;
  background: #f5f7f6;
}

@media (max-width: 1280px) {
  .dsl-workbench {
    grid-template-columns: 240px minmax(0, 1fr);
  }

  .dsl-preview {
    grid-column: 1 / -1;
  }
}
</style>
