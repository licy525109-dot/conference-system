<template>
  <section class="admin-page ops-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">页面装修运营台</h1>
        <p class="page-subtitle">运营编辑业务模块，系统自动生成页面渲染配置。</p>
      </div>
      <div class="inline-actions">
        <el-button @click="createVisible = true">新增页面</el-button>
        <el-button :disabled="!version" :loading="saving" @click="saveDraft">保存草稿</el-button>
        <el-button :disabled="!version" type="primary" :loading="publishing" @click="publish">发布页面</el-button>
      </div>
    </div>

    <section class="ops-workbench">
      <aside class="ops-sidebar">
        <section class="data-panel">
          <div class="panel-head">
            <div>
              <strong>页面</strong>
              <span>选择要装修的运营页面</span>
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
              <span>选择草稿或发布版本</span>
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
              <strong>添加模块</strong>
              <span>选择业务语义模块</span>
            </div>
          </div>
          <div class="module-library">
            <button
              v-for="definition in moduleDefinitions"
              :key="definition.type"
              type="button"
              class="module-preset"
              @click="addModule(definition.type)"
            >
              <strong>{{ definition.name }}</strong>
              <span>{{ definition.group }}</span>
              <small>{{ definition.description }}</small>
            </button>
          </div>
        </section>
      </aside>

      <main class="ops-main">
        <section class="data-panel">
          <div class="panel-head">
            <div>
              <strong>页面模块</strong>
              <span>{{ currentModules.length }} 个模块 · {{ selectedPage?.pageKey ?? "未选择页面" }}</span>
            </div>
            <el-tag type="success">运营模式</el-tag>
          </div>

          <el-empty v-if="!version" description="请选择页面版本" />
          <template v-else>
            <div class="version-row">
              <el-input v-model="versionTitle" placeholder="版本标题" />
              <el-input v-model="currentPageKey" placeholder="页面 key" disabled />
            </div>

            <div class="module-list">
              <button
                v-for="(module, index) in currentModules"
                :key="module.id"
                type="button"
                :class="['module-row', selectedModuleId === module.id ? 'active' : '']"
                @click="selectModule(module.id)"
              >
                <span class="module-row__index">{{ index + 1 }}</span>
                <span class="module-row__body">
                  <strong>{{ definitionName(module.type) }}</strong>
                  <small>{{ module.config.title || module.type }} · {{ module.enabled ? "显示" : "隐藏" }}</small>
                </span>
                <span class="module-row__actions">
                  <i @click.stop="moveModule(index, -1)">上移</i>
                  <i @click.stop="moveModule(index, 1)">下移</i>
                  <i @click.stop="duplicateModule(module)">复制</i>
                  <i class="danger" @click.stop="removeModule(module.id)">删除</i>
                </span>
              </button>
            </div>
          </template>
        </section>

        <section class="data-panel preview-shell">
          <div class="panel-head">
            <div>
              <strong>实时预览</strong>
              <span>模块自动编译后进入统一运行时</span>
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
      </main>

      <aside class="ops-config">
        <section class="data-panel config-panel">
          <div class="panel-head">
            <div>
              <strong>模块配置</strong>
              <span>{{ selectedDefinition?.name ?? "选择左侧模块后编辑" }}</span>
            </div>
            <el-switch v-if="selectedModule" v-model="selectedModule.enabled" active-text="显示" inactive-text="隐藏" />
          </div>

          <el-empty v-if="!selectedModule || !selectedDefinition" description="请选择一个模块" />
          <el-form v-else label-position="top" class="module-form">
            <el-form-item
              v-for="field in selectedDefinition.fields"
              :key="field.key"
              :label="field.label"
            >
              <el-input
                v-if="field.type === 'text'"
                :model-value="fieldValue(field.key)"
                :placeholder="field.placeholder"
                @update:model-value="updateField(field.key, $event)"
              />
              <el-input
                v-else-if="field.type === 'textarea'"
                :model-value="fieldValue(field.key)"
                type="textarea"
                :rows="4"
                :placeholder="field.placeholder"
                @update:model-value="updateField(field.key, $event)"
              />
              <el-input
                v-else-if="field.type === 'image'"
                :model-value="fieldValue(field.key)"
                :placeholder="field.placeholder || '图片 URL 或素材地址'"
                @update:model-value="updateField(field.key, $event)"
              />
              <el-select
                v-else-if="field.type === 'select'"
                :model-value="fieldValue(field.key)"
                @update:model-value="updateField(field.key, $event)"
              >
                <el-option
                  v-for="option in field.options ?? []"
                  :key="String(option.value)"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
              <el-switch
                v-else-if="field.type === 'switch'"
                :model-value="Boolean(fieldValue(field.key))"
                @update:model-value="updateField(field.key, $event)"
              />
              <div v-else-if="field.type === 'items'" class="item-editor">
                <p v-if="field.help" class="field-help">{{ field.help }}</p>
                <article v-for="(item, index) in editableItems" :key="item.id" class="item-card">
                  <div class="item-card__head">
                    <strong>条目 {{ index + 1 }}</strong>
                    <el-button link type="danger" @click="removeItem(index)">删除</el-button>
                  </div>
                  <el-input v-model="item.label" placeholder="名称" />
                  <el-input v-model="item.subtitle" placeholder="说明，可不填" />
                  <el-input v-model="item.iconUrl" placeholder="图标 URL，可不填" />
                  <el-input v-model="item.imageUrl" placeholder="图片 URL，可不填" />
                  <div class="item-link-row">
                    <el-select v-model="item.linkType" placeholder="跳转类型">
                      <el-option label="无跳转" value="none" />
                      <el-option label="小程序页面" value="page" />
                      <el-option label="会议详情" value="conference" />
                      <el-option label="报名页" value="registration" />
                      <el-option label="商品详情" value="product" />
                      <el-option label="外部 H5" value="url" />
                    </el-select>
                    <el-input v-model="item.link" placeholder="页面 key / ID / URL" />
                  </div>
                </article>
                <el-button class="full-button" @click="addItem">添加条目</el-button>
              </div>
              <p v-if="field.help && field.type !== 'items'" class="field-help">{{ field.help }}</p>
            </el-form-item>
          </el-form>
        </section>
      </aside>
    </section>

    <el-dialog v-model="createVisible" title="新增运营页面" width="520px">
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
        <el-button type="primary" :loading="creating" @click="createOpsPage">创建</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  BUSINESS_MODULE_DEFINITIONS,
  createBusinessModule,
  getBusinessModuleDefinition,
  normalizeBusinessModules,
  type BusinessModule,
  type BusinessModuleConfig,
  type BusinessModuleItem,
  type BusinessModuleType
} from "@conference/business-modules";
import { compileBusinessModules, defaultModulesForPage, extractBusinessModules } from "@conference/module-compiler";
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
import type { PageTemplate, PageVersion } from "../../services/types";

