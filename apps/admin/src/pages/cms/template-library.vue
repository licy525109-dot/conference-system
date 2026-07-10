<template>
  <section class="admin-page template-library-page">
    <AdminPageHeader title="页面模板" eyebrow="店铺管理" subtitle="选择完整页面模板，一键创建页面或应用到正在装修的页面。">
      <template #actions>
        <el-button :icon="ArrowLeft" @click="goBack">返回页面管理</el-button>
        <el-button type="primary" :icon="Plus" @click="navigateTo('/pages')">新建空白页面</el-button>
      </template>
    </AdminPageHeader>

    <nav class="cms-section-nav" aria-label="页面装修导航">
      <button type="button" @click="navigateTo('/pages')">DIY 页面</button>
      <button class="active" type="button">页面模板</button>
      <button type="button" @click="navigateTo('/themes')">店铺主题</button>
      <button type="button" @click="navigateTo('/tabbar')">底部导航</button>
      <button type="button" @click="navigateTo('/materials')">素材管理</button>
    </nav>

    <div v-if="targetPage" class="template-target-bar">
      <span>
        <Aim />
        <b>正在为“{{ targetPage.title }}”选择模板</b>
        <small>应用后会替换当前草稿内容，已发布版本不会被覆盖。</small>
      </span>
      <el-button text @click="navigateTo('/pages/editor', { pageId: targetPage.id })">返回编辑器</el-button>
    </div>

    <section class="template-library-toolbar">
      <div class="template-category-tabs">
        <button
          v-for="category in categories"
          :key="category"
          type="button"
          :class="{ active: activeCategory === category }"
          @click="activeCategory = category"
        >{{ category }}</button>
      </div>
      <el-input v-model="keyword" clearable :prefix-icon="Search" placeholder="搜索模板名称、场景或说明" />
    </section>

    <el-skeleton v-if="loading" :rows="9" animated />
    <el-empty v-else-if="filteredTemplates.length === 0" description="暂无符合条件的页面模板" />
    <section v-else class="template-gallery">
      <article v-for="template in filteredTemplates" :key="template.id" class="template-gallery-card">
        <button class="template-gallery-card__preview" type="button" @click="previewTemplate = template">
          <div class="template-gallery-card__phone">
            <CmsPageThumbnail
              :dsl="template.version?.dsl"
              :theme="template.version?.themeJson"
              :title="template.title"
            />
          </div>
          <span class="template-gallery-card__view"><View /> 查看大图</span>
        </button>
        <div class="template-gallery-card__body">
          <span class="template-category">{{ normalizedCategory(template.category) }}</span>
          <strong>{{ template.title }}</strong>
          <p>{{ template.description || template.summary || "可直接套用并继续配置组件内容。" }}</p>
          <div class="template-gallery-card__actions">
            <el-button @click="previewTemplate = template">预览</el-button>
            <el-button type="primary" :loading="applyingId === template.id" @click="useTemplate(template)">
              {{ targetPage ? "应用到当前页" : "使用此模板" }}
            </el-button>
          </div>
        </div>
      </article>
    </section>

    <el-dialog v-model="createVisible" title="使用页面模板" width="520px" destroy-on-close>
      <div v-if="pendingTemplate" class="selected-template-summary">
        <Collection />
        <span>
          <strong>{{ pendingTemplate.title }}</strong>
          <small>{{ pendingTemplate.category }} · 将创建为可继续装修的页面</small>
        </span>
      </div>
      <el-form label-position="top">
        <el-form-item label="页面名称" required>
          <el-input v-model="newPageTitle" maxlength="30" show-word-limit />
        </el-form-item>
        <el-form-item label="页面标识" required>
          <el-input v-model="newPageSlug">
            <template #prepend>custom:</template>
          </el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createFromTemplate">创建并装修</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="previewVisible" width="760px" class="template-preview-dialog" destroy-on-close>
      <template #header>
        <div class="template-preview-dialog__head">
          <span>
            <strong>{{ previewTemplate?.title }}</strong>
            <small>{{ previewTemplate?.category }}</small>
          </span>
        </div>
      </template>
      <div v-if="previewTemplate" class="template-preview-dialog__content">
        <div class="template-preview-dialog__phone">
          <CmsPageThumbnail
            :dsl="previewTemplate.version?.dsl"
            :theme="previewTemplate.version?.themeJson"
            :title="previewTemplate.title"
          />
        </div>
        <aside>
          <h3>{{ previewTemplate.title }}</h3>
          <p>{{ previewTemplate.description || previewTemplate.summary || "完整页面模板，可继续替换图片、文案和跳转。" }}</p>
          <dl>
            <div><dt>适用场景</dt><dd>{{ normalizedCategory(previewTemplate.category) }}</dd></div>
            <div><dt>页面组件</dt><dd>{{ templateComponentCount(previewTemplate) }} 个</dd></div>
            <div><dt>保存结构</dt><dd>P9 页面配置</dd></div>
          </dl>
          <el-button type="primary" :loading="applyingId === previewTemplate.id" @click="useTemplate(previewTemplate)">
            {{ targetPage ? "应用到当前页" : "使用此模板" }}
          </el-button>
        </aside>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Aim, ArrowLeft, Collection, Plus, Search, View } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import CmsPageThumbnail from "../../components/cms/CmsPageThumbnail.vue";
