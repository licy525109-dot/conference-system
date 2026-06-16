<template>
  <section class="admin-page cms-page">
    <div class="page-header cms-hero">
      <div>
        <h1 class="page-title">页面装修工作台</h1>
        <p class="page-subtitle">左侧管理页面与组件，中间专注预览和排序，右侧集中编辑页面参数与组件配置。</p>
      </div>
      <div class="inline-actions">
        <el-button @click="createVisible = true">新增页面</el-button>
        <el-button @click="openTemplateLibrary">页面模板</el-button>
        <el-button :disabled="!selectedPage || !version" @click="saveTemplateVisible = true">另存为模板</el-button>
        <el-button :loading="saving" @click="saveDraft">保存草稿</el-button>
        <el-button type="primary" :loading="publishing" @click="publish">发布页面</el-button>
      </div>
    </div>

    <section class="cms-workbench">
      <aside class="cms-sidebar cms-sidebar--left">
        <section class="data-panel cms-panel">
          <div class="library-head">
            <div>
              <div class="panel-title">页面列表</div>
              <p class="page-subtitle">选择要装修的页面，也可以直接新建自定义页面。</p>
            </div>
            <el-button link type="primary" @click="createVisible = true">新增</el-button>
          </div>
          <div class="page-list">
            <button
              v-for="page in pages"
              :key="page.id"
              class="page-item"
              :class="{ active: selectedPage?.id === page.id }"
              @click="selectPage(page)"
            >
              <span class="page-item__copy">
                <strong>{{ page.title }}</strong>
                <small>{{ page.pageType }}</small>
              </span>
              <span class="page-item__status">{{ page.publishedVersionId ? "已发布" : "草稿中" }}</span>
            </button>
          </div>
        </section>

        <section class="data-panel cms-panel">
          <div class="library-head">
            <div>
              <div class="panel-title">组件库</div>
              <p class="page-subtitle">点击添加组件到当前页面，再到右侧细调参数。</p>
            </div>
          </div>
          <div class="library-filters">
            <el-select v-model="activePresetGroup" placeholder="组件分类">
              <el-option v-for="group in filteredPresetGroups" :key="group.name" :label="group.name" :value="group.name" />
            </el-select>
            <el-input v-model="presetKeyword" clearable placeholder="搜索组件名称" />
          </div>
          <el-tabs v-model="activePresetGroup" class="library-tabs">
            <el-tab-pane v-for="group in filteredPresetGroups" :key="group.name" :label="group.name" :name="group.name">
              <div class="preset-grid">
                <button
                  v-for="preset in group.items"
                  :key="preset.type"
                  class="preset-card"
                  :class="supportStatusClass(preset.type)"
                  :disabled="!canAddPreset(preset)"
                  @click="addComponent(preset)"
                >
                  <span class="preset-thumb" :class="thumbClass(preset.type)">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span class="preset-card__title">
                    <strong>{{ preset.name }}</strong>
                    <span class="support-badge" :class="supportStatusClass(preset.type)">{{ componentSupport(preset.type).label }}</span>
                  </span>
                  <small>{{ presetSupportDescription(preset) }}</small>
                </button>
              </div>
            </el-tab-pane>
          </el-tabs>
        </section>
      </aside>

      <main v-if="selectedPage && version" class="cms-editor cms-stage">
        <section class="data-panel cms-panel cms-stage-head">
          <div class="editor-heading">
            <div>
              <div class="panel-title">{{ selectedPage.title }}</div>
              <p class="page-subtitle">当前页面：{{ selectedPage.pageKey }}，草稿标题用于区分每次装修版本。</p>
            </div>
            <div class="stage-head__actions">
              <el-input v-model="versionTitle" placeholder="草稿标题" style="width: 260px" />
              <el-button @click="rollback">回滚到已发布版本</el-button>
            </div>
          </div>
          <el-alert
            v-if="unsupportedEnabledComponents.length > 0"
            class="publish-guard-alert"
            type="warning"
            :closable="false"
            show-icon
            title="当前页面包含暂不支持小程序/H5 的组件"
            :description="`已启用 ${unsupportedEnabledComponents.length} 个不支持或后续开放组件，用户端正式页面会静默隐藏，建议发布前处理：${unsupportedEnabledComponents.map((item) => presetName(item.type)).join('、')}`"
          />
        </section>

        <section class="data-panel cms-panel phone-preview">
          <div class="library-head">
            <div>
              <div class="panel-title">手机预览</div>
              <p class="page-subtitle">中间预览当前页面效果，点击下方组件卡片可定位并到右侧编辑。</p>
            </div>
            <el-select
              v-model="selectedComponentId"
              clearable
              filterable
              placeholder="定位页面组件"
              style="width: 240px"
              @change="focusComponent"
            >
              <el-option v-for="option in componentOptions" :key="option.value" :label="option.label" :value="option.value" />
            </el-select>
          </div>
          <div class="phone-shell">
            <div class="phone-status" />
            <div class="phone-window" :style="previewStyle">
              <div class="phone-nav">
                <span>{{ previewTitle }}</span>
                <span class="phone-capsule"><i /><i /></span>
              </div>
              <div class="phone-screen">
                <template v-if="previewComponents.length > 0">
                  <div v-for="component in previewComponents" :key="component.id" class="preview-block">
                    <component-preview :item="component" :name="presetName(component.type)" />
                  </div>
                </template>
                <div v-else class="preview-empty">页面暂无展示内容</div>
              </div>
              <div v-if="previewTabbarItems.length > 0" class="phone-tabbar">
                <div
                  v-for="item in previewTabbarItems"
                  :key="item.pageKey"
                  class="phone-tabbar__item"
                  :class="{ active: selectedPage?.pageKey === item.pageKey }"
                >
                  <img v-if="item.iconUrl" :src="selectedPage?.pageKey === item.pageKey ? item.selectedIconUrl || item.iconUrl : item.iconUrl" :alt="item.title" />
                  <span v-else class="phone-tabbar__dot" />
                  <small>{{ item.title }}</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="data-panel cms-panel component-stack">
          <div class="library-head">
            <div>
              <div class="panel-title">页面内容</div>
              <p class="page-subtitle">拖拽暂未开放，当前可通过上移、下移和点击卡片来排布与编辑组件。</p>
            </div>
          </div>

          <el-empty v-if="components.length === 0" description="还没有组件，请从左侧组件库添加" />

          <div
            v-for="(component, index) in components"
            :id="componentDomId(component.id)"
            :key="component.id"
            class="component-card component-card--summary"
            :class="{ 'is-selected': selectedComponentId === component.id }"
            @click="selectComponentCard(component.id)"
          >
            <div class="component-card__head">
              <div>
                <span class="component-title-row">
                  <strong>{{ index + 1 }}. {{ presetName(component.type) }}</strong>
                  <span class="support-badge" :class="supportStatusClass(component.type)">{{ componentSupport(component.type).label }}</span>
                </span>
                <span>{{ componentStateText(component) }}</span>
                <p v-if="componentNotice(component)" class="component-notice" :class="supportStatusClass(component.type)">
                  {{ componentNotice(component) }}
                </p>
              </div>
              <div class="inline-actions" @click.stop>
                <el-switch v-model="component.enabled" active-text="展示" inactive-text="隐藏" />
                <el-button size="small" :disabled="index === 0" @click="moveComponent(index, -1)">上移</el-button>
                <el-button size="small" :disabled="index === components.length - 1" @click="moveComponent(index, 1)">下移</el-button>
                <el-button size="small" type="danger" plain @click="removeComponent(index)">删除</el-button>
              </div>
            </div>
            <div class="component-card__summary">
              <span>{{ componentSummary(component) }}</span>
              <el-button link type="primary" @click.stop="selectComponentCard(component.id)">编辑参数</el-button>
            </div>
          </div>
        </section>
      </main>

      <aside v-if="selectedPage && version" class="cms-sidebar cms-sidebar--right">
        <section class="data-panel cms-panel inspector-panel">
          <div class="library-head">
            <div>
              <div class="panel-title">页面参数</div>
              <p class="page-subtitle">设置页面标题、分享卡片和页面级元信息。</p>
            </div>
          </div>
          <el-form label-position="top" class="page-meta-form">
            <el-form-item label="小程序页面标题">
              <el-input v-model="pageMeta.pageTitle" placeholder="显示在手机预览顶部" />
            </el-form-item>
            <el-form-item label="微信分享标题">
              <el-input v-model="pageMeta.shareTitle" placeholder="转发给朋友时展示的标题" />
            </el-form-item>
            <el-form-item label="微信分享描述">
              <el-input v-model="pageMeta.shareDescription" type="textarea" :rows="2" placeholder="转发卡片描述" />
            </el-form-item>
            <el-form-item label="微信分享封面">
              <div class="field-row">
                <el-input v-model="pageMeta.shareImageUrl" placeholder="从素材库选择或粘贴图片地址" />
                <el-button @click="openPageMetaImagePicker">应用素材库</el-button>
              </div>
            </el-form-item>
          </el-form>
        </section>

        <section class="data-panel cms-panel inspector-panel">
          <div class="library-head">
            <div>
              <div class="panel-title">组件参数</div>
              <p class="page-subtitle">{{ selectedComponent ? `正在编辑：${presetName(selectedComponent.type)}` : "先在中间选择一个组件，再在这里编辑参数。" }}</p>
            </div>
          </div>

          <template v-if="selectedComponent">
            <el-collapse v-model="expandedConfigGroupIds[selectedComponent.id]" class="config-group-collapse">
              <el-collapse-item v-for="group in groupedFieldsFor(selectedComponent.type)" :key="group.key" :title="group.title" :name="group.key">
                <el-form label-position="top" class="config-form">
                  <el-form-item v-for="field in group.fields" :key="field.key" :label="field.label">
                    <el-input-number
                      v-if="field.kind === 'number'"
                      :model-value="numberValue(selectedComponent, field.key, field.fallback)"
                      :min="0"
                      @update:model-value="setConfig(selectedComponent, field.key, $event ?? field.fallback ?? 0)"
                    />
                    <div v-else-if="field.kind === 'range'" class="range-field">
                      <el-slider
                        :model-value="numberValue(selectedComponent, field.key, field.fallback)"
                        :min="field.min ?? 0"
                        :max="field.max ?? 80"
                        :step="field.step ?? 1"
                        @update:model-value="setConfig(selectedComponent, field.key, Number($event) || 0)"
                      />
                      <el-input-number
                        :model-value="numberValue(selectedComponent, field.key, field.fallback)"
                        :min="field.min ?? 0"
                        :max="field.max ?? 80"
                        :step="field.step ?? 1"
                        @update:model-value="setConfig(selectedComponent, field.key, $event ?? field.fallback ?? 0)"
                      />
                    </div>
                    <el-color-picker
                      v-else-if="field.kind === 'color'"
                      :model-value="String(selectedComponent.config[field.key] ?? field.fallback ?? '')"
                      @update:model-value="setConfig(selectedComponent, field.key, $event || field.fallback || '')"
                    />
                    <el-select
                      v-else-if="field.kind === 'select'"
                      :model-value="String(selectedComponent.config[field.key] ?? field.fallback ?? '')"
                      @update:model-value="setConfig(selectedComponent, field.key, $event)"
                    >
                      <el-option v-for="option in field.options ?? []" :key="option.value" :label="option.label" :value="option.value" />
                    </el-select>
                    <el-switch
                      v-else-if="field.kind === 'switch'"
                      :model-value="booleanValue(selectedComponent, field.key, field.fallback)"
                      active-text="显示"
                      inactive-text="隐藏"
                      @update:model-value="setConfig(selectedComponent, field.key, $event)"
                    />
                    <el-input
                      v-else-if="field.kind === 'textarea' || field.kind === 'list'"
                      :model-value="textValue(selectedComponent, field)"
                      type="textarea"
                      :rows="field.rows ?? 3"
                      :placeholder="field.placeholder"
                      @update:model-value="setTextValue(selectedComponent, field, $event)"
                    />
                    <div v-else class="field-row">
                      <el-input
                        :model-value="String(selectedComponent.config[field.key] ?? '')"
                        :placeholder="field.placeholder"
                        @update:model-value="setConfig(selectedComponent, field.key, $event)"
                      />
                      <el-button v-if="isImageField(field) || isFontField(field)" @click="openMaterialPicker(selectedComponent, field)">
                        {{ isFontField(field) ? "选择字体文件" : "应用素材库" }}
                      </el-button>
                    </div>
                    <el-button v-if="field.kind === 'list' && isImageField(field)" class="material-button" @click="openMaterialPicker(selectedComponent, field)">
                      从素材库添加图片
                    </el-button>
                  </el-form-item>
                </el-form>
              </el-collapse-item>
            </el-collapse>
          </template>
          <el-empty v-else description="从中间页面内容区选择一个组件，即可在这里编辑参数" />
        </section>
      </aside>
    </section>

    <el-dialog v-model="createVisible" title="新增页面" width="520px">
      <el-form :model="createForm" label-width="110px">
        <el-form-item label="页面地址尾缀"><el-input v-model="createForm.slug" placeholder="例如 about-us" /></el-form-item>
        <el-form-item label="页面标题"><el-input v-model="createForm.title" /></el-form-item>
        <el-form-item label="页面说明"><el-input v-model="createForm.description" /></el-form-item>
        <el-form-item label="套用模板">
          <el-select v-model="createForm.templateId" clearable filterable placeholder="可直接从模板创建">
            <el-option v-for="template in libraryTemplates" :key="template.id" :label="`${template.title} · ${template.category}`" :value="template.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="createCustomPage">保存页面</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="templateVisible" title="页面模板" width="1080px">
      <div class="template-library">
        <div class="template-library__filters">
          <el-input v-model="templateKeyword" clearable placeholder="搜索模板名称" />
          <el-radio-group v-model="templateCategory">
            <el-radio-button label="全部">全部</el-radio-button>
            <el-radio-button v-for="category in templateCategories" :key="category" :label="category">{{ category }}</el-radio-button>
          </el-radio-group>
        </div>
        <div class="template-grid">
          <article v-for="template in filteredLibraryTemplates" :key="template.id" class="template-card">
            <div class="template-card__phone">
              <div class="template-card__screen">
                <span class="template-card__category">{{ template.category }}</span>
                <strong>{{ template.title }}</strong>
                <small>{{ template.summary || template.description || "可作为页面装修参考模板" }}</small>
                <div class="template-card__chips">
                  <span v-for="name in templateComponentNames(template)" :key="name">{{ name }}</span>
                </div>
              </div>
            </div>
            <div class="template-card__body">
              <div>
                <strong>{{ template.title }}</strong>
                <p>{{ template.description || template.summary || "可直接套用后再继续修改" }}</p>
              </div>
              <div class="template-card__actions">
                <span class="support-badge" :class="template.system ? 'is-support-supported' : 'is-support-basic'">{{ template.system ? "系统模板" : "自定义模板" }}</span>
                <el-button type="primary" plain :disabled="!selectedPage || !template.version" @click="applyTemplateToCurrentPage(template)">应用到当前页</el-button>
              </div>
            </div>
          </article>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="saveTemplateVisible" title="另存为页面模板" width="520px">
      <el-form :model="saveTemplateForm" label-width="110px">
        <el-form-item label="模板标识"><el-input v-model="saveTemplateForm.slug" placeholder="例如 summit-landing" /></el-form-item>
        <el-form-item label="模板名称"><el-input v-model="saveTemplateForm.title" /></el-form-item>
        <el-form-item label="模板分类"><el-input v-model="saveTemplateForm.category" placeholder="例如 会议主会场" /></el-form-item>
        <el-form-item label="模板说明"><el-input v-model="saveTemplateForm.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saveTemplateVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!selectedPage || !version" @click="saveAsTemplate">保存模板</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="materialVisible" title="选择素材图片" width="820px">
      <div class="material-picker">
        <div class="material-picker__head">
          <el-input v-model="materialKeyword" clearable placeholder="搜索素材名称" @keyup.enter="loadMaterials" />
          <el-button :loading="materialLoading" @click="loadMaterials">搜索</el-button>
        </div>
        <el-empty v-if="!materialLoading && materialAssets.length === 0" :description="materialEmptyText" />
        <div v-else class="material-grid">
          <button v-for="asset in materialAssets" :key="asset.id" class="material-card" @click="chooseMaterial(asset)">
            <img v-if="isImageAsset(asset)" :src="asset.url" :alt="asset.name" />
            <div v-else class="font-asset">字体</div>
            <strong>{{ asset.name }}</strong>
            <small>{{ asset.usage || "通用素材" }}</small>
          </button>
        </div>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  createPage,
  createPageLibraryTemplate,
  getPageVersion,
  getTabbar,
  listMaterials,
  listComponentPresets,
  listConferences,
  listPageLibraryTemplates,
  listPages,
  publishPageVersion,
  rollbackPage,
  updatePageVersion
} from "../../services/admin";
import { routeQuery } from "../../router";
import type {
  CmsComponent,
  CmsComponentSupportStatus,
  ComponentPreset,
  Conference,
  MaterialAsset,
  PageLibraryTemplate,
  PageTemplate,
  PageVersion,
  TabBarConfig,
  ThemeConfig
} from "../../services/types";

