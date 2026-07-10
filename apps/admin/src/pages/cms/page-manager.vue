<template>
  <section class="admin-page cms-manager-page">
    <AdminPageHeader title="页面装修" eyebrow="店铺管理" subtitle="管理页面、模板与发布状态，进入编辑后专注完成页面搭建。">
      <template #actions>
        <el-button :icon="Collection" @click="navigateTo('/page-templates')">页面模板</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreateDialog">新建页面</el-button>
      </template>
    </AdminPageHeader>

    <nav class="cms-section-nav" aria-label="页面装修导航">
      <button class="active" type="button">DIY 页面</button>
      <button type="button" @click="navigateTo('/page-templates')">页面模板</button>
      <button type="button" @click="navigateTo('/themes')">店铺主题</button>
      <button type="button" @click="navigateTo('/tabbar')">底部导航</button>
      <button type="button" @click="navigateTo('/materials')">素材管理</button>
    </nav>

    <section class="cms-manager-panel">
      <header class="cms-manager-toolbar">
        <div class="cms-manager-search">
          <el-input v-model="keyword" clearable :prefix-icon="Search" placeholder="搜索页面名称、说明或页面标识" />
          <el-select v-model="statusFilter" aria-label="发布状态">
            <el-option label="全部状态" value="all" />
            <el-option label="已发布" value="published" />
            <el-option label="草稿中" value="draft" />
          </el-select>
          <el-select v-model="typeFilter" filterable aria-label="页面类型">
            <el-option label="全部类型" value="all" />
            <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </div>
        <span class="cms-manager-count">共 {{ filteredPages.length }} 个页面</span>
      </header>

      <el-skeleton v-if="loading" :rows="8" animated />
      <el-empty v-else-if="filteredPages.length === 0" description="没有找到符合条件的页面">
        <el-button type="primary" @click="openCreateDialog">新建第一个页面</el-button>
      </el-empty>
      <el-table v-else :data="pagedPages" row-key="id" class="cms-page-table">
        <el-table-column label="页面名称" min-width="250">
          <template #default="scope">
            <button class="page-name-cell" type="button" @click="editPage(scope.row)">
              <span class="page-name-cell__icon"><Document /></span>
              <span>
                <strong>{{ displayTitle(scope.row) }}</strong>
                <small>{{ scope.row.description || pageRouteHint(scope.row) }}</small>
              </span>
            </button>
          </template>
        </el-table-column>
        <el-table-column label="页面类型" min-width="160">
          <template #default="scope">
            <span class="page-type-badge">{{ pageTypeLabel(scope.row.pageType) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="绑定业务" min-width="170">
          <template #default="scope">
            <span class="page-binding">{{ bindingLabel(scope.row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="118">
          <template #default="scope">
            <span class="publish-state" :class="scope.row.publishedVersionId ? 'is-published' : 'is-draft'">
              {{ scope.row.publishedVersionId ? "已发布" : "草稿中" }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="172">
          <template #default="scope">{{ formatDate(scope.row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="286" fixed="right">
          <template #default="scope">
            <div class="page-actions">
              <el-button link type="primary" :icon="EditPen" @click="editPage(scope.row)">编辑</el-button>
              <el-button link type="primary" :icon="CopyDocument" @click="duplicatePage(scope.row)">复制</el-button>
              <el-button link type="primary" :icon="Share" @click="copyPagePath(scope.row)">分享</el-button>
              <el-button
                link
                type="danger"
                :icon="Delete"
                :disabled="!canDelete(scope.row)"
                @click="removePage(scope.row)"
              >删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <footer v-if="filteredPages.length > pageSize" class="cms-manager-pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          background
          layout="total, prev, pager, next, sizes"
          :page-sizes="[10, 20, 50]"
          :total="filteredPages.length"
        />
      </footer>
    </section>

    <el-dialog v-model="createVisible" title="新建 DIY 页面" width="620px" destroy-on-close>
      <el-form :model="createForm" label-position="top" class="create-page-form">
        <div class="create-page-grid">
          <el-form-item label="页面名称" required>
            <el-input v-model="createForm.title" maxlength="30" show-word-limit placeholder="例如：秋季峰会专题页" />
          </el-form-item>
          <el-form-item label="页面类型" required>
            <el-select v-model="createForm.pageType" @change="syncBindingFields">
              <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="后台备注">
          <el-input v-model="createForm.description" maxlength="80" show-word-limit placeholder="仅后台可见，用于说明页面用途" />
        </el-form-item>
        <el-form-item label="页面标识" required>
          <el-input v-model="createForm.slug" placeholder="例如 autumn-summit；只允许字母、数字和短横线">
            <template #prepend>custom:</template>
          </el-input>
        </el-form-item>
        <el-form-item v-if="requiresConference" label="绑定会议" required>
          <el-select v-model="createForm.conferenceId" filterable placeholder="选择会议">
            <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="requiresProduct" label="绑定商品" required>
          <el-select v-model="createForm.productId" filterable placeholder="选择商品">
            <el-option v-for="item in products" :key="item.id" :label="item.title" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="起始模板">
          <el-select v-model="createForm.templateId" clearable filterable placeholder="空白页面">
            <el-option v-for="item in templates" :key="item.id" :label="`${item.title} · ${item.category}`" :value="item.id" />
          </el-select>
          <button class="template-link" type="button" @click="navigateTo('/page-templates')">查看全部页面模板</button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建并装修</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { Collection, CopyDocument, Delete, Document, EditPen, Plus, Search, Share } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import { navigateTo } from "../../router";
import {
  createPage,
  deletePage,
  getPageVersion,
  getProductOptions,
  listConferences,
  listPageLibraryTemplates,
  listPages
} from "../../services/admin";
import type { Conference, PageLibraryTemplate, PageTemplate, Product } from "../../services/types";

const loading = ref(true);
const creating = ref(false);
const createVisible = ref(false);
const pages = ref<PageTemplate[]>([]);
const templates = ref<PageLibraryTemplate[]>([]);
const conferences = ref<Conference[]>([]);
const products = ref<Product[]>([]);
const keyword = ref("");
const statusFilter = ref("all");
const typeFilter = ref("all");
const currentPage = ref(1);
const pageSize = ref(10);

const createForm = reactive({
  title: "",
  description: "",
  slug: "",
  pageType: "CUSTOM",
  conferenceId: "",
  productId: "",
  templateId: ""
});

const typeOptions = [
  { label: "自定义页面", value: "CUSTOM" },
  { label: "会议首页", value: "HOME" },
  { label: "商城首页", value: "MALL" },
  { label: "购物车", value: "MALL_CHECKOUT" },
  { label: "会员中心", value: "USER" },
  { label: "会议报名页", value: "REGISTRATION_FORM" },
  { label: "指定会议报名页", value: "REGISTRATION_FORM_PAGE" },
  { label: "报名凭证页", value: "REGISTRATION_CREDENTIAL" },
  { label: "指定报名凭证页", value: "REGISTRATION_CREDENTIAL_PAGE" },
  { label: "会议详情模板", value: "CONFERENCE_DETAIL_TEMPLATE" },
  { label: "指定会议详情页", value: "CONFERENCE_DETAIL_PAGE" },
  { label: "商品详情模板", value: "PRODUCT_DETAIL_TEMPLATE" },
  { label: "指定商品详情页", value: "PRODUCT_DETAIL_PAGE" },
  { label: "发票申请页", value: "INVOICE" },
  { label: "商城订单与售后", value: "MALL_AFTERSALE" }
];

const requiresConference = computed(() => ["CONFERENCE_DETAIL_PAGE", "REGISTRATION_FORM_PAGE", "REGISTRATION_CREDENTIAL_PAGE"].includes(createForm.pageType));
const requiresProduct = computed(() => createForm.pageType === "PRODUCT_DETAIL_PAGE");
const filteredPages = computed(() => {
  const search = keyword.value.trim().toLowerCase();
  return pages.value.filter((page) => {
    const matchesKeyword = !search || [displayTitle(page), page.description, page.pageKey].some((value) => String(value || "").toLowerCase().includes(search));
    const matchesStatus = statusFilter.value === "all" || (statusFilter.value === "published" ? Boolean(page.publishedVersionId) : !page.publishedVersionId);
    const matchesType = typeFilter.value === "all" || page.pageType === typeFilter.value;
    return matchesKeyword && matchesStatus && matchesType;
  });
});
const pagedPages = computed(() => filteredPages.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value));

watch([keyword, statusFilter, typeFilter, pageSize], () => {
  currentPage.value = 1;
});

onMounted(async () => {
  loading.value = true;
  try {
    const [pageResponse, templateResponse, conferenceResponse, productResponse] = await Promise.all([
      listPages(),
      listPageLibraryTemplates().catch(() => ({ items: [] as PageLibraryTemplate[] })),
      listConferences({ page: 1, pageSize: 100 }).catch(() => ({ items: [] as Conference[] })),
      getProductOptions().catch(() => ({ items: [] as Product[] }))
    ]);
    pages.value = pageResponse.items;
    templates.value = templateResponse.items;
    conferences.value = conferenceResponse.items;
    products.value = productResponse.items;
  } finally {
    loading.value = false;
  }
});

function openCreateDialog(): void {
  Object.assign(createForm, {
    title: "",
    description: "",
    slug: `page-${Date.now().toString(36)}`,
    pageType: "CUSTOM",
    conferenceId: "",
    productId: "",
    templateId: ""
  });
  createVisible.value = true;
}

function syncBindingFields(): void {
  if (!requiresConference.value) createForm.conferenceId = "";
  if (!requiresProduct.value) createForm.productId = "";
}

async function submitCreate(): Promise<void> {
  const title = createForm.title.trim();
  const slug = normalizeSlug(createForm.slug);
  if (!title || !slug) {
    ElMessage.warning("请填写页面名称和页面标识");
    return;
  }
  if (requiresConference.value && !createForm.conferenceId) {
    ElMessage.warning("请选择需要绑定的会议");
    return;
  }
  if (requiresProduct.value && !createForm.productId) {
    ElMessage.warning("请选择需要绑定的商品");
    return;
  }
  creating.value = true;
  try {
    const page = await createPage({
      pageKey: `custom:${slug}`,
      title,
      description: createForm.description.trim() || undefined,
      pageType: createForm.pageType,
      conferenceId: createForm.conferenceId || undefined,
      productId: createForm.productId || undefined,
      templateId: createForm.templateId || undefined
    });
    createVisible.value = false;
    navigateTo("/pages/editor", { pageId: page.id });
  } finally {
    creating.value = false;
  }
}

function editPage(page: PageTemplate): void {
  navigateTo("/pages/editor", { pageId: page.id });
}

async function duplicatePage(page: PageTemplate): Promise<void> {
  const latest = page.versions[0];
  if (!latest) {
    ElMessage.warning("当前页面还没有可复制的草稿");
    return;
  }
  const source = await getPageVersion(latest.id);
  const created = await createPage({
    pageKey: `custom:copy-${Date.now().toString(36)}`,
    title: `${displayTitle(page)} 副本`,
    description: page.description || `复制自 ${displayTitle(page)}`,
    pageType: "CUSTOM",
    dsl: source.dsl,
    themeJson: source.themeJson || undefined
  });
  pages.value = (await listPages()).items;
  ElMessage.success("页面副本已创建");
  navigateTo("/pages/editor", { pageId: created.id });
}

async function removePage(page: PageTemplate): Promise<void> {
  if (!canDelete(page)) return;
  try {
    await ElMessageBox.confirm(`确定删除“${displayTitle(page)}”吗？删除后无法恢复。`, "删除页面", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  await deletePage(page.id);
  pages.value = pages.value.filter((item) => item.id !== page.id);
  ElMessage.success("页面已删除");
}

async function copyPagePath(page: PageTemplate): Promise<void> {
  const path = pageMiniappPath(page.pageKey);
  await navigator.clipboard.writeText(path);
  ElMessage.success("小程序页面路径已复制");
}

function canDelete(page: PageTemplate): boolean {
  return page.pageKey.startsWith("custom:") && !page.publishedVersionId;
}

function normalizeSlug(value: string): string {
  return value.trim().replace(/^custom:/, "").replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function displayTitle(page: PageTemplate): string {
  return page.title || page.pageKey;
}

function pageTypeLabel(type: string): string {
  const aliases: Record<string, string> = {
    CONFERENCE_LIST: "会议列表页",
    SCHEDULE: "年度排期页",
    REGISTRATION_MINE: "我的报名",
    REGISTRATION_DETAIL: "报名详情页",
    CART: "购物车",
    MEMBER_CENTER: "会员中心",
    SYSTEM_TEMPLATE: "系统模板"
  };
  return typeOptions.find((item) => item.value === type)?.label ?? aliases[type] ?? "业务页面";
}

function bindingLabel(page: PageTemplate): string {
  if (page.conferenceId) return `会议 · ${page.conferenceId.slice(-8)}`;
  if (page.productId) return `商品 · ${page.productId.slice(-8)}`;
  const labels: Record<string, string> = {
    SPECIFIC_CONFERENCE: "指定会议",
    SPECIFIC_PRODUCT: "指定商品",
    CONFERENCE_TEMPLATE: "所有会议详情",
    PRODUCT_TEMPLATE: "所有商品详情",
    GLOBAL: "全局页面"
  };
  if (page.bindingType) return labels[page.bindingType] ?? "业务绑定";
  return "全局页面";
}

function pageRouteHint(page: PageTemplate): string {
  return page.pageKey.startsWith("custom:") ? `自定义页面 · ${page.pageKey.slice(7)}` : page.pageKey;
}

function pageMiniappPath(pageKey: string): string {
  const routes: Record<string, string> = {
    home: "/pages/index/index",
    cart: "/pages/cart/index",
    mall: "/pages/mall/index",
    "member-center": "/pages/member/center",
    "my-registrations": "/pages/registration/mine",
    invoice: "/pages/invoice/index"
  };
  if (routes[pageKey]) return routes[pageKey];
  const normalized = pageKey.startsWith("custom:") ? pageKey.slice(7) : pageKey;
  return `/pages/custom/index?pageKey=${encodeURIComponent(normalized)}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
</script>

<style scoped>
.cms-manager-page {
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

.cms-manager-panel {
  min-width: 0;
  padding: var(--admin-space-5);
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius);
  background: var(--admin-color-panel);
  box-shadow: var(--admin-shadow-soft);
}

.cms-manager-toolbar,
.cms-manager-search,
.page-actions,
.cms-manager-pagination {
  display: flex;
  align-items: center;
}

.cms-manager-toolbar {
  justify-content: space-between;
  gap: var(--admin-space-4);
  margin-bottom: var(--admin-space-4);
}

.cms-manager-search {
  flex: 1;
  gap: var(--admin-space-3);
  max-width: 860px;
}

.cms-manager-search .el-input {
  flex: 1;
}

.cms-manager-search .el-select {
  width: 170px;
}

.cms-manager-count {
  color: var(--admin-color-muted);
  font-size: 13px;
}

.page-name-cell {
  display: flex;
  width: 100%;
  align-items: center;
  gap: var(--admin-space-3);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.page-name-cell__icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: var(--admin-radius-sm);
  background: var(--admin-color-primary-soft);
  color: var(--admin-color-primary);
}

.page-name-cell__icon :deep(svg) {
  width: 18px;
}

.page-name-cell strong,
.page-name-cell small {
  display: block;
}

.page-name-cell strong {
  margin-bottom: 3px;
  color: var(--admin-color-text);
  font-size: 14px;
}

.page-name-cell small,
.page-binding {
  max-width: 32ch;
  overflow: hidden;
  color: var(--admin-color-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-type-badge,
.publish-state {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 9px;
  border-radius: var(--admin-radius-sm);
  font-size: 12px;
  font-weight: 600;
}

.page-type-badge {
  background: var(--admin-color-primary-soft);
  color: var(--admin-color-primary);
}

.publish-state.is-published {
  background: var(--admin-color-success-soft);
  color: var(--admin-color-success);
}

.publish-state.is-draft {
  background: var(--admin-color-warning-soft);
  color: var(--admin-color-warning);
}

.page-actions {
  gap: 2px;
}

.cms-manager-pagination {
  justify-content: flex-end;
  padding-top: var(--admin-space-5);
}

.create-page-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--admin-space-4);
}

.create-page-form :deep(.el-select) {
  width: 100%;
}

.template-link {
  margin-top: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--admin-color-primary);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

@media (max-width: 1180px) {
  .cms-manager-toolbar,
  .cms-manager-search {
    align-items: stretch;
    flex-direction: column;
  }

  .cms-manager-search .el-select {
    width: 100%;
  }
}
</style>