import { navigateTo, routeQuery } from "../../router";
import { createPage, getPageVersion, listPageLibraryTemplates, listPages, updatePageVersion } from "../../services/admin";
import type { PageDsl } from "@conference/dsl-runtime";
import type { PageLibraryTemplate, PageTemplate } from "../../services/types";

const loading = ref(true);
const creating = ref(false);
const applyingId = ref("");
const templates = ref<PageLibraryTemplate[]>([]);
const pages = ref<PageTemplate[]>([]);
const keyword = ref("");
const activeCategory = ref("全部");
const previewTemplate = ref<PageLibraryTemplate | null>(null);
const pendingTemplate = ref<PageLibraryTemplate | null>(null);
const createVisible = ref(false);
const newPageTitle = ref("");
const newPageSlug = ref("");

const targetPage = computed(() => pages.value.find((item) => item.id === routeQuery.value.targetPageId) ?? null);
const previewVisible = computed({
  get: () => Boolean(previewTemplate.value),
  set: (value: boolean) => {
    if (!value) previewTemplate.value = null;
  }
});
const categories = computed(() => {
  const values = templates.value.map((item) => normalizedCategory(item.category));
  return ["全部", ...Array.from(new Set(values))];
});
const filteredTemplates = computed(() => {
  const search = keyword.value.trim().toLowerCase();
  return templates.value.filter((template) => {
    const category = normalizedCategory(template.category);
    const matchesCategory = activeCategory.value === "全部" || category === activeCategory.value;
    const matchesKeyword = !search || [template.title, template.description, template.summary, category].some((value) => String(value || "").toLowerCase().includes(search));
    return matchesCategory && matchesKeyword;
  });
});

onMounted(async () => {
  loading.value = true;
  try {
    const [templateResponse, pageResponse] = await Promise.all([
      listPageLibraryTemplates(),
      listPages().catch(() => ({ items: [] as PageTemplate[] }))
    ]);
    templates.value = templateResponse.items;
    pages.value = pageResponse.items;
  } finally {
    loading.value = false;
  }
});

function goBack(): void {
  if (targetPage.value) {
    navigateTo("/pages/editor", { pageId: targetPage.value.id });
    return;
  }
  navigateTo("/pages");
}