interface EditableComponent {
  id: string;
  type: string;
  enabled: boolean;
  sortOrder: number;
  config: Record<string, unknown>;
}

interface ConfigField {
  key: string;
  label: string;
  kind?: "text" | "textarea" | "number" | "range" | "list" | "color" | "select" | "switch";
  placeholder?: string;
  rows?: number;
  fallback?: number | string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string }>;
}

interface ConfigFieldGroup {
  key: string;
  title: string;
  fields: ConfigField[];
}

interface PageMetaForm {
  pageTitle: string;
  shareTitle: string;
  shareDescription: string;
  shareImageUrl: string;
}

interface CmsComponentSupportMeta {
  label: string;
  status: CmsComponentSupportStatus;
  description: string;
}

const CMS_COMPONENT_SUPPORT_MATRIX: Record<string, CmsComponentSupportMeta> = {
  hero: { label: "已支持", status: "supported", description: "小程序/H5 已完整支持图片横幅展示" },
  "conference-list": { label: "已支持", status: "supported", description: "小程序/H5 已完整支持会议列表展示和详情跳转" },
  "conference-tabs": { label: "基础支持", status: "basic", description: "小程序/H5 基础支持分类标签和会议卡片展示，暂不做真实筛选" },
  "registration-button": { label: "已支持", status: "supported", description: "小程序/H5 支持普通报名入口；会议详情页会隐藏以避免重复按钮" },
  "floating-registration-button": { label: "已支持", status: "supported", description: "小程序/H5 支持悬浮报名入口；会议详情页会隐藏以避免重复按钮" },
  "promotion-bar": { label: "基础支持", status: "basic", description: "小程序/H5 基础支持提示条展示" },
  "rich-text": { label: "已支持", status: "supported", description: "小程序/H5 已支持富文本片段展示" },
  "safe-html": { label: "已支持", status: "supported", description: "小程序/H5 已支持安全图文片段展示" },
  "image-grid": { label: "已支持", status: "supported", description: "小程序/H5 已支持图片宫格展示" },
  video: { label: "基础支持", status: "basic", description: "小程序/H5 基础支持视频播放入口" },
  notice: { label: "已支持", status: "supported", description: "小程序/H5 已支持公告提示展示" },
  "stats-grid": { label: "已支持", status: "supported", description: "小程序/H5 已支持数字亮点展示" },
  "ticket-price-list": { label: "已支持", status: "supported", description: "小程序/H5 已支持票种价格文案展示" },
  "process-steps": { label: "已支持", status: "supported", description: "小程序/H5 已支持流程步骤展示" },
  "text-image": { label: "已支持", status: "supported", description: "小程序/H5 已支持图文介绍展示" },
  "download-list": { label: "基础支持", status: "basic", description: "小程序/H5 基础支持资料名称列表展示" },
  "live-card": { label: "基础支持", status: "basic", description: "小程序/H5 基础支持直播信息展示" },
  "testimonial-list": { label: "基础支持", status: "basic", description: "小程序/H5 基础支持评价列表展示" },
  "traffic-guide": { label: "基础支持", status: "basic", description: "小程序/H5 基础支持交通文本展示" },
  "contact-card": { label: "已支持", status: "supported", description: "小程序/H5 已支持联系卡片展示" },
  "tag-filter": { label: "基础支持", status: "basic", description: "小程序/H5 基础支持标签展示，暂不做真实筛选" },
  title: { label: "已支持", status: "supported", description: "小程序/H5 已支持标题展示" },
  divider: { label: "已支持", status: "supported", description: "小程序/H5 已支持分割线展示" },
  spacer: { label: "已支持", status: "supported", description: "小程序/H5 已支持留白展示" },
  carousel: { label: "基础支持", status: "basic", description: "小程序/H5 基础支持图片轮播展示" },
  "speaker-cards": { label: "基础支持", status: "basic", description: "小程序/H5 基础支持嘉宾卡片展示" },
  "schedule-timeline": { label: "基础支持", status: "basic", description: "小程序/H5 基础支持会议日程展示" },
  "coupon-card": { label: "暂不支持小程序/H5", status: "unsupported", description: "优惠券能力为扩展模块，暂不建议发布到用户端" },
  countdown: { label: "基础支持", status: "basic", description: "小程序/H5 基础支持目标时间倒计时展示" },
  search: { label: "暂不支持小程序/H5", status: "unsupported", description: "搜索交互暂不支持用户端装修展示" },
  "map-contact": { label: "基础支持", status: "basic", description: "小程序/H5 基础支持地址和电话展示" },
  "sponsor-wall": { label: "基础支持", status: "basic", description: "小程序/H5 基础支持赞助商名称或 Logo 展示" },
  faq: { label: "基础支持", status: "basic", description: "小程序/H5 基础支持问答列表展示" },
  "membership-benefits": { label: "后续开放", status: "planned", description: "会员模块后续开放，暂不支持用户端装修展示" },
  "user-profile-card": { label: "后续开放", status: "planned", description: "用户中心后续增强，暂不支持用户端装修展示" },
  "my-order-list": { label: "后续开放", status: "planned", description: "订单中心后续开放，暂不支持用户端装修展示" },
  "mall-product-grid": { label: "后续开放", status: "planned", description: "商城模块后续开放，暂不支持用户端装修展示" }
};

const ADDABLE_SUPPORT_STATUSES: CmsComponentSupportStatus[] = ["supported", "basic"];
const REGISTRATION_CTA_TYPES = ["registration-button", "floating-registration-button"];

const pages = ref<PageTemplate[]>([]);
const libraryTemplates = ref<PageLibraryTemplate[]>([]);
const presets = ref<ComponentPreset[]>([]);
const selectedPage = ref<PageTemplate | null>(null);
const version = ref<PageVersion | null>(null);
const versionTitle = ref("");
const components = ref<EditableComponent[]>([]);
const saving = ref(false);
const publishing = ref(false);
const createVisible = ref(false);
const templateVisible = ref(false);
const saveTemplateVisible = ref(false);
const createForm = reactive({ slug: "", title: "", description: "", templateId: "" });
const saveTemplateForm = reactive({ slug: "", title: "", category: "自定义模板", description: "" });
const presetKeyword = ref("");
const activePresetGroup = ref("");
const selectedComponentId = ref("");
const templateKeyword = ref("");
const templateCategory = ref("全部");
const previewTheme: Partial<ThemeConfig> = { primaryColor: "#1463ff", secondaryColor: "#18c29c", backgroundColor: "#f5f7fb", cardBackground: "#ffffff", radius: 8 };
const materialVisible = ref(false);
const materialLoading = ref(false);
const materialKeyword = ref("");
const materialAssets = ref<MaterialAsset[]>([]);
const materialTarget = ref<{ component: EditableComponent; field: ConfigField } | null>(null);
const materialPageTarget = ref<keyof PageMetaForm | null>(null);
const previewConferences = ref<Conference[]>([]);
const previewTabbar = ref<TabBarConfig | null>(null);
const loadedPreviewFonts = new Set<string>();
const materialEmptyText = computed(() => (materialTarget.value && isFontField(materialTarget.value.field) ? "暂无字体素材，请先到素材管理上传字体文件" : "暂无可用图片素材"));
const expandedComponentIds = ref<string[]>([]);
const expandedConfigGroupIds = reactive<Record<string, string[]>>({});
const pageMeta = reactive<PageMetaForm>({ pageTitle: "", shareTitle: "", shareDescription: "", shareImageUrl: "" });