const moduleDefinitions = BUSINESS_MODULE_DEFINITIONS;

const pages = ref<PageTemplate[]>([]);
const selectedPage = ref<PageTemplate | null>(null);
const selectedVersionId = ref("");
const version = ref<PageVersion | null>(null);
const versionTitle = ref("");
const selectedModuleId = ref("");
const currentPageKey = ref("cms");
const currentModules = ref<BusinessModule[]>([]);
const saving = ref(false);
const publishing = ref(false);
const creating = ref(false);
const createVisible = ref(false);
const createForm = reactive({ pageKey: "", title: "", description: "" });

const selectedModule = computed(() => currentModules.value.find((module) => module.id === selectedModuleId.value));
const selectedDefinition = computed(() => (selectedModule.value ? getBusinessModuleDefinition(selectedModule.value.type) : null));
const compiledDsl = computed<PageDsl>(() => compileBusinessModules({ page: currentPageKey.value, modules: currentModules.value }).dsl);
const runtimeContext = computed(() =>
  createGovernedRuntimeContext({
    page: compiledDsl.value.page,
    platform: "admin",
    data: {},
    theme: { id: "admin-preview", name: "Admin Preview" }
  })
);
const governed = computed(() => governRender(compiledDsl.value, { context: runtimeContext.value, allowLegacyDslFallback: false }));
const renderTree = computed(() => governed.value.tree);
const renderWarnings = computed<RenderGovernorWarning[]>(() => governed.value.warnings);
const editableItems = computed<BusinessModuleItem[]>(() => {
  if (!selectedModule.value) return [];
  if (!Array.isArray(selectedModule.value.config.items)) selectedModule.value.config.items = [];
  return selectedModule.value.config.items;
});

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
  currentPageKey.value = page.pageKey;
  const editable = page.versions.find((item) => item.status === "DRAFT") ?? page.versions[0];
  selectedVersionId.value = editable?.id ?? "";
  if (selectedVersionId.value) {
    await loadVersion(selectedVersionId.value);
  } else {
    resetModules(page.pageKey, defaultModulesForPage(page.pageKey));
  }
}

async function loadVersion(id = selectedVersionId.value): Promise<void> {
  if (!id) return;
  const response = await getPageVersion(id);
  version.value = response;
  versionTitle.value = response.title;
  const extracted = extractBusinessModules(response.dsl, response.template.pageKey);
  resetModules(extracted.dsl.page, extracted.modules.length > 0 ? extracted.modules : defaultModulesForPage(response.template.pageKey));
}

function resetModules(page: string, modules: BusinessModule[]): void {
  currentPageKey.value = page;
  currentModules.value = normalizeBusinessModules(modules).map((module, index) => ({ ...module, sortOrder: index * 10 }));
  selectedModuleId.value = currentModules.value[0]?.id ?? "";
}

function addModule(type: BusinessModuleType): void {
  const module = createBusinessModule(type, currentModules.value.length);
  currentModules.value.push(module);
  selectedModuleId.value = module.id;
}

function selectModule(id: string): void {
  selectedModuleId.value = id;
}

function moveModule(index: number, direction: -1 | 1): void {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= currentModules.value.length) return;
  const [module] = currentModules.value.splice(index, 1);
  if (!module) return;
  currentModules.value.splice(nextIndex, 0, module);
  resequenceModules();
}