async function useTemplate(template: PageLibraryTemplate): Promise<void> {
  if (!template.version?.dsl) {
    ElMessage.warning("该模板暂无可用页面内容");
    return;
  }
  if (!targetPage.value) {
    pendingTemplate.value = template;
    newPageTitle.value = template.title.replace(/模板$/, "");
    newPageSlug.value = `page-${Date.now().toString(36)}`;
    createVisible.value = true;
    previewTemplate.value = null;
    return;
  }
  try {
    await ElMessageBox.confirm(`应用“${template.title}”后，当前草稿中的组件与样式会被替换。`, "应用页面模板", {
      confirmButtonText: "确认应用",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  const latest = targetPage.value.versions[0];
  if (!latest) {
    ElMessage.warning("当前页面没有可编辑草稿");
    return;
  }
  applyingId.value = template.id;
  try {
    const dsl = cloneDslForPage(template.version.dsl, targetPage.value.pageKey);
    await updatePageVersion(latest.id, {
      title: `${targetPage.value.title} · ${template.title}`,
      dsl,
      themeJson: template.version.themeJson || undefined
    });
    ElMessage.success("模板已应用，可以继续编辑页面内容");
    navigateTo("/pages/editor", { pageId: targetPage.value.id });
  } finally {
    applyingId.value = "";
  }
}

async function createFromTemplate(): Promise<void> {
  if (!pendingTemplate.value) return;
  const title = newPageTitle.value.trim();
  const slug = normalizeSlug(newPageSlug.value);
  if (!title || !slug) {
    ElMessage.warning("请填写页面名称和页面标识");
    return;
  }
  creating.value = true;
  try {
    const page = await createPage({
      pageKey: `custom:${slug}`,
      title,
      description: `创建自模板：${pendingTemplate.value.title}`,
      pageType: "CUSTOM",
      templateId: pendingTemplate.value.id
    });
    createVisible.value = false;
    navigateTo("/pages/editor", { pageId: page.id });
  } finally {
    creating.value = false;
  }
}

function cloneDslForPage(source: PageDsl, pageKey: string): PageDsl {
  return {
    ...structuredClone(source),
    schemaVersion: "p9",
    page: pageKey
  };
}

function normalizedCategory(value: string): string {
  const category = value.trim();
  if (!category || category === "自定义模板") return "通用";
  if (/首页|主会场/.test(category)) return "会议首页";
  if (/报名/.test(category)) return "会议报名";
  if (/商城|商品/.test(category)) return "商城";
  if (/会员|用户/.test(category)) return "会员中心";
  if (/峰会|论坛|沙龙|展会|年会/.test(category)) return category;
  return category;
}

function templateComponentCount(template: PageLibraryTemplate): number {
  const editorComponents = template.version?.dsl?.meta?.editorComponents;
  if (Array.isArray(editorComponents)) return editorComponents.length;
  return template.version?.dsl?.dsl.nodes.length ?? 0;
}

function normalizeSlug(value: string): string {
  return value.trim().replace(/^custom:/, "").replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}
</script>

<style scoped>
.template-library-page {
  display: grid;
  gap: var(--admin-space-4);
  min-width: 0;
}

.cms-section-nav {
  display: flex;
  gap: var(--admin-space-6);
  min-height: 48px;
  padding: 0 var(--admin-space-5);
  border-bottom: 1px solid var(--admin-color-border);
  background: var(--admin-color-panel);
}

.cms-section-nav button {
  position: relative;
  border: 0;
  background: transparent;
  color: var(--admin-color-muted);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}

.cms-section-nav button:hover,
.cms-section-nav button:focus-visible,
.cms-section-nav button.active {
  color: var(--admin-color-primary);
}

.cms-section-nav button.active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  background: var(--admin-color-primary);
  content: "";
}

.template-target-bar,
.template-library-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--admin-space-4);
  padding: var(--admin-space-4) var(--admin-space-5);
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius);
  background: var(--admin-color-panel);
}

.template-target-bar > span {
  display: flex;
  align-items: center;
  gap: var(--admin-space-2);
}

.template-target-bar svg {
  width: 18px;
  color: var(--admin-color-primary);
}

.template-target-bar small {
  color: var(--admin-color-muted);
}

.template-category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--admin-space-2);
}

.template-category-tabs button {
  min-height: 34px;
  padding: 0 var(--admin-space-3);
  border: 1px solid transparent;
  border-radius: var(--admin-radius-sm);
  background: var(--admin-color-panel-soft);
  color: var(--admin-color-muted);
  cursor: pointer;
  font: inherit;
}

.template-category-tabs button:hover,
.template-category-tabs button:focus-visible,
.template-category-tabs button.active {
  border-color: var(--admin-color-primary);
  background: var(--admin-color-primary-soft);
  color: var(--admin-color-primary);
}

.template-library-toolbar .el-input {
  width: min(320px, 100%);
}

.template-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: var(--admin-space-5);
}