const presetGroups = computed(() => {
  const groups = new Map<string, ComponentPreset[]>();
  for (const preset of presets.value) {
    groups.set(preset.group, [...(groups.get(preset.group) ?? []), preset]);
  }
  return Array.from(groups.entries()).map(([name, items]) => ({ name, items }));
});

const filteredPresetGroups = computed(() => {
  const keyword = presetKeyword.value.trim();
  return presetGroups.value
    .map((group) => ({
      name: group.name,
      items: keyword ? group.items.filter((item) => item.name.includes(keyword) || item.description?.includes(keyword)) : group.items
    }))
    .filter((group) => group.items.length > 0);
});

const previewComponents = computed(() => components.value.filter((item) => item.enabled));
const unsupportedEnabledComponents = computed(() =>
  components.value.filter((item) => item.enabled && ["unsupported", "planned"].includes(componentSupport(item.type).status))
);
const componentOptions = computed(() =>
  components.value.map((component, index) => ({
    label: `${index + 1}. ${presetName(component.type)} · ${componentSupport(component.type).label}${component.enabled ? "" : "（已隐藏）"}`,
    value: component.id
  }))
);
const selectedComponent = computed(() => components.value.find((component) => component.id === selectedComponentId.value) ?? null);
const previewTitle = computed(() => pageMeta.pageTitle.trim() || selectedPage.value?.title || "会议报名");
const previewTabbarItems = computed(() => (previewTabbar.value?.enabled === false ? [] : (previewTabbar.value?.items ?? []).filter((item) => item.visible).sort((a, b) => a.sortOrder - b.sortOrder)));
const templateCategories = computed(() =>
  Array.from(new Set(libraryTemplates.value.map((item) => item.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"))
);
const filteredLibraryTemplates = computed(() =>
  libraryTemplates.value.filter((item) => {
    const keyword = templateKeyword.value.trim();
    const matchesKeyword = !keyword || item.title.includes(keyword) || item.description?.includes(keyword) || item.summary.includes(keyword);
    const matchesCategory = templateCategory.value === "全部" || item.category === templateCategory.value;
    return matchesKeyword && matchesCategory;
  })
);
const previewStyle = computed(() => ({
  "--preview-primary": previewTheme.primaryColor,
  "--preview-secondary": previewTheme.secondaryColor,
  "--preview-bg": previewTheme.backgroundColor,
  "--preview-card": previewTheme.cardBackground,
  "--preview-radius": `${previewTheme.radius}px`
}));

watch(
  filteredPresetGroups,
  (groups) => {
    if (!groups.some((group) => group.name === activePresetGroup.value)) {
      activePresetGroup.value = groups[0]?.name ?? "";
    }
  },
  { immediate: true }
);

watch(components, installPreviewFonts, { deep: true });

onMounted(async () => {
  const [presetResponse, conferenceResponse, tabbarResponse] = await Promise.all([
    listComponentPresets(),
    listConferences({ page: 1, pageSize: 6, status: "PUBLISHED" }).catch(() => ({ items: [] as Conference[] })),
    getTabbar().catch(() => null)
  ]);
  presets.value = presetResponse.items;
  previewConferences.value = conferenceResponse.items;
  previewTabbar.value = tabbarResponse;
  activePresetGroup.value = presetGroups.value[0]?.name ?? "";
  await Promise.all([loadPages(), loadLibraryTemplates()]);
});

async function loadPages() {
  pages.value = (await listPages()).items;
  if (!selectedPage.value && pages.value[0]) {
    const target = pages.value.find((item) => item.pageKey === routeQuery.value.pageKey) ?? pages.value[0];
    await selectPage(target);
  }
}

async function loadLibraryTemplates() {
  libraryTemplates.value = (await listPageLibraryTemplates()).items;
}

async function selectPage(page: PageTemplate) {
  selectedPage.value = page;
  const latest = page.versions[0];
  if (!latest) {
    version.value = null;
    return;
  }
  version.value = await getPageVersion(latest.id);
  versionTitle.value = version.value.title;
  components.value = version.value.components.map(toEditableComponent);
  applyPageMeta(version.value.themeJson, page.title);
  expandedComponentIds.value = components.value[0] ? [components.value[0].id] : [];
  selectedComponentId.value = components.value[0]?.id ?? "";
  initializeConfigGroups(components.value);
}

function toEditableComponent(component: CmsComponent): EditableComponent {
  return {
    id: component.id,
    type: component.type,
    enabled: component.enabled,
    sortOrder: component.sortOrder,
    config: { ...(component.config ?? {}) }
  };
}

function addComponent(preset: ComponentPreset) {
  if (!canAddPreset(preset)) {
    ElMessage.warning(componentSupport(preset.type).description || "该组件暂不支持小程序/H5展示，建议暂勿发布");
    return;
  }
  const id = `${preset.type}-${Date.now()}`;
  components.value.push({
    id,
    type: preset.type,
    enabled: true,
    sortOrder: components.value.length,
    config: { ...(preset.defaultConfigJson ?? {}) }
  });
  expandedComponentIds.value = [id];
  selectedComponentId.value = id;
  expandedConfigGroupIds[id] = defaultExpandedConfigGroups(preset.type);
  void nextTick(() => scrollToComponent(id));
  ElMessage.success(`已添加${preset.name}`);
}

function moveComponent(index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= components.value.length) return;
  const list = [...components.value];
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
  components.value = list;
}

function removeComponent(index: number) {
  const target = components.value[index];
  components.value.splice(index, 1);
  if (target) {
    expandedComponentIds.value = expandedComponentIds.value.filter((id) => id !== target.id);
    delete expandedConfigGroupIds[target.id];
    if (selectedComponentId.value === target.id) selectedComponentId.value = "";
  }
}

function componentDomId(id: string) {
  return `cms-component-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function focusComponent(value: string | string[] | number | boolean | undefined) {
  if (typeof value !== "string" || !value) return;
  const component = components.value.find((item) => item.id === value);
  if (component) {
    expandedConfigGroupIds[value] = expandedConfigGroupIds[value] ?? defaultExpandedConfigGroups(component.type);
  }
  void nextTick(() => scrollToComponent(value));
}

function selectComponentCard(id: string) {
  selectedComponentId.value = id;
  focusComponent(id);
}

function scrollToComponent(id: string) {
  document.getElementById(componentDomId(id))?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function initializeConfigGroups(list: EditableComponent[]) {
  const activeIds = new Set(list.map((component) => component.id));
  for (const key of Object.keys(expandedConfigGroupIds)) {
    if (!activeIds.has(key)) delete expandedConfigGroupIds[key];
  }
  for (const component of list) {
    expandedConfigGroupIds[component.id] = expandedConfigGroupIds[component.id] ?? defaultExpandedConfigGroups(component.type);
  }
}

function defaultExpandedConfigGroups(type: string): string[] {
  const groups = groupedFieldsFor(type);
  return groups.length > 0 ? [groups[0].key] : [];
}

async function saveDraft() {
  if (!version.value) return;
  saving.value = true;
  try {
    version.value = await updatePageVersion(version.value.id, {
      title: versionTitle.value,
      components: toPayloadComponents(),
      themeJson: nextThemeJson()
    });
    components.value = version.value.components.map(toEditableComponent);
    applyPageMeta(version.value.themeJson, selectedPage.value?.title);
    expandedComponentIds.value = expandedComponentIds.value.filter((id) => components.value.some((component) => component.id === id));
    if (!components.value.some((component) => component.id === selectedComponentId.value)) {
      selectedComponentId.value = components.value[0]?.id ?? "";
    }
    initializeConfigGroups(components.value);
    ElMessage.success("草稿已保存");
  } finally {
    saving.value = false;
  }
}

async function publish() {
  if (!version.value) return;
  if (unsupportedEnabledComponents.value.length > 0) {
    try {
      await ElMessageBox.confirm(
        "发布后这些组件不会展示给普通用户端，请确认是否继续发布。建议先隐藏或替换为已支持/基础支持组件。",
        "存在暂不支持组件",
        {
          confirmButtonText: "继续发布",
          cancelButtonText: "返回处理",
          type: "warning"
        }
      );
    } catch {
      return;
    }
  }
  await saveDraft();
  publishing.value = true;
  try {
    version.value = await publishPageVersion(version.value.id);
    await loadPages();
    ElMessage.success("页面已发布");
  } finally {
    publishing.value = false;
  }
}

async function rollback() {
  if (!selectedPage.value) return;
  const next = await rollbackPage(selectedPage.value.id);
  await loadPages();
  version.value = next;
  components.value = next.components.map(toEditableComponent);
  applyPageMeta(next.themeJson, selectedPage.value?.title);
  expandedComponentIds.value = components.value[0] ? [components.value[0].id] : [];
  selectedComponentId.value = components.value[0]?.id ?? "";
  initializeConfigGroups(components.value);
  ElMessage.success("已回滚到上一发布版本");
}

async function createCustomPage() {
  const slug = createForm.slug.trim().replace(/^custom:/, "");
  await createPage({
    pageKey: `custom:${slug}`,
    title: createForm.title,
    description: createForm.description,
    templateId: createForm.templateId || undefined
  });
  Object.assign(createForm, { slug: "", title: "", description: "", templateId: "" });
  createVisible.value = false;
  await loadPages();
}

function openTemplateLibrary() {
  templateVisible.value = true;
}

async function applyTemplateToCurrentPage(template: PageLibraryTemplate) {
  if (!template.version) return;
  try {
    await ElMessageBox.confirm(`应用模板“${template.title}”后，当前草稿中的组件排序与配置会被替换。`, "应用页面模板", {
      confirmButtonText: "继续应用",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  components.value = template.version.components.map(toEditableComponent);
  versionTitle.value = `${selectedPage.value?.title || "页面"} · ${template.title}`;
  applyPageMeta(template.version.themeJson, selectedPage.value?.title);
  selectedComponentId.value = components.value[0]?.id ?? "";
  initializeConfigGroups(components.value);
  templateVisible.value = false;
  ElMessage.success("已应用模板到当前草稿");
}

async function saveAsTemplate() {
  if (!version.value) return;
  const slug = saveTemplateForm.slug.trim().replace(/^template:/, "");
  await createPageLibraryTemplate({
    slug,
    title: saveTemplateForm.title,
    category: saveTemplateForm.category,
    description: saveTemplateForm.description,
    components: toPayloadComponents(),
    themeJson: nextThemeJson()
  });
  Object.assign(saveTemplateForm, { slug: "", title: "", category: "自定义模板", description: "" });
  saveTemplateVisible.value = false;
  await loadLibraryTemplates();
  ElMessage.success("已保存为页面模板");
}

function toPayloadComponents(): CmsComponent[] {
  return components.value.map((component, index) => ({
    id: component.id,
    type: component.type,
    enabled: component.enabled,
    sortOrder: index,
    config: normalizeConfig(component.config)
  }));
}

function normalizeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string") {
      next[key] = value.trim();
    } else {
      next[key] = value;
    }
  }
  return next;
}

function applyPageMeta(themeJson: Record<string, unknown> | null | undefined, fallbackTitle?: string | null) {
  const meta = readPageMeta(themeJson);
  pageMeta.pageTitle = meta.pageTitle || fallbackTitle || "";
  pageMeta.shareTitle = meta.shareTitle || fallbackTitle || "";
  pageMeta.shareDescription = meta.shareDescription || "";
  pageMeta.shareImageUrl = meta.shareImageUrl || "";
}

function readPageMeta(themeJson: Record<string, unknown> | null | undefined): PageMetaForm {
  const raw = themeJson?.pageMeta;
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    pageTitle: typeof source.pageTitle === "string" ? source.pageTitle : "",
    shareTitle: typeof source.shareTitle === "string" ? source.shareTitle : "",
    shareDescription: typeof source.shareDescription === "string" ? source.shareDescription : "",
    shareImageUrl: typeof source.shareImageUrl === "string" ? source.shareImageUrl : ""
  };
}

function nextThemeJson(): Record<string, unknown> {
  return {
    ...(version.value?.themeJson ?? {}),
    pageMeta: {
      pageTitle: pageMeta.pageTitle.trim(),
      shareTitle: pageMeta.shareTitle.trim(),
      shareDescription: pageMeta.shareDescription.trim(),
      shareImageUrl: pageMeta.shareImageUrl.trim()
    }
  };
}

function templateComponentNames(template: PageLibraryTemplate): string[] {
  const names = (template.version?.components ?? []).map((component) => presetName(component.type));
  return names.slice(0, 4);
}

function componentSummary(component: EditableComponent): string {
  const configValues = Object.values(component.config)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return configValues[0] || "点击右侧编辑该组件的展示内容、样式和行为。";
}

function fieldsFor(type: string): ConfigField[] {
  const commonTitle = [{ key: "title", label: "模块标题", placeholder: "请输入模块标题" }];
  const titleStyleFields: ConfigField[] = [
    { key: "titleFontSize", label: "模块标题字号", kind: "number", fallback: 32 },
    {
      key: "titleFontFamily",
      label: "模块标题字体",
      kind: "select",
      fallback: "system",
      options: [
        { label: "系统默认", value: "system" },
        { label: "苹方/微软雅黑", value: "sans" },
        { label: "宋体", value: "serif" },
        { label: "黑体", value: "bold-sans" },
        { label: "上传字体", value: "custom" }
      ]
    },
    { key: "titleFontAssetUrl", label: "模块标题字体文件", placeholder: "从素材库选择字体文件" },
    { key: "titleTextColor", label: "模块标题颜色", kind: "color", fallback: "#172033" },
    {
      key: "titleTextAlign",
      label: "模块标题对齐",
      kind: "select",
      fallback: "left",
      options: [
        { label: "居左", value: "left" },
        { label: "居中", value: "center" },
        { label: "居右", value: "right" }
      ]
    }
  ];
  const textStyleFields: ConfigField[] = [
    { key: "fontSize", label: "内容文字字号", kind: "number", fallback: 26 },
    {
      key: "fontFamily",
      label: "内容文字字体",
      kind: "select",
      fallback: "system",
      options: [
        { label: "系统默认", value: "system" },
        { label: "苹方/微软雅黑", value: "sans" },
        { label: "宋体", value: "serif" },
        { label: "黑体", value: "bold-sans" },
        { label: "上传字体", value: "custom" }
      ]
    },
    { key: "fontAssetUrl", label: "内容字体文件", placeholder: "从素材库选择字体文件" },
    { key: "textColor", label: "内容文字颜色", kind: "color", fallback: "#172033" },
    {
      key: "textAlign",
      label: "内容文字对齐",
      kind: "select",
      fallback: "left",
      options: [
        { label: "居左", value: "left" },
        { label: "居中", value: "center" },
        { label: "居右", value: "right" }
      ]
    }
  ];
  const withTextStyle = (fields: ConfigField[], fontSize = 26) => [...fields, ...titleStyleFields, { ...textStyleFields[0], fallback: fontSize }, ...textStyleFields.slice(1)];
  const conferenceDisplayFields: ConfigField[] = [
    { key: "showCover", label: "显示会议封面", kind: "switch", fallback: "true" },
    {
      key: "cardImageLayout",
      label: "封面展示方式",
      kind: "select",
      fallback: "left",
      options: [
        { label: "左侧缩略图", value: "left" },
        { label: "图片独占一行铺满", value: "full" }
      ]
    },
    { key: "cardThumbWidth", label: "左侧缩略图宽度", kind: "range", fallback: 0, min: 0, max: 180 },
    { key: "cardThumbHeight", label: "左侧缩略图高度", kind: "range", fallback: 0, min: 0, max: 150 },
    { key: "cardImageHeight", label: "铺满图片高度", kind: "range", fallback: 120, min: 80, max: 260 },
    { key: "showSummary", label: "显示会议简介", kind: "switch", fallback: "true" },
    { key: "summaryFallback", label: "无简介时默认文案", placeholder: "点击查看会议详情和报名信息。" },
    { key: "detailButtonText", label: "详情按钮文案", placeholder: "查看详情" },
    { key: "showTime", label: "显示会议时间", kind: "switch", fallback: "true" },
    { key: "showLocation", label: "显示会议地点", kind: "switch", fallback: "true" },
    { key: "showRegistrationCount", label: "显示报名人数", kind: "switch", fallback: "false" },
    {
      key: "registrationCountMode",
      label: "报名人数模式",
      kind: "select",
      fallback: "actual",
      options: [
        { label: "实际报名人数", value: "actual" },
        { label: "虚拟报名人数", value: "virtual" },
        { label: "实际 + 虚拟人数", value: "actual-plus-virtual" }
      ]
    },
    { key: "virtualRegistrationBase", label: "虚拟人数基数", kind: "number", fallback: 0 },
    { key: "virtualRegistrationStep", label: "每条递增人数", kind: "number", fallback: 0 },
    { key: "cardMarginTop", label: "上间距", kind: "range", fallback: 10, min: 0, max: 60 },
    { key: "cardMarginBottom", label: "下间距", kind: "range", fallback: 0, min: 0, max: 60 },
    { key: "cardMarginX", label: "左右间距", kind: "range", fallback: 0, min: 0, max: 40 },
    { key: "cardPadding", label: "卡片内边距", kind: "range", fallback: 10, min: 0, max: 40 },
    { key: "cardGap", label: "图文间距", kind: "range", fallback: 10, min: 0, max: 40 },
    { key: "cardRadius", label: "卡片圆角", kind: "range", fallback: 8, min: 0, max: 32 },
    { key: "cardTitleFontSize", label: "卡片标题字号", kind: "number", fallback: 24 },
    { key: "cardTitleColor", label: "卡片标题颜色", kind: "color", fallback: "#172033" },
    {
      key: "cardTitleAlign",
      label: "卡片标题对齐",
      kind: "select",
      fallback: "left",
      options: [
        { label: "居左", value: "left" },
        { label: "居中", value: "center" },
        { label: "居右", value: "right" }
      ]
    },
    { key: "cardSummaryFontSize", label: "卡片简介字号", kind: "number", fallback: 12 },
    { key: "cardSummaryColor", label: "卡片简介颜色", kind: "color", fallback: "#637083" },
    {
      key: "cardSummaryAlign",
      label: "卡片简介对齐",
      kind: "select",
      fallback: "left",
      options: [
        { label: "居左", value: "left" },
        { label: "居中", value: "center" },
        { label: "居右", value: "right" }
      ]
    },
    { key: "cardMetaFontSize", label: "卡片信息字号", kind: "number", fallback: 11 },
    { key: "cardMetaColor", label: "卡片信息颜色", kind: "color", fallback: "#637083" },
    {
      key: "cardMetaAlign",
      label: "卡片信息对齐",
      kind: "select",
      fallback: "left",
      options: [
        { label: "居左", value: "left" },
        { label: "居中", value: "center" },
        { label: "居右", value: "right" }
      ]
    }
  ];
  const map: Record<string, ConfigField[]> = {
    hero: [
      { key: "imageUrl", label: "横幅图片地址", placeholder: "从素材库选择或粘贴图片地址" },
      { key: "fullBleed", label: "横幅铺满屏幕宽度", kind: "switch", fallback: "true" },
      {
        key: "imageMode",
        label: "图片裁切方式",
        kind: "select",
        fallback: "aspectFill",
        options: [
          { label: "铺满裁切", value: "aspectFill" },
          { label: "完整显示", value: "aspectFit" },
          { label: "宽度铺满", value: "widthFix" }
        ]
      }
    ],
    carousel: [{ key: "images", label: "轮播图片", kind: "list", placeholder: "每行一个图片地址", rows: 5 }],
    "conference-list": withTextStyle([...commonTitle, { key: "limit", label: "展示数量", kind: "number", fallback: 10 }, ...conferenceDisplayFields], 26),
    "conference-tabs": withTextStyle([...commonTitle, { key: "tabs", label: "分类名称", kind: "list", placeholder: "每行一个分类名称；留空时自动取会议地点", rows: 4 }, ...conferenceDisplayFields], 26),
    "speaker-cards": withTextStyle([...commonTitle, { key: "speakers", label: "嘉宾信息", kind: "list", placeholder: "每行一位嘉宾，例如：张三｜主讲嘉宾", rows: 5 }], 26),
    "schedule-timeline": withTextStyle([...commonTitle, { key: "items", label: "日程安排", kind: "list", placeholder: "每行一项日程", rows: 5 }], 26),
    "registration-button": withTextStyle([{ key: "text", label: "按钮文字", placeholder: "立即报名" }], 28),
    "floating-registration-button": withTextStyle([{ key: "text", label: "悬浮按钮文字", placeholder: "立即报名" }], 28),
    "coupon-card": withTextStyle([...commonTitle, { key: "description", label: "说明文字", kind: "textarea", rows: 2 }], 26),
    "promotion-bar": withTextStyle([{ key: "text", label: "提示文字", placeholder: "满减活动进行中" }], 28),
    "rich-text": withTextStyle([{ key: "html", label: "图文内容", kind: "textarea", rows: 6, placeholder: "填写图文内容，可使用简单段落和换行" }], 28),
    "safe-html": withTextStyle([{ key: "html", label: "图文内容", kind: "textarea", rows: 6, placeholder: "填写安全图文内容" }], 28),
    "image-grid": [{ key: "images", label: "图片宫格", kind: "list", placeholder: "每行一个图片地址", rows: 5 }],
    video: withTextStyle([...commonTitle, { key: "url", label: "视频地址", placeholder: "请输入视频地址" }], 26),
    countdown: withTextStyle([...commonTitle, { key: "targetAt", label: "目标时间", placeholder: "例如 2026-08-01 09:00" }], 26),
    notice: withTextStyle([{ key: "text", label: "公告内容", placeholder: "请输入公告" }], 28),
    "map-contact": withTextStyle([
      { key: "address", label: "会议地址", placeholder: "请输入地址" },
      { key: "phone", label: "联系电话", placeholder: "请输入电话" }
    ], 26),
    "sponsor-wall": withTextStyle([...commonTitle, { key: "sponsors", label: "赞助商名称", kind: "list", placeholder: "每行一个赞助商", rows: 4 }], 26),
    faq: withTextStyle([...commonTitle, { key: "items", label: "常见问题", kind: "list", placeholder: "每行一个问题和答案", rows: 5 }], 26),
    "stats-grid": withTextStyle([...commonTitle, { key: "items", label: "数字亮点", kind: "list", placeholder: "例如：500+ 参会席位", rows: 4 }], 26),
    "ticket-price-list": withTextStyle([...commonTitle, { key: "items", label: "票种价格", kind: "list", placeholder: "例如：早鸟票 ¥299", rows: 4 }], 26),
    "process-steps": withTextStyle([...commonTitle, { key: "items", label: "流程步骤", kind: "list", placeholder: "每行一个步骤", rows: 4 }], 26),
    "text-image": withTextStyle([
      ...commonTitle,
      { key: "text", label: "介绍内容", kind: "textarea", rows: 3 },
      { key: "imageUrl", label: "配图地址", placeholder: "从素材库复制图片地址" }
    ], 26),
    "download-list": withTextStyle([...commonTitle, { key: "items", label: "资料名称", kind: "list", placeholder: "每行一份资料", rows: 4 }], 26),
    "live-card": withTextStyle([
      ...commonTitle,
      { key: "text", label: "直播说明", kind: "textarea", rows: 2 },
      { key: "url", label: "直播地址", placeholder: "请输入直播地址" }
    ], 26),
    "testimonial-list": withTextStyle([...commonTitle, { key: "items", label: "参会评价", kind: "list", placeholder: "每行一条评价", rows: 4 }], 26),
    "traffic-guide": withTextStyle([
      ...commonTitle,
      { key: "address", label: "地址", placeholder: "请输入地址" },
      { key: "text", label: "交通说明", kind: "textarea", rows: 3 }
    ], 26),
    "contact-card": withTextStyle([
      ...commonTitle,
      { key: "phone", label: "联系电话", placeholder: "请输入电话" },
      { key: "text", label: "咨询说明", kind: "textarea", rows: 2 }
    ], 26),
    "tag-filter": withTextStyle([...commonTitle, { key: "items", label: "标签名称", kind: "list", placeholder: "每行一个标签", rows: 4 }], 26),
    title: withTextStyle([{ key: "text", label: "标题文字", placeholder: "请输入标题" }], 34),
    divider: [],
    spacer: [{ key: "height", label: "留白高度", kind: "number", fallback: 24 }]
  };
  return map[type] ?? commonTitle;
}

function groupedFieldsFor(type: string): ConfigFieldGroup[] {
  const fields = fieldsFor(type);
  if (fields.length === 0) return [];

  if (type === "conference-list" || type === "conference-tabs") {
    return compactGroups([
      { key: "content", title: "基础内容", fields: fieldsByKeys(fields, ["title", "limit", "tabs", "summaryFallback", "detailButtonText"]) },
      {
        key: "display",
        title: "显示控制",
        fields: fieldsByKeys(fields, [
          "showCover",
          "cardImageLayout",
          "cardImageHeight",
          "showSummary",
          "showTime",
          "showLocation",
          "showRegistrationCount",
          "registrationCountMode",
          "virtualRegistrationBase",
          "virtualRegistrationStep"
        ])
      },
      {
        key: "card-spacing",
        title: "会议卡片间距",
        fields: fieldsByKeys(fields, ["cardThumbWidth", "cardThumbHeight", "cardMarginTop", "cardMarginBottom", "cardMarginX", "cardPadding", "cardGap", "cardRadius"])
      },
      { key: "card-title", title: "会议标题样式", fields: fieldsByKeys(fields, ["cardTitleFontSize", "cardTitleColor", "cardTitleAlign"]) },
      { key: "card-summary", title: "会议简介样式", fields: fieldsByKeys(fields, ["cardSummaryFontSize", "cardSummaryColor", "cardSummaryAlign"]) },
      { key: "card-meta", title: "时间地点人数样式", fields: fieldsByKeys(fields, ["cardMetaFontSize", "cardMetaColor", "cardMetaAlign"]) },
      { key: "card-font", title: "卡片字体", fields: fieldsByKeys(fields, ["fontFamily", "fontAssetUrl"]) },
      { key: "module-title", title: "模块标题样式", fields: fieldsByKeys(fields, ["titleFontSize", "titleFontFamily", "titleFontAssetUrl", "titleTextColor", "titleTextAlign"]) }
    ]);
  }

  const titleKeys = ["titleFontSize", "titleFontFamily", "titleFontAssetUrl", "titleTextColor", "titleTextAlign"];
  const textKeys = ["fontSize", "fontFamily", "fontAssetUrl", "textColor", "textAlign"];
  const contentFields = fields.filter((field) => !titleKeys.includes(field.key) && !textKeys.includes(field.key));
  return compactGroups([
    { key: "content", title: "基础内容", fields: contentFields },
    { key: "module-title", title: "模块标题样式", fields: fieldsByKeys(fields, titleKeys) },
    { key: "text-style", title: "内容文字样式", fields: fieldsByKeys(fields, textKeys) }
  ]);
}

function fieldsByKeys(fields: ConfigField[], keys: string[]): ConfigField[] {
  const lookup = new Map(fields.map((field) => [field.key, field]));
  return keys.map((key) => lookup.get(key)).filter((field): field is ConfigField => Boolean(field));
}

function compactGroups(groups: ConfigFieldGroup[]): ConfigFieldGroup[] {
  return groups.filter((group) => group.fields.length > 0);
}

function textValue(component: EditableComponent, field: ConfigField): string {
  const value = component.config[field.key];
  if (field.kind === "list") {
    return Array.isArray(value) ? value.map((item) => String(item)).join("\n") : "";
  }
  return typeof value === "string" ? value : "";
}

function setTextValue(component: EditableComponent, field: ConfigField, value: string) {
  if (field.kind === "list") {
    setConfig(
      component,
      field.key,
      value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
    );
    return;
  }
  setConfig(component, field.key, value);
}

function numberValue(component: EditableComponent, key: string, fallback: number | string = 0) {
  const value = component.config[key];
  return typeof value === "number" ? value : Number(fallback) || 0;
}

function booleanValue(component: EditableComponent, key: string, fallback: number | string = "false") {
  const value = component.config[key];
  return typeof value === "boolean" ? value : fallback === "true";
}

function setConfig(component: EditableComponent, key: string, value: unknown) {
  component.config = { ...component.config, [key]: value };
}

function isImageField(field: ConfigField): boolean {
  return ["imageUrl", "images"].includes(field.key);
}

function isFontField(field: ConfigField): boolean {
  return ["fontAssetUrl", "titleFontAssetUrl"].includes(field.key);
}

async function openMaterialPicker(component: EditableComponent, field: ConfigField) {
  materialTarget.value = { component, field };
  materialPageTarget.value = null;
  materialVisible.value = true;
  await loadMaterials();
}

async function openPageMetaImagePicker() {
  materialTarget.value = null;
  materialPageTarget.value = "shareImageUrl";
  materialVisible.value = true;
  await loadMaterials();
}

async function loadMaterials() {
  materialLoading.value = true;
  try {
    const response = await listMaterials({ page: 1, pageSize: 80, keyword: materialKeyword.value, enabled: true });
    const target = materialTarget.value;
    materialAssets.value = response.items.filter((asset) => {
      if (!asset.enabled) return false;
      if (materialPageTarget.value) return isImageAsset(asset);
      return target && isFontField(target.field) ? isFontAsset(asset) : isImageAsset(asset);
    });
  } finally {
    materialLoading.value = false;
  }
}

function chooseMaterial(asset: MaterialAsset) {
  if (materialPageTarget.value) {
    pageMeta[materialPageTarget.value] = asset.url;
    materialVisible.value = false;
    materialPageTarget.value = null;
    ElMessage.success("已应用分享封面");
    return;
  }
  const target = materialTarget.value;
  if (!target) return;
  if (target.field.kind === "list") {
    const current = target.component.config[target.field.key];
    const list = Array.isArray(current) ? current.map(String) : [];
    setConfig(target.component, target.field.key, [...list, asset.url]);
  } else {
    setConfig(target.component, target.field.key, asset.url);
  }
  materialVisible.value = false;
  if (isFontField(target.field)) {
    installPreviewFonts();
  }
  ElMessage.success(isFontField(target.field) ? "已应用字体文件" : "已应用素材图片");
}

function isImageAsset(asset: MaterialAsset) {
  return asset.fileType.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(asset.url);
}

function isFontAsset(asset: MaterialAsset) {
  return asset.fileType.startsWith("font/") || /\.(ttf|otf|woff2?)(\?|$)/i.test(asset.url);
}

function installPreviewFonts() {
  if (typeof window === "undefined" || !("FontFace" in window) || !("fonts" in document)) return;
  for (const component of components.value) {
    for (const key of ["fontAssetUrl", "titleFontAssetUrl"]) {
      const url = component.config[key];
      if (typeof url !== "string" || !url || loadedPreviewFonts.has(`${component.id}-${key}-${url}`)) continue;
      const family = fontFamilyForComponent(component, key);
      loadedPreviewFonts.add(`${component.id}-${key}-${url}`);
      const font = new FontFace(family, `url("${url}")`);
      void font.load().then((loaded) => document.fonts.add(loaded)).catch(() => undefined);
    }
  }
}

function presetName(type: string): string {
  return presets.value.find((item) => item.type === type)?.name ?? "未命名组件";
}

function componentSupport(type: string): CmsComponentSupportMeta {
  return CMS_COMPONENT_SUPPORT_MATRIX[type] ?? {
    label: "暂不支持小程序/H5",
    status: "unsupported",
    description: "该组件暂未纳入小程序/H5渲染支持矩阵，建议暂勿发布"
  };
}

function canAddPreset(preset: ComponentPreset): boolean {
  return preset.enabled && ADDABLE_SUPPORT_STATUSES.includes(componentSupport(preset.type).status);
}

function supportStatusClass(type: string): string {
  return `is-support-${componentSupport(type).status}`;
}

function presetSupportDescription(preset: ComponentPreset): string {
  if (!preset.enabled) return "后续开放";
  const support = componentSupport(preset.type);
  if (!canAddPreset(preset)) return support.description;
  return `${support.description}${preset.description ? `；${preset.description}` : ""}`;
}

function componentStateText(component: EditableComponent): string {
  const base = component.enabled ? "正在展示" : "已隐藏";
  const support = componentSupport(component.type);
  return `${base} · ${support.description}`;
}

function componentNotice(component: EditableComponent): string {
  const support = componentSupport(component.type);
  if (support.status === "unsupported" || support.status === "planned") {
    return "该组件暂不支持小程序/H5展示，用户端正式页面会静默隐藏，建议暂勿发布。";
  }
  if (isConferenceDetailPage() && isRegistrationCtaType(component.type)) {
    return "会议详情页已有固定底部报名按钮，该 CMS 报名按钮在用户端详情页会隐藏，避免重复 CTA。";
  }
  if (support.status === "basic") {
    return "该组件为基础展示支持，请发布前在 H5 和小程序预览中核对内容字段。";
  }
  return "";
}

function isConferenceDetailPage(): boolean {
  return selectedPage.value?.pageKey === "conference-detail";
}

function isRegistrationCtaType(type: string): boolean {
  return REGISTRATION_CTA_TYPES.includes(type);
}

function isRenderableSupport(type: string): boolean {
  return ADDABLE_SUPPORT_STATUSES.includes(componentSupport(type).status);
}

function thumbClass(type: string): string {
  if (type === "hero") return "is-hero";
  if (type === "carousel" || type === "image-grid") return "is-carousel";
  if (type === "conference-list" || type === "conference-tabs") return "is-conference";
  if (type.includes("button") || type.includes("contact")) return "is-action";
  if (type.includes("image") || type.includes("carousel") || type.includes("video") || type.includes("hero")) return "is-media";
  if (type.includes("list") || type.includes("timeline") || type.includes("steps")) return "is-list";
  if (type.includes("stats") || type.includes("price")) return "is-data";
  return "is-content";
}

const ComponentPreview = defineComponent({
  name: "ComponentPreview",
  props: {
    item: { type: Object as () => EditableComponent, required: true },
    name: { type: String, required: true }
  },
  setup(props) {
    const value = (key: string, fallback = "") => String(props.item.config[key] ?? fallback);
    const list = (key: string) => (Array.isArray(props.item.config[key]) ? (props.item.config[key] as unknown[]).map(String) : []);
    const textStyle = () => buildPreviewTextStyle(props.item);
    const titleStyle = () => buildPreviewTitleStyle(props.item);
    const parsedList = (key: string) => list(key).map(splitPreviewLine).filter((item) => item.length > 0);
    const meetings = () =>
      (previewConferences.value.length > 0 ? previewConferences.value : sampleConferences).map((item, index) => ({
        id: item.id,
        title: item.title,
        summary: "summary" in item && typeof item.summary === "string" ? item.summary : summaryFallbackText(props.item),
        image: readConferenceCover(item),
        location: item.location || "会议中心",
        time: formatPreviewDate(item.startAt),
        registrationCount: registrationCountForPreview(item, props.item, index)
      }));
    return () => {
      const type = props.item.type;
      if (!isRenderableSupport(type)) {
        return h("div", { class: "preview-support-warning" }, [
          h("strong", props.name),
          h("span", "该组件暂不支持小程序/H5展示，建议暂勿发布")
        ]);
      }
      if (isConferenceDetailPage() && isRegistrationCtaType(type)) {
        return h("div", { class: "preview-support-warning is-support-basic" }, [
          h("strong", props.name),
          h("span", "会议详情页会使用固定底部报名按钮，该 CMS 报名按钮将隐藏")
        ]);
      }
      if (type === "hero") {
        return h("div", { class: "preview-hero-card" }, [
          value("imageUrl") ? h("img", { src: value("imageUrl"), alt: "主视觉横幅" }) : h("div", { class: "preview-hero-empty" }, "请选择横幅图片")
        ]);
      }
      if (type === "conference-list") {
        const limit = numberValue(props.item, "limit", 10);
        return h("div", { class: "preview-section" }, [
          h("strong", { style: titleStyle() }, value("title", "可报名会议")),
          ...meetings()
            .slice(0, limit)
            .map((meeting) =>
              h("div", { class: previewMeetingClass(props.item, "preview-meeting"), style: previewMeetingStyle(props.item) }, [
                booleanConfig(props.item, "showCover", true) && meeting.image
                  ? h("img", { class: previewCoverClass(props.item, "preview-meeting-cover"), style: previewCoverStyle(props.item), src: meeting.image, alt: meeting.title })
                  : null,
                h("div", { class: "preview-meeting-body" }, [
                  h("b", { style: previewCardTextStyle(props.item, "title") }, meeting.title),
                  booleanConfig(props.item, "showSummary", true) ? h("span", { style: previewCardTextStyle(props.item, "summary") }, meeting.summary || summaryFallbackText(props.item)) : null,
                  ...meetingMetaLines(meeting, props.item).map((line) => h("span", { style: previewCardTextStyle(props.item, "meta") }, line)),
                  h("button", { class: "preview-detail-button" }, detailButtonText(props.item))
                ])
              ])
            )
        ]);
      }
      if (type === "conference-tabs") {
        const tabs = list("tabs");
        const nextTabs = tabs.length > 0 ? tabs : Array.from(new Set(meetings().map((meeting) => meeting.location))).slice(0, 4);
        return h("div", { class: "preview-section" }, [
          h("strong", { style: titleStyle() }, value("title", "会议分类切换")),
          h("div", { class: "preview-tabs" }, nextTabs.map((item, index) => h("span", { class: index === 0 ? "active" : "" }, item))),
          ...meetings()
            .slice(0, 2)
            .map((meeting) =>
              h("div", { class: previewMeetingClass(props.item, "preview-mini-meeting"), style: previewMeetingStyle(props.item) }, [
                booleanConfig(props.item, "showCover", true) && meeting.image
                  ? h("img", { class: previewCoverClass(props.item, "preview-mini-meeting-cover"), style: previewCoverStyle(props.item), src: meeting.image, alt: meeting.title })
                  : null,
                h("div", { class: "preview-meeting-body" }, [
                  h("b", { style: previewCardTextStyle(props.item, "title") }, meeting.title),
                  booleanConfig(props.item, "showSummary", false) ? h("span", { style: previewCardTextStyle(props.item, "summary") }, meeting.summary || summaryFallbackText(props.item)) : null,
                  ...meetingMetaLines(meeting, props.item).map((line) => h("span", { style: previewCardTextStyle(props.item, "meta") }, line)),
                  h("button", { class: "preview-detail-button" }, detailButtonText(props.item))
                ])
              ])
            )
        ]);
      }
      if (type === "registration-button" || type === "floating-registration-button") {
        return h("button", { class: "preview-button", style: textStyle() }, value("text", "立即报名"));
      }
      if (type === "speaker-cards") {
        const items = parsedList("speakers");
        return h("div", { class: "preview-section" }, [
          h("strong", { style: titleStyle() }, value("title", "嘉宾阵容")),
          h("div", { class: "preview-speakers" }, (items.length > 0 ? items : [["嘉宾", "信息待公布"]]).map((item) =>
            h("div", { class: "preview-person" }, [
              h("span", { class: "preview-person-avatar" }, (item[0] || "嘉宾").slice(0, 1)),
              h("div", [h("b", item[0] || "嘉宾"), item[1] ? h("span", item[1]) : null])
            ])
          ))
        ]);
      }
      if (type === "schedule-timeline") {
        const items = parsedList("items");
        return h("div", { class: "preview-section" }, [
          h("strong", { style: titleStyle() }, value("title", "会议日程")),
          h("div", { class: "preview-timeline" }, (items.length > 0 ? items : [["待定", "日程安排待公布"]]).map((item) =>
            h("div", { class: "preview-timeline-item" }, [
              h("span", { class: "preview-timeline-time" }, item[0] || "待定"),
              h("div", [h("b", item[1] || item[0] || "日程安排"), item[2] ? h("span", item.slice(2).join(" ")) : null])
            ])
          ))
        ]);
      }
      if (type === "countdown") {
        return h("div", { class: "preview-section" }, [
          h("strong", { style: titleStyle() }, value("title", "距离开始")),
          h("div", { class: "preview-countdown" }, ["天", "时", "分", "秒"].map((item, index) => h("span", [h("b", index === 0 ? "00" : "12"), h("small", item)])))
        ]);
      }
      if (type === "map-contact") {
        return h("div", { class: "preview-section" }, [
          h("strong", { style: titleStyle() }, value("title", "会场与联系")),
          h("p", { style: textStyle() }, value("address", "会议地址待公布")),
          value("phone") ? h("button", { class: "preview-outline-button" }, `联系会务组：${value("phone")}`) : null
        ]);
      }
      if (type === "sponsor-wall") {
        const items = list("sponsors");
        return h("div", { class: "preview-section" }, [
          h("strong", { style: titleStyle() }, value("title", "合作伙伴")),
          h("div", { class: "preview-sponsors" }, (items.length > 0 ? items : ["合作伙伴"]).map((item) => h("span", item)))
        ]);
      }
      if (type === "faq") {
        const items = parsedList("items");
        return h("div", { class: "preview-section" }, [
          h("strong", { style: titleStyle() }, value("title", "常见问题")),
          h("div", { class: "preview-faq" }, (items.length > 0 ? items : [["常见问题", "答案待补充"]]).map((item) =>
            h("div", [h("b", item[0] || "常见问题"), item[1] ? h("span", item.slice(1).join(" ")) : null])
          ))
        ]);
      }
      if (type === "stats-grid") {
        return h("div", { class: "preview-section" }, [
          h("strong", { style: titleStyle() }, value("title", "会议亮点")),
          h("div", { class: "preview-stats" }, list("items").map((item) => h("span", { style: textStyle() }, item)))
        ]);
      }
      if (type === "ticket-price-list" || type === "process-steps" || type === "download-list" || type === "testimonial-list" || type === "tag-filter") {
        return h("div", { class: "preview-section" }, [
          h("strong", { style: titleStyle() }, value("title", props.name)),
          h("div", { class: "preview-list" }, list("items").map((item) => h("span", { style: textStyle() }, item)))
        ]);
      }
      if (type === "text-image") {
        return h("div", { class: "preview-section" }, [
          value("imageUrl") ? h("img", { class: "preview-cover", src: value("imageUrl"), alt: "" }) : null,
          h("strong", { style: titleStyle() }, value("title", "大会介绍")),
          h("p", { style: textStyle() }, value("text", "聚焦行业趋势、案例实践和高质量连接。"))
        ]);
      }
      if (type === "image-grid" || type === "carousel") {
        if (type === "carousel") {
          const images = list("images");
          return h("div", { class: "preview-carousel" }, images[0] ? h("img", { src: images[0], alt: "" }) : h("span", "暂无轮播图片"));
        }
        return h("div", { class: "preview-image-grid" }, list("images").map((item) => h("img", { src: item, alt: "" })));
      }
      if (type === "notice" || type === "promotion-bar") {
        return h("div", { class: "preview-notice", style: textStyle() }, value("text", "报名开放中"));
      }
      if (type === "rich-text" || type === "safe-html") {
        return h("div", { class: "preview-section", innerHTML: value("html", "请输入图文内容") });
      }
      if (type === "divider") return h("div", { class: "preview-divider" });
      if (type === "spacer") return h("div", { style: { height: `${numberValue(props.item, "height", 24)}px` } });
      return h("div", { class: "preview-section" }, [h("strong", { style: titleStyle() }, props.name), h("p", { style: textStyle() }, value("text", "组件内容预览"))]);
    };
  }
});

const sampleConferences = [
  {
    id: "sample-1",
    title: "行业增长大会",
    summary: "增长案例与实战方法",
    coverImage: "",
    location: "上海会议中心",
    startAt: "2026-08-18T09:00:00.000Z"
  },
  {
    id: "sample-2",
    title: "数字运营峰会",
    summary: "数字化运营与组织增长",
    coverImage: "",
    location: "深圳",
    startAt: "2026-09-06T09:00:00.000Z"
  }
];

function buildPreviewTextStyle(component: EditableComponent) {
  const align = String(component.config.textAlign ?? "left");
  const color = String(component.config.textColor ?? "#172033");
  const fontSize = numberValue(component, "fontSize", 30);
  return {
    color,
    fontSize: `${Math.max(6, fontSize)}px`,
    textAlign: align,
    fontFamily: fontFamilyValue(String(component.config.fontFamily ?? "system"), component, "fontAssetUrl"),
    fontWeight: component.config.fontFamily === "bold-sans" ? "800" : undefined
  };
}

function buildPreviewTitleStyle(component: EditableComponent) {
  const align = String(component.config.titleTextAlign ?? component.config.textAlign ?? "left");
  const color = String(component.config.titleTextColor ?? component.config.textColor ?? "#172033");
  const fontSize = numberValue(component, "titleFontSize", 32);
  const customFontKey = typeof component.config.titleFontAssetUrl === "string" && component.config.titleFontAssetUrl ? "titleFontAssetUrl" : "fontAssetUrl";
  return {
    color,
    fontSize: `${Math.max(6, fontSize)}px`,
    textAlign: align,
    fontFamily: fontFamilyValue(String(component.config.titleFontFamily ?? component.config.fontFamily ?? "system"), component, customFontKey),
    fontWeight: component.config.titleFontFamily === "bold-sans" ? "800" : undefined
  };
}

function previewCardTextStyle(component: EditableComponent, part: "title" | "summary" | "meta") {
  const prefix = part === "title" ? "cardTitle" : part === "summary" ? "cardSummary" : "cardMeta";
  const fallbackSize = part === "title" ? 24 : part === "summary" ? 12 : 11;
  return {
    color: String(component.config[`${prefix}Color`] ?? (part === "title" ? "#172033" : "#637083")),
    fontSize: `${Math.max(6, numberValue(component, `${prefix}FontSize`, fallbackSize))}px`,
    textAlign: String(component.config[`${prefix}Align`] ?? "left"),
    fontFamily: fontFamilyValue(String(component.config.fontFamily ?? "system"), component, "fontAssetUrl"),
    fontWeight: part === "title" ? "800" : undefined
  };
}

function summaryFallbackText(component: EditableComponent) {
  const value = component.config.summaryFallback;
  return typeof value === "string" && value.trim() ? value.trim() : "点击查看会议详情和报名信息。";
}

function detailButtonText(component: EditableComponent) {
  const value = component.config.detailButtonText;
  return typeof value === "string" && value.trim() ? value.trim() : "查看详情";
}

function previewMeetingClass(component: EditableComponent, baseClass: string) {
  return [baseClass, component.config.cardImageLayout === "full" ? "is-cover-full" : ""].filter(Boolean).join(" ");
}

function previewCoverClass(component: EditableComponent, baseClass: string) {
  return [baseClass, component.config.cardImageLayout === "full" ? "is-cover-full__image" : ""].filter(Boolean).join(" ");
}

function previewMeetingStyle(component: EditableComponent) {
  return {
    marginTop: `${numberValue(component, "cardMarginTop", 10)}px`,
    marginBottom: `${numberValue(component, "cardMarginBottom", 0)}px`,
    marginLeft: `${numberValue(component, "cardMarginX", 0)}px`,
    marginRight: `${numberValue(component, "cardMarginX", 0)}px`,
    padding: `${numberValue(component, "cardPadding", 10)}px`,
    borderRadius: `${numberValue(component, "cardRadius", 8)}px`,
    gap: `${numberValue(component, "cardGap", 10)}px`
  };
}

function previewCoverStyle(component: EditableComponent) {
  const size = previewThumbSize(component);
  if (component.config.cardImageLayout !== "full") {
    return {
      width: `${size.width}px`,
      height: `${size.height}px`,
      flexBasis: `${size.width}px`
    };
  }
  return {
    height: `${numberValue(component, "cardImageHeight", 120)}px`,
    borderRadius: `${numberValue(component, "cardRadius", 8)}px`
  };
}

function previewThumbSize(component: EditableComponent) {
  const titleSize = numberValue(component, "cardTitleFontSize", 24);
  const configuredWidth = numberValue(component, "cardThumbWidth", 0);
  const width = configuredWidth > 0 ? configuredWidth : Math.min(Math.max(Math.round(titleSize * 4.2), 72), 132);
  const configuredHeight = numberValue(component, "cardThumbHeight", 0);
  return {
    width,
    height: configuredHeight > 0 ? configuredHeight : Math.round(width * 0.72)
  };
}

function fontFamilyValue(value: string, component?: EditableComponent, key?: string) {
  if (value === "custom" && component && key && typeof component.config[key] === "string" && component.config[key]) return fontFamilyForComponent(component, key);
  if (value === "serif") return "Songti SC, SimSun, serif";
  if (value === "sans") return "PingFang SC, Microsoft YaHei, sans-serif";
  if (value === "bold-sans") return "Heiti SC, Microsoft YaHei, sans-serif";
  return "inherit";
}

function fontFamilyForComponent(component: EditableComponent, key: string) {
  return `cms-font-${component.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${key}`;
}

function readConferenceCover(item: Partial<Conference> & { coverImage?: string | null }) {
  return item.coverImage ?? "";
}

function booleanConfig(component: EditableComponent, key: string, fallback = false) {
  const value = component.config[key];
  return typeof value === "boolean" ? value : fallback;
}

function registrationCountForPreview(item: Partial<Conference> & { registrationCount?: number }, component: EditableComponent, index: number) {
  const actual = typeof item.registrationCount === "number" ? item.registrationCount : item.counts?.registrations ?? 0;
  const virtual = numberValue(component, "virtualRegistrationBase", 0) + index * numberValue(component, "virtualRegistrationStep", 0);
  const mode = String(component.config.registrationCountMode ?? "actual");
  if (mode === "virtual") return virtual;
  if (mode === "actual-plus-virtual") return actual + virtual;
  return actual;
}

function meetingMetaLines(meeting: { time: string; location: string; registrationCount: number }, component: EditableComponent) {
  const parts: string[] = [];
  if (booleanConfig(component, "showTime", true)) parts.push(`会议时间：${meeting.time}`);
  if (booleanConfig(component, "showLocation", true)) parts.push(`会议地点：${meeting.location}`);
  if (booleanConfig(component, "showRegistrationCount", false)) parts.push(`${meeting.registrationCount} 人已报名`);
  return parts;
}

function formatPreviewDate(value: string | undefined) {
  if (!value) return "待定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "待定";
  return `${String(date.getMonth() + 1).padStart(2, "0")} 月 ${String(date.getDate()).padStart(2, "0")} 日`;
}

function splitPreviewLine(value: string): string[] {
  return value.split(/[\n|｜,，;；]+/).map((item) => item.trim()).filter(Boolean);
}
</script>

<style scoped>
.cms-hero,
.cms-workbench,
.cms-builder {
  display: grid;
  gap: 16px;
}

.cms-hero {
  grid-template-columns: 1fr auto;
  padding: 22px;
  border: 1px solid rgb(221 230 242 / 88%);
  border-radius: var(--admin-radius);
  background:
    linear-gradient(135deg, rgb(20 99 255 / 12%), rgb(24 194 156 / 8%)),
    #ffffff;
  box-shadow: var(--admin-shadow);
}

.cms-workbench {
  grid-template-columns: 288px minmax(760px, 1fr) 360px;
  align-items: start;
  min-width: 1420px;
}

.cms-page {
  overflow-x: auto;
}

.cms-panel {
  padding: 18px;
  border: 1px solid var(--admin-color-border);
  border-radius: 14px;
  background: #ffffff;
  box-shadow: var(--admin-shadow-soft);
}

.cms-sidebar,
.phone-preview {
  position: sticky;
  top: 20px;
}

.panel-title {
  color: var(--admin-color-text);
  font-size: 16px;
  font-weight: 800;
}

.page-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
  max-height: 320px;
  overflow: auto;
}

.page-item {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 13px 14px;
  border: 1px solid var(--admin-color-border);
  border-radius: 12px;
  background: #ffffff;
  color: var(--admin-color-text);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease,
    background 0.2s ease;
}

.page-item:hover {
  border-color: rgb(20 99 255 / 34%);
  box-shadow: var(--admin-shadow-soft);
  transform: translateY(-1px);
}

.page-item.active {
  border-color: var(--admin-color-primary);
  background: linear-gradient(135deg, rgb(20 99 255 / 10%), rgb(24 194 156 / 5%));
}

.page-item__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-item__status {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: #eef4ff;
  color: var(--admin-color-primary);
  font-size: 12px;
  font-weight: 700;
}

.page-item span,
.page-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-item small {
  color: var(--admin-color-muted);
}

.cms-editor,
.component-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.publish-guard-alert {
  border-radius: var(--admin-radius);
}

.editor-heading,
.library-head,
.component-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.library-filters {
  display: grid;
  gap: 10px;
  margin: 14px 0 12px;
}

.cms-builder {
  grid-template-columns: minmax(320px, 0.82fr) minmax(460px, 1.18fr);
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.preset-card {
  min-height: 156px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--admin-color-border);
  border-radius: 12px;
  background: #ffffff;
  color: var(--admin-color-text);
  text-align: left;
  cursor: pointer;
}

.preset-card:hover:not(:disabled) {
  border-color: var(--admin-color-primary);
  box-shadow: var(--admin-shadow-soft);
  transform: translateY(-1px);
}

.preset-card:disabled {
  opacity: 0.54;
  cursor: not-allowed;
}

.preset-card strong,
.preset-card small,
.component-card__head strong,
.component-card__head span {
  display: block;
}

.preset-card__title,
.component-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.support-badge {
  flex: 0 0 auto;
  padding: 3px 7px;
  border-radius: 999px;
  background: #eef4ff;
  color: var(--admin-color-primary);
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
}

.support-badge.is-support-supported {
  background: #e9f8f2;
  color: #0f7a52;
}

.support-badge.is-support-basic {
  background: #fff7e8;
  color: #a15c00;
}

.support-badge.is-support-unsupported,
.support-badge.is-support-planned {
  background: #f1f5f9;
  color: #64748b;
}

.preset-card.is-support-unsupported,
.preset-card.is-support-planned {
  background: #f8fafc;
}

.preset-card small,
.component-card__head span {
  color: var(--admin-color-muted);
  line-height: 1.45;
}

.component-notice {
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8fbff;
  color: var(--admin-color-muted);
  font-size: 12px;
  line-height: 1.45;
}

.component-notice.is-support-basic {
  background: #fff7e8;
  color: #8a4b00;
}

.component-notice.is-support-unsupported,
.component-notice.is-support-planned {
  background: #fff1f2;
  color: #b42318;
}

.preset-thumb {
  height: 54px;
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid rgb(20 99 255 / 10%);
  border-radius: 8px;
  background: #f4f8ff;
}

.preset-thumb i {
  display: block;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.22;
}

.preset-thumb.is-media,
.preset-thumb.is-hero,
.preset-thumb.is-carousel {
  grid-template-rows: 1fr 8px;
}

.preset-thumb.is-media i:first-child,
.preset-thumb.is-hero i:first-child,
.preset-thumb.is-carousel i:first-child {
  border-radius: 7px;
  background: linear-gradient(135deg, rgb(20 99 255 / 28%), rgb(24 194 156 / 22%));
  opacity: 1;
}

.preset-thumb.is-media i:nth-child(2),
.preset-thumb.is-hero i:nth-child(2),
.preset-thumb.is-carousel i:nth-child(2) {
  width: 58%;
  opacity: 0.3;
}

.preset-thumb.is-media i:nth-child(3),
.preset-thumb.is-hero i:nth-child(3),
.preset-thumb.is-carousel i:nth-child(3) {
  display: none;
}

.preset-thumb.is-conference {
  grid-template-columns: 42px 1fr;
  grid-template-rows: repeat(3, 1fr);
}

.preset-thumb.is-conference i:first-child {
  grid-row: 1 / -1;
  border-radius: 7px;
  background: linear-gradient(135deg, rgb(20 99 255 / 25%), rgb(20 99 255 / 8%));
  opacity: 1;
}

.preset-thumb.is-conference i:nth-child(2),
.preset-thumb.is-conference i:nth-child(3) {
  height: 8px;
  align-self: center;
}

.preset-thumb.is-action {
  grid-template-rows: 1fr 16px 1fr;
}

.preset-thumb.is-action i:nth-child(2) {
  width: 60%;
  border-radius: 999px;
  background: #0f9f6e;
  opacity: 0.9;
}

.preset-thumb.is-data {
  grid-template-columns: repeat(3, 1fr);
}

.preset-thumb.is-data i {
  height: 100%;
  border-radius: 7px;
}

.preset-thumb.is-list i,
.preset-thumb.is-content i {
  height: 9px;
  align-self: center;
}

.preset-thumb.is-action { color: #0f9f6e; }
.preset-thumb.is-media { color: #1463ff; }
.preset-thumb.is-list { color: #7c3aed; }
.preset-thumb.is-data { color: #b76e00; }
.preset-thumb.is-content { color: #43536a; }
.preset-thumb.is-conference { color: #1463ff; }
.preset-thumb.is-hero { color: #18c29c; }
.preset-thumb.is-carousel { color: #7c3aed; }

.component-card {
  padding: 14px;
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius);
  background: #ffffff;
  box-shadow: var(--admin-shadow-soft);
}

.config-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, 1fr));
  gap: 0 12px;
  margin-top: 12px;
}

.config-form :deep(.el-form-item:has(.el-textarea)) {
  grid-column: 1 / -1;
}

.range-field {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 118px;
  align-items: center;
  gap: 14px;
}

.phone-preview {
  position: relative;
  top: auto;
  right: auto;
  width: auto;
  z-index: auto;
  max-height: none;
  overflow: hidden;
}

.phone-shell {
  width: 320px;
  margin: 18px auto 0;
  padding: 10px;
  border-radius: 34px;
  background: linear-gradient(180deg, #0f172a, #1f2937);
  box-shadow: 0 22px 44px rgb(15 23 42 / 22%);
}

.phone-window {
  overflow: hidden;
  border-radius: 24px;
  background: var(--preview-bg);
}

.phone-nav {
  height: 46px;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  background: rgb(255 255 255 / 92%);
  color: #172033;
  font-size: 14px;
  font-weight: 800;
}

.phone-nav span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.phone-capsule {
  width: 70px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  border: 1px solid rgb(15 23 42 / 12%);
  border-radius: 999px;
  background: rgb(255 255 255 / 86%);
}

.phone-capsule i:first-child {
  width: 18px;
  height: 4px;
  border-radius: 999px;
  background: #111827;
}

.phone-capsule i:last-child {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #111827;
}

.component-config-collapse {
  margin-top: 12px;
  border: 0;
}

.page-meta-collapse {
  margin-top: 16px;
  border: 0;
}

.page-meta-collapse :deep(.el-collapse-item) {
  border: 1px solid var(--admin-color-border);
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
}

.page-meta-collapse :deep(.el-collapse-item__header) {
  height: 38px;
  padding: 0 12px;
  border-bottom: 1px solid var(--admin-color-border);
  color: var(--admin-color-text);
  font-weight: 800;
}

.page-meta-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: 0;
}

.page-meta-collapse :deep(.el-collapse-item__content) {
  padding: 12px 12px 0;
}

.page-meta-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(180px, 1fr));
  gap: 0 12px;
}

.page-meta-form :deep(.el-form-item:has(.el-textarea)),
.page-meta-form :deep(.el-form-item:last-child) {
  grid-column: 1 / -1;
}

.component-config-collapse :deep(.el-collapse-item__header) {
  height: 36px;
  border-bottom: 1px solid var(--admin-color-border);
  color: var(--admin-color-primary);
  font-weight: 800;
}

.component-config-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: 0;
}

.component-config-collapse :deep(.el-collapse-item__content) {
  padding-bottom: 0;
}

.config-group-collapse {
  border: 0;
  background: #f8fbff;
}

.config-group-collapse :deep(.el-collapse-item) {
  margin-bottom: 10px;
  border: 1px solid var(--admin-color-border);
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
}

.config-group-collapse :deep(.el-collapse-item__header) {
  height: 38px;
  padding: 0 12px;
  border-bottom: 1px solid var(--admin-color-border);
  color: var(--admin-color-text);
  font-size: 13px;
  font-weight: 800;
}

.config-group-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: 0;
}

.config-group-collapse :deep(.el-collapse-item__content) {
  padding: 10px 12px 12px;
}

.phone-status {
  width: 96px;
  height: 8px;
  margin: 0 auto 10px;
  border-radius: 999px;
  background: rgb(255 255 255 / 18%);
}

.phone-screen {
  min-height: 560px;
  max-height: 620px;
  overflow: auto;
  padding: 0 0 14px;
  background: var(--preview-bg);
  box-sizing: border-box;
}

.phone-tabbar {
  min-height: 56px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(42px, 1fr));
  gap: 4px;
  padding: 6px 8px 8px;
  border-top: 1px solid rgb(15 23 42 / 8%);
  background: #ffffff;
}

.phone-tabbar__item {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: #6b778c;
  font-size: 10px;
}

.phone-tabbar__item.active {
  color: var(--preview-primary);
  font-weight: 800;
}

.phone-tabbar__item img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.phone-tabbar__dot {
  width: 18px;
  height: 18px;
  border-radius: 7px;
  background: currentColor;
  opacity: 0.22;
}

.phone-tabbar__item small {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.component-card--summary {
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.component-card--summary:hover {
  border-color: rgb(20 99 255 / 34%);
  transform: translateY(-1px);
}

.component-card--summary.is-selected {
  border-color: var(--admin-color-primary);
  box-shadow: 0 12px 28px rgb(20 99 255 / 12%);
}

.component-card__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed rgb(220 227 239 / 96%);
}

.template-library {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.template-library__filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.template-library__filters :deep(.el-input) {
  width: 240px;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 16px;
  max-height: 68vh;
  overflow: auto;
}

.template-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--admin-color-border);
  border-radius: 16px;
  background: #ffffff;
  box-shadow: var(--admin-shadow-soft);
}

.template-card__phone {
  padding: 12px;
  border-radius: 20px;
  background: linear-gradient(180deg, #172033, #2a3650);
}

.template-card__screen {
  min-height: 210px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  padding: 16px;
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgb(20 99 255 / 14%), rgb(24 194 156 / 10%)),
    #f8fbff;
}

.template-card__category {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgb(20 99 255 / 10%);
  color: var(--admin-color-primary);
  font-size: 11px;
  font-weight: 800;
}

.template-card__screen strong,
.template-card__body strong {
  color: var(--admin-color-text);
  font-size: 16px;
  font-weight: 800;
}

.template-card__screen small,
.template-card__body p {
  margin: 0;
  color: var(--admin-color-muted);
  line-height: 1.55;
}

.template-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.template-card__chips span {
  padding: 6px 10px;
  border-radius: 999px;
  background: #ffffff;
  color: #475569;
  font-size: 12px;
  box-shadow: inset 0 0 0 1px rgb(220 227 239 / 94%);
}

.template-card__body {
  display: grid;
  gap: 12px;
}

.template-card__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.preview-block {
  margin-bottom: 12px;
  padding: 0 14px;
}

.preview-hero-card,
.preview-section,
.preview-notice,
.preview-button {
  border-radius: var(--preview-radius);
}

.preview-hero-card {
  overflow: hidden;
  padding: 0;
  background: #eef3fb;
  color: #637083;
}

.preview-hero-card img,
.preview-cover {
  width: 100%;
  height: 128px;
  object-fit: cover;
  border-radius: var(--preview-radius);
  margin-bottom: 10px;
}

.phone-screen :deep(img) {
  display: block;
  max-width: 100%;
  border: 0;
}

.phone-screen :deep(.preview-hero-card) {
  overflow: hidden;
  padding: 0;
  box-sizing: border-box;
}

.phone-screen :deep(.preview-hero-card img) {
  width: 100%;
  max-width: 100%;
  height: 168px;
  object-fit: contain;
  border-radius: var(--preview-radius);
  background: #fff8e8;
}

.phone-screen :deep(.preview-cover) {
  width: 100%;
  max-width: 100%;
  height: 128px;
  object-fit: cover;
  border-radius: var(--preview-radius);
  margin-bottom: 10px;
}

.phone-screen :deep(.preview-hero-empty) {
  display: grid;
  place-items: center;
  height: 168px;
  color: #637083;
  font-size: 13px;
}

.phone-screen :deep(.preview-image-grid img) {
  width: 100%;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
  background: #e8eef8;
}

.preview-hero-card strong,
.preview-hero-card span,
.preview-section strong,
.preview-section span,
.preview-meeting b,
.preview-meeting span {
  display: block;
}

.preview-section {
  padding: 14px;
  background: var(--preview-card);
}

.preview-section p {
  margin: 8px 0 0;
  color: #5b6b80;
  line-height: 1.55;
}

.preview-support-warning {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border: 1px dashed #cbd5e1;
  border-radius: var(--preview-radius);
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.preview-support-warning.is-support-basic {
  border-color: #f2c36b;
  background: #fff7e8;
  color: #8a4b00;
}

.phone-screen :deep(.preview-meeting) {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 10px;
  padding: 10px;
  border: 1px solid #e3e9f2;
  border-radius: 8px;
}

.phone-screen :deep(.preview-meeting.is-cover-full),
.phone-screen :deep(.preview-mini-meeting.is-cover-full) {
  flex-direction: column;
  align-items: stretch;
}

.phone-screen :deep(.preview-meeting-cover),
.phone-screen :deep(.preview-mini-meeting-cover) {
  width: 74px;
  height: 58px;
  flex: 0 0 74px;
  object-fit: contain;
  border-radius: 8px;
  background: #eef3fb;
}

.phone-screen :deep(.preview-meeting-cover.is-cover-full__image),
.phone-screen :deep(.preview-mini-meeting-cover.is-cover-full__image) {
  width: 100%;
  flex: none;
}

.phone-screen :deep(.preview-meeting-body) {
  flex: 1;
  min-width: 0;
}

.phone-screen :deep(.preview-meeting-body b),
.phone-screen :deep(.preview-meeting-body span) {
  display: block;
  white-space: normal;
  word-break: break-word;
}

.phone-screen :deep(.preview-meeting span),
.preview-list span {
  color: #637083;
  font-size: 11px;
  display: block;
  margin-top: 4px;
  line-height: 1.35;
}

.phone-screen :deep(.preview-detail-button) {
  min-width: 72px;
  height: 26px;
  margin: 8px 0 0;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: var(--preview-primary);
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
  line-height: 26px;
}

.preview-button {
  width: 100%;
  min-height: 42px;
  border: 0;
  background: var(--preview-primary);
  color: #ffffff;
  font-weight: 800;
}

.preview-stats,
.preview-list,
.preview-image-grid,
.preview-speakers,
.preview-timeline,
.preview-faq {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.preview-stats {
  grid-template-columns: repeat(3, 1fr);
}

.preview-stats span,
.preview-list span {
  padding: 8px;
  border-radius: 8px;
  background: #f4f8ff;
}

.preview-image-grid {
  grid-template-columns: repeat(3, 1fr);
}

.preview-carousel {
  display: grid;
  place-items: center;
  min-height: 132px;
  overflow: hidden;
  border-radius: var(--preview-radius);
  background: #eef3fb;
  color: #637083;
  font-size: 12px;
}

.preview-carousel img {
  width: 100%;
  height: 132px;
  object-fit: cover;
}

.preview-person,
.preview-timeline-item,
.preview-faq div {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  background: #f4f8ff;
}

.preview-person-avatar {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #e8f1ff;
  color: var(--preview-primary);
  font-weight: 800;
}

.preview-person b,
.preview-timeline-item b,
.preview-faq b {
  display: block;
  color: #172033;
  font-size: 12px;
}

.preview-person span,
.preview-timeline-item span,
.preview-faq span {
  display: block;
  margin-top: 3px;
  color: #637083;
  font-size: 11px;
  line-height: 1.35;
}

.preview-timeline-time {
  width: 46px;
  flex: 0 0 46px;
  color: var(--preview-primary) !important;
  font-weight: 800;
}

.preview-countdown,
.preview-sponsors {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.preview-countdown {
  grid-template-columns: repeat(4, 1fr);
}

.preview-countdown span,
.preview-sponsors span {
  display: grid;
  place-items: center;
  min-height: 44px;
  border-radius: 8px;
  background: #f4f8ff;
}

.preview-countdown b {
  color: var(--preview-primary);
  font-size: 16px;
}

.preview-countdown small {
  color: #637083;
  font-size: 10px;
}

.preview-sponsors {
  grid-template-columns: repeat(2, 1fr);
}

.preview-outline-button {
  width: 100%;
  min-height: 34px;
  margin-top: 8px;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #ffffff;
  color: var(--preview-primary);
  font-size: 12px;
  font-weight: 800;
}

.preview-tabs {
  display: flex;
  gap: 7px;
  margin-top: 10px;
  overflow: hidden;
}

.preview-tabs span {
  flex: 0 0 auto;
  padding: 6px 10px;
  border-radius: 999px;
  background: #eef4ff;
  color: #2452a8;
  font-size: 12px;
}

.preview-tabs span.active {
  background: var(--preview-primary);
  color: #ffffff;
}

.phone-screen :deep(.preview-mini-meeting) {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 10px;
  padding: 9px;
  border-radius: 8px;
  background: #f7faff;
}

.preview-image-grid img {
  width: 100%;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
  background: #e8eef8;
}

.preview-notice {
  padding: 12px;
  color: #8a4b00;
  background: #fff7ed;
}

.preview-divider {
  height: 1px;
  background: #dce3ef;
}

.preview-empty {
  display: grid;
  place-items: center;
  min-height: 420px;
  color: var(--admin-color-muted);
}

.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.material-button {
  margin-top: 8px;
}

.material-picker {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.material-picker__head {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
}

.material-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  max-height: 520px;
  overflow: auto;
}

.material-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--admin-color-border);
  border-radius: 8px;
  background: #ffffff;
  color: var(--admin-color-text);
  text-align: left;
  cursor: pointer;
}

.material-card:hover {
  border-color: var(--admin-color-primary);
  box-shadow: var(--admin-shadow-soft);
}

.material-card img {
  width: 100%;
  height: 100px;
  object-fit: cover;
  border-radius: 8px;
  background: #eef3fb;
}

.font-asset {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100px;
  border-radius: 8px;
  background: #f4f8ff;
  color: var(--admin-color-primary);
  font-size: 24px;
  font-weight: 800;
}

.material-card strong,
.material-card small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.material-card small {
  color: var(--admin-color-muted);
}
</style>