function duplicateModule(module: BusinessModule): void {
  const copy = deepClone(module);
  copy.id = `${module.type}-${Date.now().toString(36)}`;
  copy.sortOrder = currentModules.value.length * 10;
  currentModules.value.push(copy);
  selectedModuleId.value = copy.id;
}

function removeModule(id: string): void {
  const index = currentModules.value.findIndex((module) => module.id === id);
  if (index < 0) return;
  currentModules.value.splice(index, 1);
  selectedModuleId.value = currentModules.value[Math.max(index - 1, 0)]?.id ?? "";
  resequenceModules();
}

function resequenceModules(): void {
  currentModules.value.forEach((module, index) => {
    module.sortOrder = index * 10;
  });
}

function fieldValue(key: keyof BusinessModuleConfig): string | number | boolean {
  const value = selectedModule.value?.config[key];
  if (typeof value === "number" || typeof value === "boolean") return value;
  return typeof value === "string" ? value : "";
}

function updateField(key: keyof BusinessModuleConfig, value: string | number | boolean): void {
  if (!selectedModule.value) return;
  selectedModule.value.config = {
    ...selectedModule.value.config,
    [key]: value
  };
}

function addItem(): void {
  if (!selectedModule.value) return;
  if (!Array.isArray(selectedModule.value.config.items)) selectedModule.value.config.items = [];
  selectedModule.value.config.items.push({
    id: `item-${Date.now().toString(36)}`,
    label: "新条目",
    subtitle: "",
    iconUrl: "",
    imageUrl: "",
    linkType: "none",
    link: ""
  });
}

function removeItem(index: number): void {
  if (!selectedModule.value?.config.items) return;
  selectedModule.value.config.items.splice(index, 1);
}

async function saveDraft(): Promise<void> {
  if (!version.value) return;
  saving.value = true;
  try {
    const response = await updatePageVersion(version.value.id, {
      title: versionTitle.value,
      dsl: compileBusinessModules({ page: currentPageKey.value, modules: currentModules.value }).dsl,
      themeJson: version.value.themeJson ?? null
    });
    version.value = response;
    ElMessage.success("运营页面草稿已保存");
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
    ElMessage.success("运营页面已发布");
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
  const extracted = extractBusinessModules(response.dsl, selectedPage.value.pageKey);
  resetModules(extracted.dsl.page, extracted.modules);
  await loadPages();
}

async function createOpsPage(): Promise<void> {
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
      dsl: compileBusinessModules({ page: pageKey, modules: defaultModulesForPage(pageKey) }).dsl
    });
    createVisible.value = false;
    Object.assign(createForm, { pageKey: "", title: "", description: "" });
    await loadPages();
    ElMessage.success("运营页面已创建");
  } finally {
    creating.value = false;
  }
}

function definitionName(type: BusinessModuleType): string {
  return getBusinessModuleDefinition(type).name;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
</script>

<style scoped>
.ops-page {
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

.ops-workbench {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 410px;
  gap: 18px;
  align-items: start;
}

.ops-sidebar,
.ops-main,
.ops-config {
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
.module-library,
.module-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.page-item,
.module-preset,
.module-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid #dbe4e1;
  border-radius: 8px;
  background: #f8faf9;
  color: #172026;
  text-align: left;
}

.page-item,
.module-preset {
  flex-direction: column;
  align-items: flex-start;
}

.page-item.active,
.module-row.active {
  border-color: #315d7d;
  background: #e6eef4;
}

.page-item span,
.page-item small,
.module-preset span,
.module-preset small,
.module-row small {
  color: #5f6d76;
}

.module-row__index {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: #e6eef4;
  color: #315d7d;
  font-weight: 700;
}

.module-row__body {
  min-width: 0;
  flex: 1;
}

.module-row__body strong,
.module-row__body small {
  display: block;
}

.module-row__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.module-row__actions i {
  color: #315d7d;
  cursor: pointer;
  font-style: normal;
}

.module-row__actions .danger {
  color: #bf3b3b;
}

.version-row,
.item-link-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}

.full-button {
  width: 100%;
  margin-top: 12px;
}

.preview-shell {
  position: sticky;
  top: 16px;
}

.phone-window {
  width: 340px;
  min-height: 620px;
  max-height: 760px;
  overflow: auto;
  margin: 0 auto;
  padding: 14px;
  border: 10px solid #172026;
  border-radius: 28px;
  background: #eef3f1;
}

.phone-window :deep(.admin-ds-tree) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.warning-alert {
  margin-bottom: 10px;
}

.module-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.field-help {
  margin: 6px 0 0;
  color: #5f6d76;
  font-size: 12px;
}

.item-editor {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 10px;
}

.item-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid #dbe4e1;
  border-radius: 8px;
  background: #f8faf9;
}

.item-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

@media (max-width: 1280px) {
  .ops-workbench {
    grid-template-columns: 280px minmax(0, 1fr);
  }

  .ops-config {
    grid-column: 1 / -1;
  }
}
</style>