.template-gallery-card {
  overflow: hidden;
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius);
  background: var(--admin-color-panel);
  box-shadow: var(--admin-shadow-soft);
  transition: border-color 180ms ease-out, box-shadow 180ms ease-out, transform 180ms ease-out;
}

.template-gallery-card:hover {
  border-color: var(--admin-color-primary);
  box-shadow: var(--admin-shadow);
  transform: translateY(-2px);
}

.template-gallery-card__preview {
  position: relative;
  display: grid;
  width: 100%;
  height: 430px;
  overflow: hidden;
  place-items: start center;
  border: 0;
  background: var(--admin-color-panel-soft);
  cursor: pointer;
}

.template-gallery-card__phone {
  width: 210px;
  height: 404px;
  margin-top: 18px;
  overflow: hidden;
  border: 1px solid var(--admin-color-border);
  border-radius: 8px 8px 0 0;
  background: var(--admin-color-panel);
  box-shadow: 0 12px 28px rgb(24 33 47 / 10%);
}

.template-gallery-card__phone :deep(.cms-page-thumbnail) {
  transform: scale(0.56);
  transform-origin: left top;
}

.template-gallery-card__view {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 10px;
  border-radius: var(--admin-radius-sm);
  background: rgb(23 32 47 / 82%);
  color: var(--admin-color-panel);
  font-size: 12px;
}

.template-gallery-card__view svg {
  width: 14px;
}

.template-gallery-card__body {
  padding: var(--admin-space-4);
}

.template-gallery-card__body strong,
.template-gallery-card__body p {
  display: block;
}

.template-gallery-card__body strong {
  margin-top: var(--admin-space-2);
  color: var(--admin-color-text);
  font-size: 15px;
}

.template-gallery-card__body p {
  min-height: 40px;
  margin: 6px 0 var(--admin-space-4);
  color: var(--admin-color-muted);
  font-size: 12px;
  line-height: 1.6;
}

.template-category {
  color: var(--admin-color-primary);
  font-size: 12px;
  font-weight: 700;
}

.template-gallery-card__actions {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: var(--admin-space-2);
}

.selected-template-summary {
  display: flex;
  align-items: center;
  gap: var(--admin-space-3);
  margin-bottom: var(--admin-space-4);
  padding: var(--admin-space-3);
  border-radius: var(--admin-radius-sm);
  background: var(--admin-color-primary-soft);
  color: var(--admin-color-primary);
}

.selected-template-summary svg {
  width: 24px;
}

.selected-template-summary strong,
.selected-template-summary small {
  display: block;
}

.template-preview-dialog__head span,
.template-preview-dialog__head strong,
.template-preview-dialog__head small {
  display: block;
}

.template-preview-dialog__head small {
  margin-top: 4px;
  color: var(--admin-color-muted);
}

.template-preview-dialog__content {
  display: grid;
  grid-template-columns: 270px 1fr;
  gap: var(--admin-space-6);
}

.template-preview-dialog__phone {
  width: 264px;
  height: 506px;
  overflow: hidden;
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius);
  background: var(--admin-color-panel-soft);
}

.template-preview-dialog__phone :deep(.cms-page-thumbnail) {
  transform: scale(0.704);
  transform-origin: left top;
}

.template-preview-dialog__content aside {
  padding-top: var(--admin-space-4);
}

.template-preview-dialog__content h3 {
  margin: 0 0 var(--admin-space-3);
  color: var(--admin-color-text);
}

.template-preview-dialog__content p {
  color: var(--admin-color-muted);
  line-height: 1.7;
}

.template-preview-dialog__content dl {
  margin: var(--admin-space-6) 0;
  border-top: 1px solid var(--admin-color-border);
}

.template-preview-dialog__content dl div {
  display: grid;
  grid-template-columns: 88px 1fr;
  padding: var(--admin-space-3) 0;
  border-bottom: 1px solid var(--admin-color-border);
}

.template-preview-dialog__content dt {
  color: var(--admin-color-muted);
}

.template-preview-dialog__content dd {
  margin: 0;
  color: var(--admin-color-text);
}

@media (max-width: 1100px) {
  .template-library-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .template-library-toolbar .el-input {
    width: 100%;
  }
}
</style>
