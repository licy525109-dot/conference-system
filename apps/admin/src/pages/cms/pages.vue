<template>
  <section class="admin-page cms-page">
    <header class="cms-editor-toolbar">
      <div class="cms-editor-toolbar__identity">
        <el-button text :icon="ArrowLeft" @click="navigateTo('/pages')">返回</el-button>
        <span class="cms-editor-toolbar__divider" />
        <span>
          <strong>{{ selectedPageDisplayTitle || "页面装修" }}</strong>
          <small>{{ selectedPage ? `${pageTypeLabel(selectedPage.pageType)} · ${selectedPageContextText}` : "正在加载页面" }}</small>
        </span>
      </div>
      <div class="cms-editor-toolbar__actions">
        <span class="cms-live-state" :class="{ 'is-unpublished': !selectedPage?.publishedVersionId }">
          {{ selectedPage?.publishedVersionId ? "小程序线上版本已发布" : "尚未发布，小程序暂不可见" }}
        </span>
        <span class="cms-save-state" :class="{ 'is-saving': saving, 'is-dirty': isDirty }">
          <CircleCheck v-if="!saving && !isDirty" />
          <Loading v-else-if="saving" class="is-spinning" />
          <EditPen v-else />
          {{ saveStateText }}
        </span>
        <el-tooltip content="撤销" placement="bottom"><el-button circle :icon="RefreshLeft" :disabled="!canUndo" @click="undo" /></el-tooltip>
        <el-tooltip content="重做" placement="bottom"><el-button circle :icon="RefreshRight" :disabled="!canRedo" @click="redo" /></el-tooltip>
        <el-tooltip content="页面设置" placement="bottom"><el-button circle aria-label="页面设置" :icon="Setting" @click="inspectorTab = 'page'" /></el-tooltip>
        <el-tooltip content="页面模板" placement="bottom"><el-button circle aria-label="页面模板" :icon="Collection" @click="openTemplateCenter" /></el-tooltip>
        <el-dropdown :disabled="!selectedPage || !version" @command="handleEditorMoreAction">
          <el-button circle aria-label="更多操作" :icon="MoreFilled" />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="fixed-template">应用页面结构模板</el-dropdown-item>
              <el-dropdown-item command="save-template">另存为页面模板</el-dropdown-item>
              <el-dropdown-item command="rollback" divided>回滚到已发布版本</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-tooltip content="发布检查" placement="bottom"><el-button circle aria-label="发布检查" :icon="DocumentChecked" @click="publishPanelVisible = true" /></el-tooltip>
        <el-button type="primary" :loading="publishing" @click="publish">发布页面</el-button>
      </div>
    </header>

    <section class="cms-workbench">
      <aside class="cms-sidebar cms-sidebar--left">
        <section class="data-panel cms-panel component-library-panel">
          <div class="library-head">
            <div>
              <div class="panel-title">组件库</div>
              <p class="page-subtitle">点击组件即可添加到页面。</p>
            </div>
          </div>
          <div class="library-filters">
            <el-input v-model="presetKeyword" clearable :prefix-icon="Search" placeholder="搜索组件" />
            <el-select v-model="activePresetGroup" aria-label="组件分类" placeholder="选择组件分类">
              <el-option label="全部组件" value="all" />
              <el-option v-for="group in presetGroups" :key="group.name" :label="`${group.name}（${group.items.length}）`" :value="group.name" />
            </el-select>
          </div>
          <div class="component-library-result-summary">
            <span>{{ visiblePresets.length }} 个可用组件</span>
            <button v-if="presetKeyword || activePresetGroup !== 'all'" type="button" @click="resetComponentLibraryFilters">清除筛选</button>
          </div>
          <div v-if="visiblePresets.length > 0" class="preset-grid is-operator-grid">
            <button
              v-for="preset in visiblePresets"
              :key="preset.type"
              class="preset-card"
              :class="supportStatusClass(preset.type)"
              :disabled="!canAddPreset(preset)"
              @click="addComponent(preset)"
            >
              <CmsPresetThumbnail :type="preset.type" :config="preset.defaultConfigJson" />
              <span class="preset-card__label">
                <span class="preset-card__icon"><component :is="presetIcon(preset.type)" /></span>
                <span class="preset-card__copy">
                  <strong>{{ preset.name }}</strong>
                  <small>{{ preset.group }}</small>
                </span>
              </span>
            </button>
          </div>
          <el-empty v-else description="没有找到匹配组件" :image-size="48" />
        </section>

        <section class="data-panel cms-panel layer-panel">
          <div class="library-head">
            <div>
              <div class="panel-title">页面结构</div>
              <p class="page-subtitle">共 {{ components.length }} 个组件，可快速定位与调整顺序。</p>
            </div>
          </div>
          <el-empty v-if="components.length === 0" description="从上方添加组件" :image-size="56" />
          <div v-else class="layer-list">
            <button
              v-for="(component, index) in components"
              :key="component.id"
              type="button"
              class="layer-item"
              :class="{ active: selectedComponentId === component.id, hidden: !component.enabled }"
              @click="selectPreviewComponent(component.id)"
            >
              <span class="layer-item__drag"><Rank /></span>
              <span class="layer-item__name">{{ presetName(component.type) }}</span>
              <span class="layer-item__actions" @click.stop>
                <el-button text :icon="component.enabled ? View : Hide" @click="component.enabled = !component.enabled" />
                <el-button text :icon="ArrowUp" :disabled="index === 0" @click="moveComponent(index, -1)" />
                <el-button text :icon="ArrowDown" :disabled="index === components.length - 1" @click="moveComponent(index, 1)" />
              </span>
            </button>
          </div>
        </section>
      </aside>

      <main v-if="selectedPage && version" class="cms-editor cms-stage">
        <section class="data-panel cms-panel phone-preview cms-editor-preview">
          <div class="canvas-toolbar">
            <div>
              <strong>页面预览</strong>
              <small>点击组件编辑，按住组件拖动排序</small>
            </div>
            <div class="preview-toolbar">
              <el-radio-group v-model="previewPlatform" size="small">
                <el-radio-button label="miniapp">小程序</el-radio-button>
                <el-radio-button label="h5">H5</el-radio-button>
              </el-radio-group>
              <el-radio-group v-model="previewUserMode" size="small" aria-label="预览登录状态">
                <el-radio-button label="guest">访客</el-radio-button>
                <el-radio-button label="member">已登录</el-radio-button>
              </el-radio-group>
              <el-tooltip content="页面背景与分享设置" placement="bottom"><el-button circle :icon="Setting" @click="inspectorTab = 'page'" /></el-tooltip>
            </div>
          </div>
          <div class="phone-shell" :class="`is-${previewPlatform}`">
            <div class="phone-status" :class="`is-${previewPlatform}`">
              <span>15:29</span>
              <span><i /> <i /> <b>63</b></span>
            </div>
            <div class="phone-window" :class="`is-${previewPlatform}`" :style="previewStyle">
              <div class="phone-nav" :class="`is-${previewPlatform}`">
                <template v-if="previewPlatform === 'h5'">
                  <span class="phone-browser-dot" />
                  <span class="phone-browser-address">{{ previewRouteHint }}</span>
                  <span class="phone-browser-more">···</span>
                </template>
                <template v-else>
                  <span class="phone-nav__spacer" />
                  <span class="phone-nav__title">
                    <img v-if="previewTitleLogoUrl" class="phone-nav__logo" :src="previewTitleLogoUrl" alt="" />
                    <span>{{ previewTitle }}</span>
                  </span>
                  <span class="phone-capsule"><i /><i /></span>
                </template>
              </div>
              <div class="phone-screen">
                <CmsRuntimePreview
                  :src="runtimePreviewUrl"
                  :payload="runtimePreviewPayload"
                  @select-component="selectPreviewComponent"
                  @reorder-component="moveComponentTo"
                />
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
      </main>

      <aside v-if="selectedPage && version" class="cms-sidebar cms-sidebar--right cms-editor-settings">
        <div class="inspector-tabs" role="tablist" aria-label="配置面板">
          <button type="button" :class="{ active: inspectorTab === 'component' }" @click="inspectorTab = 'component'">组件设置</button>
          <button type="button" :class="{ active: inspectorTab === 'page' }" @click="inspectorTab = 'page'">页面设置</button>
        </div>

        <section v-show="inspectorTab === 'page'" class="data-panel cms-panel inspector-panel shop-identity-card">
          <div class="library-head">
            <div>
              <div class="panel-title">店铺主体</div>
              <p class="page-subtitle">会务主体、分享信息、Logo 和素材入口集中管理，避免装修页和小程序主体信息脱节。</p>
            </div>
          </div>
          <div class="shop-identity-summary">
            <div class="shop-identity-logo">
              <img v-if="previewTitleLogoUrl" :src="previewTitleLogoUrl" alt="" />
              <span v-else>{{ previewTitle.slice(0, 1) || "会" }}</span>
            </div>
            <span>
              <strong>{{ previewTitle }}</strong>
              <small>{{ pageMeta.shareTitle || "未设置微信分享标题" }}</small>
              <em>{{ previewRouteHint }}</em>
            </span>
          </div>
          <div class="shop-identity-checks">
            <span v-for="item in shopSubjectChecklist" :key="item.key" :class="{ done: item.done }">
              <b>{{ item.done ? "已配置" : "待配置" }}</b>{{ item.label }}
            </span>
          </div>
          <div class="shop-identity-actions">
            <el-button size="small" plain @click="openPageMetaImagePicker('navLogoUrl')">主体 Logo</el-button>
            <el-button size="small" plain @click="openPageMetaImagePicker('shareImageUrl')">分享封面</el-button>
            <el-button size="small" plain @click="navigateToSection('/themes')">主题配置</el-button>
            <el-button size="small" plain @click="navigateToSection('/materials')">素材管理</el-button>
          </div>
        </section>

        <section v-show="inspectorTab === 'page'" class="data-panel cms-panel inspector-panel">
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
            <el-form-item>
              <template #label>顶部标题 Logo<MaterialSpecHelp spec-key="topTitleLogo" /></template>
              <div class="field-row">
                <el-input v-model="pageMeta.navLogoUrl" placeholder="建议 64x64 或 96x96，PNG/SVG/WebP/GIF" />
                <el-button @click="openPageMetaImagePicker('navLogoUrl')">应用素材库</el-button>
              </div>
              <p class="form-help">用于后台手机预览中的小程序顶部标题。微信原生导航栏不支持直接插入图片，若正式端需要展示 Logo，需使用自定义导航栏页面。</p>
            </el-form-item>
            <el-form-item>
              <template #label>顶部动态 Logo<MaterialSpecHelp spec-key="topTitleLogo" /></template>
              <div class="field-row">
                <el-input v-model="pageMeta.navLogoDynamicUrl" placeholder="可填 GIF/APNG/WebP 动图 URL，不填则使用静态 Logo" />
                <el-button @click="openPageMetaImagePicker('navLogoDynamicUrl')">应用素材库</el-button>
              </div>
              <p class="form-help">建议减少动图帧数并保留透明留白，避免影响小程序首屏加载。</p>
            </el-form-item>
            <el-form-item label="微信分享标题">
              <el-input v-model="pageMeta.shareTitle" placeholder="转发给朋友时展示的标题" />
            </el-form-item>
            <el-form-item label="微信分享描述">
              <el-input v-model="pageMeta.shareDescription" type="textarea" :rows="2" placeholder="转发卡片描述" />
            </el-form-item>
            <el-form-item>
              <template #label>微信分享封面<MaterialSpecHelp spec-key="shareCover" /></template>
              <div class="field-row">
                <el-input v-model="pageMeta.shareImageUrl" placeholder="建议 500x400 或 5:4，JPG/PNG" />
                <el-button @click="openPageMetaImagePicker">应用素材库</el-button>
              </div>
            </el-form-item>
          </el-form>
        </section>

        <section v-if="showBusinessDisplayEditor" v-show="inspectorTab === 'page'" class="data-panel cms-panel inspector-panel">
          <div class="library-head">
            <div>
              <div class="panel-title">固定业务模块</div>
              <p class="page-subtitle">控制小程序真实业务页的固定信息区，配置会随当前通用模板或指定会议页一起发布。</p>
            </div>
          </div>
          <el-alert
            class="business-display-alert"
            type="info"
            :closable="false"
            show-icon
            title="业务数据仍来自会议、票种和报名接口"
            description="这里负责显示隐藏、标题文案、按钮文案和库存展示方式；会议名称、时间、地点、价格、库存和报名状态仍以真实业务数据为准。"
          />
          <div class="business-display-toolbar">
            <div class="business-display-stats">
              <span><b>{{ businessDisplayStats.visible }}</b> 显示</span>
              <span><b>{{ businessDisplayStats.hidden }}</b> 隐藏</span>
              <span><b>{{ businessDisplayStats.total }}</b> 总模块</span>
            </div>
            <div class="business-display-actions">
              <el-button size="small" plain @click="showAllBusinessModules">全部显示</el-button>
              <el-button size="small" plain @click="hideOptionalBusinessModules">隐藏可选项</el-button>
              <el-button size="small" plain @click="normalizeBusinessDisplayOrder">整理排序</el-button>
              <el-button size="small" plain @click="resetBusinessDisplayForCurrentPage">恢复默认</el-button>
            </div>
          </div>
          <el-form label-position="top" class="business-display-form">
            <el-form-item label="底部报名按钮文案">
              <el-input v-model="businessDisplay.primaryButtonText" placeholder="立即报名" />
            </el-form-item>
            <el-form-item label="库存展示方式">
              <el-select v-model="businessDisplay.inventoryDisplayMode">
                <el-option label="显示库存状态" value="STATUS" />
                <el-option label="显示精确库存" value="EXACT" />
                <el-option label="隐藏库存" value="HIDDEN" />
              </el-select>
            </el-form-item>
            <el-form-item label="库存紧张阈值">
              <el-input-number v-model="businessDisplay.lowStockThreshold" :min="1" :max="999" />
            </el-form-item>
            <el-form-item label="会议助手">
              <el-select v-model="businessDisplay.assistantMode">
                <el-option label="显示 AI 会议助手" value="ai" />
                <el-option label="隐藏会议助手" value="hidden" />
              </el-select>
            </el-form-item>
            <div class="business-module-list">
              <div v-for="(module, moduleIndex) in businessDisplay.modules" :key="module.key" class="business-module-card">
                <div class="business-module-card__head">
                  <span class="business-module-card__title">
                    <strong>{{ businessModuleLabel(module.key) }}</strong>
                    <small>{{ moduleIndex + 1 }} · {{ module.key }}</small>
                  </span>
                  <span class="business-module-card__ops">
                    <el-switch v-model="module.visible" active-text="显示" inactive-text="隐藏" />
                    <el-button size="small" :disabled="moduleIndex === 0" @click="moveBusinessDisplayModule(moduleIndex, -1)">上移</el-button>
                    <el-button size="small" :disabled="moduleIndex === businessDisplay.modules.length - 1" @click="moveBusinessDisplayModule(moduleIndex, 1)">下移</el-button>
                  </span>
                </div>
                <el-input v-model="module.title" size="small" placeholder="模块标题" />
                <el-input
                  v-if="businessModuleAllowsContent(module.key)"
                  v-model="module.content"
                  type="textarea"
                  :rows="2"
                  placeholder="模块说明或按钮文案，可留空使用真实数据兜底"
                />
                <div class="business-module-card__sort">
                  <span>显示顺序</span>
                  <el-input-number v-model="module.sort" size="small" :min="0" :step="10" controls-position="right" />
                </div>
                <el-select v-model="module.style" size="small" placeholder="模块样式">
                  <el-option label="卡片" value="card" />
                  <el-option label="紧凑" value="compact" />
                  <el-option label="强调按钮" value="accent" />
                  <el-option label="胶囊标题" value="capsule" />
                  <el-option label="普通标题" value="title" />
                  <el-option label="提示条" value="bar" />
                  <el-option label="简洁文字" value="text" />
                  <el-option label="吸底结算" value="sticky" />
                  <el-option label="隐藏标题样式" value="hidden" />
                </el-select>
              </div>
            </div>
          </el-form>
        </section>

        <section v-show="inspectorTab === 'component'" class="data-panel cms-panel inspector-panel component-inspector-panel">
          <div class="library-head">
            <div>
              <div class="panel-title">组件参数</div>
              <p class="page-subtitle">{{ selectedComponent ? `正在编辑：${presetName(selectedComponent.type)}` : "先在中间选择一个组件，再在这里编辑参数。" }}</p>
            </div>
          </div>

          <template v-if="selectedComponent">
            <div class="selected-component-actions">
              <span>{{ selectedComponentIndex + 1 }}. {{ presetName(selectedComponent.type) }}</span>
              <div>
                <el-tooltip :content="selectedComponent.enabled ? '隐藏组件' : '显示组件'" placement="top">
                  <el-button circle size="small" :aria-label="selectedComponent.enabled ? '隐藏组件' : '显示组件'" :icon="selectedComponent.enabled ? Hide : View" @click="selectedComponent.enabled = !selectedComponent.enabled" />
                </el-tooltip>
                <el-tooltip content="复制组件" placement="top"><el-button circle size="small" aria-label="复制组件" :icon="CopyDocument" @click="duplicateSelectedComponent" /></el-tooltip>
                <el-tooltip content="删除组件" placement="top"><el-button circle size="small" type="danger" plain aria-label="删除组件" :icon="Delete" @click="removeSelectedComponent" /></el-tooltip>
              </div>
            </div>
            <el-collapse v-model="expandedConfigGroupIds[selectedComponent.id]" class="config-group-collapse">
              <el-collapse-item v-for="group in groupedFieldsFor(selectedComponent.type)" :key="group.key" :title="group.title" :name="group.key">
                <el-form label-position="top" class="config-form">
                  <el-form-item v-for="field in group.fields" :key="field.key">
                    <template #label>
                      {{ field.label }}
                      <MaterialSpecHelp v-if="materialSpecKeyForField(selectedComponent.type, field)" :spec-key="materialSpecKeyForField(selectedComponent.type, field)" />
                    </template>
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
                    <div v-else-if="field.kind === 'rich-blocks'" class="rich-block-editor">
                      <div class="rich-block-editor__head">
                        <p>用内容块组合标题、正文、图片、引用、按钮和分割线；不需要填写 HTML 代码，发布后小程序按同一结构渲染。</p>
                        <div class="rich-block-editor__actions">
                          <el-button size="small" plain @click="addRichBlock(selectedComponent, 'heading')">标题</el-button>
                          <el-button size="small" plain @click="addRichBlock(selectedComponent, 'paragraph')">正文</el-button>
                          <el-button size="small" plain @click="addRichBlock(selectedComponent, 'image')">图片</el-button>
                          <el-button size="small" plain @click="addRichBlock(selectedComponent, 'quote')">引用</el-button>
                          <el-button size="small" plain @click="addRichBlock(selectedComponent, 'button')">按钮</el-button>
                        </div>
                      </div>
                      <div
                        v-for="(block, blockIndex) in richBlocksFor(selectedComponent)"
                        :key="block.id"
                        class="rich-block-card"
                        :class="{ 'is-expanded': isRichBlockExpanded(block.id), 'is-disabled': !block.enabled }"
                      >
                        <div class="rich-block-card__top">
                          <div class="rich-block-card__summary">
                            <span class="rich-block-card__type">{{ richBlockTypeLabel(block.type) }}</span>
                            <span>
                              <strong>{{ blockIndex + 1 }}. {{ richBlockSummary(block) }}</strong>
                              <small>{{ block.enabled ? "正在展示" : "已隐藏" }}</small>
                            </span>
                          </div>
                          <div class="rich-block-card__actions">
                            <el-switch v-model="block.enabled" active-text="展示" inactive-text="隐藏" />
                            <el-button size="small" type="primary" plain @click="toggleRichBlockExpanded(block.id)">
                              {{ isRichBlockExpanded(block.id) ? "收起" : "编辑" }}
                            </el-button>
                            <el-button size="small" plain @click="duplicateRichBlock(selectedComponent, blockIndex)">复制</el-button>
                            <el-button size="small" :disabled="blockIndex === 0" @click="moveRichBlock(selectedComponent, blockIndex, -1)">上移</el-button>
                            <el-button size="small" :disabled="blockIndex === richBlocksFor(selectedComponent).length - 1" @click="moveRichBlock(selectedComponent, blockIndex, 1)">下移</el-button>
                            <el-button size="small" type="danger" plain @click="removeRichBlock(selectedComponent, blockIndex)">删除</el-button>
                          </div>
                        </div>

                        <div v-if="isRichBlockExpanded(block.id)" class="rich-block-card__grid">
                          <label>
                            <span>内容类型</span>
                            <el-select v-model="block.type">
                              <el-option label="标题" value="heading" />
                              <el-option label="正文段落" value="paragraph" />
                              <el-option label="图片" value="image" />
                              <el-option label="引用/重点提示" value="quote" />
                              <el-option label="分割线" value="divider" />
                              <el-option label="按钮" value="button" />
                            </el-select>
                          </label>
                          <label v-if="block.type === 'heading'">
                            <span>标题文字</span>
                            <el-input v-model="block.title" placeholder="例如 大会介绍" />
                          </label>
                          <label v-if="block.type === 'paragraph' || block.type === 'quote'" class="rich-block-card__wide">
                            <span>{{ block.type === "quote" ? "提示内容" : "正文内容" }}</span>
                            <el-input v-model="block.text" type="textarea" :rows="4" placeholder="可直接粘贴多段文本，避免粘贴外部 HTML 代码" />
                          </label>
                          <label v-if="block.type === 'image'" class="rich-block-card__wide">
                            <span>图片地址 <MaterialSpecHelp spec-key="contentImage" /></span>
                            <div class="field-row">
                              <el-input v-model="block.imageUrl" placeholder="从素材库选择或粘贴图片地址" />
                              <el-button @click="openRichBlockMaterialPicker(selectedComponent, block)">素材库</el-button>
                            </div>
                            <small>图文配图建议宽度 750px，使用 JPG/PNG/WebP。可连续添加多张图片块。</small>
                          </label>
                          <label v-if="block.type === 'image'">
                            <span>图片显示方式</span>
                            <el-select v-model="block.imageMode">
                              <el-option label="宽度自适应" value="widthFix" />
                              <el-option label="等比裁切" value="aspectFill" />
                              <el-option label="完整显示" value="aspectFit" />
                            </el-select>
                          </label>
                          <label v-if="block.type === 'image'">
                            <span>图片说明</span>
                            <el-input v-model="block.caption" placeholder="可选，显示在图片下方" />
                          </label>
                          <label v-if="block.type !== 'divider' && block.type !== 'image'">
                            <span>对齐方式</span>
                            <el-select v-model="block.align">
                              <el-option label="居左" value="left" />
                              <el-option label="居中" value="center" />
                              <el-option label="居右" value="right" />
                            </el-select>
                          </label>
                          <label v-if="block.type === 'button'">
                            <span>按钮文字</span>
                            <el-input v-model="block.buttonText" placeholder="例如 立即查看" />
                          </label>
                          <template v-if="block.type !== 'divider'">
                            <label>
                              <span>点击动作</span>
                              <el-select v-model="block.actionTargetType">
                                <el-option v-for="option in actionTargetOptions()" :key="option.value" :label="option.label" :value="option.value" />
                              </el-select>
                              <small>标题、图片、正文和按钮都可点击跳转；不需要跳转时选择“无跳转”。</small>
                            </label>
                            <label v-if="block.actionTargetType === 'page'">
                              <span>内部页面</span>
                              <el-select v-model="block.targetPageKey" filterable>
                                <el-option v-for="option in pageTargetOptions()" :key="option.value" :label="option.label" :value="option.value" />
                              </el-select>
                            </label>
                            <label v-if="block.actionTargetType === 'conference' || block.actionTargetType === 'registration' || block.actionTargetType === 'ai'">
                              <span>目标会议</span>
                              <el-select v-model="block.targetConferenceId" filterable>
                                <el-option v-for="option in conferenceSelectOptions()" :key="option.value" :label="option.label" :value="option.value" />
                              </el-select>
                            </label>
                            <label v-if="block.actionTargetType === 'product'">
                              <span>目标商品</span>
                              <el-select v-model="block.targetProductId" filterable>
                                <el-option v-for="option in productSelectOptions()" :key="option.value" :label="option.label" :value="option.value" />
                              </el-select>
                            </label>
                            <label v-if="block.actionTargetType === 'product-category'">
                              <span>商品分类</span>
                              <el-select v-model="block.targetProductCategoryId" filterable>
                                <el-option v-for="option in productCategorySelectOptions()" :key="option.value" :label="option.label" :value="option.value" />
                              </el-select>
                            </label>
                            <label v-if="block.actionTargetType === 'coupon'">
                              <span>券活动</span>
                              <el-select v-model="block.targetCouponCampaignId" filterable>
                                <el-option v-for="option in couponCampaignSelectOptions()" :key="option.value" :label="option.label" :value="option.value" />
                              </el-select>
                            </label>
                            <label v-if="block.actionTargetType === 'external-h5'">
                              <span>外部 H5 URL</span>
                              <el-input v-model="block.externalUrl" placeholder="https://example.com" />
                            </label>
                            <template v-if="block.actionTargetType === 'external-miniapp'">
                              <label>
                                <span>小程序 AppID</span>
                                <el-input v-model="block.externalMiniappAppId" placeholder="目标小程序 AppID" />
                              </label>
                              <label>
                                <span>小程序路径</span>
                                <el-input v-model="block.externalMiniappPath" placeholder="pages/index/index" />
                              </label>
                            </template>
                            <label v-if="block.actionTargetType === 'phone'">
                              <span>电话</span>
                              <el-input v-model="block.phone" placeholder="用于一键拨打" />
                            </label>
                            <label v-if="block.actionTargetType === 'copy'">
                              <span>复制内容</span>
                              <el-input v-model="block.copyText" placeholder="用户点击后复制这段文本" />
                            </label>
                          </template>
                        </div>
                      </div>
                    </div>
                    <div v-else-if="field.kind === 'entry-list'" class="entry-editor">
                      <div class="entry-editor__head">
                        <p>每个入口独立配置图标、文案、颜色和跳转动作；保存后小程序按相同字段渲染。</p>
                        <el-button type="primary" plain size="small" @click="addEntryItem(selectedComponent)">新增入口</el-button>
                      </div>
                      <div
                        v-for="(entry, entryIndex) in entryItemsFor(selectedComponent)"
                        :key="entry.id"
                        class="entry-card"
                        :class="{ 'is-expanded': isEntryExpanded(entry.id) }"
                      >
                        <div class="entry-card__top">
                          <div class="entry-card__summary">
                            <span class="entry-card__icon">
                              <img v-if="entryIconPreview(entry)" :src="entryIconPreview(entry)" :alt="entry.title" />
                              <b v-else>{{ builtinIconLabel(entry) }}</b>
                            </span>
                            <span class="entry-card__sort">
                              <strong>{{ entryIndex + 1 }}. {{ entry.title || "未命名入口" }}</strong>
                              <small>{{ entry.subtitle || "未填写副标题" }}</small>
                              <small>跳转：{{ entryActionLabel(entry) }}</small>
                              <small>状态：{{ entry.enabled ? "启用" : "停用" }}</small>
                            </span>
                          </div>
                          <div class="entry-card__actions">
                            <el-switch v-model="entry.enabled" active-text="启用" inactive-text="停用" />
                            <el-button size="small" type="primary" plain @click="toggleEntryExpanded(entry.id)">
                              {{ isEntryExpanded(entry.id) ? "收起" : "编辑" }}
                            </el-button>
                            <el-button size="small" plain @click="duplicateEntryItem(selectedComponent, entryIndex)">复制</el-button>
                            <el-button size="small" :disabled="entryIndex === 0" @click="moveEntryItem(selectedComponent, entryIndex, -1)">上移</el-button>
                            <el-button size="small" :disabled="entryIndex === entryItemsFor(selectedComponent).length - 1" @click="moveEntryItem(selectedComponent, entryIndex, 1)">下移</el-button>
                            <el-button size="small" type="danger" plain @click="removeEntryItem(selectedComponent, entryIndex)">删除</el-button>
                          </div>
                        </div>

                        <div v-if="isEntryExpanded(entry.id)" class="entry-card__grid">
                          <div class="entry-card__group-title">基础信息</div>
                          <label>
                            <span>中文标题</span>
                            <el-input v-model="entry.title" placeholder="例如 会议报名" />
                          </label>
                          <label>
                            <span>英文副标题</span>
                            <el-input v-model="entry.subtitle" placeholder="例如 Registration，可留空" />
                          </label>
                          <div class="entry-card__group-title">图标</div>
                          <label>
                            <span>静态图标</span>
                            <div class="field-row">
                              <el-input v-model="entry.iconUrl" placeholder="从素材库选择、上传后粘贴 URL，或填写图片地址" />
                              <el-button @click="openEntryMaterialPicker(selectedComponent, entry, 'iconUrl')">素材库</el-button>
                            </div>
                            <small>建议 96x96 PNG/SVG，图形主体居中并保留适当留白。</small>
                          </label>
                          <label>
                            <span>动态图标 <MaterialSpecHelp spec-key="animatedIcon" /></span>
                            <div class="field-row">
                              <el-input v-model="entry.dynamicIconUrl" placeholder="可填写 GIF/APNG 动图地址；不填则使用静态图标" />
                              <el-button @click="openEntryMaterialPicker(selectedComponent, entry, 'dynamicIconUrl')">素材库</el-button>
                            </div>
                            <small>建议 96x96 或 128x128，使用 GIF/APNG/WebP/PNG/SVG。</small>
                          </label>
                          <label>
                            <span>内置图标</span>
                            <el-select v-model="entry.builtinIcon">
                              <el-option label="自动首字占位" value="" />
                              <el-option label="会议" value="conference" />
                              <el-option label="报名" value="registration" />
                              <el-option label="订单" value="order" />
                              <el-option label="商城" value="shop" />
                              <el-option label="会员" value="member" />
                              <el-option label="发票" value="invoice" />
                              <el-option label="客服" value="service" />
                            </el-select>
                          </label>
                          <div class="entry-card__group-title">样式</div>
                          <label>
                            <span>卡片样式</span>
                            <el-select v-model="entry.cardStyle">
                              <el-option label="跟随模块" value="" />
                              <el-option label="柔和卡片" value="soft" />
                              <el-option label="描边卡片" value="outline" />
                              <el-option label="扁平入口" value="plain" />
                            </el-select>
                          </label>
                          <label>
                            <span>入口背景色</span>
                            <el-color-picker v-model="entry.backgroundColor" />
                          </label>
                          <label>
                            <span>文字颜色</span>
                            <el-color-picker v-model="entry.textColor" />
                          </label>
                          <div class="entry-card__group-title">跳转动作</div>
                          <label>
                            <span>点击动作</span>
                            <el-select v-model="entry.actionTargetType">
                              <el-option v-for="option in actionTargetOptions()" :key="option.value" :label="option.label" :value="option.value" />
                            </el-select>
                          </label>
                          <label v-if="entry.actionTargetType === 'page'">
                            <span>内部页面</span>
                            <el-select v-model="entry.targetPageKey" filterable>
                              <el-option v-for="option in pageTargetOptions()" :key="option.value" :label="option.label" :value="option.value" />
                            </el-select>
                          </label>
                          <label v-if="entry.actionTargetType === 'conference' || entry.actionTargetType === 'registration' || entry.actionTargetType === 'ai'">
                            <span>目标会议</span>
                            <el-select v-model="entry.targetConferenceId" filterable>
                              <el-option v-for="option in conferenceSelectOptions()" :key="option.value" :label="option.label" :value="option.value" />
                            </el-select>
                          </label>
                          <label v-if="entry.actionTargetType === 'product'">
                            <span>目标商品</span>
                            <el-select v-model="entry.targetProductId" filterable>
                              <el-option v-for="option in productSelectOptions()" :key="option.value" :label="option.label" :value="option.value" />
                            </el-select>
                          </label>
                          <label v-if="entry.actionTargetType === 'product-category'">
                            <span>商品分类</span>
                            <el-select v-model="entry.targetProductCategoryId" filterable>
                              <el-option v-for="option in productCategorySelectOptions()" :key="option.value" :label="option.label" :value="option.value" />
                            </el-select>
                          </label>
                          <label v-if="entry.actionTargetType === 'coupon'">
                            <span>券活动</span>
                            <el-select v-model="entry.targetCouponCampaignId" filterable>
                              <el-option v-for="option in couponCampaignSelectOptions()" :key="option.value" :label="option.label" :value="option.value" />
                            </el-select>
                          </label>
                          <label v-if="entry.actionTargetType === 'external-h5'">
                            <span>外部 H5 URL</span>
                            <el-input v-model="entry.externalUrl" placeholder="https://example.com；注意小程序业务域名限制" />
                          </label>
                          <template v-if="entry.actionTargetType === 'external-miniapp'">
                            <label>
                              <span>外部小程序 AppID</span>
                              <el-input v-model="entry.externalMiniappAppId" placeholder="wx..." />
                            </label>
                            <label>
                              <span>外部小程序路径</span>
                              <el-input v-model="entry.externalMiniappPath" placeholder="pages/index/index" />
                            </label>
                            <label class="entry-card__wide">
                              <span>extraData</span>
                              <el-input v-model="entry.externalMiniappExtraData" type="textarea" :rows="2" placeholder="JSON 字符串，可留空" />
                            </label>
                          </template>
                          <label v-if="entry.actionTargetType === 'phone'">
                            <span>电话号码</span>
                            <el-input v-model="entry.phone" placeholder="用于一键拨打" />
                          </label>
                          <template v-if="entry.actionTargetType === 'copy'">
                            <label>
                              <span>复制内容</span>
                              <el-input v-model="entry.copyText" placeholder="用户点击后复制这段文本" />
                            </label>
                            <label>
                              <span>复制成功提示</span>
                              <el-input v-model="entry.copySuccessText" placeholder="内容已复制" />
                            </label>
                          </template>
                        </div>
                      </div>
                    </div>
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
                      <el-button v-if="isMaterialSelectableField(selectedComponent.type, field)" @click="openMaterialPicker(selectedComponent, field)">
                        {{ materialPickerButtonText(selectedComponent.type, field) }}
                      </el-button>
                    </div>
                    <el-button v-if="field.kind === 'list' && isMaterialSelectableField(selectedComponent.type, field)" class="material-button" @click="openMaterialPicker(selectedComponent, field)">
                      {{ materialPickerButtonText(selectedComponent.type, field) }}
                      <MaterialSpecHelp :spec-key="materialSpecKeyForField(selectedComponent.type, field) || 'imageGrid'" />
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

    <el-drawer v-model="publishPanelVisible" title="发布检查" size="460px" append-to-body>
      <div class="publish-drawer__summary">
        <span class="is-pass"><b>{{ acceptanceSummary.pass }}</b> 项通过</span>
        <span class="is-warn"><b>{{ acceptanceSummary.warn }}</b> 项提醒</span>
        <span class="is-error"><b>{{ acceptanceSummary.error }}</b> 项阻断</span>
      </div>
      <el-alert
        v-if="unsupportedEnabledComponents.length > 0"
        type="error"
        :closable="false"
        show-icon
        title="页面中有暂不可发布的组件"
        :description="unsupportedEnabledComponents.map((item) => presetName(item.type)).join('、')"
      />
      <div class="acceptance-list publish-drawer__checks">
        <div v-for="check in acceptanceChecks" :key="check.key" class="acceptance-check" :class="acceptanceCheckClass(check.status)">
          <span class="acceptance-check__status">{{ acceptanceStatusLabel(check.status) }}</span>
          <span class="acceptance-check__copy">
            <strong>{{ check.title }}</strong>
            <small>{{ operatorAcceptanceDescription(check) }}</small>
          </span>
        </div>
      </div>
      <template #footer>
        <div class="publish-drawer__footer">
          <el-button @click="publishPanelVisible = false">继续装修</el-button>
          <el-button type="primary" :loading="publishing" :disabled="acceptanceSummary.error > 0" @click="publishFromDrawer">确认发布</el-button>
        </div>
      </template>
    </el-drawer>

    <el-dialog v-model="fixedTemplateVisible" title="页面结构模板" width="760px" destroy-on-close>
      <p class="dialog-intro">选择一个起始结构。应用后每个模块都可独立配置、拖拽、复制、隐藏或删除，不会生成锁死的整页组件。</p>
      <div class="fixed-template-grid">
        <button
          v-for="template in fixedBusinessTemplateOptions"
          :key="template.key"
          type="button"
          class="fixed-template-card"
          @click="chooseFixedTemplate(template.key)"
        >
          <span><Collection /></span>
          <strong>{{ template.name }}</strong>
          <small>{{ template.heroSubtitle || template.noticeText }}</small>
        </button>
      </div>
    </el-dialog>

    <el-dialog v-model="createVisible" title="新增页面" width="520px">
      <el-form :model="createForm" label-width="110px">
        <el-form-item label="页面类型">
          <el-select v-model="createForm.pageType" @change="syncCreateSlug">
            <el-option v-for="item in pageTypeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          <p class="form-help">{{ pageTypeHelp(createForm.pageType) }}</p>
        </el-form-item>
        <el-form-item label="页面地址尾缀"><el-input v-model="createForm.slug" placeholder="例如 about-us；指定详情页可自动生成" /></el-form-item>
        <el-form-item label="页面标题"><el-input v-model="createForm.title" /></el-form-item>
        <el-form-item label="页面说明"><el-input v-model="createForm.description" /></el-form-item>
        <el-form-item v-if="requiresCreateConference" label="绑定会议">
          <el-select v-model="createForm.conferenceId" filterable placeholder="选择具体会议" @change="syncCreateSlug">
            <el-option v-for="item in previewConferences" :key="item.id" :label="item.title" :value="item.id" />
          </el-select>
          <p class="form-help">{{ createConferenceBindingHelp }}</p>
        </el-form-item>
        <el-form-item v-if="createForm.pageType === 'PRODUCT_DETAIL_PAGE'" label="绑定商品">
          <el-select v-model="createForm.productId" filterable placeholder="选择具体商品" @change="syncCreateSlug">
            <el-option v-for="item in productOptions" :key="item.id" :label="item.title" :value="item.id" />
          </el-select>
          <p class="form-help">指定商品详情页只对所选商品生效；未命中时用户端会回退商品详情模板。</p>
        </el-form-item>
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
                <div class="template-card__buttons">
                  <el-button plain :disabled="!template.version" @click="openTemplatePreview(template)">详细预览</el-button>
                  <el-button type="primary" plain :disabled="!selectedPage || !template.version" @click="applyTemplateToCurrentPage(template)">应用到当前页</el-button>
                </div>
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

    <el-dialog v-model="templatePreviewVisible" :title="templatePreview?.title || '模板详细预览'" width="920px">
      <div v-if="templatePreview" class="template-preview-layout">
        <div class="template-preview-phone">
          <div class="phone-shell">
            <div class="phone-status is-miniapp">
              <span>15:29</span>
              <span><i /> <i /> <b>63</b></span>
            </div>
            <div class="phone-window" :style="templatePreviewStyle">
              <div class="phone-nav">
                <span class="phone-nav__spacer" />
                <span class="phone-nav__title">{{ templatePreview.title }}</span>
                <span class="phone-capsule"><i /><i /></span>
              </div>
              <div class="phone-screen">
                <div
                  v-for="component in templatePreviewComponents"
                  :key="component.id"
                  class="preview-block"
                >
                  <component-preview :item="component" :name="presetName(component.type)" user-mode="member" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <aside class="template-preview-meta">
          <span class="support-badge" :class="templatePreview.system ? 'is-support-supported' : 'is-support-basic'">
            {{ templatePreview.system ? "系统模板" : "自定义模板" }}
          </span>
          <h3>{{ templatePreview.title }}</h3>
          <p>{{ templatePreview.description || templatePreview.summary || "可直接套用后继续修改。" }}</p>
          <div class="template-preview-meta__list">
            <span v-for="name in templateComponentNames(templatePreview)" :key="name">{{ name }}</span>
          </div>
          <el-button type="primary" :disabled="!selectedPage || !templatePreview.version" @click="applyTemplateToCurrentPage(templatePreview)">应用到当前页</el-button>
        </aside>
      </div>
    </el-dialog>

    <el-dialog v-model="materialVisible" :title="materialDialogTitle" width="820px">
      <div class="material-picker">
        <div class="material-picker__head">
          <el-input v-model="materialKeyword" clearable placeholder="搜索素材名称" @keyup.enter="loadMaterials" />
          <el-button :loading="materialLoading" @click="loadMaterials">搜索</el-button>
        </div>
        <div class="material-picker__spec">
          <MaterialSpecHelp :spec-key="materialPickerSpecKey" />
          <span>{{ materialPickerSpecText }}</span>
        </div>
        <el-empty v-if="!materialLoading && materialAssets.length === 0" :description="materialEmptyText" />
        <div v-else class="material-grid">
          <button v-for="asset in materialAssets" :key="asset.id" class="material-card" @click="chooseMaterial(asset)">
            <img v-if="isImageAsset(asset)" :src="asset.url" :alt="asset.name" />
            <div v-else-if="isVideoAsset(asset)" class="font-asset">视频</div>
            <div v-else-if="isFontAsset(asset)" class="font-asset">字体</div>
            <div v-else class="font-asset">资料</div>
            <strong>{{ asset.name }}</strong>
            <small>{{ asset.usage || "通用素材" }}</small>
          </button>
        </div>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, getCurrentInstance, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, type Component } from "vue";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bell,
  Calendar,
  ChatDotRound,
  CircleCheck,
  Collection,
  CopyDocument,
  CreditCard,
  Delete,
  Document,
  DocumentChecked,
  EditPen,
  Files,
  Grid,
  Hide,
  Link,
  Loading,
  Menu,
  MoreFilled,
  Picture,
  Rank,
  RefreshLeft,
  RefreshRight,
  Search,
  Setting,
  ShoppingCart,
  Tickets,
  User,
  VideoCamera,
  View
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import CmsPresetThumbnail from "../../components/cms/CmsPresetThumbnail.vue";
import CmsRuntimePreview from "../../components/cms/CmsRuntimePreview.vue";
import MaterialSpecHelp from "../../components/MaterialSpecHelp.vue";
import type { PageDsl } from "@conference/dsl-runtime";
import { buildCmsPageComposition, expandLegacyCmsTemplate } from "@conference/shared";
import {
  BUSINESS_MODULE_DEFINITIONS,
  createBusinessModule,
  getModuleRenderContractForVisualComponent,
  type BusinessModule,
  type BusinessModuleType,
  type ModuleRenderContract
} from "@conference/business-modules";
import {
  createPage,
  createPageLibraryTemplate,
  deletePage,
  getTheme,
  getProductCategoryOptions,
  getProductOptions,
  getPageVersion,
  getTabbar,
  listCouponCampaigns,
  listMaterials,
  listComponentPresets,
  listConferences,
  listPageLibraryTemplates,
  listPages,
  publishPageVersion,
  rollbackPage,
  updatePageVersion
} from "../../services/admin";
import { navigateTo, routeQuery } from "../../router";
import { materialSpecs, materialSpecText, type MaterialSpecKey } from "../../constants/materialSpecs";
import type {
  CmsComponent,
  CmsComponentSupportStatus,
  ComponentPreset,
  Conference,
  CouponCampaign,
  MaterialAsset,
  PageLibraryTemplate,
  PageTemplate,
  PageVersion,
  ProductCategory,
  Product,
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

interface EditorSnapshot {
  components: EditableComponent[];
  pageMeta: PageMetaForm;
  businessDisplay: BusinessDisplayForm;
  versionTitle: string;
}

interface ConfigField {
  key: string;
  label: string;
  kind?: "text" | "textarea" | "number" | "range" | "list" | "entry-list" | "rich-blocks" | "color" | "select" | "switch";
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
  navLogoUrl: string;
  navLogoDynamicUrl: string;
  shareTitle: string;
  shareDescription: string;
  shareImageUrl: string;
}

interface BusinessDisplayModule {
  key: string;
  title: string;
  content: string;
  visible: boolean;
  sort: number;
  style: string;
}

interface BusinessModuleGuide {
  source: string;
  entry: string;
  effect: string;
  defaultStatus?: "configured" | "default" | "unconfigured";
}

interface FixedBusinessTemplateOption {
  key: string;
  kind: "home" | "schedule" | "registration" | "mall" | "cart" | "member-center";
  name: string;
  pageTitle: string;
  shareTitle: string;
  heroTitle: string;
  heroSubtitle: string;
  noticeText?: string;
  growthValue?: string;
}

type ShopWorkbenchAction = "decorate" | "templates" | "theme" | "tabbar" | "materials" | "subject";

interface ShopWorkbenchCard {
  key: string;
  index: string;
  title: string;
  subtitle: string;
  meta: string;
  action: ShopWorkbenchAction;
  active?: boolean;
}

interface BusinessDisplayForm {
  modules: BusinessDisplayModule[];
  assistantMode: string;
  primaryButtonText: string;
  inventoryDisplayMode: "EXACT" | "STATUS" | "HIDDEN";
  lowStockThreshold: number;
}

interface EntryConfigItem {
  id: string;
  enabled: boolean;
  sort: number;
  title: string;
  subtitle: string;
  iconUrl: string;
  dynamicIconUrl: string;
  builtinIcon: string;
  backgroundColor: string;
  textColor: string;
  cardStyle: string;
  actionTargetType: string;
  targetPageKey: string;
  targetConferenceId: string;
  targetProductId: string;
  targetProductCategoryId: string;
  targetCouponCampaignId: string;
  externalUrl: string;
  externalMiniappAppId: string;
  externalMiniappPath: string;
  externalMiniappExtraData: string;
  phone: string;
  copyText: string;
  copySuccessText: string;
}

interface RichContentBlockItem {
  id: string;
  enabled: boolean;
  sort: number;
  type: "heading" | "paragraph" | "image" | "quote" | "divider" | "button";
  title: string;
  text: string;
  imageUrl: string;
  caption: string;
  imageMode: string;
  align: string;
  buttonText: string;
  actionTargetType: string;
  targetPageKey: string;
  targetConferenceId: string;
  targetProductId: string;
  targetProductCategoryId: string;
  targetCouponCampaignId: string;
  externalUrl: string;
  externalMiniappAppId: string;
  externalMiniappPath: string;
  phone: string;
  copyText: string;
}

interface CmsComponentSupportMeta {
  label: string;
  status: CmsComponentSupportStatus;
  description: string;
}

type AcceptanceStatus = "pass" | "warn" | "error";

interface AcceptanceCheck {
  key: string;
  title: string;
  description: string;
  status: AcceptanceStatus;
  action?: string;
}

interface ComponentParityRuleView {
  label: string;
  detail: string;
}

interface ComponentParityContractView {
  title: string;
  summary: string;
  adminAdapter: string;
  h5Adapter: string;
  miniappAdapter: string;
  rules: ComponentParityRuleView[];
}

interface PreviewUserContext {
  avatarUrl: string;
  nickname: string;
  phone: string;
  memberStatus: string;
  memberLevel: string;
  registrationCount: number;
  pendingConferenceCount: number;
  orderCount: number;
  couponCount: number;
}

const SAMPLE_USER_CONTEXT: PreviewUserContext = {
  avatarUrl: "",
  nickname: "潮起东方",
  phone: "138****8888",
  memberStatus: "有效会员",
  memberLevel: "黄金会员",
  registrationCount: 3,
  pendingConferenceCount: 2,
  orderCount: 5,
  couponCount: 4
};

const DEFAULT_PARITY_RULES: ComponentParityRuleView[] = [
  { label: "数据源", detail: "保存后写入 P9 DSL，并在 meta.editorComponents 保留高级装修源配置。" },
  { label: "渲染路径", detail: "后台预览、H5 和小程序均按同一组件字段解释，用户端仍先经过 Render Governor 校验。" },
  { label: "文案策略", detail: "运营删除标题或描述后，不在用户端自动补技术节点名。" }
];

const COMPONENT_PARITY_CONTRACTS: Record<string, ComponentParityContractView> = {
  "fixed-business-template": {
    title: "旧整页模板兼容协议",
    summary: "旧模板先按 templateKey 展开成可配置组件，再进入三端统一组件渲染器。",
    adminAdapter: "ComponentPreview 组合展开",
    h5Adapter: "CmsVisualRenderer 组合展开",
    miniappAdapter: "CmsVisualRenderer 组合展开",
    rules: [
      { label: "模板类型", detail: "home、schedule、registration、mall、cart、member-center 映射到同一可配置组合。" },
      { label: "编辑方式", detail: "历史页面打开时自动拆分为独立组件，可直接拖拽、删除和调整全部参数。" },
      { label: "旧页兼容", detail: "历史页面仍可展示，保存后会写回可配置 P9 组件结构。" }
    ]
  },
  "hero-banner": {
    title: "Hero Banner 跨端协议",
    summary: "主视觉图片、标题、描述、遮罩、按钮和图片模式三端同源。",
    adminAdapter: "ComponentPreview hero-banner",
    h5Adapter: "CmsVisualRenderer hero-banner",
    miniappAdapter: "CmsVisualRenderer hero-banner",
    rules: [
      { label: "图片模式", detail: "完整显示、等比裁切、宽度铺满必须使用同一个 imageMode。" },
      { label: "文案显隐", detail: "标题、描述、按钮为空时三端都不显示默认技术文案。" },
      { label: "高度策略", detail: "height、radius、imageOnly 与遮罩开关保持一致。" }
    ]
  },
  "quick-icon-grid": {
    title: "快捷入口宫格协议",
    summary: "入口列表、列数、图标、卡片样式和跳转动作三端一致。",
    adminAdapter: "ComponentPreview entry-grid",
    h5Adapter: "CmsVisualRenderer quick-icon-grid",
    miniappAdapter: "CmsVisualRenderer quick-icon-grid",
    rules: [
      { label: "列数", detail: "columns 在后台、H5、小程序保持一致，不按端私自改列数。" },
      { label: "入口字段", detail: "title、subtitle、iconUrl、dynamicIconUrl、enabled 和 actionTargetType 同源。" },
      { label: "跳转动作", detail: "内部页、会议、商品、优惠券、电话、复制文本均走统一动作字段。" }
    ]
  },
  "login-card": {
    title: "登录欢迎卡协议",
    summary: "未登录引导和已登录头像昵称上下文使用同一字段结构。",
    adminAdapter: "示例用户上下文预览",
    h5Adapter: "ensureLogin / 用户上下文",
    miniappAdapter: "ensureLogin / 微信头像昵称补全",
    rules: [
      { label: "登录动作", detail: "立即登录必须触发 ensureLogin，不作为普通链接处理。" },
      { label: "用户信息", detail: "头像、昵称、手机号、会员等级和统计信息进入统一 userContext。" },
      { label: "空态兜底", detail: "后台预览可用示例用户，小程序真机必须读取当前登录用户。" }
    ]
  },
  "rich-text": {
    title: "图文富文本协议",
    summary: "默认不暴露 HTML/JSON，使用图文块配置生成跨端内容。",
    adminAdapter: "rich-blocks 表单预览",
    h5Adapter: "CmsVisualRenderer rich-text",
    miniappAdapter: "CmsVisualRenderer rich-text",
    rules: [
      { label: "内容块", detail: "标题、正文、图片、引用、按钮和分割线按 blocks 顺序渲染。" },
      { label: "图片显示", detail: "图片圆角、间距和 imageMode 与高级装修配置一致。" },
      { label: "点击动作", detail: "图文块可配置统一 actionTargetType，不要求运营写 JSON。" }
    ]
  },
  "conference-schedule": {
    title: "年度排期协议",
    summary: "月份、分类、会议卡片、预约/日历入口使用真实会议上下文预览。",
    adminAdapter: "ComponentPreview schedule",
    h5Adapter: "CmsVisualRenderer conference-schedule",
    miniappAdapter: "CmsVisualRenderer conference-schedule",
    rules: [
      { label: "日期", detail: "月份和日期来自会议 startAt/endAt，不在端上硬编码。" },
      { label: "分类", detail: "categories 字段决定筛选标签，未配置时用安全默认分类。" },
      { label: "卡片样式", detail: "封面、时间、地点、报名人数显隐按同一配置生效。" }
    ]
  },
  "mall-product-grid": {
    title: "商品宫格协议",
    summary: "商品来源、分类、价格和加购文案在后台预览与用户端保持同一字段。",
    adminAdapter: "商品示例预览",
    h5Adapter: "CmsVisualRenderer mall-product-grid",
    miniappAdapter: "CmsVisualRenderer mall-product-grid",
    rules: [
      { label: "商品来源", detail: "productCategoryId、keyword、limit 决定展示范围。" },
      { label: "卡片字段", detail: "封面、标题、价格和库存来自商城商品接口。" },
      { label: "加购动作", detail: "按钮文案可配，订单金额仍由后端商城链路计算。" }
    ]
  }
};

const CMS_COMPONENT_SUPPORT_MATRIX: Record<string, CmsComponentSupportMeta> = {
  "fixed-business-template": { label: "兼容", status: "supported", description: "历史整页模板会自动展开为可配置组件；新页面建议直接使用组件组合" },
  hero: { label: "已支持", status: "supported", description: "小程序/H5 已完整支持图片横幅展示" },
  "hero-banner": { label: "已支持", status: "supported", description: "小程序/H5 已支持首页主视觉、双按钮、背景图和统一跳转配置" },
  "login-card": { label: "已支持", status: "supported", description: "小程序/H5 已支持微信头像昵称登录引导、登录后头像昵称展示和跳转配置" },
  "quick-icon-grid": { label: "已支持", status: "supported", description: "小程序/H5 已支持 2 到 4 列图标入口、动态图标图片和统一跳转配置" },
  "member-promo-banner": { label: "已支持", status: "supported", description: "小程序/H5 已支持会员、优惠券或活动横幅和统一跳转配置" },
  "event-card-carousel": { label: "已支持", status: "supported", description: "小程序/H5 已支持会议卡片横向滑动和详情跳转" },
  "service-shortcut-card": { label: "已支持", status: "supported", description: "小程序/H5 已支持订单、发票、售后、客服等快捷入口" },
  "task-progress-card": { label: "已支持", status: "supported", description: "小程序/H5 已支持任务进度展示和统一跳转配置" },
  "image-promo-card": { label: "已支持", status: "supported", description: "小程序/H5 已支持图片推广卡片和统一跳转配置" },
  "rich-content-block": { label: "已支持", status: "supported", description: "小程序/H5 已支持标题、正文、图片和按钮展示" },
  "conference-list": { label: "已支持", status: "supported", description: "小程序/H5 已完整支持会议列表展示和详情跳转" },
  "conference-schedule": { label: "已支持", status: "supported", description: "小程序/H5 支持按真实会议日期生成年度排期和添加日历" },
  "conference-tabs": { label: "已支持", status: "supported", description: "小程序/H5 支持分类标签筛选和会议卡片展示" },
  "registration-button": { label: "已支持", status: "supported", description: "小程序/H5 支持普通报名入口；会议详情页会隐藏以避免重复按钮" },
  "floating-registration-button": { label: "已支持", status: "supported", description: "小程序/H5 支持悬浮报名入口；会议详情页会隐藏以避免重复按钮" },
  "promotion-bar": { label: "已支持", status: "supported", description: "小程序/H5 支持图标、标题、按钮和跳转的一行运营引导条" },
  "rich-text": { label: "已支持", status: "supported", description: "小程序/H5 已支持富文本片段展示" },
  "safe-html": { label: "已支持", status: "supported", description: "小程序/H5 已支持安全图文片段展示" },
  "image-grid": { label: "已支持", status: "supported", description: "小程序/H5 已支持图片宫格展示" },
  video: { label: "已支持", status: "supported", description: "小程序/H5 支持视频播放、封面和禁用自动播放" },
  notice: { label: "已支持", status: "supported", description: "小程序/H5 已支持公告提示展示" },
  "stats-grid": { label: "已支持", status: "supported", description: "小程序/H5 已支持数字亮点展示" },
  "dual-track-tags": { label: "已支持", status: "supported", description: "小程序/H5 支持双行标签、右侧按钮和统一跳转配置" },
  "ticket-price-list": { label: "已支持", status: "supported", description: "小程序/H5 已支持票种价格文案展示" },
  "process-steps": { label: "已支持", status: "supported", description: "小程序/H5 已支持流程步骤展示" },
  "text-image": { label: "已支持", status: "supported", description: "小程序/H5 已支持图文介绍展示" },
  "download-list": { label: "已支持", status: "supported", description: "小程序/H5 支持资料链接打开或复制" },
  "live-card": { label: "已支持", status: "supported", description: "小程序/H5 支持直播信息、状态和链接打开或复制" },
  "testimonial-list": { label: "已支持", status: "supported", description: "小程序/H5 支持评价、姓名、单位和头像展示" },
  "traffic-guide": { label: "已支持", status: "supported", description: "小程序/H5 支持交通说明、地址复制和电话拨打" },
  "contact-card": { label: "已支持", status: "supported", description: "小程序/H5 已支持联系卡片展示" },
  "tag-filter": { label: "已支持", status: "supported", description: "小程序/H5 支持标签点击筛选会议" },
  title: { label: "已支持", status: "supported", description: "小程序/H5 已支持标题展示" },
  divider: { label: "已支持", status: "supported", description: "小程序/H5 已支持分割线展示" },
  spacer: { label: "已支持", status: "supported", description: "小程序/H5 已支持留白展示" },
  carousel: { label: "已支持", status: "supported", description: "小程序/H5 支持图片轮播展示" },
  "speaker-cards": { label: "已支持", status: "supported", description: "小程序/H5 支持嘉宾卡片展示" },
  "schedule-timeline": { label: "已支持", status: "supported", description: "小程序/H5 支持会议日程展示" },
  "coupon-card": { label: "已支持", status: "supported", description: "小程序/H5 支持优惠券领取和错误反馈" },
  countdown: { label: "已支持", status: "supported", description: "小程序/H5 支持目标时间倒计时和结束文案" },
  search: { label: "已支持", status: "supported", description: "小程序/H5 支持搜索输入和会议筛选跳转" },
  "map-contact": { label: "已支持", status: "supported", description: "小程序/H5 支持地址复制和电话拨打" },
  "sponsor-wall": { label: "已支持", status: "supported", description: "小程序/H5 支持赞助商 Logo 展示和链接复制" },
  faq: { label: "已支持", status: "supported", description: "小程序/H5 支持问答展开折叠" },
  "membership-benefits": { label: "已支持", status: "supported", description: "小程序/H5 支持会员权益展示和会员中心入口" },
  "user-profile-card": { label: "已支持", status: "supported", description: "小程序/H5 支持登录资料和未登录引导" },
  "my-order-list": { label: "已支持", status: "supported", description: "小程序/H5 支持报名和商城订单入口" },
  "mall-product-grid": { label: "已支持", status: "supported", description: "小程序/H5 支持真实商品展示和详情跳转" },
  "credential-header": { label: "已支持", status: "supported", description: "小程序/H5 报名凭证页支持报名状态、会议名称和报名号展示" },
  "credential-qr": { label: "已支持", status: "supported", description: "小程序/H5 报名凭证页支持真实二维码展示" },
  "credential-conference-info": { label: "已支持", status: "supported", description: "小程序/H5 报名凭证页支持会议时间、地点和票种展示" },
  "credential-attendee-info": { label: "已支持", status: "supported", description: "小程序/H5 报名凭证页支持参会人和微信用户信息展示" },
  "credential-payment-info": { label: "已支持", status: "supported", description: "小程序/H5 报名凭证页支持支付状态、金额、渠道和订单号展示" },
  "credential-form-summary": { label: "已支持", status: "supported", description: "小程序/H5 报名凭证页支持报名字段摘要展示" },
  "credential-checkin-info": { label: "已支持", status: "supported", description: "小程序/H5 报名凭证页支持签到状态和签到时间展示" },
  "credential-actions": { label: "已支持", status: "supported", description: "小程序/H5 报名凭证页支持签到、客户群、议程、指南、客服和日历入口" }
};

const ADDABLE_SUPPORT_STATUSES: CmsComponentSupportStatus[] = ["supported", "basic"];
const REGISTRATION_CTA_TYPES = ["registration-button", "floating-registration-button"];
const PAGE_TYPES_REQUIRING_CONFERENCE_UI = ["CONFERENCE_DETAIL_PAGE", "REGISTRATION_FORM_PAGE", "REGISTRATION_CREDENTIAL_PAGE"];
const DEFAULT_PREVIEW_THEME: ThemeConfig = {
  visualPreset: "business-blue",
  primaryColor: "#315d7d",
  secondaryColor: "#3a8f79",
  accentColor: "#b58b47",
  backgroundColor: "#f5f7f6",
  cardBackground: "#ffffff",
  radius: 8,
  buttonStyle: "solid",
  shadow: "soft",
  titleFontSize: 42,
  bannerStyle: "clean",
  backgroundMode: "solid",
  backgroundGradientFrom: "#fbfcfb",
  backgroundGradientTo: "#edf3f0",
  backgroundImageUrl: "",
  backgroundVideoUrl: "",
  backgroundVideoPosterUrl: "",
  backgroundVideoOverlayMode: "light",
  backgroundVideoOverlayOpacity: 0.08,
  backgroundDynamicDensity: 40,
  backgroundDynamicSpeed: 30,
  backgroundDynamicPattern: "flow",
  backgroundGradientAngle: 135,
  backgroundBottomFilter: true,
  backgroundApplyTo: "body",
  themeApplyMode: "all",
  themeApplyPageKeys: []
};

const DEFAULT_BUSINESS_MODULES: BusinessDisplayModule[] = [
  { key: "conferenceInfo", title: "会议信息", content: "", visible: true, sort: 10, style: "card" },
  { key: "assistant", title: "会议助手", content: "", visible: true, sort: 20, style: "card" },
  { key: "speakers", title: "嘉宾介绍", content: "", visible: true, sort: 30, style: "card" },
  { key: "schedule", title: "日程安排", content: "", visible: true, sort: 40, style: "card" },
  { key: "location", title: "会议地点", content: "", visible: true, sort: 50, style: "card" },
  { key: "skus", title: "报名规格", content: "", visible: true, sort: 60, style: "card" },
  { key: "inventory", title: "库存展示", content: "", visible: true, sort: 70, style: "compact" },
  { key: "guide", title: "参会指南", content: "", visible: true, sort: 80, style: "card" },
  { key: "customerService", title: "联系客服", content: "", visible: false, sort: 90, style: "compact" },
  { key: "customerGroup", title: "加入客户群", content: "", visible: false, sort: 100, style: "compact" },
  { key: "calendar", title: "添加到日历", content: "", visible: false, sort: 110, style: "compact" },
  { key: "registrationButton", title: "立即报名", content: "", visible: true, sort: 120, style: "accent" },
  { key: "shareButton", title: "分享会议", content: "分享给微信好友", visible: true, sort: 130, style: "compact" }
];

const BUSINESS_PAGE_MODULES: Record<string, BusinessDisplayModule[]> = {
  conferenceDetail: DEFAULT_BUSINESS_MODULES,
  registrationForm: [
    { key: "registrationInfo", title: "报名信息", content: "", visible: true, sort: 10, style: "card" },
    { key: "skuSelector", title: "选择报名规格", content: "", visible: true, sort: 20, style: "card" },
    { key: "couponFee", title: "优惠与费用", content: "", visible: true, sort: 30, style: "card" },
    { key: "attendeeForm", title: "参会人信息", content: "", visible: true, sort: 40, style: "card" },
    { key: "inventory", title: "库存展示", content: "", visible: true, sort: 50, style: "compact" },
    { key: "addCartButton", title: "加入购物车", content: "加入购物车", visible: true, sort: 60, style: "compact" },
    { key: "submitOrder", title: "提交订单", content: "提交订单", visible: true, sort: 70, style: "accent" },
    { key: "assistant", title: "会议助手", content: "", visible: false, sort: 80, style: "card" },
    { key: "customerService", title: "客服咨询", content: "", visible: false, sort: 90, style: "compact" }
  ],
  registrationCredential: [
    { key: "credentialHeader", title: "凭证头部", content: "", visible: true, sort: 10, style: "card" },
    { key: "credentialQr", title: "签到二维码", content: "", visible: true, sort: 20, style: "card" },
    { key: "conferenceInfo", title: "会议信息", content: "", visible: true, sort: 30, style: "card" },
    { key: "attendeeInfo", title: "参会人信息", content: "", visible: true, sort: 40, style: "card" },
    { key: "paymentInfo", title: "支付信息", content: "", visible: true, sort: 50, style: "card" },
    { key: "formSummary", title: "报名表单摘要", content: "", visible: true, sort: 60, style: "card" },
    { key: "checkinInfo", title: "签到信息", content: "", visible: true, sort: 70, style: "card" },
    { key: "actionButtons", title: "操作按钮", content: "", visible: true, sort: 80, style: "accent" },
    { key: "assistant", title: "会议助手", content: "", visible: false, sort: 90, style: "card" },
    { key: "customerService", title: "联系客服", content: "", visible: false, sort: 100, style: "compact" }
  ],
  myRegistrations: [
    { key: "listHeader", title: "我的报名", content: "", visible: true, sort: 10, style: "card" },
    { key: "statusTag", title: "状态标签", content: "", visible: true, sort: 20, style: "compact" },
    { key: "credentialEntry", title: "查看凭证", content: "查看凭证", visible: true, sort: 30, style: "compact" },
    { key: "refundEntry", title: "退款入口", content: "申请退款", visible: true, sort: 40, style: "compact" },
    { key: "checkinEntry", title: "签到入口", content: "去签到", visible: true, sort: 50, style: "compact" },
    { key: "emptyState", title: "空状态文案", content: "暂无报名记录", visible: true, sort: 60, style: "card" },
    { key: "customerService", title: "客服咨询", content: "", visible: false, sort: 70, style: "compact" }
  ],
  mallHome: [
    { key: "mallHeader", title: "商城首页头部", content: "", visible: true, sort: 10, style: "card" },
    { key: "banner", title: "商城 Banner", content: "", visible: true, sort: 20, style: "card" },
    { key: "quickGrid", title: "商城入口宫格", content: "", visible: true, sort: 30, style: "card" },
    { key: "categories", title: "商品分类", content: "", visible: true, sort: 40, style: "compact" },
    { key: "recommended", title: "推荐商品", content: "", visible: true, sort: 50, style: "card" },
    { key: "coupon", title: "优惠券入口", content: "", visible: false, sort: 60, style: "compact" },
    { key: "orderCenter", title: "订单中心", content: "", visible: true, sort: 70, style: "compact" },
    { key: "cart", title: "购物车", content: "", visible: true, sort: 80, style: "compact" },
    { key: "customerService", title: "客服咨询", content: "", visible: false, sort: 90, style: "compact" }
  ],
  productDetail: [
    { key: "productInfo", title: "商品信息", content: "", visible: true, sort: 10, style: "card" },
    { key: "cover", title: "商品封面", content: "", visible: true, sort: 20, style: "card" },
    { key: "price", title: "价格展示", content: "", visible: true, sort: 30, style: "compact" },
    { key: "skuSelector", title: "规格选择", content: "", visible: true, sort: 40, style: "card" },
    { key: "inventory", title: "库存展示", content: "", visible: true, sort: 50, style: "compact" },
    { key: "detail", title: "商品详情", content: "", visible: true, sort: 60, style: "card" },
    { key: "addCartButton", title: "加入购物车", content: "加入购物车", visible: true, sort: 70, style: "compact" },
    { key: "buyNowButton", title: "立即购买", content: "立即购买", visible: true, sort: 80, style: "accent" },
    { key: "aftersales", title: "售后说明", content: "", visible: true, sort: 90, style: "card" },
    { key: "customerService", title: "客服咨询", content: "", visible: false, sort: 100, style: "compact" }
  ],
  cart: [
    { key: "title", title: "页面标题", content: "购物车", visible: true, sort: 10, style: "capsule" },
    { key: "couponNotice", title: "优惠券提示", content: "选择已领取的商品券或通用券", visible: true, sort: 20, style: "bar" },
    { key: "cartItems", title: "商品与报名项", content: "", visible: true, sort: 30, style: "card" },
    { key: "registrationItems", title: "会议报名商品", content: "报名支付沿用现有安全订单链路", visible: true, sort: 40, style: "card" },
    { key: "mallItems", title: "商城商品", content: "商品可创建待支付订单，订单页完成支付", visible: true, sort: 50, style: "card" },
    { key: "shippingInfo", title: "收货信息", content: "用于实物商品配送", visible: true, sort: 60, style: "card" },
    { key: "productCoupons", title: "商品优惠券", content: "选择已领取的商品券或通用券，结算时由后端重新计算抵扣。", visible: true, sort: 70, style: "card" },
    { key: "checkoutBar", title: "底部结算条", content: "去结算", visible: true, sort: 80, style: "sticky" },
    { key: "emptyState", title: "空状态", content: "购物车还没有内容", visible: true, sort: 90, style: "card" },
    { key: "recommendations", title: "推荐商品", content: "去商城逛逛", visible: true, sort: 100, style: "card" },
    { key: "customerService", title: "客服入口", content: "联系客服", visible: false, sort: 110, style: "compact" }
  ],
  cartCheckout: [
    { key: "title", title: "页面标题", content: "购物车", visible: true, sort: 10, style: "capsule" },
    { key: "couponNotice", title: "优惠券提示", content: "选择已领取的商品券或通用券", visible: true, sort: 20, style: "bar" },
    { key: "cartItems", title: "商品与报名项", content: "", visible: true, sort: 30, style: "card" },
    { key: "registrationItems", title: "会议报名商品", content: "报名支付沿用现有安全订单链路", visible: true, sort: 40, style: "card" },
    { key: "mallItems", title: "商城商品", content: "商品可创建待支付订单，订单页完成支付", visible: true, sort: 50, style: "card" },
    { key: "shippingInfo", title: "收货信息", content: "用于实物商品配送", visible: true, sort: 60, style: "card" },
    { key: "productCoupons", title: "商品优惠券", content: "选择已领取的商品券或通用券，结算时由后端重新计算抵扣。", visible: true, sort: 70, style: "card" },
    { key: "checkoutBar", title: "底部结算条", content: "去结算", visible: true, sort: 80, style: "sticky" },
    { key: "emptyState", title: "空状态", content: "购物车还没有内容", visible: true, sort: 90, style: "card" },
    { key: "recommendations", title: "推荐商品", content: "去商城逛逛", visible: true, sort: 100, style: "card" },
    { key: "customerService", title: "客服入口", content: "联系客服", visible: false, sort: 110, style: "compact" }
  ],
  mallOrders: [
    { key: "orderList", title: "订单列表", content: "", visible: true, sort: 10, style: "card" },
    { key: "statusFilter", title: "状态筛选", content: "", visible: true, sort: 20, style: "compact" },
    { key: "aftersalesEntry", title: "售后入口", content: "申请售后", visible: true, sort: 30, style: "compact" },
    { key: "invoiceEntry", title: "发票入口", content: "申请发票", visible: true, sort: 40, style: "compact" },
    { key: "emptyState", title: "空订单文案", content: "暂无商城订单", visible: true, sort: 50, style: "card" },
    { key: "customerService", title: "客服咨询", content: "", visible: false, sort: 60, style: "compact" }
  ],
  memberCenter: [
    { key: "memberProfile", title: "用户卡片", content: "", visible: true, sort: 10, style: "card" },
    { key: "level", title: "会员等级", content: "", visible: true, sort: 20, style: "card" },
    { key: "benefitList", title: "会员权益", content: "", visible: true, sort: 30, style: "card" },
    { key: "memberPricing", title: "会员价说明", content: "会员价由后端 quote/create order 计算", visible: true, sort: 40, style: "card" },
    { key: "registrations", title: "我的报名", content: "", visible: true, sort: 50, style: "compact" },
    { key: "orders", title: "商城订单", content: "", visible: true, sort: 60, style: "compact" },
    { key: "invoice", title: "发票申请", content: "", visible: true, sort: 70, style: "compact" },
    { key: "aftersales", title: "售后申请", content: "", visible: true, sort: 80, style: "compact" },
    { key: "customerService", title: "客服咨询", content: "", visible: false, sort: 90, style: "compact" }
  ],
  invoice: [
    { key: "invoiceableOrders", title: "可开票订单", content: "", visible: true, sort: 10, style: "card" },
    { key: "invoiceProfile", title: "发票抬头", content: "", visible: true, sort: 20, style: "card" },
    { key: "invoiceForm", title: "开票信息表单", content: "", visible: true, sort: 30, style: "card" },
    { key: "submitButton", title: "提交申请", content: "提交发票申请", visible: true, sort: 40, style: "accent" },
    { key: "emptyState", title: "空状态文案", content: "暂无可开票订单", visible: true, sort: 50, style: "card" },
    { key: "customerService", title: "客服咨询", content: "", visible: false, sort: 60, style: "compact" }
  ],
  aftersale: [
    { key: "aftersaleInfo", title: "售后说明", content: "", visible: true, sort: 10, style: "card" },
    { key: "orderProduct", title: "订单商品信息", content: "", visible: true, sort: 20, style: "card" },
    { key: "reason", title: "售后原因", content: "", visible: true, sort: 30, style: "card" },
    { key: "imageUpload", title: "凭证上传", content: "", visible: true, sort: 40, style: "card" },
    { key: "submitButton", title: "提交申请", content: "提交售后申请", visible: true, sort: 50, style: "accent" },
    { key: "customerService", title: "客服咨询", content: "", visible: false, sort: 60, style: "compact" }
  ]
};

const BUSINESS_MODULE_GUIDES: Record<string, BusinessModuleGuide> = {
  conferenceInfo: {
    source: "会议管理中的标题、时间、地点、状态和报名时间",
    entry: "会议管理 -> 会议配置",
    effect: "用户端始终展示真实会议基础信息，页面装修只控制标题和展示顺序。",
    defaultStatus: "configured"
  },
  assistant: {
    source: "AI 知识库、会议资料和当前页面助手显示开关",
    entry: "AI 知识库 -> 会议知识库；或当前页面装修 -> 会议助手",
    effect: "未启用 AI 时不展示无效入口；选择隐藏后用户端不显示。",
    defaultStatus: "default"
  },
  speakers: {
    source: "会议内容配置中的嘉宾介绍，或当前模块自定义说明",
    entry: "会议管理 -> 内容维护；或当前页面装修模块",
    effect: "未配置时显示主办方维护提示，也可在当前模块覆盖文案。",
    defaultStatus: "default"
  },
  schedule: {
    source: "会议内容配置中的日程安排，或当前模块自定义说明",
    entry: "会议管理 -> 内容维护；或当前页面装修模块",
    effect: "未配置时显示主办方维护提示，也可在当前模块覆盖文案。",
    defaultStatus: "default"
  },
  location: {
    source: "会议地点和当前模块说明",
    entry: "会议管理 -> 会议配置 -> 会议地点；或当前页面装修模块",
    effect: "用户端展示真实会议地点，未配置地点时显示待公布提示。",
    defaultStatus: "configured"
  },
  skus: {
    source: "会议票种、价格和报名库存",
    entry: "会议管理 -> 票种规格",
    effect: "用户端按后端实时票种和库存展示，页面装修不改金额。",
    defaultStatus: "configured"
  },
  inventory: {
    source: "票种剩余库存和当前页面库存展示方式",
    entry: "会议管理 -> 票种规格；或当前页面装修 -> 库存展示方式",
    effect: "可显示库存状态、精确库存或隐藏，真实库存仍来自后端。",
    defaultStatus: "configured"
  },
  guide: {
    source: "参会指南自定义内容或会议资料",
    entry: "会议管理 -> 内容维护 -> 参会指南；或当前页面装修模块",
    effect: "未配置时显示默认提示；运营可选择隐藏。",
    defaultStatus: "default"
  },
  title: {
    source: "当前页面装修的购物车标题配置",
    entry: "页面装修 -> 固定业务模块 -> 页面标题",
    effect: "控制小程序购物车顶部标题胶囊是否显示，以及标题文案。",
    defaultStatus: "configured"
  },
  couponNotice: {
    source: "当前页面装修的购物车优惠券提示配置",
    entry: "页面装修 -> 固定业务模块 -> 优惠券提示",
    effect: "控制购物车顶部优惠券提示条是否展示。",
    defaultStatus: "default"
  },
  cartItems: {
    source: "当前登录用户购物车中的报名项和商城商品项",
    entry: "用户在报名页或商品页加入购物车；当前页面装修控制显示隐藏。",
    effect: "隐藏后用户端不显示报名商品列表和商城商品列表，但不改变购物车数据。",
    defaultStatus: "configured"
  },
  registrationItems: {
    source: "当前登录用户购物车中的会议报名项",
    entry: "会议报名页 -> 加入购物车；当前页面装修控制显示隐藏。",
    effect: "隐藏后用户端不显示会议报名商品块，支付链路不变。",
    defaultStatus: "configured"
  },
  mallItems: {
    source: "当前登录用户购物车中的商城商品项",
    entry: "商城商品页 -> 加入购物车；当前页面装修控制显示隐藏。",
    effect: "隐藏后用户端不显示商城商品块，商城订单创建逻辑不变。",
    defaultStatus: "configured"
  },
  shippingInfo: {
    source: "当前用户填写或保存的常用收货信息",
    entry: "购物车页收货信息；当前页面装修控制显示隐藏。",
    effect: "控制实物商品收货信息区域是否显示，隐藏不改变后端订单校验。",
    defaultStatus: "configured"
  },
  productCoupons: {
    source: "当前登录用户可用商城优惠券",
    entry: "营销活动 -> 优惠券；当前页面装修控制显示隐藏。",
    effect: "控制商品优惠券选择卡片是否显示，实际抵扣仍由后端结算重算。",
    defaultStatus: "configured"
  },
  checkoutBar: {
    source: "当前购物车勾选项和后端返回的购物车金额",
    entry: "购物车页底部结算条；当前页面装修控制显示隐藏。",
    effect: "控制底部全选、合计和去结算按钮是否显示，不改变订单金额计算。",
    defaultStatus: "configured"
  },
  recommendations: {
    source: "商城推荐商品或当前页面装修推荐入口",
    entry: "商城商品管理；或当前页面装修模块",
    effect: "控制空白区或列表下方的推荐商品入口是否显示。",
    defaultStatus: "default"
  },
  customerService: {
    source: "客服手机号、客服链接或当前模块说明",
    entry: "系统配置 / 会务联系方式；或当前页面装修模块",
    effect: "默认隐藏，未配置联系方式时不会展示无效按钮。",
    defaultStatus: "unconfigured"
  },
  customerGroup: {
    source: "企微客户群绑定、自定义群二维码或自定义链接",
    entry: "企微客户群 -> 群绑定会议；或当前页面装修模块",
    effect: "默认隐藏，未绑定客户群时不展示无效入口。",
    defaultStatus: "unconfigured"
  },
  calendar: {
    source: "会议时间、地点和标题",
    entry: "会议管理 -> 会议配置；或当前页面装修模块",
    effect: "默认隐藏，启用后按真实会议信息生成日历提示。",
    defaultStatus: "unconfigured"
  },
  registrationButton: {
    source: "会议报名状态、票种库存和页面按钮文案",
    entry: "会议管理 -> 报名配置；或当前页面装修 -> 底部报名按钮文案",
    effect: "按钮会进入真实报名页，未到报名时间或售罄时显示后端状态。",
    defaultStatus: "configured"
  },
  shareButton: {
    source: "页面分享标题、分享封面和会议信息",
    entry: "当前页面装修 -> 页面设置 -> 分享信息",
    effect: "用户端使用小程序分享能力；不支持的端仅展示提示。",
    defaultStatus: "default"
  }
};

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
const fixedTemplateVisible = ref(false);
const saveTemplateVisible = ref(false);
const templatePreviewVisible = ref(false);
const templatePreview = ref<PageLibraryTemplate | null>(null);
const createForm = reactive({ slug: "", title: "", description: "", templateId: "", pageType: "CUSTOM", conferenceId: "", productId: "" });
const saveTemplateForm = reactive({ slug: "", title: "", category: "自定义模板", description: "" });
const presetKeyword = ref("");
const activePresetGroup = ref("all");
const previewPlatform = ref<"miniapp" | "h5">("miniapp");
const previewUserMode = ref<"guest" | "member">("member");
const selectedComponentId = ref("");
const inspectorTab = ref<"component" | "page">("component");
const publishPanelVisible = ref(false);
const isDirty = ref(false);
const lastSavedAt = ref<Date | null>(null);
const expandedEntryIds = ref<string[]>([]);
const expandedRichBlockIds = ref<string[]>([]);
const draggingComponentId = ref("");
const templateKeyword = ref("");
const templateCategory = ref("全部");
const previewTheme = reactive<ThemeConfig>({ ...DEFAULT_PREVIEW_THEME });
const materialVisible = ref(false);
const materialLoading = ref(false);
const materialKeyword = ref("");
const materialAssets = ref<MaterialAsset[]>([]);
const materialTarget = ref<{ component: EditableComponent; field: ConfigField } | null>(null);
const materialPageTarget = ref<keyof PageMetaForm | null>(null);
const materialEntryTarget = ref<{ component: EditableComponent; entry: EntryConfigItem; key: "iconUrl" | "dynamicIconUrl" } | null>(null);
const materialRichBlockTarget = ref<{ component: EditableComponent; block: RichContentBlockItem } | null>(null);
const previewConferences = ref<Conference[]>([]);
const previewTabbar = ref<TabBarConfig | null>(null);
const couponCampaignOptions = ref<CouponCampaign[]>([]);
const productCategoryOptions = ref<ProductCategory[]>([]);
const productOptions = ref<Product[]>([]);
const pageTypeOptions = [
  { label: "普通页面", value: "CUSTOM" },
  { label: "会议首页", value: "HOME" },
  { label: "会议报名页", value: "REGISTRATION_FORM" },
  { label: "指定会议报名页", value: "REGISTRATION_FORM_PAGE" },
  { label: "报名凭证页", value: "REGISTRATION_CREDENTIAL" },
  { label: "指定报名凭证页", value: "REGISTRATION_CREDENTIAL_PAGE" },
  { label: "用户页", value: "USER" },
  { label: "商城下单/购物车页", value: "MALL_CHECKOUT" },
  { label: "商城首页", value: "MALL" },
  { label: "商城订单/售后申请页", value: "MALL_AFTERSALE" },
  { label: "发票申请页", value: "INVOICE" },
  { label: "会议详情模板", value: "CONFERENCE_DETAIL_TEMPLATE" },
  { label: "指定会议详情页", value: "CONFERENCE_DETAIL_PAGE" },
  { label: "商品详情模板", value: "PRODUCT_DETAIL_TEMPLATE" },
  { label: "指定商品详情页", value: "PRODUCT_DETAIL_PAGE" }
];
const FIXED_TEMPLATE_ASSET_ROOT = "/static/fixed-templates";
const fixedBusinessTemplateOptions: FixedBusinessTemplateOption[] = [
  {
    key: "fixed-home",
    kind: "home",
    name: "观潮首页结构",
    pageTitle: "观潮会集",
    shareTitle: "欢迎来到观潮会集",
    heroTitle: "潮起谋局  潮落定势",
    heroSubtitle: "行业会议与创始人社群平台",
    noticeText: "欢迎来到观潮会集，查看年度排期、会议报名与会员权益。"
  },
  {
    key: "fixed-schedule",
    kind: "schedule",
    name: "年度排期结构",
    pageTitle: "年度排期",
    shareTitle: "观潮会集全年会议安排",
    heroTitle: "年度排期",
    heroSubtitle: "查看观潮会集全年会议安排"
  },
  {
    key: "fixed-registration",
    kind: "registration",
    name: "会议报名结构",
    pageTitle: "会议报名",
    shareTitle: "选择感兴趣的会议，快速报名参与",
    heroTitle: "会议报名",
    heroSubtitle: "选择感兴趣的会议，快速报名参与"
  },
  {
    key: "fixed-mall",
    kind: "mall",
    name: "商城首页结构",
    pageTitle: "会议周边商城",
    shareTitle: "精选会议周边与品牌物料",
    heroTitle: "会议周边商城",
    heroSubtitle: "精选会议周边与品牌物料"
  },
  {
    key: "fixed-cart",
    kind: "cart",
    name: "购物车结构",
    pageTitle: "购物车",
    shareTitle: "观潮会集购物车",
    heroTitle: "购物车",
    heroSubtitle: "已选商品、优惠券和结算信息都可按模块显隐控制"
  },
  {
    key: "fixed-member-center",
    kind: "member-center",
    name: "会员中心结构",
    pageTitle: "我的",
    shareTitle: "观潮会集会员中心",
    heroTitle: "会员中心",
    heroSubtitle: "查看报名、订单、优惠券和会员权益",
    growthValue: "2568"
  }
];
const quickModuleDefinitions = BUSINESS_MODULE_DEFINITIONS;
const loadedPreviewFonts = new Set<string>();
const materialPickerSpecKey = computed<MaterialSpecKey>(() => {
  if (materialRichBlockTarget.value) return "contentImage";
  if (materialEntryTarget.value) return materialEntryTarget.value.key === "dynamicIconUrl" ? "animatedIcon" : "tabbarIcon";
  if (materialPageTarget.value) return pageMetaMaterialSpecKey(materialPageTarget.value);
  const target = materialTarget.value;
  return target ? materialSpecKeyForField(target.component.type, target.field) ?? "materialUpload" : "materialUpload";
});
const materialPickerSpecText = computed(() => materialSpecText(materialSpecs[materialPickerSpecKey.value]));
const materialPickerKind = computed<"image" | "video" | "file" | "font">(() => {
  if (materialRichBlockTarget.value) return "image";
  if (materialEntryTarget.value) return "image";
  if (materialPageTarget.value) return "image";
  const target = materialTarget.value;
  if (!target) return "image";
  if (isFontField(target.field)) return "font";
  if (isVideoField(target.component.type, target.field)) return "video";
  if (isDownloadListField(target.component.type, target.field)) return "file";
  return "image";
});
const materialDialogTitle = computed(() => {
  const map = {
    image: "选择图片素材",
    video: "选择视频素材",
    file: "选择资料文件",
    font: "选择字体文件"
  } as const;
  return map[materialPickerKind.value];
});

function pageMetaMaterialSpecKey(key: keyof PageMetaForm): MaterialSpecKey {
  if (key === "navLogoUrl" || key === "navLogoDynamicUrl") return "topTitleLogo";
  return "shareCover";
}
const materialEmptyText = computed(() => {
  const map = {
    image: "暂无可用图片素材，请先到素材管理上传图片",
    video: "暂无可用视频素材，请先到素材管理上传 MP4",
    file: "暂无可用资料文件，请先到素材管理上传 PDF 或图片",
    font: "暂无字体素材，请先到素材管理上传字体文件"
  } as const;
  return map[materialPickerKind.value];
});
const expandedComponentIds = ref<string[]>([]);
const expandedConfigGroupIds = reactive<Record<string, string[]>>({});
const pageMeta = reactive<PageMetaForm>({ pageTitle: "", navLogoUrl: "", navLogoDynamicUrl: "", shareTitle: "", shareDescription: "", shareImageUrl: "" });
const businessDisplay = reactive<BusinessDisplayForm>(defaultBusinessDisplay());
const history = ref<EditorSnapshot[]>([]);
const historyIndex = ref(-1);
const canUndo = computed(() => historyIndex.value > 0);
const canRedo = computed(() => historyIndex.value >= 0 && historyIndex.value < history.value.length - 1);
const saveStateText = computed(() => {
  if (saving.value) return "正在保存";
  if (isDirty.value) return "有未保存修改";
  if (lastSavedAt.value) {
    return `${lastSavedAt.value.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })} 已保存`;
  }
  return "已保存";
});
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let historyTimer: ReturnType<typeof setTimeout> | undefined;
let editorReady = false;
let applyingSnapshot = false;

const presetGroups = computed(() => {
  const groups = new Map<string, ComponentPreset[]>();
  for (const preset of presets.value.filter((item) => item.enabled)) {
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
const visiblePresets = computed(() => {
  const keyword = presetKeyword.value.trim().toLocaleLowerCase("zh-CN");
  return presets.value
    .filter((preset) => preset.enabled)
    .filter((preset) => activePresetGroup.value === "all" || preset.group === activePresetGroup.value)
    .filter((preset) => !keyword || `${preset.name} ${preset.description || ""} ${preset.group}`.toLocaleLowerCase("zh-CN").includes(keyword));
});

const componentLibraryStats = computed(() => ({
  total: presets.value.filter((preset) => preset.enabled).length,
  supported: presets.value.filter((preset) => canAddPreset(preset)).length
}));
const activePresetGroupMeta = computed(() => {
  const items = activePresetGroup.value === "all"
    ? presetGroups.value.flatMap((item) => item.items)
    : filteredPresetGroups.value.find((item) => item.name === activePresetGroup.value)?.items ?? [];
  return {
    count: items.length,
    supported: items.filter((preset) => canAddPreset(preset)).length
  };
});
const unsupportedEnabledComponents = computed(() =>
  components.value.filter((item) => item.enabled && ["unsupported", "planned"].includes(componentSupport(item.type).status))
);
const basicEnabledComponents = computed(() => components.value.filter((item) => item.enabled && componentSupport(item.type).status === "basic"));
const componentOptions = computed(() =>
  components.value.map((component, index) => ({
    label: `${index + 1}. ${presetName(component.type)} · ${componentSupport(component.type).label}${component.enabled ? "" : "（已隐藏）"}`,
    value: component.id
  }))
);
const selectedComponent = computed(() => components.value.find((component) => component.id === selectedComponentId.value) ?? null);
const selectedComponentIndex = computed(() => components.value.findIndex((component) => component.id === selectedComponentId.value));
const selectedPageDisplayTitle = computed(() => (selectedPage.value ? pageDisplayTitle(selectedPage.value) : "页面装修"));
const previewTitle = computed(() => pageMeta.pageTitle.trim() || selectedPageDisplayTitle.value || "会议报名");
const previewTitleLogoUrl = computed(() => pageMeta.navLogoDynamicUrl.trim() || pageMeta.navLogoUrl.trim());
const previewTabbarItems = computed(() => (previewTabbar.value?.enabled === false ? [] : (previewTabbar.value?.items ?? []).filter((item) => item.visible).sort((a, b) => a.sortOrder - b.sortOrder)));
const previewStats = computed(() => {
  const total = components.value.length;
  const visible = components.value.filter((component) => component.enabled).length;
  const unsupported = components.value.filter((component) => component.enabled && ["unsupported", "planned"].includes(componentSupport(component.type).status)).length;
  return {
    total,
    visible,
    hidden: Math.max(0, total - visible),
    unsupported
  };
});
const previewPlatformName = computed(() => (previewPlatform.value === "miniapp" ? "微信小程序" : "H5 页面"));
const previewViewportLabel = computed(() => (previewPlatform.value === "miniapp" ? " · 375x812 预览" : " · 移动 H5 预览"));
const previewRouteHint = computed(() => {
  const route = previewRouteForPage(selectedPage.value);
  return previewPlatform.value === "miniapp" ? route.miniapp : route.h5;
});
const runtimePreviewUrl = computed(() => {
  const configured = String(import.meta.env.VITE_CMS_RUNTIME_PREVIEW_URL || "").trim();
  if (configured) return configured;
  return import.meta.env.DEV
    ? "http://localhost:5173/#/pages/cms-preview/index"
    : "https://m.guanchaohuiji.com/#/pages/cms-preview/index";
});
const runtimePreviewUserContext = computed<Record<string, unknown> | null>(() => previewUserMode.value === "member"
  ? { loggedIn: true, userId: "cms-preview-user", ...SAMPLE_USER_CONTEXT }
  : { loggedIn: false });
const runtimePreviewPayload = computed(() => ({
  platform: previewPlatform.value,
  dsl: dslFromComponents(selectedPage.value?.pageKey ?? "cms-preview"),
  theme: { ...previewTheme },
  conferences: previewContextConferences.value.map(toRuntimePreviewConference),
  products: productOptions.value,
  userContext: runtimePreviewUserContext.value,
  selectedComponentId: selectedComponentId.value
}));
const requiresCreateConference = computed(() => PAGE_TYPES_REQUIRING_CONFERENCE_UI.includes(createForm.pageType));
const createConferenceBindingHelp = computed(() => {
  if (createForm.pageType === "REGISTRATION_FORM_PAGE") return "指定会议报名页只对所选会议生效；未命中时用户端会回退会议报名通用页。";
  if (createForm.pageType === "REGISTRATION_CREDENTIAL_PAGE") return "指定报名凭证页只对所选会议的报名凭证生效；未命中时用户端会回退报名凭证通用页。";
  return "指定会议详情页只对所选会议生效；未命中时用户端会回退会议详情通用模板。";
});
const selectedBoundConference = computed(() => {
  const conferenceId = selectedPage.value?.conferenceId;
  return conferenceId ? previewConferences.value.find((item) => item.id === conferenceId) ?? null : null;
});
const selectedBoundProduct = computed(() => {
  const productId = selectedPage.value?.productId;
  return productId ? productOptions.value.find((item) => item.id === productId) ?? null : null;
});
const previewContextConferences = computed(() => {
  if (selectedBoundConference.value) return [selectedBoundConference.value];
  if (selectedPage.value && isConferenceContextPage(selectedPage.value)) return previewConferences.value.slice(0, 1);
  return previewConferences.value;
});
const selectedPageContextText = computed(() => (selectedPage.value ? pageContextText(selectedPage.value) : "未选择页面"));
const showBusinessDisplayEditor = computed(() => {
  const page = selectedPage.value;
  return Boolean(page && businessDisplayKeyForPage(page));
});
const businessDisplayStats = computed(() => {
  const total = businessDisplay.modules.length;
  const visible = businessDisplay.modules.filter((module) => module.visible).length;
  return {
    total,
    visible,
    hidden: Math.max(0, total - visible)
  };
});
const selectedComponentParityContract = computed(() => componentParityContract(selectedComponent.value?.type));
const acceptanceChecks = computed<AcceptanceCheck[]>(() => buildAcceptanceChecks());
const acceptanceSummary = computed(() =>
  acceptanceChecks.value.reduce(
    (summary, check) => {
      summary[check.status] += 1;
      return summary;
    },
    { pass: 0, warn: 0, error: 0 } as Record<AcceptanceStatus, number>
  )
);
const shopWorkbenchCards = computed<ShopWorkbenchCard[]>(() => [
  {
    key: "decorate",
    index: "01",
    title: "店铺装修",
    subtitle: "当前页面装修、组件编排和手机预览",
    meta: `${previewStats.value.visible}/${previewStats.value.total} 展示`,
    action: "decorate",
    active: true
  },
  {
    key: "templates",
    index: "02",
    title: "页面模板",
    subtitle: "首页、排期、商城、会员和自定义模板",
    meta: `${libraryTemplates.value.length} 个模板`,
    action: "templates"
  },
  {
    key: "theme",
    index: "03",
    title: "店铺主题",
    subtitle: "主题色、圆角、背景、按钮和品牌视觉",
    meta: previewTheme.primaryColor || "主题色",
    action: "theme"
  },
  {
    key: "tabbar",
    index: "04",
    title: "底部导航",
    subtitle: "小程序/H5 底部入口和业务页绑定",
    meta: `${previewTabbarItems.value.length} 个入口`,
    action: "tabbar"
  },
  {
    key: "materials",
    index: "05",
    title: "素材管理",
    subtitle: "图片、图标、视频、文件和字体素材",
    meta: "统一素材库",
    action: "materials"
  },
  {
    key: "subject",
    index: "06",
    title: "店铺主体",
    subtitle: "主体名称、Logo、分享信息和页面元数据",
    meta: shopSubjectChecklist.value.filter((item) => item.done).length + "/4 已配",
    action: "subject"
  }
]);
const shopSubjectChecklist = computed(() => [
  { key: "title", label: "主体名称", done: Boolean(previewTitle.value.trim()) },
  { key: "logo", label: "顶部 Logo", done: Boolean(previewTitleLogoUrl.value.trim()) },
  { key: "shareTitle", label: "分享标题", done: Boolean(pageMeta.shareTitle.trim()) },
  { key: "shareImage", label: "分享封面", done: Boolean(pageMeta.shareImageUrl.trim()) }
]);
const previewContextHint = computed(() => {
  const page = selectedPage.value;
  if (!page) return "";
  if (selectedBoundConference.value) {
    return `${pageDisplayTitle(page)} · 预览数据来自会议“${selectedBoundConference.value.title}”，小程序会按 conferenceId 优先读取该页面。`;
  }
  if (isConferenceContextPage(page)) {
    const sample = previewContextConferences.value[0];
    return `${pageDisplayTitle(page)} · 未绑定具体会议，发布后作为通用模板；预览使用${sample ? `“${sample.title}”` : "示例会议"}上下文。`;
  }
  if (selectedBoundProduct.value) {
    return `${pageDisplayTitle(page)} · 预览数据来自商品“${selectedBoundProduct.value.title}”，小程序会按 productId 优先读取该页面。`;
  }
  if (page.bindingType === "PRODUCT_TEMPLATE") {
    return `${pageDisplayTitle(page)} · 未绑定具体商品，发布后作为商品详情通用模板。`;
  }
  return "";
});
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
const templatePreviewComponents = computed(() => componentsFromTemplate(templatePreview.value));
const previewStyle = computed(() => ({
  "--preview-primary": previewTheme.primaryColor,
  "--preview-secondary": previewTheme.secondaryColor,
  "--preview-bg": previewBodyBackground(previewTheme),
  "--preview-page-bg": previewBodyBackground(previewTheme),
  "--preview-card": previewTheme.cardBackground,
  "--preview-radius": `${previewTheme.radius}px`
}));
const templatePreviewStyle = computed(() => ({
  "--preview-primary": previewTheme.primaryColor,
  "--preview-secondary": previewTheme.secondaryColor,
  "--preview-bg": templateBackgroundColor(templatePreview.value) || previewBodyBackground(previewTheme),
  "--preview-page-bg": templateBackgroundColor(templatePreview.value) || previewBodyBackground(previewTheme),
  "--preview-card": previewTheme.cardBackground,
  "--preview-radius": `${previewTheme.radius}px`
}));
const previewShowDynamicBackground = computed(() => previewTheme.backgroundMode === "dynamic-gradient" && previewTheme.backgroundApplyTo !== "header");

watch(
  filteredPresetGroups,
  (groups) => {
    if (!groups.some((group) => group.name === activePresetGroup.value)) {
      activePresetGroup.value = preferredPresetGroup(groups);
    }
  },
  { immediate: true }
);

watch(components, installPreviewFonts, { deep: true });
watch(
  [components, pageMeta, businessDisplay, versionTitle],
  () => {
    if (!editorReady || applyingSnapshot) return;
    isDirty.value = true;
    scheduleHistorySnapshot();
    scheduleAutosave();
  },
  { deep: true }
);

onMounted(async () => {
  window.addEventListener("keydown", handleEditorShortcut);
  const [presetResponse, conferenceResponse, tabbarResponse, campaignResponse, categoryResponse, productResponse, themeResponse] = await Promise.all([
    listComponentPresets(),
    listConferences({ page: 1, pageSize: 100, status: "PUBLISHED" }).catch(() => ({ items: [] as Conference[] })),
    getTabbar().catch(() => null),
    listCouponCampaigns({ page: 1, pageSize: 100 }).catch(() => ({ items: [] as CouponCampaign[] })),
    getProductCategoryOptions().catch(() => ({ items: [] as ProductCategory[] })),
    getProductOptions().catch(() => ({ items: [] as Product[] })),
    getTheme().catch(() => null)
  ]);
  presets.value = presetResponse.items;
  previewConferences.value = conferenceResponse.items;
  previewTabbar.value = tabbarResponse;
  couponCampaignOptions.value = campaignResponse.items;
  productCategoryOptions.value = categoryResponse.items;
  productOptions.value = productResponse.items;
  if (themeResponse?.config) {
    Object.assign(previewTheme, { ...DEFAULT_PREVIEW_THEME, ...themeResponse.config });
  }
  activePresetGroup.value = preferredPresetGroup(presetGroups.value);
  await Promise.all([loadPages(), loadLibraryTemplates()]);
});

function preferredPresetGroup(groups: Array<{ name: string }>): string {
  return groups.length > 0 ? "all" : "";
}

function resetComponentLibraryFilters(): void {
  presetKeyword.value = "";
  activePresetGroup.value = "all";
}

function toRuntimePreviewConference(item: Conference): Record<string, unknown> {
  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    summary: item.subtitle || "查看会议详情、时间地点与报名信息",
    coverImageUrl: item.coverImage,
    location: item.location,
    startsAt: item.startAt,
    endsAt: item.endAt,
    registrationStartsAt: item.startAt,
    registrationEndsAt: item.endAt,
    registrationCount: item.counts?.registrations ?? 0
  };
}

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleEditorShortcut);
  if (autosaveTimer) clearTimeout(autosaveTimer);
  if (historyTimer) clearTimeout(historyTimer);
});

async function loadPages() {
  pages.value = (await listPages()).items;
  if (selectedPage.value) {
    const refreshed = pages.value.find((item) => item.id === selectedPage.value?.id);
    if (refreshed) {
      selectedPage.value = refreshed;
      return;
    }
    selectedPage.value = null;
  }
  if (!selectedPage.value && pages.value[0]) {
    const target =
      pages.value.find((item) => item.id === routeQuery.value.pageId) ??
      pages.value.find((item) => item.pageKey === routeQuery.value.pageKey) ??
      pages.value[0];
    await selectPage(target);
  }
}

async function loadLibraryTemplates() {
  libraryTemplates.value = (await listPageLibraryTemplates()).items;
}

async function selectPage(page: PageTemplate) {
  editorReady = false;
  selectedPage.value = page;
  const latest = page.versions[0];
  if (!latest) {
    version.value = null;
    return;
  }
  version.value = await getPageVersion(latest.id);
  versionTitle.value = version.value.title;
  components.value = componentsFromVersion(version.value);
  applyPageMeta(version.value.themeJson, page.title);
  expandedComponentIds.value = components.value[0] ? [components.value[0].id] : [];
  selectedComponentId.value = components.value[0]?.id ?? "";
  initializeConfigGroups(components.value);
  inspectorTab.value = selectedComponentId.value ? "component" : "page";
  resetEditorHistory();
  isDirty.value = false;
  lastSavedAt.value = new Date(version.value.updatedAt);
  await nextTick();
  editorReady = true;
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

function componentsFromVersion(pageVersion: PageVersion | null | undefined): EditableComponent[] {
  if (!pageVersion) return [];
  const dslComponents = componentsFromDsl(pageVersion.dsl);
  if (dslComponents.length > 0) return dslComponents;
  if (Array.isArray(pageVersion.components) && pageVersion.components.length > 0) {
    return expandLegacyEditorComponents(pageVersion.components.map(toEditableComponent));
  }
  return [];
}

function componentsFromTemplate(template: PageLibraryTemplate | null | undefined): EditableComponent[] {
  const pageVersion = template?.version;
  if (!pageVersion) return [];
  const dslComponents = componentsFromDsl(pageVersion.dsl);
  if (dslComponents.length > 0) return dslComponents;
  if (Array.isArray(pageVersion.components) && pageVersion.components.length > 0) {
    return expandLegacyEditorComponents(pageVersion.components.map(toEditableComponent));
  }
  return [];
}

function componentsFromDsl(dsl: PageDsl | undefined): EditableComponent[] {
  const metaComponents = readRecord(dsl?.meta?.editorComponents);
  const metaItems = Array.isArray(dsl?.meta?.editorComponents) ? dsl?.meta?.editorComponents : Array.isArray(metaComponents.items) ? metaComponents.items : [];
  if (Array.isArray(metaItems) && metaItems.length > 0) {
    return expandLegacyEditorComponents(metaItems.map((item, index) => toEditableComponent(normalizeCmsComponent(item, index))));
  }
  const nodes = dsl?.dsl.nodes ?? [];
  return expandLegacyEditorComponents(nodes.map((node, index) => componentFromDslNode(node, index)).filter((item): item is EditableComponent => Boolean(item)));
}

function expandLegacyEditorComponents(items: EditableComponent[]): EditableComponent[] {
  return items
    .flatMap((item) => item.type === "fixed-business-template"
      ? expandLegacyCmsTemplate(item).map((expanded) => ({
          id: expanded.id,
          type: expanded.type,
          enabled: expanded.enabled,
          sortOrder: expanded.sortOrder,
          config: deepCloneConfig(expanded.config)
        }))
      : [item])
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function normalizeCmsComponent(value: unknown, index: number): CmsComponent {
  const record = readRecord(value);
  const type = typeof record.type === "string" && record.type.trim() ? record.type : "rich-content-block";
  return {
    id: typeof record.id === "string" && record.id.trim() ? record.id : `${type}-${index + 1}`,
    type,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    sortOrder: Number.isFinite(Number(record.sortOrder)) ? Number(record.sortOrder) : index,
    config: readRecord(record.config)
  };
}

function componentFromDslNode(node: PageDsl["dsl"]["nodes"][number], index: number): EditableComponent | null {
  const meta = readRecord(node.meta);
  const originalType = typeof meta.originalType === "string" ? meta.originalType : "";
  const moduleType = typeof meta.moduleType === "string" ? meta.moduleType : "";
  const type = originalType || legacyTypeFromDsType(node.type, moduleType);
  if (!type) return null;
  const props = readRecord(node.props);
  return toEditableComponent({
    id: node.id || `${type}-${index + 1}`,
    type,
    enabled: node.enabled !== false,
    sortOrder: Number.isFinite(Number(node.sortOrder)) ? Number(node.sortOrder) : index,
    config: configFromDslProps(type, props)
  });
}

function legacyTypeFromDsType(type: string, moduleType = ""): string {
  if (moduleType === "home-hero") return "hero-banner";
  if (moduleType === "home-quick-entry") return "quick-icon-grid";
  if (moduleType === "home-event-list") return "conference-list";
  if (moduleType === "home-product-grid" || moduleType === "mall-product-grid") return "mall-product-grid";
  if (moduleType === "home-member-card") return "member-promo-banner";
  if (type === "ds-banner") return "hero-banner";
  if (type === "ds-grid") return "quick-icon-grid";
  if (type === "ds-list") return "conference-list";
  if (type === "ds-button") return "registration-button";
  if (type === "ds-carousel") return "carousel";
  if (type === "ds-image") return "image-promo-card";
  if (type === "ds-card") return "image-promo-card";
  if (type === "ds-section") return "rich-content-block";
  return "";
}

function configFromDslProps(type: string, props: Record<string, unknown>): Record<string, unknown> {
  const config = { ...props };
  if (Array.isArray(props.items)) config.items = props.items;
  if (type === "rich-content-block" && !Array.isArray(config.blocks)) {
    config.blocks = [
      {
        id: "block-1",
        type: "text",
        enabled: true,
        title: typeof props.title === "string" ? props.title : "",
        content: typeof props.description === "string" ? props.description : typeof props.text === "string" ? props.text : ""
      }
    ];
  }
  return config;
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

function addBusinessModule(type: BusinessModuleType) {
  const module = createBusinessModule(type, components.value.length);
  const component = businessModuleToComponent(module);
  components.value.push(component);
  expandedComponentIds.value = [component.id];
  selectedComponentId.value = component.id;
  expandedConfigGroupIds[component.id] = defaultExpandedConfigGroups(component.type);
  void nextTick(() => scrollToComponent(component.id));
  ElMessage.success("业务模块已添加，可以继续配置内容和样式");
}

function businessModuleToComponent(module: BusinessModule): EditableComponent {
  const config = module.config;
  const typeMap: Partial<Record<BusinessModuleType, string>> = {
    "home-hero": "hero-banner",
    "image-banner": "hero-banner",
    "home-quick-entry": "quick-icon-grid",
    "quick-icon-grid": "quick-icon-grid",
    "home-event-list": "conference-list",
    "event-card-carousel": "event-card-carousel",
    "conference-card": "conference-list",
    "home-product-grid": "mall-product-grid",
    "product-card": "mall-product-grid",
    "cart-item": "service-shortcut-card",
    "home-member-card": "member-promo-banner",
    "member-profile-card": "login-card",
    "member-benefit-card": "membership-benefits",
    "order-card": "my-order-list",
    "conference-detail-info": "rich-content-block",
    "rich-text": "rich-content-block",
    "conference-register-form": "registration-button",
    "mall-product-grid": "mall-product-grid",
    "invoice-form": "service-shortcut-card",
    "aftersale-form": "service-shortcut-card"
  };
  const componentType = typeMap[module.type] ?? "rich-content-block";
  return {
    id: `${componentType}-${Date.now().toString(36)}`,
    type: componentType,
    enabled: module.enabled,
    sortOrder: components.value.length,
    config: {
      title: config.title ?? "",
      subtitle: config.subtitle ?? "",
      description: config.description ?? "",
      buttonText: config.buttonText ?? "",
      imageUrl: config.imageUrl ?? "",
      imageMode: config.imageMode ?? "scaleToFill",
      imageOnly: config.imageOnly ?? false,
      showOverlay: config.showOverlay ?? true,
      columns: config.columns ?? 4,
      layout: config.layout ?? "grid",
      layoutMode: config.layout === "card" ? "scroll" : "grid",
      iconSize: config.iconSize ?? "large",
      radiusPreset: config.radiusPreset ?? "md",
      spacingPreset: config.spacingPreset ?? "standard",
      buttonStyle: config.buttonStyle ?? "primary",
      cardStyle: config.cardStyle ?? "soft",
      actionTargetType: businessModuleLinkTypeToAction(config.linkType),
      targetPageKey: config.linkType === "page" ? config.link ?? "" : "",
      targetConferenceId: config.linkType === "conference" || config.linkType === "registration" ? config.link ?? "" : "",
      targetProductId: config.linkType === "product" ? config.link ?? "" : "",
      externalUrl: config.linkType === "url" ? config.link ?? "" : "",
      items: (config.items ?? []).map((item, index) => normalizeEntryItem({
        id: item.id,
        title: item.label,
        subtitle: item.subtitle,
        iconUrl: item.iconUrl,
        dynamicIconUrl: "",
        imageUrl: item.imageUrl,
        enabled: true,
        sortOrder: index,
        actionTargetType: businessModuleLinkTypeToAction(item.linkType),
        targetPageKey: item.linkType === "page" ? item.link ?? "" : "",
        targetConferenceId: item.linkType === "conference" || item.linkType === "registration" ? item.link ?? "" : "",
        targetProductId: item.linkType === "product" ? item.link ?? "" : "",
        externalUrl: item.linkType === "url" ? item.link ?? "" : ""
      }, index)),
      blocks: [
        {
          id: "block-1",
          type: "paragraph",
          enabled: true,
          text: config.description ?? config.subtitle ?? config.title ?? "",
          align: "left",
          actionTargetType: "none"
        }
      ],
      businessModuleType: module.type
    }
  };
}

function businessModuleLinkTypeToAction(type: BusinessModule["config"]["linkType"]): string {
  if (type === "page") return "page";
  if (type === "conference") return "conference";
  if (type === "registration") return "registration";
  if (type === "product") return "product";
  if (type === "url") return "external-h5";
  return "none";
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

function duplicateComponent(index: number) {
  const source = components.value[index];
  if (!source) return;
  const id = `${source.type}-${Date.now()}`;
  const copy: EditableComponent = {
    id,
    type: source.type,
    enabled: source.enabled,
    sortOrder: index + 1,
    config: deepCloneConfig(source.config)
  };
  components.value.splice(index + 1, 0, copy);
  selectedComponentId.value = id;
  expandedConfigGroupIds[id] = defaultExpandedConfigGroups(copy.type);
  void nextTick(() => scrollToComponent(id));
  ElMessage.success("已复制模块，请保存草稿或发布页面");
}

function duplicateSelectedComponent() {
  const index = selectedComponentIndex.value;
  if (index < 0) return;
  duplicateComponent(index);
}

function deepCloneConfig(config: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config ?? {})) as Record<string, unknown>;
}

async function removeSelectedComponent() {
  const index = selectedComponentIndex.value;
  const target = selectedComponent.value;
  if (index < 0 || !target) return;
  try {
    await ElMessageBox.confirm(
      `确认删除「${presetName(target.type)}」模块？删除后需要保存草稿或发布页面才会生效。`,
      "删除当前模块",
      {
        confirmButtonText: "删除模块",
        cancelButtonText: "取消",
        type: "warning"
      }
    );
  } catch {
    return;
  }
  removeComponent(index);
  const next = components.value[Math.min(index, components.value.length - 1)];
  selectedComponentId.value = next?.id ?? "";
  if (next) expandedConfigGroupIds[next.id] = expandedConfigGroupIds[next.id] ?? defaultExpandedConfigGroups(next.type);
  ElMessage.success("已删除当前模块，请保存草稿或发布页面");
}

function componentDomId(id: string) {
  return `cms-component-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function previewComponentDomId(id: string) {
  return `cms-preview-component-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
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
  inspectorTab.value = "component";
  focusComponent(id);
}

function selectPreviewComponent(id: string) {
  selectedComponentId.value = id;
  inspectorTab.value = "component";
  const component = components.value.find((item) => item.id === id);
  if (component) {
    expandedConfigGroupIds[id] = expandedConfigGroupIds[id] ?? defaultExpandedConfigGroups(component.type);
  }
}

function componentIndex(id: string): number {
  return components.value.findIndex((item) => item.id === id);
}

function moveSelectedBy(direction: -1 | 1): void {
  const index = componentIndex(selectedComponentId.value);
  if (index < 0) return;
  moveComponent(index, direction);
}

function scrollToComponent(id: string) {
  document.getElementById(componentDomId(id))?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToPreviewComponent(id: string) {
  document.getElementById(previewComponentDomId(id))?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function startPreviewDrag(id: string, event: DragEvent) {
  draggingComponentId.value = id;
  event.dataTransfer?.setData("text/plain", id);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function dropPreviewComponent(targetId: string) {
  const sourceId = draggingComponentId.value;
  draggingComponentId.value = "";
  if (!sourceId || sourceId === targetId) return;
  moveComponentTo(sourceId, targetId);
}

function finishPreviewDrag() {
  draggingComponentId.value = "";
}

function moveComponentTo(sourceId: string, targetId: string) {
  const sourceIndex = components.value.findIndex((item) => item.id === sourceId);
  const targetIndex = components.value.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  const list = [...components.value];
  const [item] = list.splice(sourceIndex, 1);
  list.splice(targetIndex, 0, item);
  components.value = list;
  selectedComponentId.value = sourceId;
  void nextTick(() => scrollToPreviewComponent(sourceId));
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

function captureEditorSnapshot(): EditorSnapshot {
  return cloneJson({
    components: components.value,
    pageMeta: { ...pageMeta },
    businessDisplay: { ...businessDisplay, modules: [...businessDisplay.modules] },
    versionTitle: versionTitle.value
  });
}

function resetEditorHistory(): void {
  history.value = [captureEditorSnapshot()];
  historyIndex.value = 0;
}

function scheduleHistorySnapshot(): void {
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    const snapshot = captureEditorSnapshot();
    const current = history.value[historyIndex.value];
    if (current && snapshotSignature(current) === snapshotSignature(snapshot)) return;
    const next = history.value.slice(0, historyIndex.value + 1);
    next.push(snapshot);
    history.value = next.slice(-50);
    historyIndex.value = history.value.length - 1;
  }, 240);
}

function scheduleAutosave(): void {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    void saveDraft({ silent: true }).catch(() => {
      isDirty.value = true;
    });
  }, 1800);
}

function snapshotSignature(snapshot: EditorSnapshot): string {
  return JSON.stringify(snapshot);
}

function applyEditorSnapshot(snapshot: EditorSnapshot): void {
  applyingSnapshot = true;
  components.value = cloneJson(snapshot.components);
  Object.assign(pageMeta, cloneJson(snapshot.pageMeta));
  Object.assign(businessDisplay, cloneJson(snapshot.businessDisplay));
  versionTitle.value = snapshot.versionTitle;
  if (!components.value.some((component) => component.id === selectedComponentId.value)) {
    selectedComponentId.value = components.value[0]?.id ?? "";
  }
  initializeConfigGroups(components.value);
  void nextTick(() => {
    applyingSnapshot = false;
    isDirty.value = true;
    scheduleAutosave();
  });
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function undo(): void {
  if (!canUndo.value) return;
  historyIndex.value -= 1;
  applyEditorSnapshot(history.value[historyIndex.value]);
}

function redo(): void {
  if (!canRedo.value) return;
  historyIndex.value += 1;
  applyEditorSnapshot(history.value[historyIndex.value]);
}

function handleEditorShortcut(event: KeyboardEvent): void {
  if (!(event.metaKey || event.ctrlKey)) return;
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, textarea, [contenteditable='true']")) return;
  if (event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  }
  if (event.key.toLowerCase() === "s") {
    event.preventDefault();
    void saveDraft();
  }
}

async function saveDraft(options: { silent?: boolean } = {}) {
  if (!version.value) return;
  if (saving.value) return;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  saving.value = true;
  try {
    version.value = await updatePageVersion(version.value.id, {
      title: versionTitle.value,
      dsl: dslFromComponents(selectedPage.value?.pageKey ?? version.value.template.pageKey),
      themeJson: nextThemeJson()
    });
    isDirty.value = false;
    lastSavedAt.value = new Date();
    if (!options.silent) ElMessage.success("页面已保存");
  } finally {
    saving.value = false;
  }
}

async function publish() {
  if (!version.value) return;
  await saveDraft({ silent: true });
  if (unsupportedEnabledComponents.value.length > 0) {
    ElMessage.error(`页面包含不可发布组件：${unsupportedEnabledComponents.value.map((item) => presetName(item.type)).join("、")}`);
    return;
  }
  const confirmBasic = basicEnabledComponents.value.length > 0;
  if (confirmBasic) {
    try {
      await ElMessageBox.confirm(
        `当前页面包含 ${basicEnabledComponents.value.length} 个基础支持组件。请确认已经核对 H5 和小程序预览，再继续发布。`,
        "确认发布基础支持组件",
        {
          confirmButtonText: "确认发布",
          cancelButtonText: "返回处理",
          type: "warning"
        }
      );
    } catch {
      return;
    }
  }
  publishing.value = true;
  try {
    editorReady = false;
    const draft = await publishPageVersion(version.value.id, { confirmBasic });
    version.value = draft;
    versionTitle.value = draft.title;
    components.value = componentsFromVersion(draft);
    applyPageMeta(draft.themeJson, selectedPage.value?.title);
    expandedComponentIds.value = components.value[0] ? [components.value[0].id] : [];
    selectedComponentId.value = components.value[0]?.id ?? "";
    initializeConfigGroups(components.value);
    await loadPages();
    resetEditorHistory();
    isDirty.value = false;
    lastSavedAt.value = new Date();
    publishPanelVisible.value = false;
    ElMessage.success("页面已发布，已自动保留下一版草稿");
  } finally {
    editorReady = true;
    publishing.value = false;
  }
}

async function publishFromDrawer(): Promise<void> {
  await publish();
}

async function rollback() {
  if (!selectedPage.value) return;
  editorReady = false;
  const next = await rollbackPage(selectedPage.value.id);
  await loadPages();
  version.value = next;
  components.value = componentsFromVersion(next);
  applyPageMeta(next.themeJson, selectedPage.value?.title);
  expandedComponentIds.value = components.value[0] ? [components.value[0].id] : [];
  selectedComponentId.value = components.value[0]?.id ?? "";
  initializeConfigGroups(components.value);
  resetEditorHistory();
  isDirty.value = false;
  lastSavedAt.value = new Date(next.updatedAt);
  editorReady = true;
  ElMessage.success("已回滚到上一发布版本");
}

async function createCustomPage() {
  const slug = createForm.slug.trim().replace(/^custom:/, "") || defaultCreateSlug();
  await createPage({
    pageKey: `custom:${slug}`,
    title: createForm.title,
    description: createForm.description,
    pageType: createForm.pageType,
    conferenceId: createForm.conferenceId || undefined,
    productId: createForm.productId || undefined,
    templateId: createForm.templateId || undefined
  });
  Object.assign(createForm, { slug: "", title: "", description: "", templateId: "", pageType: "CUSTOM", conferenceId: "", productId: "" });
  createVisible.value = false;
  await loadPages();
}

function canDeletePage(page: PageTemplate): boolean {
  return !page.publishedVersionId && !page.pageKey.startsWith("template:") && page.pageType !== "SYSTEM_TEMPLATE";
}

async function duplicatePage(page: PageTemplate) {
  const latest = page.versions[0];
  if (!latest) {
    ElMessage.warning("该页面还没有可复制的版本");
    return;
  }
  const source = await getPageVersion(latest.id);
  const copyTitle = `${pageDisplayTitle(page)} 副本`;
  const copySlug = `copy-${Date.now().toString(36)}`;
  const created = await createPage({
    pageKey: `custom:${copySlug}`,
    title: copyTitle,
    description: page.description || `复制自 ${pageDisplayTitle(page)}`,
    pageType: "CUSTOM",
    dsl: dslFromComponents(page.pageKey, componentsFromVersion(source)),
    themeJson: source.themeJson || undefined
  });
  await loadPages();
  const target = pages.value.find((item) => item.id === created.id);
  if (target) await selectPage(target);
  ElMessage.success("已复制为新的自定义页面");
}

async function deletePageTemplate(page: PageTemplate) {
  try {
    await ElMessageBox.confirm(`确定删除“${pageDisplayTitle(page)}”吗？仅未发布、非系统内置页面可以删除。内置业务草稿会从页面列表隐藏。`, "删除页面", {
      confirmButtonText: "删除",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  await deletePage(page.id);
  if (selectedPage.value?.id === page.id) {
    selectedPage.value = null;
    version.value = null;
    components.value = [];
  }
  await loadPages();
  ElMessage.success("页面已删除");
}

function syncCreateSlug() {
  if (!PAGE_TYPES_REQUIRING_CONFERENCE_UI.includes(createForm.pageType)) createForm.conferenceId = "";
  if (createForm.pageType !== "PRODUCT_DETAIL_PAGE") createForm.productId = "";
  if (createForm.pageType === "CONFERENCE_DETAIL_TEMPLATE") createForm.slug = "conference-detail-template";
  if (createForm.pageType === "PRODUCT_DETAIL_TEMPLATE") createForm.slug = "product-detail-template";
  if (createForm.pageType === "CONFERENCE_DETAIL_PAGE" && createForm.conferenceId) createForm.slug = `conference-${createForm.conferenceId.slice(-8)}`;
  if (createForm.pageType === "REGISTRATION_FORM_PAGE" && createForm.conferenceId) createForm.slug = `registration-${createForm.conferenceId.slice(-8)}`;
  if (createForm.pageType === "REGISTRATION_CREDENTIAL_PAGE" && createForm.conferenceId) createForm.slug = `credential-${createForm.conferenceId.slice(-8)}`;
  if (createForm.pageType === "PRODUCT_DETAIL_PAGE" && createForm.productId) createForm.slug = `product-${createForm.productId.slice(-8)}`;
}

function defaultCreateSlug() {
  if (createForm.pageType === "CONFERENCE_DETAIL_PAGE" && createForm.conferenceId) return `conference-${createForm.conferenceId.slice(-8)}`;
  if (createForm.pageType === "REGISTRATION_FORM_PAGE" && createForm.conferenceId) return `registration-${createForm.conferenceId.slice(-8)}`;
  if (createForm.pageType === "REGISTRATION_CREDENTIAL_PAGE" && createForm.conferenceId) return `credential-${createForm.conferenceId.slice(-8)}`;
  if (createForm.pageType === "PRODUCT_DETAIL_PAGE" && createForm.productId) return `product-${createForm.productId.slice(-8)}`;
  return `page-${Date.now()}`;
}

function pageTypeLabel(value: string) {
  return pageTypeOptions.find((item) => item.value === value)?.label ?? value;
}

function pageTypeHelp(value: string) {
  if (value === "CONFERENCE_DETAIL_TEMPLATE") return "作为所有会议详情页的默认模板，不绑定具体会议。";
  if (value === "CONFERENCE_DETAIL_PAGE") return "绑定某一个具体会议，用户打开该会议详情时优先生效。";
  if (value === "REGISTRATION_FORM_PAGE") return "绑定某一个具体会议，用户打开该会议报名页时优先生效。";
  if (value === "REGISTRATION_CREDENTIAL_PAGE") return "绑定某一个具体会议，用户查看该会议报名凭证时优先生效。";
  if (value === "PRODUCT_DETAIL_TEMPLATE") return "作为所有商品详情页的默认模板，不绑定具体商品。";
  if (value === "PRODUCT_DETAIL_PAGE") return "绑定某一个具体商品，用户打开该商品详情时优先生效。";
  return "普通页面可通过底部导航或自定义入口访问。";
}

function pageBindingLabel(page: PageTemplate) {
  if (page.bindingType === "SPECIFIC_CONFERENCE") return previewConferences.value.find((item) => item.id === page.conferenceId)?.title || "已绑定会议";
  if (page.bindingType === "SPECIFIC_PRODUCT") return productOptions.value.find((item) => item.id === page.productId)?.title || "已绑定商品";
  if (page.bindingType === "CONFERENCE_TEMPLATE") return "会议详情通用模板";
  if (page.bindingType === "PRODUCT_TEMPLATE") return "所有商品详情";
  return "";
}

function pageDisplayTitle(page: PageTemplate) {
  const binding = pageBindingLabel(page);
  if (page.pageType === "CONFERENCE_DETAIL_TEMPLATE" || page.pageKey === "conference-detail") return "会议详情页（通用模板）";
  if (page.pageType === "CONFERENCE_DETAIL_PAGE") return `会议详情页（${binding || "未绑定会议"}）`;
  if (page.pageType === "REGISTRATION_FORM") return "会议报名页（通用模板）";
  if (page.pageType === "REGISTRATION_FORM_PAGE") return `会议报名页（${binding || "未绑定会议"}）`;
  if (page.pageType === "REGISTRATION_CREDENTIAL") return "报名凭证页（通用模板）";
  if (page.pageType === "REGISTRATION_CREDENTIAL_PAGE") return `报名凭证页（${binding || "未绑定会议"}）`;
  if (page.pageType === "PRODUCT_DETAIL_TEMPLATE" || page.pageKey === "mall-detail") return "商品详情页（通用模板）";
  if (page.pageType === "PRODUCT_DETAIL_PAGE") return `商品详情页（${binding || "未绑定商品"}）`;
  return page.title;
}

function previewRouteForPage(page: PageTemplate | null | undefined) {
  const key = page?.pageKey || "";
  const routeMap: Record<string, { miniapp: string; h5: string }> = {
    home: { miniapp: "pages/index/index", h5: "/pages/index/index" },
    index: { miniapp: "pages/index/index", h5: "/pages/index/index" },
    "conference-detail": { miniapp: "pages/conference/detail", h5: "/pages/conference/detail" },
    "registration-form": { miniapp: "pages/registration/form", h5: "/pages/registration/form" },
    "registration-credential": { miniapp: "pages/registration-success/index", h5: "/pages/registration-success/index" },
    "my-registrations": { miniapp: "pages/registrations/my", h5: "/pages/registrations/my" },
    cart: { miniapp: "pages/cart/index", h5: "/pages/cart/index" },
    "member-center": { miniapp: "pages/member/center", h5: "/pages/member/center" },
    mall: { miniapp: "pages/mall/index", h5: "/pages/mall/index" },
    "mall-home": { miniapp: "pages/mall/index", h5: "/pages/mall/index" },
    "mall-detail": { miniapp: "pages/mall/detail", h5: "/pages/mall/detail" },
    "product-detail": { miniapp: "pages/mall/detail", h5: "/pages/mall/detail" },
    "mall-orders": { miniapp: "pages/mall/orders", h5: "/pages/mall/orders" },
    invoice: { miniapp: "pages/invoice/index", h5: "/pages/invoice/index" },
    aftersale: { miniapp: "pages/refund/index", h5: "/pages/refund/index" },
    "ai-assistant": { miniapp: "pages/ai-assistant/index", h5: "/pages/ai-assistant/index" }
  };
  const route = routeMap[key] ?? { miniapp: "pages/custom/index", h5: "/pages/custom/index" };
  if (!key || routeMap[key]) return route;
  return {
    miniapp: `${route.miniapp}?pageKey=${encodeURIComponent(key)}`,
    h5: `${route.h5}?pageKey=${encodeURIComponent(key)}`
  };
}

function pageContextText(page: PageTemplate) {
  const binding = pageBindingLabel(page);
  if (page.bindingType === "SPECIFIC_CONFERENCE") return `已绑定会议：${binding || page.conferenceId || "未识别"}`;
  if (page.bindingType === "SPECIFIC_PRODUCT") return `已绑定商品：${binding || page.productId || "未识别"}`;
  if (page.bindingType === "CONFERENCE_TEMPLATE") return "会议详情通用模板，未单独绑定的会议会回退到此页";
  if (page.pageType === "REGISTRATION_FORM") return "会议报名通用页，未单独绑定的会议报名会回退到此页";
  if (page.pageType === "REGISTRATION_CREDENTIAL") return "报名凭证通用页，未单独绑定的会议凭证会回退到此页";
  if (page.bindingType === "PRODUCT_TEMPLATE") return "商品详情通用模板，未单独绑定的商品会回退到此页";
  return "普通业务页面";
}

function pageConfigurableText(page: PageTemplate): string {
  if (!page.enabled) return "已停用";
  if (page.pageType === "CUSTOM") return "自定义可配置";
  return "业务页可配置";
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isConferenceContextPage(page: PageTemplate): boolean {
  return (
    page.bindingType === "SPECIFIC_CONFERENCE" ||
    page.bindingType === "CONFERENCE_TEMPLATE" ||
    ["CONFERENCE_DETAIL", "CONFERENCE_DETAIL_TEMPLATE", "CONFERENCE_DETAIL_PAGE", "REGISTRATION_FORM", "REGISTRATION_FORM_PAGE", "REGISTRATION_CREDENTIAL", "REGISTRATION_CREDENTIAL_PAGE"].includes(page.pageType) ||
    ["conference-detail", "registration-form", "registration-success"].includes(page.pageKey)
  );
}

function previewBodyBackground(theme: ThemeConfig): string {
  if (theme.backgroundApplyTo === "header") {
    return theme.backgroundColor || DEFAULT_PREVIEW_THEME.backgroundColor;
  }
  if (theme.backgroundMode === "image" && theme.backgroundImageUrl) {
    const overlay = theme.backgroundBottomFilter === false ? "" : `linear-gradient(180deg, rgba(255,255,255,0.10), ${theme.backgroundColor || DEFAULT_PREVIEW_THEME.backgroundColor} 96%), `;
    return `${overlay}url("${theme.backgroundImageUrl}") center top / cover no-repeat`;
  }
  if (theme.backgroundMode === "gradient" || theme.backgroundMode === "dynamic-gradient") {
    if (theme.backgroundMode === "dynamic-gradient") {
      return theme.backgroundColor || DEFAULT_PREVIEW_THEME.backgroundColor;
    }
    return `linear-gradient(180deg, ${theme.backgroundGradientFrom || theme.backgroundColor || DEFAULT_PREVIEW_THEME.backgroundColor}, ${theme.backgroundGradientTo || theme.secondaryColor || DEFAULT_PREVIEW_THEME.secondaryColor})`;
  }
  if (theme.backgroundMode === "video" && theme.backgroundVideoPosterUrl) {
    return `url("${theme.backgroundVideoPosterUrl}") center / cover no-repeat`;
  }
  return theme.backgroundColor || DEFAULT_PREVIEW_THEME.backgroundColor;
}

function navigateToSection(path: string) {
  navigateTo(path);
}

function openTemplateCenter(): void {
  navigateTo("/page-templates", { targetPageId: selectedPage.value?.id });
}

async function handleEditorMoreAction(command: string | number | object): Promise<void> {
  if (command === "fixed-template") {
    fixedTemplateVisible.value = true;
    return;
  }
  if (command === "save-template") {
    saveTemplateVisible.value = true;
    return;
  }
  if (command === "rollback") await rollback();
}

function openTemplateLibrary() {
  templateVisible.value = true;
}

function openTemplatePreview(template: PageLibraryTemplate) {
  templatePreview.value = template;
  templatePreviewVisible.value = true;
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
  components.value = componentsFromTemplate(template);
  versionTitle.value = `${selectedPage.value?.title || "页面"} · ${template.title}`;
  applyPageMeta(template.version.themeJson, selectedPage.value?.title);
  selectedComponentId.value = components.value[0]?.id ?? "";
  initializeConfigGroups(components.value);
  templateVisible.value = false;
  templatePreviewVisible.value = false;
  ElMessage.success("已应用模板到当前草稿");
}

async function applyFixedBusinessTemplate(command: string | number | object) {
  if (!selectedPage.value || !version.value) return;
  const option = fixedBusinessTemplateOptions.find((item) => item.key === String(command));
  if (!option) return;
  if (components.value.length > 0) {
    try {
      await ElMessageBox.confirm(`应用“${option.name}”会替换当前草稿组件。应用后所有模块都可继续编辑和重排。`, "应用页面结构模板", {
        confirmButtonText: "继续应用",
        cancelButtonText: "取消",
        type: "warning"
      });
    } catch {
      return;
    }
  }
  components.value = buildCmsPageComposition(option.kind, FIXED_TEMPLATE_ASSET_ROOT).map((item, index) => ({
    id: `${option.key}:${item.id}`,
    type: item.type,
    enabled: item.enabled,
    sortOrder: index,
    config: deepCloneConfig(item.config)
  }));
  versionTitle.value = `${selectedPage.value.title || "页面"} · ${option.name}`;
  Object.assign(pageMeta, {
    pageTitle: option.pageTitle,
    shareTitle: option.shareTitle,
    shareDescription: option.heroSubtitle,
    navLogoUrl: pageMeta.navLogoUrl,
    navLogoDynamicUrl: pageMeta.navLogoDynamicUrl,
    shareImageUrl: pageMeta.shareImageUrl
  });
  selectedComponentId.value = components.value[0]?.id ?? "";
  expandedComponentIds.value = selectedComponentId.value ? [selectedComponentId.value] : [];
  initializeConfigGroups(components.value);
  ElMessage.success(`已应用${option.name}，生成 ${components.value.length} 个可编辑模块`);
}

async function chooseFixedTemplate(key: string): Promise<void> {
  await applyFixedBusinessTemplate(key);
  fixedTemplateVisible.value = false;
}

async function saveAsTemplate() {
  if (!version.value) return;
  const slug = saveTemplateForm.slug.trim().replace(/^template:/, "");
  await createPageLibraryTemplate({
    slug,
    title: saveTemplateForm.title,
    category: saveTemplateForm.category,
    description: saveTemplateForm.description,
    dsl: dslFromComponents(`template:${slug || saveTemplateForm.title.trim() || "custom"}`),
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
    config: normalizeConfig(component.config, component.type)
  }));
}

function dslFromComponents(page: string, source = components.value): PageDsl {
  const payloadComponents = source.map((component, index) => ({
    id: component.id,
    type: component.type,
    enabled: component.enabled,
    sortOrder: index,
    config: normalizeConfig(component.config, component.type)
  }));
  return {
    schemaVersion: "p9",
    page,
    dsl: {
      nodes: payloadComponents
        .filter((component) => component.enabled !== false)
        .map((component, index) => componentToDslNode(component, index))
    },
    meta: {
      source: "visual-component-editor",
      editor: "operator-visual",
      editorComponents: payloadComponents
    }
  };
}

function componentToDslNode(component: CmsComponent, index: number): PageDsl["dsl"]["nodes"][number] {
  const props = componentPropsForDsl(component);
  return {
    id: component.id,
    type: dsTypeForComponent(component.type),
    enabled: component.enabled,
    sortOrder: index * 10,
    props,
    meta: {
      source: "visual-component-editor",
      originalType: component.type,
      supportStatus: componentSupport(component.type).status
    }
  };
}

function componentPropsForDsl(component: CmsComponent): Record<string, unknown> {
  const config = normalizeConfig(component.config, component.type);
  const title = readString(config.title) || readString(config.name) || readString(config.text) || presetName(component.type);
  return {
    ...config,
    title,
    subtitle: readString(config.subtitle) || readString(config.description),
    description: readString(config.description) || readString(config.content) || readString(config.text),
    imageUrl: readString(config.imageUrl) || readString(config.coverImageUrl) || readString(config.backgroundImageUrl),
    images: Array.isArray(config.images) ? config.images : [],
    items: Array.isArray(config.items) ? config.items : [],
    action: actionFromConfig(config)
  };
}

function dsTypeForComponent(type: string): string {
  const map: Record<string, string> = {
    "fixed-business-template": "ds-section",
    hero: "ds-banner",
    "hero-banner": "ds-banner",
    carousel: "ds-carousel",
    "quick-icon-grid": "ds-grid",
    "image-grid": "ds-grid",
    "mall-product-grid": "ds-grid",
    "conference-list": "ds-list",
    "conference-schedule": "ds-list",
    "conference-tabs": "ds-list",
    "event-card-carousel": "ds-list",
    "rich-content-block": "ds-section",
    "rich-text": "ds-section",
    "safe-html": "ds-section",
    "text-image": "ds-section",
    title: "ds-section",
    notice: "ds-card",
    "member-promo-banner": "ds-banner",
    "image-promo-card": "ds-card",
    "service-shortcut-card": "ds-grid",
    "task-progress-card": "ds-card",
    "registration-button": "ds-button",
    "floating-registration-button": "ds-button",
    "credential-header": "ds-card",
    "credential-qr": "ds-card",
    "credential-conference-info": "ds-card",
    "credential-attendee-info": "ds-card",
    "credential-payment-info": "ds-card",
    "credential-form-summary": "ds-card",
    "credential-checkin-info": "ds-card",
    "credential-actions": "ds-grid",
    "user-profile-card": "ds-card",
    "membership-benefits": "ds-list",
    "download-list": "ds-list",
    "live-card": "ds-card",
    "sponsor-wall": "ds-grid",
    faq: "ds-list",
    countdown: "ds-card",
    video: "ds-card",
    "map-contact": "ds-card",
    "traffic-guide": "ds-card",
    "custom-button": "ds-button"
  };
  return map[type] ?? "ds-section";
}

function actionFromConfig(config: Record<string, unknown>): Record<string, unknown> {
  const actionTargetType = readString(config.actionTargetType || config.linkType);
  if (actionTargetType === "page" || actionTargetType === "internal-page") return { type: "page", pageKey: readString(config.targetPageKey || config.pageKey || config.link) };
  if (actionTargetType === "conference" || actionTargetType === "conference-detail") return { type: "conference", conferenceId: readString(config.conferenceId || config.link) };
  if (actionTargetType === "registration" || actionTargetType === "conference-registration") return { type: "registration", conferenceId: readString(config.conferenceId || config.link) };
  if (actionTargetType === "product" || actionTargetType === "product-detail") return { type: "product", productId: readString(config.productId || config.link) };
  if (actionTargetType === "url" || actionTargetType === "external-h5") return { type: "url", url: readString(config.url || config.link) };
  if (actionTargetType === "phone") return { type: "phone", phone: readString(config.phone) };
  if (actionTargetType === "copy") return { type: "copy", text: readString(config.copyText) };
  return { type: "none" };
}

function normalizeConfig(config: Record<string, unknown>, componentType?: string): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  if (componentType && isRichContentComponentType(componentType)) {
    const component: EditableComponent = {
      id: "normalizing",
      type: componentType,
      enabled: true,
      sortOrder: 0,
      config
    };
    next.blocks = normalizeRichBlocks(config.blocks, component);
  }
  for (const [key, value] of Object.entries(config)) {
    if (key === "blocks" && componentType && isRichContentComponentType(componentType)) {
      continue;
    }
    if ((componentType === "quick-icon-grid" || componentType === "service-shortcut-card") && key === "items") {
      next[key] = normalizeEntryItems(value, componentType);
    } else if (typeof value === "string") {
      next[key] = value.trim();
    } else {
      next[key] = value;
    }
  }
  return next;
}

function isRichContentComponentType(type: string): boolean {
  return ["rich-content-block", "rich-text", "safe-html", "text-image"].includes(type);
}

function applyPageMeta(themeJson: Record<string, unknown> | null | undefined, fallbackTitle?: string | null) {
  const meta = readPageMeta(themeJson);
  pageMeta.pageTitle = meta.pageTitle || fallbackTitle || "";
  pageMeta.navLogoUrl = meta.navLogoUrl || "";
  pageMeta.navLogoDynamicUrl = meta.navLogoDynamicUrl || "";
  pageMeta.shareTitle = meta.shareTitle || fallbackTitle || "";
  pageMeta.shareDescription = meta.shareDescription || "";
  pageMeta.shareImageUrl = meta.shareImageUrl || "";
  applyBusinessDisplay(themeJson);
}

function readPageMeta(themeJson: Record<string, unknown> | null | undefined): PageMetaForm {
  const raw = themeJson?.pageMeta;
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    pageTitle: typeof source.pageTitle === "string" ? source.pageTitle : "",
    navLogoUrl: typeof source.navLogoUrl === "string" ? source.navLogoUrl : "",
    navLogoDynamicUrl: typeof source.navLogoDynamicUrl === "string" ? source.navLogoDynamicUrl : "",
    shareTitle: typeof source.shareTitle === "string" ? source.shareTitle : "",
    shareDescription: typeof source.shareDescription === "string" ? source.shareDescription : "",
    shareImageUrl: typeof source.shareImageUrl === "string" ? source.shareImageUrl : ""
  };
}

function nextThemeJson(): Record<string, unknown> {
  const businessDisplayKey = selectedPage.value ? businessDisplayKeyForPage(selectedPage.value) : "";
  const currentBusinessDisplay = readRecord(version.value?.themeJson?.businessDisplay);
  const nextBusinessDisplay = businessDisplayKey
    ? {
        ...currentBusinessDisplay,
        [businessDisplayKey]: serializeBusinessDisplay()
      }
    : currentBusinessDisplay;
  return {
    ...(version.value?.themeJson ?? {}),
    pageMeta: {
      pageTitle: pageMeta.pageTitle.trim(),
      navLogoUrl: pageMeta.navLogoUrl.trim(),
      navLogoDynamicUrl: pageMeta.navLogoDynamicUrl.trim(),
      shareTitle: pageMeta.shareTitle.trim(),
      shareDescription: pageMeta.shareDescription.trim(),
      shareImageUrl: pageMeta.shareImageUrl.trim()
    },
    businessDisplay: nextBusinessDisplay
  };
}

function businessDisplayKeyForPage(page: PageTemplate | null | undefined): string {
  if (!page) return "";
  if (page.pageKey === "conference-detail" || ["CONFERENCE_DETAIL", "CONFERENCE_DETAIL_TEMPLATE", "CONFERENCE_DETAIL_PAGE"].includes(page.pageType)) return "conferenceDetail";
  if (page.pageKey === "registration-form" || ["REGISTRATION_FORM", "REGISTRATION_FORM_PAGE"].includes(page.pageType)) return "registrationForm";
  if (page.pageKey === "registration-success" || ["REGISTRATION_CREDENTIAL", "REGISTRATION_CREDENTIAL_PAGE"].includes(page.pageType)) return "registrationCredential";
  if (page.pageKey === "my-registrations") return "myRegistrations";
  if (page.pageKey === "mall" || page.pageType === "MALL") return "mallHome";
  if (page.pageKey === "mall-detail" || ["PRODUCT_DETAIL_TEMPLATE", "PRODUCT_DETAIL_PAGE"].includes(page.pageType)) return "productDetail";
  if (page.pageKey === "cart" || page.pageType === "MALL_CHECKOUT") return "cart";
  if (page.pageKey === "mall-orders") return page.pageType === "MALL_AFTERSALE" ? "aftersale" : "mallOrders";
  if (page.pageKey === "member-center") return "memberCenter";
  if (page.pageKey === "invoice" || page.pageType === "INVOICE") return "invoice";
  return "";
}

function businessModulesForKey(key: string): BusinessDisplayModule[] {
  return (BUSINESS_PAGE_MODULES[key] ?? DEFAULT_BUSINESS_MODULES).map((module) => ({ ...module }));
}

function defaultBusinessDisplay(modules = businessModulesForKey("conferenceDetail")): BusinessDisplayForm {
  return {
    modules: modules.map((module) => ({ ...module })),
    assistantMode: "ai",
    primaryButtonText: "立即报名",
    inventoryDisplayMode: "STATUS",
    lowStockThreshold: 10
  };
}

function applyBusinessDisplay(themeJson: Record<string, unknown> | null | undefined) {
  const next = readBusinessDisplay(themeJson, selectedPage.value ? businessDisplayKeyForPage(selectedPage.value) : "conferenceDetail");
  businessDisplay.modules = next.modules;
  businessDisplay.assistantMode = next.assistantMode;
  businessDisplay.primaryButtonText = next.primaryButtonText;
  businessDisplay.inventoryDisplayMode = next.inventoryDisplayMode;
  businessDisplay.lowStockThreshold = next.lowStockThreshold;
}

function readBusinessDisplay(themeJson: Record<string, unknown> | null | undefined, key = "conferenceDetail"): BusinessDisplayForm {
  const businessDisplaySource = readRecord(themeJson?.businessDisplay);
  const fallbackSource =
    key === "conferenceDetail"
      ? businessDisplaySource.conferenceDetail ?? themeJson?.detailDisplay
      : key === "cart"
        ? businessDisplaySource.cart ?? businessDisplaySource.cartCheckout ?? businessDisplaySource.shoppingCart ?? businessDisplaySource.mallCart
        : {};
  const source = readRecord(businessDisplaySource[key] ?? fallbackSource);
  const mode = String(source.inventoryDisplayMode || "STATUS").toUpperCase();
  const rawModules = Array.isArray(source.modules) ? source.modules : [];
  const oldVisibleModules = Array.isArray(source.visibleModules) ? source.visibleModules.filter((item): item is string => typeof item === "string") : [];
  const oldVisible = new Set(oldVisibleModules);
  const defaultModules = businessModulesForKey(key);
  const modules = defaultModules.map((module) => {
    const keys = businessModuleConfigAliases(module.key);
    const configured = readRecord(rawModules.find((item) => keys.includes(String(readRecord(item).key || ""))));
    const hasOldVisible = oldVisibleModules.length > 0;
    return {
      ...module,
      title: readString(configured.title) || module.title,
      content: readString(configured.content),
      visible: typeof configured.visible === "boolean" ? configured.visible : hasOldVisible ? oldVisible.has(module.key) : module.visible,
      sort: Number.isFinite(Number(configured.sort)) ? Number(configured.sort) : module.sort,
      style: readString(configured.style) || module.style
    };
  }).sort((a, b) => a.sort - b.sort);
  return {
    modules,
    assistantMode: readString(source.assistantMode) || "ai",
    primaryButtonText: readString(source.primaryButtonText) || "立即报名",
    inventoryDisplayMode: mode === "EXACT" || mode === "HIDDEN" ? mode : "STATUS",
    lowStockThreshold: Number.isFinite(Number(source.lowStockThreshold)) ? Math.max(1, Number(source.lowStockThreshold)) : 10
  };
}

function serializeBusinessDisplay(): Record<string, unknown> {
  return {
    modules: businessDisplay.modules.map((module, index) => ({
      key: module.key,
      title: module.title.trim() || businessModuleLabel(module.key),
      content: module.content.trim(),
      visible: module.visible,
      sort: index * 10 + 10,
      style: module.style || "card"
    })),
    assistantMode: businessDisplay.assistantMode || "ai",
    primaryButtonText: businessDisplay.primaryButtonText.trim() || "立即报名",
    inventoryDisplayMode: businessDisplay.inventoryDisplayMode,
    lowStockThreshold: Math.max(1, Number(businessDisplay.lowStockThreshold) || 10)
  };
}

function businessModuleLabel(key: string): string {
  return businessModulesForKey(selectedPage.value ? businessDisplayKeyForPage(selectedPage.value) : "conferenceDetail").find((module) => module.key === key)?.title || key;
}

function businessModuleConfigAliases(key: string): string[] {
  if (key === "checkoutBar") return ["checkoutBar", "submitButton"];
  if (key === "productCoupons") return ["productCoupons", "coupon"];
  if (key === "mallItems") return ["mallItems", "productItems"];
  if (key === "shippingInfo") return ["shippingInfo", "receiver"];
  if (key === "recommendations") return ["recommendations", "recommended"];
  return [key];
}

function businessModuleAllowsContent(key: string): boolean {
  return !["conferenceInfo", "registrationInfo", "credentialHeader", "productInfo", "mallHeader", "memberProfile", "orderList", "invoiceableOrders"].includes(key);
}

function businessModuleGuide(key: string): BusinessModuleGuide {
  return BUSINESS_MODULE_GUIDES[key] ?? {
    source: "当前业务页真实接口和页面装修配置",
    entry: "当前页面装修",
    effect: "用户端按发布版本展示，未配置时使用业务页默认兜底。",
    defaultStatus: "default"
  };
}

function businessModuleStatus(module: BusinessDisplayModule): string {
  if (!module.visible) return "已隐藏";
  if (module.content.trim()) return "已配置";
  const status = businessModuleGuide(module.key).defaultStatus;
  if (status === "configured") return "已配置";
  if (status === "unconfigured") return "未配置";
  return "使用默认值";
}

function componentParityContract(type: string | undefined): ComponentParityContractView {
  if (type && COMPONENT_PARITY_CONTRACTS[type]) return COMPONENT_PARITY_CONTRACTS[type];
  const name = type ? presetName(type) : "未选择组件";
  return {
    title: `${name} 通用跨端协议`,
    summary: "使用当前组件配置生成 P9 DSL，后台预览、H5 和小程序按支持矩阵解释。",
    adminAdapter: "ComponentPreview",
    h5Adapter: "CmsVisualRenderer / DS RenderTree",
    miniappAdapter: "CmsVisualRenderer / DS RenderTree",
    rules: DEFAULT_PARITY_RULES
  };
}

function buildAcceptanceChecks(): AcceptanceCheck[] {
  const page = selectedPage.value;
  const route = previewRouteForPage(page);
  const enabledComponents = components.value.filter((component) => component.enabled);
  const requiredBusinessModules = requiredBusinessModuleKeysForPage(page);
  const missingBusinessModules = requiredBusinessModules.filter((key) => !businessDisplay.modules.some((module) => module.key === key));
  const disabledRequiredModules = requiredBusinessModules.filter((key) => businessDisplay.modules.some((module) => module.key === key && !module.visible));
  const hasUserContextModule = enabledComponents.some((component) => ["login-card", "user-profile-card", "member-promo-banner", "fixed-business-template"].includes(component.type));
  const needsUserContext = page ? ["member-center", "my-registrations", "cart", "invoice", "mall-orders"].includes(page.pageKey) || hasUserContextModule : hasUserContextModule;
  const versionDsl = readRecord(version.value?.dsl);
  const schemaVersion = readString(versionDsl.schemaVersion) || "p9";
  const checks: AcceptanceCheck[] = [
    {
      key: "dsl",
      title: "P9 DSL 保存链路",
      description: `当前草稿保存会写入 schemaVersion=${schemaVersion === "p9" ? "p9" : "p9（保存时重写）"}，高级装修源配置保存在 meta.editorComponents。`,
      status: "pass"
    },
    {
      key: "support-matrix",
      title: "组件支持矩阵",
      description: unsupportedEnabledComponents.value.length > 0 ? `仍有 ${unsupportedEnabledComponents.value.length} 个启用组件未纳入 H5/小程序支持。` : "当前启用组件均已纳入发布支持矩阵。",
      status: unsupportedEnabledComponents.value.length > 0 ? "error" : basicEnabledComponents.value.length > 0 ? "warn" : "pass",
      action: basicEnabledComponents.value.length > 0 ? "基础支持组件发布前需人工核对真机。" : undefined
    },
    {
      key: "route",
      title: "三端路由",
      description: `小程序：${route.miniapp}；H5：${route.h5}。后台预览可在顶部切换两个平台外壳。`,
      status: page ? "pass" : "warn",
      action: page ? undefined : "请选择页面后再发布。"
    },
    {
      key: "preview",
      title: "手机实时预览",
      description: enabledComponents.length > 0 ? `当前展示 ${enabledComponents.length} 个组件，点击预览组件可定位右侧配置，预览内可拖拽排序。` : "当前页面没有启用装修组件。",
      status: enabledComponents.length > 0 ? "pass" : "warn",
      action: enabledComponents.length === 0 ? "建议至少配置一个可展示组件。" : undefined
    }
  ];

  if (showBusinessDisplayEditor.value) {
    checks.push({
      key: "business-display",
      title: "固定业务模块",
      description: missingBusinessModules.length > 0
        ? `缺少固定业务模块：${missingBusinessModules.map(businessModuleLabel).join("、")}。`
        : `固定业务模块 ${businessDisplayStats.value.visible}/${businessDisplayStats.value.total} 正在显示。`,
      status: missingBusinessModules.length > 0 ? "error" : disabledRequiredModules.length > 0 ? "warn" : "pass",
      action: disabledRequiredModules.length > 0 ? `已隐藏关键模块：${disabledRequiredModules.map(businessModuleLabel).join("、")}，请确认这是运营意图。` : undefined
    });
  }

  if (needsUserContext) {
    checks.push({
      key: "user-context",
      title: "登录用户上下文",
      description: "后台预览使用示例用户；小程序真机会注入头像、昵称、手机号、会员等级、报名数、订单数和优惠券数。",
      status: hasUserContextModule || needsUserContext ? "pass" : "warn",
      action: "请在小程序真机登录后核对会员中心、登录卡、购物车和我的报名数据。"
    });
  }

  return checks;
}

function requiredBusinessModuleKeysForPage(page: PageTemplate | null | undefined): string[] {
  const key = businessDisplayKeyForPage(page);
  const map: Record<string, string[]> = {
    conferenceDetail: ["conferenceInfo", "location", "skus", "registrationButton"],
    registrationForm: ["registrationInfo", "skuSelector", "attendeeForm", "submitOrder"],
    registrationCredential: ["credentialHeader", "credentialQr", "conferenceInfo", "attendeeInfo"],
    myRegistrations: ["listHeader", "credentialEntry", "emptyState"],
    mallHome: ["mallHeader", "categories", "recommended", "cart"],
    productDetail: ["productInfo", "cover", "price", "skuSelector", "buyNowButton"],
    cart: ["title", "cartItems", "shippingInfo", "productCoupons", "checkoutBar", "emptyState", "recommendations"],
    cartCheckout: ["title", "cartItems", "shippingInfo", "productCoupons", "checkoutBar", "emptyState", "recommendations"],
    mallOrders: ["orderList", "statusFilter", "aftersalesEntry", "invoiceEntry", "emptyState"],
    memberCenter: ["memberProfile", "level", "benefitList", "registrations", "orders"],
    invoice: ["invoiceableOrders", "invoiceProfile", "invoiceForm", "submitButton"],
    aftersale: ["aftersaleInfo", "orderProduct", "reason", "submitButton"]
  };
  return map[key] ?? [];
}

function acceptanceStatusLabel(status: AcceptanceStatus): string {
  if (status === "pass") return "通过";
  if (status === "warn") return "提醒";
  return "阻断";
}

function operatorAcceptanceDescription(check: AcceptanceCheck): string {
  return check.description
    .replace(/P9 DSL/g, "页面配置")
    .replace(/DSL/g, "页面结构")
    .replace(/editorComponents/g, "可视化组件")
    .replace(/Runtime/g, "前台渲染");
}

function acceptanceCheckClass(status: AcceptanceStatus): string {
  return `is-${status}`;
}

function showAllBusinessModules() {
  businessDisplay.modules.forEach((module) => {
    module.visible = true;
  });
  ElMessage.success("已显示全部固定业务模块");
}

function hideOptionalBusinessModules() {
  businessDisplay.modules.forEach((module) => {
    if (businessModuleGuide(module.key).defaultStatus === "unconfigured") {
      module.visible = false;
    }
  });
  ElMessage.success("已隐藏默认未配置的可选业务模块");
}

function normalizeBusinessDisplayOrder() {
  businessDisplay.modules = [...businessDisplay.modules]
    .sort((a, b) => a.sort - b.sort)
    .map((module, index) => ({ ...module, sort: index * 10 + 10 }));
  ElMessage.success("已按显示顺序整理模块");
}

function resetBusinessDisplayForCurrentPage() {
  const key = businessDisplayKeyForPage(selectedPage.value) || "conferenceDetail";
  const next = defaultBusinessDisplay(businessModulesForKey(key));
  businessDisplay.modules = next.modules;
  businessDisplay.assistantMode = next.assistantMode;
  businessDisplay.primaryButtonText = next.primaryButtonText;
  businessDisplay.inventoryDisplayMode = next.inventoryDisplayMode;
  businessDisplay.lowStockThreshold = next.lowStockThreshold;
  ElMessage.success("已恢复当前业务页默认模块配置");
}

function moveBusinessDisplayModule(index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= businessDisplay.modules.length) return;
  const list = [...businessDisplay.modules];
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
  businessDisplay.modules = list.map((module, moduleIndex) => ({ ...module, sort: moduleIndex * 10 + 10 }));
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeFixedTemplateKind(value: string): FixedBusinessTemplateOption["kind"] {
  if (value.includes("schedule")) return "schedule";
  if (value.includes("registration") || value.includes("conference-list")) return "registration";
  if (value.includes("mall")) return "mall";
  if (value.includes("cart")) return "cart";
  if (value.includes("member")) return "member-center";
  return "home";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function templateComponentNames(template: PageLibraryTemplate): string[] {
  const names = componentsFromTemplate(template).map((component) => presetName(component.type));
  return names.slice(0, 8);
}

function templateBackgroundColor(template: PageLibraryTemplate | null): string {
  const value = template?.version?.themeJson?.backgroundColor;
  return typeof value === "string" && value.trim() ? value : "";
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
  const moduleHeadingFields: ConfigField[] = [
    { key: "showTitle", label: "显示模块标题", kind: "switch", fallback: "true" },
    { key: "subtitle", label: "模块副标题", placeholder: "可填写标题下方说明" },
    { key: "titleBottomGap", label: "标题与内容间距", kind: "range", fallback: 18, min: 0, max: 60 },
    { key: "showMore", label: "显示查看更多", kind: "switch", fallback: "false" },
    { key: "moreText", label: "查看更多文案", placeholder: "查看更多" },
    { key: "moreActionTargetType", label: "查看更多跳转", kind: "select", fallback: "none", options: actionTargetOptions() },
    { key: "moreTargetPageKey", label: "查看更多目标页面", kind: "select", options: pageTargetOptions() },
    { key: "moreTargetConferenceId", label: "查看更多目标会议", kind: "select", options: conferenceSelectOptions() },
    { key: "moreTargetProductId", label: "查看更多目标商品", kind: "select", options: productSelectOptions() },
    { key: "moreExternalUrl", label: "查看更多外部 H5", placeholder: "https://example.com" }
  ];
  const titleStyleFields: ConfigField[] = [
    { key: "titleFontSize", label: "模块标题字号", kind: "number", fallback: 32 },
    {
      key: "titleFontWeight",
      label: "模块标题字重",
      kind: "select",
      fallback: "800",
      options: [
        { label: "常规", value: "400" },
        { label: "中等", value: "600" },
        { label: "加粗", value: "800" },
        { label: "特粗", value: "900" }
      ]
    },
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
    { key: "subtitleFontSize", label: "模块副标题字号", kind: "number", fallback: 22 },
    { key: "subtitleTextColor", label: "模块副标题颜色", kind: "color", fallback: "#637083" },
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
  const layoutFields: ConfigField[] = [
    { key: "fullBleed", label: "组件铺满屏幕宽度", kind: "switch", fallback: "false" },
    {
      key: "contentBackgroundStyle",
      label: "组件背景",
      kind: "select",
      fallback: "card",
      options: [
        { label: "卡片背景", value: "card" },
        { label: "透明背景", value: "transparent" }
      ]
    },
    { key: "moduleHeight", label: "模块最小高度（0 为自适应）", kind: "range", fallback: 0, min: 0, max: 900 },
    { key: "moduleOpacity", label: "模块透明度", kind: "range", fallback: 100, min: 0, max: 100 },
    { key: "moduleSpacingTop", label: "与上个模块间距", kind: "range", fallback: 0, min: 0, max: 160 }
  ];
  const richContentLayoutFields: ConfigField[] = [
    {
      key: "contentBackgroundStyle",
      label: "组件背景",
      kind: "select",
      fallback: "transparent",
      options: [
        { label: "透明背景", value: "transparent" },
        { label: "卡片背景", value: "card" }
      ]
    },
    { key: "contentPadding", label: "内容内边距", kind: "range", fallback: 0, min: 0, max: 60 },
    { key: "blockGap", label: "内容块间距", kind: "range", fallback: 0, min: 0, max: 80 },
    { key: "imageRadius", label: "图片圆角", kind: "range", fallback: 0, min: 0, max: 48 },
    { key: "moduleHeight", label: "模块最小高度（0 为自适应）", kind: "range", fallback: 0, min: 0, max: 900 },
    { key: "moduleOpacity", label: "模块透明度", kind: "range", fallback: 100, min: 0, max: 100 },
    { key: "moduleSpacingTop", label: "与上个模块间距", kind: "range", fallback: 0, min: 0, max: 160 }
  ];
  const uniqueFields = (fields: ConfigField[]) => fields.filter((field, index, list) => list.findIndex((item) => item.key === field.key) === index);
  const withTextStyle = (fields: ConfigField[], fontSize = 26) =>
    uniqueFields([...fields, ...layoutFields, ...moduleHeadingFields, ...titleStyleFields, { ...textStyleFields[0], fallback: fontSize }, ...textStyleFields.slice(1)]);
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
    {
      key: "cardImageMode",
      label: "封面铺满方式",
      kind: "select",
      fallback: "scaleToFill",
      options: [
        { label: "整图铺满", value: "scaleToFill" },
        { label: "整图铺满（旧配置）", value: "aspectFit" },
        { label: "等比裁切铺满", value: "aspectFill" },
        { label: "完整显示", value: "contain" }
      ]
    },
    { key: "cardThumbWidth", label: "左侧缩略图宽度", kind: "range", fallback: 0, min: 0, max: 180 },
    { key: "cardThumbHeight", label: "左侧缩略图高度", kind: "range", fallback: 0, min: 0, max: 150 },
    { key: "cardImageHeight", label: "铺满图片高度", kind: "range", fallback: 120, min: 80, max: 260 },
    { key: "showSummary", label: "显示会议简介", kind: "switch", fallback: "true" },
    { key: "summaryFallback", label: "无简介时默认文案", placeholder: "点击查看会议详情和报名信息。" },
    { key: "detailButtonText", label: "详情按钮文案", placeholder: "查看详情" },
    { key: "showAppointmentButton", label: "未开放报名时显示提前预约", kind: "switch", fallback: "true" },
    { key: "appointmentButtonText", label: "提前预约按钮文案", placeholder: "提前预约" },
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
  const actionTargetFields: ConfigField[] = [
    { key: "actionTargetType", label: "点击目标", kind: "select", fallback: "register", options: actionTargetOptions() },
    { key: "targetPageKey", label: "目标页面", kind: "select", options: pageTargetOptions() },
    { key: "targetConferenceId", label: "目标会议", kind: "select", options: conferenceSelectOptions() },
    { key: "targetProductId", label: "目标商品", kind: "select", options: productSelectOptions() },
    { key: "targetProductCategoryId", label: "目标商品分类", kind: "select", options: productCategorySelectOptions() },
    { key: "targetCouponCampaignId", label: "目标券活动", kind: "select", options: couponCampaignSelectOptions() },
    { key: "externalUrl", label: "外部 H5 链接", placeholder: "https://example.com，小程序端会复制链接或打开 WebView 能力" },
    { key: "externalMiniappAppId", label: "外部小程序 AppID", placeholder: "wx..." },
    { key: "externalMiniappPath", label: "外部小程序路径", placeholder: "pages/index/index" },
    { key: "externalMiniappExtraData", label: "外部小程序 extraData", kind: "textarea", rows: 2, placeholder: "JSON 字符串，可留空" },
    { key: "phone", label: "联系电话", placeholder: "用于电话动作" },
    { key: "copyText", label: "复制内容", kind: "textarea", rows: 2, placeholder: "用于复制文本动作" }
  ];
  const loginActionTargetFields: ConfigField[] = actionTargetFields.map((field) =>
    field.key === "actionTargetType" ? { ...field, fallback: "member", label: "登录后点击目标" } : field
  );
  const secondaryActionTargetFields: ConfigField[] = [
    { key: "secondaryActionTargetType", label: "次按钮目标", kind: "select", fallback: "page", options: actionTargetOptions() },
    { key: "secondaryTargetPageKey", label: "次按钮目标页面", kind: "select", options: pageTargetOptions() },
    { key: "secondaryTargetConferenceId", label: "次按钮目标会议", kind: "select", options: conferenceSelectOptions() },
    { key: "secondaryTargetProductId", label: "次按钮目标商品", kind: "select", options: productSelectOptions() },
    { key: "secondaryTargetProductCategoryId", label: "次按钮目标商品分类", kind: "select", options: productCategorySelectOptions() },
    { key: "secondaryTargetCouponCampaignId", label: "次按钮目标券活动", kind: "select", options: couponCampaignSelectOptions() },
    { key: "secondaryExternalUrl", label: "次按钮外部 H5 链接", placeholder: "https://example.com" },
    { key: "secondaryExternalMiniappAppId", label: "次按钮外部小程序 AppID", placeholder: "wx..." },
    { key: "secondaryExternalMiniappPath", label: "次按钮外部小程序路径", placeholder: "pages/index/index" },
    { key: "secondaryPhone", label: "次按钮联系电话", placeholder: "用于电话动作" },
    { key: "secondaryCopyText", label: "次按钮复制内容", kind: "textarea", rows: 2 }
  ];
  const credentialFields = (extraFields: ConfigField[]): ConfigField[] => withTextStyle([
    ...commonTitle,
    {
      key: "cardStyle",
      label: "卡片样式",
      kind: "select",
      fallback: "standard",
      options: [
        { label: "标准卡片", value: "standard" },
        { label: "强调卡片", value: "highlight" },
        { label: "轻量卡片", value: "plain" }
      ]
    },
    ...extraFields
  ], 26);
  const map: Record<string, ConfigField[]> = {
    "fixed-business-template": [
      {
        key: "templateKey",
        label: "旧模板类型",
        kind: "select",
        fallback: "home",
        options: fixedBusinessTemplateOptions.map((item) => ({ label: item.name, value: item.kind }))
      },
      { key: "heroTitle", label: "主标题", placeholder: "请输入模板主标题" },
      { key: "heroSubtitle", label: "副标题", placeholder: "请输入模板副标题" },
      { key: "heroImageUrl", label: "Hero 背景图", placeholder: "从素材库选择或粘贴图片地址" },
      { key: "heroShowTitle", label: "显示主标题", kind: "switch", fallback: "true" },
      { key: "heroShowSubtitle", label: "显示副标题", kind: "switch", fallback: "true" },
      {
        key: "heroImageMode",
        label: "图片显示方式",
        kind: "select",
        fallback: "contain",
        options: [
          { label: "完整显示", value: "contain" },
          { label: "等比裁切", value: "cover" },
          { label: "宽度铺满", value: "width" }
        ]
      },
      { key: "items", label: "首页快捷入口", kind: "entry-list" },
      { key: "noticeText", label: "公告文案", kind: "textarea", rows: 2, placeholder: "首页公告/说明文案" },
      { key: "growthValue", label: "示例成长值", placeholder: "2568" },
      { key: "noticeBar", label: "显示公告条", kind: "switch", fallback: "true" },
      { key: "loginCard", label: "显示登录卡", kind: "switch", fallback: "true" },
      { key: "quickGrid", label: "显示快捷入口", kind: "switch", fallback: "true" },
      { key: "highlightStrip", label: "显示赛道导引", kind: "switch", fallback: "true" },
      { key: "statsCard", label: "显示品牌数据卡", kind: "switch", fallback: "true" },
      { key: "conferenceModels", label: "显示会议模型", kind: "switch", fallback: "true" },
      { key: "tagRows", label: "显示生态标签", kind: "switch", fallback: "true" }
    ],
    hero: [
      { key: "kicker", label: "眉标文字", placeholder: "会议报名" },
      { key: "title", label: "主标题", placeholder: "选择会议，完成报名缴费" },
      { key: "description", label: "说明文字", kind: "textarea", rows: 2, placeholder: "填写横幅说明" },
      { key: "buttonText", label: "按钮文字", placeholder: "立即报名" },
      ...actionTargetFields,
      { key: "showContent", label: "显示文案区域", kind: "switch", fallback: "true" },
      { key: "showOverlay", label: "显示遮罩", kind: "switch", fallback: "true" },
      { key: "showButton", label: "显示按钮", kind: "switch", fallback: "true" },
      { key: "imageUrl", label: "横幅图片地址", placeholder: "从素材库选择或粘贴图片地址" },
      { key: "imageOnly", label: "仅显示图片", kind: "switch", fallback: "false" },
      { key: "fullBleed", label: "横幅铺满屏幕宽度", kind: "switch", fallback: "true" },
      { key: "height", label: "横幅高度", kind: "range", fallback: 430, min: 260, max: 720 },
      {
        key: "imageMode",
        label: "图片铺满方式",
        kind: "select",
        fallback: "scaleToFill",
        options: [
          { label: "整图铺满", value: "scaleToFill" },
          { label: "整图铺满（旧配置）", value: "aspectFit" },
          { label: "等比裁切铺满", value: "aspectFill" },
          { label: "完整显示", value: "contain" },
          { label: "宽度铺满", value: "widthFix" }
        ]
      }
    ],
    carousel: [
      { key: "images", label: "轮播图片", kind: "list", placeholder: "每行一个图片地址", rows: 5 },
      { key: "height", label: "轮播高度", kind: "range", fallback: 320, min: 160, max: 680 },
      {
        key: "imageMode",
        label: "图片显示方式",
        kind: "select",
        fallback: "scaleToFill",
        options: [
          { label: "整图铺满", value: "scaleToFill" },
          { label: "整图铺满（旧配置）", value: "aspectFit" },
          { label: "等比裁切铺满", value: "aspectFill" },
          { label: "完整显示", value: "contain" },
          { label: "宽度铺满", value: "widthFix" }
        ]
      },
      { key: "fullBleed", label: "铺满屏幕宽度", kind: "switch", fallback: "true" },
      { key: "autoplay", label: "自动轮播", kind: "switch", fallback: "true" },
      { key: "indicatorDots", label: "显示指示点", kind: "switch", fallback: "true" }
    ],
    "hero-banner": withTextStyle([
      { key: "title", label: "主标题", placeholder: "欢迎进入会务小程序" },
      { key: "showTitle", label: "显示主标题", kind: "switch", fallback: "true" },
      { key: "subtitle", label: "副标题", placeholder: "会议报名、签到和会务服务一站完成" },
      { key: "showSubtitle", label: "显示副标题", kind: "switch", fallback: "true" },
      { key: "description", label: "说明文字", kind: "textarea", rows: 2 },
      { key: "showDescription", label: "显示说明文字", kind: "switch", fallback: "true" },
      { key: "imageUrl", label: "背景图片", placeholder: "从素材库选择或粘贴图片地址" },
      { key: "backgroundColor", label: "背景色", kind: "color", fallback: "#315d7d" },
      { key: "textColor", label: "文字颜色", kind: "color", fallback: "#ffffff" },
      { key: "buttonText", label: "主按钮文案", placeholder: "查看会议" },
      ...actionTargetFields,
      { key: "secondaryButtonText", label: "次按钮文案", placeholder: "我的报名" },
      ...secondaryActionTargetFields,
      { key: "imageOnly", label: "仅显示图片", kind: "switch", fallback: "false" },
      { key: "showOverlay", label: "显示遮罩", kind: "switch", fallback: "true" },
      { key: "contentAlign", label: "文字水平位置", kind: "select", fallback: "left", options: [{ label: "居左", value: "left" }, { label: "居中", value: "center" }, { label: "居右", value: "right" }] },
      { key: "verticalAlign", label: "文字垂直位置", kind: "select", fallback: "bottom", options: [{ label: "顶部", value: "top" }, { label: "居中", value: "center" }, { label: "底部", value: "bottom" }] },
      {
        key: "imageMode",
        label: "图片显示方式",
        kind: "select",
        fallback: "scaleToFill",
        options: [
          { label: "整图铺满", value: "scaleToFill" },
          { label: "完整显示", value: "contain" },
          { label: "等比裁切铺满", value: "aspectFill" },
          { label: "宽度铺满", value: "widthFix" }
        ]
      },
      { key: "height", label: "高度", kind: "range", fallback: 420, min: 260, max: 720 },
      { key: "radius", label: "圆角", kind: "range", fallback: 28, min: 0, max: 48 }
    ], 26),
    "login-card": withTextStyle([
      { key: "logoUrl", label: "未登录 Logo / 头像图", placeholder: "建议 96×96 PNG/SVG/GIF，可从素材库选择" },
      { key: "title", label: "未登录标题", placeholder: "欢迎来到观潮会集" },
      { key: "subtitle", label: "未登录说明", kind: "textarea", rows: 2, placeholder: "欢迎光临，请登录成为会员，查看会议排期与报名权益" },
      { key: "buttonText", label: "登录按钮文案", placeholder: "立即登录" },
      { key: "loggedInTitle", label: "已登录标题", placeholder: "留空时自动显示欢迎回来 + 微信昵称" },
      { key: "loggedInSubtitle", label: "已登录说明", kind: "textarea", rows: 2, placeholder: "可查看会议排期、报名权益和会员资料。" },
      { key: "loggedInButtonText", label: "已登录按钮文案", placeholder: "查看权益" },
      { key: "backgroundColor", label: "卡片背景色", kind: "color", fallback: "" },
      ...loginActionTargetFields
    ], 26),
    "quick-icon-grid": withTextStyle([
      ...commonTitle,
      { key: "columns", label: "列数", kind: "select", fallback: "3", options: [{ label: "2 列", value: "2" }, { label: "3 列", value: "3" }, { label: "4 列", value: "4" }, { label: "5 列", value: "5" }] },
      { key: "layoutMode", label: "布局方式", kind: "select", fallback: "grid", options: [{ label: "宫格", value: "grid" }, { label: "纵向列表", value: "list" }, { label: "横向滑动", value: "scroll" }] },
      { key: "iconSize", label: "图标尺寸", kind: "select", fallback: "large", options: [{ label: "超大图标", value: "xlarge" }, { label: "大图标", value: "large" }, { label: "小图标", value: "small" }] },
      { key: "cardStyle", label: "卡片样式", kind: "select", fallback: "soft", options: [{ label: "柔和卡片", value: "soft" }, { label: "描边卡片", value: "outline" }, { label: "无边框", value: "plain" }] },
      { key: "cardRadius", label: "卡片圆角", kind: "range", fallback: 28, min: 0, max: 48 },
      { key: "cardGap", label: "入口间距", kind: "range", fallback: 14, min: 4, max: 40 },
      { key: "backgroundColor", label: "模块背景色", kind: "color", fallback: "" },
      { key: "cardBackground", label: "卡片背景色", kind: "color", fallback: "" },
      { key: "showSubtitle", label: "显示英文副标题", kind: "switch", fallback: "true" },
      { key: "items", label: "入口配置", kind: "entry-list" }
    ], 24),
    "member-promo-banner": withTextStyle([
      ...commonTitle,
      { key: "subtitle", label: "副标题", placeholder: "查看会员价和专属权益" },
      { key: "description", label: "说明文字", kind: "textarea", rows: 2 },
      { key: "imageUrl", label: "背景图片", placeholder: "从素材库选择或粘贴图片地址" },
      { key: "buttonText", label: "按钮文案", placeholder: "查看会员中心" },
      { key: "backgroundColor", label: "背景色", kind: "color", fallback: "" },
      ...actionTargetFields
    ], 26),
    "event-card-carousel": withTextStyle([
      ...commonTitle,
      { key: "limit", label: "展示数量", kind: "number", fallback: 6 },
      { key: "cardSize", label: "卡片尺寸", kind: "select", fallback: "large", options: [{ label: "大图卡片", value: "large" }, { label: "小图卡片", value: "small" }] },
      { key: "conferenceIds", label: "指定会议", kind: "list", rows: 3, placeholder: "可选，每行一个会议 ID；留空展示会议列表前 N 个" },
      { key: "category", label: "分类/标签过滤", placeholder: "按会议标题、摘要或地点关键词过滤" },
      { key: "detailButtonText", label: "详情按钮文案", placeholder: "查看详情" },
      ...conferenceDisplayFields
    ], 26),
    "service-shortcut-card": withTextStyle([
      ...commonTitle,
      { key: "columns", label: "列数", kind: "select", fallback: "2", options: [{ label: "2 列", value: "2" }, { label: "3 列", value: "3" }, { label: "4 列", value: "4" }] },
      { key: "layoutMode", label: "布局方式", kind: "select", fallback: "grid", options: [{ label: "宫格", value: "grid" }, { label: "纵向列表", value: "list" }, { label: "横向滑动", value: "scroll" }] },
      { key: "iconSize", label: "图标尺寸", kind: "select", fallback: "small", options: [{ label: "超大图标", value: "xlarge" }, { label: "大图标", value: "large" }, { label: "小图标", value: "small" }] },
      { key: "cardStyle", label: "卡片样式", kind: "select", fallback: "soft", options: [{ label: "柔和卡片", value: "soft" }, { label: "描边卡片", value: "outline" }, { label: "无边框", value: "plain" }] },
      { key: "cardRadius", label: "卡片圆角", kind: "range", fallback: 24, min: 0, max: 48 },
      { key: "cardGap", label: "入口间距", kind: "range", fallback: 14, min: 4, max: 40 },
      { key: "backgroundColor", label: "模块背景色", kind: "color", fallback: "" },
      { key: "cardBackground", label: "卡片背景色", kind: "color", fallback: "" },
      { key: "showSubtitle", label: "显示说明文字", kind: "switch", fallback: "true" },
      { key: "items", label: "服务入口", kind: "entry-list" }
    ], 24),
    "task-progress-card": withTextStyle([
      ...commonTitle,
      { key: "subtitle", label: "副标题", placeholder: "完成任务领取权益" },
      { key: "description", label: "说明文字", kind: "textarea", rows: 2 },
      { key: "iconUrl", label: "图标地址", placeholder: "从素材库选择或粘贴图标地址" },
      { key: "current", label: "当前进度", kind: "number", fallback: 0 },
      { key: "target", label: "目标进度", kind: "number", fallback: 8 },
      { key: "unit", label: "进度单位", placeholder: "项" },
      { key: "ruleText", label: "规则说明", placeholder: "完成 8 项任务可领取权益" },
      ...actionTargetFields
    ], 26),
    "image-promo-card": withTextStyle([
      ...commonTitle,
      { key: "subtitle", label: "副标题", placeholder: "自定义活动卡片" },
      { key: "imageUrl", label: "图片地址", placeholder: "从素材库选择或粘贴图片地址" },
      { key: "buttonText", label: "按钮文案", placeholder: "查看详情" },
      { key: "radius", label: "圆角", kind: "range", fallback: 24, min: 0, max: 48 },
      ...actionTargetFields
    ], 26),
    "rich-content-block": withTextStyle([
      ...commonTitle,
      { key: "subtitle", label: "副标题", placeholder: "模块副标题" },
      { key: "blocks", label: "图文内容块", kind: "rich-blocks" },
      ...richContentLayoutFields
    ], 26),
    "conference-list": withTextStyle([...commonTitle, { key: "limit", label: "展示数量", kind: "number", fallback: 10 }, ...conferenceDisplayFields], 26),
    "conference-schedule": withTextStyle([
      ...commonTitle,
      { key: "categories", label: "分类筛选", kind: "list", placeholder: "每行一个分类，例如：全部、闭门会、论坛、沙龙", rows: 5 },
      { key: "limit", label: "展示数量", kind: "number", fallback: 8 },
      { key: "showCalendarButton", label: "显示日历入口", kind: "switch", fallback: "true" },
      { key: "showItemCalendarButton", label: "每条会议显示日历按钮", kind: "switch", fallback: "false" },
      { key: "calendarText", label: "日历入口文案", placeholder: "日历 / 保存日程" },
      ...conferenceDisplayFields
    ], 26),
    "conference-tabs": withTextStyle([...commonTitle, { key: "target", label: "筛选字段", kind: "select", fallback: "tag", options: filterTargetOptions() }, { key: "tabs", label: "分类名称", kind: "list", placeholder: "每行一个分类名称；留空时自动取会议地点", rows: 4 }, ...conferenceDisplayFields], 26),
    "speaker-cards": withTextStyle([...commonTitle, { key: "speakers", label: "嘉宾信息", kind: "list", placeholder: "每行一位嘉宾，例如：张三｜主讲嘉宾", rows: 5 }], 26),
    "schedule-timeline": withTextStyle([...commonTitle, { key: "items", label: "日程安排", kind: "list", placeholder: "每行一项日程", rows: 5 }], 26),
    "registration-button": withTextStyle([{ key: "text", label: "按钮文字", placeholder: "立即报名" }, ...actionTargetFields], 28),
    "floating-registration-button": withTextStyle([{ key: "text", label: "悬浮按钮文字", placeholder: "立即报名" }, ...actionTargetFields], 28),
    "coupon-card": withTextStyle([
      ...commonTitle,
      { key: "description", label: "说明文字", kind: "textarea", rows: 2 },
      { key: "buttonText", label: "按钮文案", placeholder: "立即领取" },
      { key: "couponCampaignId", label: "关联券活动", kind: "select", options: couponCampaignSelectOptions() },
      { key: "claimCode", label: "领取码兜底", placeholder: "优先使用券活动选择器；仅兼容历史页面" }
    ], 26),
    "promotion-bar": withTextStyle([
      { key: "iconText", label: "左侧图标文字", placeholder: "可填符号或短字，如：▰" },
      { key: "title", label: "引导标题", placeholder: "五大增量生态 × 五大垂类赛道" },
      { key: "text", label: "兼容旧提示文字", placeholder: "旧配置兜底，可留空" },
      { key: "buttonText", label: "右侧按钮文案", placeholder: "查看详情" },
      { key: "showArrow", label: "显示右箭头", kind: "switch", fallback: "true" },
      { key: "barHeight", label: "导引条高度", kind: "range", fallback: 72, min: 48, max: 180 },
      { key: "backgroundColor", label: "背景色", kind: "color", fallback: "" },
      ...actionTargetFields
    ], 28),
    "rich-text": withTextStyle([{ key: "blocks", label: "图文内容块", kind: "rich-blocks" }, ...richContentLayoutFields], 28),
    "safe-html": withTextStyle([{ key: "blocks", label: "图文内容块", kind: "rich-blocks" }, ...richContentLayoutFields], 28),
    "image-grid": [{ key: "images", label: "图片宫格", kind: "list", placeholder: "每行一个图片地址", rows: 5 }, ...layoutFields],
    video: withTextStyle([...commonTitle, { key: "url", label: "视频地址", placeholder: "请输入视频地址" }, { key: "coverUrl", label: "视频封面", placeholder: "从素材库选择视频封面" }], 26),
    countdown: withTextStyle([...commonTitle, { key: "targetAt", label: "目标时间", placeholder: "例如 2026-08-01 09:00" }, { key: "endedText", label: "结束文案", placeholder: "活动已开始" }], 26),
    notice: withTextStyle([
      { key: "text", label: "公告内容", placeholder: "请输入公告" },
      { key: "showIcon", label: "显示提示图标", kind: "switch", fallback: "true" },
      { key: "iconText", label: "图标文字", placeholder: "例如：播" },
      { key: "displayStyle", label: "展示样式", kind: "select", fallback: "elegant", options: [{ label: "精致横条", value: "elegant" }, { label: "轻提示", value: "subtle" }, { label: "强调提示", value: "strong" }] },
      { key: "textAlign", label: "文字对齐", kind: "select", fallback: "left", options: [{ label: "居左", value: "left" }, { label: "居中", value: "center" }, { label: "居右", value: "right" }] }
    ], 28),
    search: withTextStyle([
      ...commonTitle,
      { key: "placeholder", label: "输入框占位", placeholder: "输入会议关键词" },
      { key: "buttonText", label: "按钮文案", placeholder: "搜索" },
      { key: "target", label: "跳转目标", kind: "select", fallback: "conference-list", options: [{ label: "会议列表", value: "conference-list" }] },
      { key: "searchScope", label: "搜索范围", kind: "select", fallback: "conference", options: [{ label: "会议标题/摘要/地点", value: "conference" }] }
    ], 26),
    "map-contact": withTextStyle([
      ...commonTitle,
      { key: "contactName", label: "联系人", placeholder: "会务组" },
      { key: "address", label: "会议地址", placeholder: "请输入地址" },
      { key: "phone", label: "联系电话", placeholder: "请输入电话" },
      { key: "mapUrl", label: "地图链接", placeholder: "可填写地图或导航链接；小程序端会复制链接" }
    ], 26),
    "sponsor-wall": withTextStyle([...commonTitle, { key: "sponsors", label: "赞助商", kind: "list", placeholder: "每行一个赞助商：名称｜Logo URL｜链接", rows: 4 }], 26),
    faq: withTextStyle([...commonTitle, { key: "items", label: "常见问题", kind: "list", placeholder: "每行一个问题和答案：问题｜答案", rows: 5 }], 26),
    "stats-grid": withTextStyle([
      ...commonTitle,
      { key: "subtitle", label: "模块说明", placeholder: "例如：行业会议与创始人社群平台" },
      { key: "dataSource", label: "数据来源", kind: "select", fallback: "static", options: [{ label: "手动配置", value: "static" }, { label: "当前登录用户", value: "current-user" }] },
      { key: "columns", label: "列数", kind: "select", fallback: "2", options: [{ label: "2 列", value: "2" }, { label: "3 列", value: "3" }, { label: "4 列", value: "4" }] },
      { key: "cardStyle", label: "展示样式", kind: "select", fallback: "split", options: [{ label: "分栏数据", value: "split" }, { label: "简洁无边框", value: "plain" }] },
      { key: "items", label: "数字亮点", kind: "list", placeholder: "每行一项：1500+｜头部创始人", rows: 4 }
    ], 26),
    "dual-track-tags": withTextStyle([
      { key: "primaryTitle", label: "第一行标题", placeholder: "五大增量生态" },
      { key: "primaryItems", label: "第一行标签", kind: "list", rows: 5, placeholder: "每行一个标签，例如：自然" },
      { key: "primaryButtonText", label: "第一行按钮", placeholder: "查看" },
      ...actionTargetFields,
      { key: "secondaryTitle", label: "第二行标题", placeholder: "五大垂类赛道" },
      { key: "secondaryItems", label: "第二行标签", kind: "list", rows: 5, placeholder: "每行一个标签，例如：学前" },
      { key: "secondaryButtonText", label: "第二行按钮", placeholder: "查看" },
      ...secondaryActionTargetFields,
      { key: "backgroundColor", label: "模块背景色", kind: "color", fallback: "" }
    ], 26),
    "ticket-price-list": withTextStyle([...commonTitle, { key: "items", label: "票种价格", kind: "list", placeholder: "例如：早鸟票 ¥299", rows: 4 }], 26),
    "process-steps": withTextStyle([...commonTitle, { key: "items", label: "流程步骤", kind: "list", placeholder: "每行一个步骤", rows: 4 }], 26),
    "text-image": withTextStyle([
      ...commonTitle,
      { key: "blocks", label: "图文内容块", kind: "rich-blocks" },
      ...richContentLayoutFields
    ], 26),
    "download-list": withTextStyle([...commonTitle, { key: "items", label: "资料文件", kind: "list", placeholder: "每行一份资料：名称｜文件 URL｜说明", rows: 4 }], 26),
    "live-card": withTextStyle([
      ...commonTitle,
      { key: "platform", label: "直播平台", placeholder: "视频号 / 腾讯会议 / 其他" },
      { key: "startAt", label: "开始时间", placeholder: "例如 2026-08-01 09:00" },
      { key: "endAt", label: "结束时间", placeholder: "例如 2026-08-01 12:00" },
      { key: "text", label: "直播说明", kind: "textarea", rows: 2 },
      { key: "url", label: "直播地址", placeholder: "请输入直播地址" },
      { key: "coverUrl", label: "直播封面", placeholder: "从素材库选择直播封面" },
      { key: "buttonText", label: "按钮文案", placeholder: "打开直播" }
    ], 26),
    "testimonial-list": withTextStyle([...commonTitle, { key: "items", label: "参会评价", kind: "list", placeholder: "每行一条评价：评价｜姓名｜单位｜头像 URL", rows: 4 }], 26),
    "traffic-guide": withTextStyle([
      ...commonTitle,
      { key: "address", label: "地址", placeholder: "请输入地址" },
      { key: "mapUrl", label: "地图链接", placeholder: "可填写地图或导航链接；小程序端会复制链接" },
      { key: "phone", label: "联系电话", placeholder: "请输入电话" },
      { key: "text", label: "交通说明", kind: "textarea", rows: 3 }
    ], 26),
    "contact-card": withTextStyle([
      ...commonTitle,
      { key: "phone", label: "联系电话", placeholder: "请输入电话" },
      { key: "text", label: "咨询说明", kind: "textarea", rows: 2 }
    ], 26),
    "tag-filter": withTextStyle([...commonTitle, { key: "target", label: "筛选/跳转对象", kind: "select", fallback: "tag", options: filterTargetOptions() }, { key: "items", label: "标签按钮", kind: "list", placeholder: "每行一个按钮：显示名｜筛选值｜对象；商城可写：文创周边｜分类ID｜product-category", rows: 4 }], 26),
    "membership-benefits": withTextStyle([
      ...commonTitle,
      { key: "subtitle", label: "权益说明", placeholder: "尊享会员专属特权" },
      { key: "imageUrl", label: "权益背景图", placeholder: "从素材库选择或粘贴图片地址" },
      { key: "items", label: "权益项", kind: "list", placeholder: "每行一个会员权益", rows: 5 },
      { key: "buttonText", label: "按钮文案", placeholder: "查看权益" }
    ], 26),
    "user-profile-card": withTextStyle([
      ...commonTitle,
      { key: "description", label: "未登录提示", kind: "textarea", rows: 2 },
      { key: "loggedInDescription", label: "已登录说明", kind: "textarea", rows: 2 },
      { key: "buttonText", label: "已登录按钮文案", placeholder: "编辑资料" },
      { key: "loginButtonText", label: "未登录按钮文案", placeholder: "立即登录" },
      { key: "imageUrl", label: "卡片背景图", placeholder: "从素材库选择或粘贴图片地址" },
      { key: "cardStyle", label: "卡片样式", kind: "select", fallback: "brand", options: [{ label: "品牌背景", value: "brand" }, { label: "简洁白卡", value: "plain" }] },
      { key: "target", label: "点击目标", kind: "select", fallback: "member", options: profileTargetOptions() }
    ], 26),
    "my-order-list": withTextStyle([...commonTitle, { key: "orderType", label: "展示类型", kind: "select", fallback: "both", options: orderTypeOptions() }], 26),
    "mall-product-grid": withTextStyle([
      ...commonTitle,
      { key: "limit", label: "展示数量", kind: "number", fallback: 4 },
      { key: "keyword", label: "商品关键词", placeholder: "按商品标题过滤" },
      { key: "productCategoryId", label: "商品分类", kind: "select", options: productCategorySelectOptions() },
      { key: "categories", label: "分类标签", kind: "list", rows: 5, placeholder: "每行一个标签，例如：全部、办公用品" },
      { key: "columns", label: "列数", kind: "select", fallback: "2", options: [{ label: "2 列", value: "2" }, { label: "3 列", value: "3" }, { label: "4 列", value: "4" }] },
      { key: "layoutMode", label: "布局方式", kind: "select", fallback: "grid", options: [{ label: "宫格", value: "grid" }, { label: "横向推荐", value: "scroll" }] },
      { key: "imageRatio", label: "图片比例", kind: "select", fallback: "1:1", options: [{ label: "正方形 1:1", value: "1:1" }, { label: "横图 4:3", value: "4:3" }, { label: "竖图 3:4", value: "3:4" }] },
      { key: "cardStyle", label: "卡片样式", kind: "select", fallback: "elevated", options: [{ label: "轻阴影", value: "elevated" }, { label: "描边", value: "outline" }, { label: "简洁", value: "plain" }] },
      { key: "showImage", label: "显示商品图", kind: "switch", fallback: "true" },
      { key: "showSubtitle", label: "显示商品副标题", kind: "switch", fallback: "false" },
      { key: "showPrice", label: "显示价格", kind: "switch", fallback: "true" },
      { key: "showCartButton", label: "显示加购按钮", kind: "switch", fallback: "true" },
      { key: "buttonText", label: "加购按钮文案", placeholder: "加入购物车" },
      { key: "cartSuccessText", label: "加购成功提示", placeholder: "已加入购物车" },
      { key: "showMoreButton", label: "显示查看更多按钮", kind: "switch", fallback: "false" },
      { key: "moreButtonText", label: "查看更多文案", placeholder: "查看更多" }
    ], 26),
    "credential-header": credentialFields([
      { key: "statusText", label: "状态文案", placeholder: "报名成功" }
    ]),
    "credential-qr": credentialFields([
      { key: "description", label: "二维码说明", kind: "textarea", rows: 2, placeholder: "工作人员可扫码完成签到核销。" }
    ]),
    "credential-conference-info": credentialFields([]),
    "credential-attendee-info": credentialFields([
      { key: "showWechatUser", label: "显示微信用户", kind: "switch", fallback: "true" }
    ]),
    "credential-payment-info": credentialFields([]),
    "credential-form-summary": credentialFields([
      { key: "emptyText", label: "无字段文案", placeholder: "暂无补充报名字段" }
    ]),
    "credential-checkin-info": credentialFields([]),
    "credential-actions": credentialFields([
      { key: "checkinText", label: "签到按钮文案", placeholder: "去签到" },
      { key: "groupText", label: "客户群按钮文案", placeholder: "加入会议客户群" },
      { key: "agendaText", label: "议程按钮文案", placeholder: "查看议程" },
      { key: "guideText", label: "指南按钮文案", placeholder: "参会指南" },
      { key: "contactText", label: "客服按钮文案", placeholder: "联系客服" },
      { key: "calendarText", label: "日历按钮文案", placeholder: "添加到日历" }
    ]),
    title: withTextStyle([{ key: "text", label: "标题文字", placeholder: "请输入标题" }], 34),
    divider: [],
    spacer: [{ key: "height", label: "留白高度", kind: "number", fallback: 24 }]
  };
  return map[type] ?? commonTitle;
}

function couponCampaignSelectOptions(): Array<{ label: string; value: string }> {
  return [
    { label: "不关联券活动", value: "" },
    ...couponCampaignOptions.value.map((item) => ({ label: `${item.name}（${item.claimCode}）`, value: item.id }))
  ];
}

function productCategorySelectOptions(): Array<{ label: string; value: string }> {
  return [
    { label: "全部分类", value: "" },
    ...productCategoryOptions.value.map((item) => ({ label: item.name, value: item.id }))
  ];
}

function actionTargetOptions(): Array<{ label: string; value: string }> {
  return [
    { label: "不跳转", value: "none" },
    { label: "打开登录弹窗", value: "login" },
    { label: "默认报名动作", value: "register" },
    { label: "打开页面", value: "page" },
    { label: "打开会议", value: "conference" },
    { label: "打开报名页", value: "registration" },
    { label: "打开商品", value: "product" },
    { label: "打开商品分类", value: "product-category" },
    { label: "打开券活动", value: "coupon" },
    { label: "会员中心", value: "member" },
    { label: "购物车", value: "cart" },
    { label: "商城订单", value: "mall-orders" },
    { label: "发票申请", value: "invoice" },
    { label: "售后申请", value: "aftersale" },
    { label: "AI 助手", value: "ai" },
    { label: "外部 H5", value: "external-h5" },
    { label: "外部小程序", value: "external-miniapp" },
    { label: "拨打电话", value: "phone" },
    { label: "复制文本", value: "copy" }
  ];
}

function pageTargetOptions(): Array<{ label: string; value: string }> {
  return [
    { label: "请选择页面", value: "" },
    ...pages.value.map((page) => ({ label: `${page.title}（${pageBindingLabel(page) || page.pageKey}）`, value: page.pageKey }))
  ];
}

function conferenceSelectOptions(): Array<{ label: string; value: string }> {
  return [
    { label: "请选择会议", value: "" },
    ...previewConferences.value.map((item) => ({ label: item.title, value: item.id }))
  ];
}

function productSelectOptions(): Array<{ label: string; value: string }> {
  return [
    { label: "请选择商品", value: "" },
    ...productOptions.value.map((item) => ({ label: item.title, value: item.id }))
  ];
}

function filterTargetOptions(): Array<{ label: string; value: string }> {
  return [
    { label: "会议标签关键词", value: "tag" },
    { label: "会议地点", value: "location" },
    { label: "会议分类关键词", value: "category" },
    { label: "商城商品分类", value: "product-category" },
    { label: "商城商品关键词", value: "productKeyword" }
  ];
}

function profileTargetOptions(): Array<{ label: string; value: string }> {
  return [
    { label: "会员中心", value: "member" },
    { label: "我的报名", value: "registrations" }
  ];
}

function orderTypeOptions(): Array<{ label: string; value: string }> {
  return [
    { label: "报名订单和商城订单", value: "both" },
    { label: "仅报名订单", value: "registration" },
    { label: "仅商城订单", value: "mall" }
  ];
}

function groupedFieldsFor(type: string): ConfigFieldGroup[] {
  const fields = fieldsFor(type);
  if (fields.length === 0) return [];

  if (type === "fixed-business-template") {
    return compactGroups([
      { key: "template", title: "旧页兼容", fields: fieldsByKeys(fields, ["templateKey", "heroShowTitle", "heroTitle", "heroShowSubtitle", "heroSubtitle", "heroImageUrl", "heroImageMode", "noticeText", "growthValue"]) },
      { key: "quick-entry", title: "首页快捷入口", fields: fieldsByKeys(fields, ["items"]) },
      { key: "visibility", title: "模块显隐", fields: fieldsByKeys(fields, ["noticeBar", "loginCard", "quickGrid", "highlightStrip", "statsCard", "conferenceModels", "tagRows"]) }
    ]);
  }

  if (type === "hero") {
    return compactGroups([
      { key: "content", title: "横幅内容", fields: fieldsByKeys(fields, ["kicker", "title", "description", "buttonText", "showContent", "showButton"]) },
      { key: "media", title: "图片与布局", fields: fieldsByKeys(fields, ["imageUrl", "imageOnly", "showOverlay", "fullBleed", "height", "imageMode"]) }
    ]);
  }

  if (type === "carousel") {
    return compactGroups([
      { key: "images", title: "轮播图片", fields: fieldsByKeys(fields, ["images"]) },
      { key: "display", title: "显示与播放", fields: fieldsByKeys(fields, ["height", "imageMode", "fullBleed", "autoplay", "indicatorDots"]) }
    ]);
  }

  if (type === "conference-list" || type === "conference-tabs" || type === "conference-schedule") {
    return compactGroups([
      { key: "content", title: "基础内容", fields: fieldsByKeys(fields, ["title", "limit", "tabs", "categories", "showCalendarButton", "showItemCalendarButton", "calendarText", "summaryFallback", "detailButtonText", "showAppointmentButton", "appointmentButtonText"]) },
      {
        key: "display",
        title: "显示控制",
        fields: fieldsByKeys(fields, [
          "showCover",
          "fullBleed",
          "cardImageLayout",
          "cardImageMode",
          "cardImageHeight",
          "showSummary",
          "showTime",
          "showLocation",
          "showRegistrationCount",
          "registrationCountMode",
          "virtualRegistrationBase",
          "virtualRegistrationStep",
          "contentBackgroundStyle",
          "moduleHeight",
          "moduleOpacity",
          "moduleSpacingTop"
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
      { key: "module-title", title: "模块标题样式", fields: fieldsByKeys(fields, ["showTitle", "title", "subtitle", "titleBottomGap", "showMore", "moreText", "moreActionTargetType", "moreTargetPageKey", "moreTargetConferenceId", "moreTargetProductId", "moreExternalUrl", "titleFontSize", "titleFontWeight", "titleFontFamily", "titleFontAssetUrl", "titleTextColor", "subtitleFontSize", "subtitleTextColor", "titleTextAlign"]) }
    ]);
  }

  if (isRichContentComponentType(type)) {
    return compactGroups([
      { key: "content", title: "图文内容", fields: fieldsByKeys(fields, ["blocks"]) },
      { key: "layout", title: "铺满与间距", fields: fieldsByKeys(fields, ["fullBleed", "contentBackgroundStyle", "contentPadding", "blockGap", "imageRadius", "moduleHeight", "moduleOpacity", "moduleSpacingTop"]) },
      { key: "module-title", title: "模块标题样式", fields: fieldsByKeys(fields, ["showTitle", "title", "subtitle", "titleBottomGap", "showMore", "moreText", "moreActionTargetType", "moreTargetPageKey", "moreTargetConferenceId", "moreTargetProductId", "moreExternalUrl", "titleFontSize", "titleFontWeight", "titleFontFamily", "titleFontAssetUrl", "titleTextColor", "subtitleFontSize", "subtitleTextColor", "titleTextAlign"]) },
      { key: "text-style", title: "内容文字样式", fields: fieldsByKeys(fields, ["fontSize", "fontFamily", "fontAssetUrl", "textColor", "textAlign"]) }
    ]);
  }

  const titleKeys = ["showTitle", "title", "subtitle", "titleBottomGap", "showMore", "moreText", "moreActionTargetType", "moreTargetPageKey", "moreTargetConferenceId", "moreTargetProductId", "moreExternalUrl", "titleFontSize", "titleFontWeight", "titleFontFamily", "titleFontAssetUrl", "titleTextColor", "subtitleFontSize", "subtitleTextColor", "titleTextAlign"];
  const textKeys = ["fontSize", "fontFamily", "fontAssetUrl", "textColor", "textAlign"];
  const layoutKeys = ["moduleHeight", "moduleOpacity", "moduleSpacingTop", "contentBackgroundStyle"];
  const contentFields = fields.filter((field) => !titleKeys.includes(field.key) && !textKeys.includes(field.key) && !layoutKeys.includes(field.key));
  return compactGroups([
    { key: "content", title: "基础内容", fields: contentFields },
    { key: "layout", title: "模块尺寸与透明度", fields: fieldsByKeys(fields, layoutKeys) },
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

function entryItemsFor(component: EditableComponent): EntryConfigItem[] {
  const current = component.config.items;
  if (Array.isArray(current) && current.every(isStandardEntryConfigItem)) {
    return current as EntryConfigItem[];
  }
  const items = normalizeEntryItems(current, component.type);
  setConfig(component, "items", items);
  return items;
}

function isEntryExpanded(id: string): boolean {
  return expandedEntryIds.value.includes(id);
}

function toggleEntryExpanded(id: string) {
  expandedEntryIds.value = isEntryExpanded(id)
    ? expandedEntryIds.value.filter((item) => item !== id)
    : [...expandedEntryIds.value, id];
}

function expandEntry(id: string) {
  if (!isEntryExpanded(id)) expandedEntryIds.value = [...expandedEntryIds.value, id];
}

function entryIconPreview(entry: EntryConfigItem): string {
  return entry.dynamicIconUrl || entry.iconUrl;
}

function normalizeEntryItems(value: unknown, componentType = "quick-icon-grid"): EntryConfigItem[] {
  const fallback = componentType === "service-shortcut-card" ? defaultServiceEntries() : defaultQuickEntries();
  const rawItems = Array.isArray(value) ? value : fallback;
  return rawItems
    .map((item, index) => normalizeEntryItem(item, index))
    .filter((item) => item.title)
    .sort((a, b) => a.sort - b.sort)
    .map((item, index) => ({ ...item, sort: index * 10 + 10 }));
}

function normalizeEntryItem(value: unknown, index: number): EntryConfigItem {
  if (isEntryConfigRecord(value)) {
    const targetType = readString(value.actionTargetType ?? value.targetType ?? value.actionType ?? value.type) || "none";
    const fallbackTarget = readString(value.targetValue ?? value.target);
    return {
      id: readString(value.id) || `entry-${Date.now()}-${index}`,
      enabled: typeof value.enabled === "boolean" ? value.enabled : true,
      sort: Number.isFinite(Number(value.sort)) ? Number(value.sort) : index * 10 + 10,
      title: readString(value.title ?? value.name ?? value.label ?? value.text) || "入口",
      subtitle: readString(value.subtitle ?? value.description ?? value.desc ?? value.englishTitle),
      iconUrl: readString(value.iconUrl ?? value.imageUrl ?? value.icon ?? value.image),
      dynamicIconUrl: readString(value.dynamicIconUrl ?? value.animatedIconUrl),
      builtinIcon: readString(value.builtinIcon),
      backgroundColor: readString(value.backgroundColor),
      textColor: readString(value.textColor),
      cardStyle: readString(value.cardStyle),
      actionTargetType: targetType,
      targetPageKey: readString(value.targetPageKey ?? value.pageKey) || (targetType === "page" ? fallbackTarget : ""),
      targetConferenceId: readString(value.targetConferenceId ?? value.conferenceId) || (targetType === "conference" || targetType === "registration" || targetType === "ai" ? fallbackTarget : ""),
      targetProductId: readString(value.targetProductId ?? value.productId) || (targetType === "product" ? fallbackTarget : ""),
      targetProductCategoryId: readString(value.targetProductCategoryId ?? value.productCategoryId) || (targetType === "product-category" ? fallbackTarget : ""),
      targetCouponCampaignId: readString(value.targetCouponCampaignId ?? value.couponCampaignId) || (targetType === "coupon" ? fallbackTarget : ""),
      externalUrl: readString(value.externalUrl ?? value.url) || (targetType === "external-h5" ? fallbackTarget : ""),
      externalMiniappAppId: readString(value.externalMiniappAppId ?? value.miniappAppId) || (targetType === "external-miniapp" ? fallbackTarget : ""),
      externalMiniappPath: readString(value.externalMiniappPath ?? value.miniappPath),
      externalMiniappExtraData: readString(value.externalMiniappExtraData ?? value.miniappExtraData),
      phone: readString(value.phone) || (targetType === "phone" ? fallbackTarget : ""),
      copyText: readString(value.copyText) || (targetType === "copy" ? fallbackTarget : ""),
      copySuccessText: readString(value.copySuccessText) || "内容已复制"
    };
  }

  const parts = String(value).split(/[|｜]/).map((item) => item.trim());
  const targetType = parts[3] || (parts[2] && !looksLikePreviewImage(parts[2]) ? parts[2] : "none");
  const targetValue = parts[4] || "";
  return normalizeEntryItem(
    {
      id: `entry-${Date.now()}-${index}`,
      enabled: true,
      sort: index * 10 + 10,
      title: parts[0] || "入口",
      subtitle: parts[1] || "",
      iconUrl: looksLikePreviewImage(parts[2] || "") ? parts[2] : "",
      actionTargetType: targetType,
      targetValue
    },
    index
  );
}

function addEntryItem(component: EditableComponent) {
  const items = entryItemsFor(component);
  const nextEntry = normalizeEntryItem(
    {
      id: `entry-${Date.now()}`,
      title: "新入口",
      subtitle: "",
      actionTargetType: "page",
      targetPageKey: ""
    },
    items.length
  );
  setConfig(component, "items", [
    ...items,
    nextEntry
  ]);
  expandEntry(nextEntry.id);
}

function removeEntryItem(component: EditableComponent, index: number) {
  const items = [...entryItemsFor(component)];
  const removed = items[index];
  items.splice(index, 1);
  setConfig(component, "items", items.map((item, nextIndex) => ({ ...item, sort: nextIndex * 10 + 10 })));
  if (removed) expandedEntryIds.value = expandedEntryIds.value.filter((id) => id !== removed.id);
}

function moveEntryItem(component: EditableComponent, index: number, offset: number) {
  const items = [...entryItemsFor(component)];
  const target = index + offset;
  if (target < 0 || target >= items.length) return;
  const [item] = items.splice(index, 1);
  items.splice(target, 0, item);
  setConfig(component, "items", items.map((entry, nextIndex) => ({ ...entry, sort: nextIndex * 10 + 10 })));
}

function duplicateEntryItem(component: EditableComponent, index: number) {
  const items = [...entryItemsFor(component)];
  const source = items[index];
  if (!source) return;
  const nextEntry = normalizeEntryItem({ ...source, id: `entry-${Date.now()}`, title: `${source.title || "入口"} 副本` }, index + 1);
  items.splice(index + 1, 0, nextEntry);
  setConfig(component, "items", items.map((entry, nextIndex) => ({ ...entry, sort: nextIndex * 10 + 10 })));
  expandEntry(nextEntry.id);
}

function richBlocksFor(component: EditableComponent): RichContentBlockItem[] {
  const current = component.config.blocks;
  if (Array.isArray(current) && current.every(isStandardRichBlockItem)) {
    return current as RichContentBlockItem[];
  }
  const blocks = normalizeRichBlocks(current, component);
  setConfig(component, "blocks", blocks);
  return blocks;
}

function isRichBlockExpanded(id: string): boolean {
  return expandedRichBlockIds.value.includes(id);
}

function toggleRichBlockExpanded(id: string) {
  expandedRichBlockIds.value = isRichBlockExpanded(id)
    ? expandedRichBlockIds.value.filter((item) => item !== id)
    : [...expandedRichBlockIds.value, id];
}

function expandRichBlock(id: string) {
  if (!isRichBlockExpanded(id)) expandedRichBlockIds.value = [...expandedRichBlockIds.value, id];
}

function addRichBlock(component: EditableComponent, type: RichContentBlockItem["type"]) {
  const items = richBlocksFor(component);
  const block = normalizeRichBlock(
    {
      id: `rich-${Date.now()}`,
      type,
      title: type === "heading" ? "新标题" : "",
      text: type === "paragraph" ? "请输入正文内容" : type === "quote" ? "请输入重点提示" : "",
      buttonText: type === "button" ? "查看详情" : "",
      actionTargetType: type === "button" ? "page" : "none"
    },
    items.length
  );
  setConfig(component, "blocks", [...items, block]);
  expandRichBlock(block.id);
}

function removeRichBlock(component: EditableComponent, index: number) {
  const items = [...richBlocksFor(component)];
  const removed = items[index];
  items.splice(index, 1);
  setConfig(component, "blocks", resequenceRichBlocks(items));
  if (removed) expandedRichBlockIds.value = expandedRichBlockIds.value.filter((id) => id !== removed.id);
}

function moveRichBlock(component: EditableComponent, index: number, offset: number) {
  const items = [...richBlocksFor(component)];
  const target = index + offset;
  if (target < 0 || target >= items.length) return;
  const [item] = items.splice(index, 1);
  items.splice(target, 0, item);
  setConfig(component, "blocks", resequenceRichBlocks(items));
}

function duplicateRichBlock(component: EditableComponent, index: number) {
  const items = [...richBlocksFor(component)];
  const source = items[index];
  if (!source) return;
  const nextBlock = normalizeRichBlock({ ...source, id: `rich-${Date.now()}` }, index + 1);
  items.splice(index + 1, 0, nextBlock);
  setConfig(component, "blocks", resequenceRichBlocks(items));
  expandRichBlock(nextBlock.id);
}

function resequenceRichBlocks(items: RichContentBlockItem[]): RichContentBlockItem[] {
  return items.map((item, index) => ({ ...item, sort: index * 10 + 10 }));
}

function normalizeRichBlocks(value: unknown, component: EditableComponent): RichContentBlockItem[] {
  const rawItems = Array.isArray(value) && value.length > 0 ? value : legacyRichBlocks(component);
  return rawItems
    .map((item, index) => normalizeRichBlock(item, index))
    .filter((item) => item.type === "divider" || item.title || item.text || item.imageUrl || item.buttonText)
    .sort((a, b) => a.sort - b.sort)
    .map((item, index) => ({ ...item, sort: index * 10 + 10 }));
}

function legacyRichBlocks(component: EditableComponent): Array<Record<string, unknown>> {
  const config = component.config;
  const blocks: Array<Record<string, unknown>> = [];
  const title = readString(config.title);
  const subtitle = readString(config.subtitle);
  const imageUrl = readString(config.imageUrl);
  const html = readString(config.html);
  const content = readString(config.content ?? config.text);
  const buttonText = readString(config.buttonText);

  if (imageUrl) blocks.push({ type: "image", imageUrl, caption: subtitle });
  for (const url of imageUrlsFromHtml(html).filter((url) => url !== imageUrl)) {
    blocks.push({ type: "image", imageUrl: url });
  }
  if (title) blocks.push({ type: "heading", title });
  if (subtitle && !imageUrl) blocks.push({ type: "paragraph", text: subtitle });
  for (const paragraph of htmlToPlainText(html || content).split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)) {
    blocks.push({ type: "paragraph", text: paragraph });
  }
  if (buttonText) {
    blocks.push({
      type: "button",
      buttonText,
      actionTargetType: readString(config.actionTargetType) || "none",
      targetPageKey: readString(config.targetPageKey),
      targetConferenceId: readString(config.targetConferenceId),
      targetProductId: readString(config.targetProductId),
      targetProductCategoryId: readString(config.targetProductCategoryId),
      targetCouponCampaignId: readString(config.targetCouponCampaignId),
      externalUrl: readString(config.externalUrl),
      phone: readString(config.phone),
      copyText: readString(config.copyText)
    });
  }
  return blocks.length > 0 ? blocks : [{ type: "paragraph", text: "请输入图文内容" }];
}

function normalizeRichBlock(value: unknown, index: number): RichContentBlockItem {
  const record = readRecord(value);
  const typeValue = readString(record.type);
  const type = ["heading", "paragraph", "image", "quote", "divider", "button"].includes(typeValue)
    ? (typeValue as RichContentBlockItem["type"])
    : "paragraph";
  const targetType = readString(record.actionTargetType ?? record.targetType ?? record.actionType) || (type === "button" ? "page" : "none");
  return {
    id: readString(record.id) || `rich-${Date.now()}-${index}`,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    sort: Number.isFinite(Number(record.sort)) ? Number(record.sort) : index * 10 + 10,
    type,
    title: readString(record.title ?? record.heading ?? record.text),
    text: readString(record.text ?? record.content ?? record.description),
    imageUrl: readString(record.imageUrl ?? record.url ?? record.src),
    caption: readString(record.caption ?? record.alt),
    imageMode: readString(record.imageMode) || "widthFix",
    align: readString(record.align) || "left",
    buttonText: readString(record.buttonText ?? record.label) || (type === "button" ? "查看详情" : ""),
    actionTargetType: targetType,
    targetPageKey: readString(record.targetPageKey ?? record.pageKey),
    targetConferenceId: readString(record.targetConferenceId ?? record.conferenceId),
    targetProductId: readString(record.targetProductId ?? record.productId),
    targetProductCategoryId: readString(record.targetProductCategoryId ?? record.productCategoryId),
    targetCouponCampaignId: readString(record.targetCouponCampaignId ?? record.couponCampaignId),
    externalUrl: readString(record.externalUrl ?? record.url),
    externalMiniappAppId: readString(record.externalMiniappAppId ?? record.miniappAppId),
    externalMiniappPath: readString(record.externalMiniappPath ?? record.miniappPath),
    phone: readString(record.phone),
    copyText: readString(record.copyText)
  };
}

function isStandardRichBlockItem(value: unknown): value is RichContentBlockItem {
  return (
    isEntryConfigRecord(value) &&
    typeof value.id === "string" &&
    typeof value.enabled === "boolean" &&
    ["heading", "paragraph", "image", "quote", "divider", "button"].includes(String(value.type))
  );
}

function richBlockTypeLabel(type: RichContentBlockItem["type"]): string {
  return {
    heading: "标题",
    paragraph: "正文",
    image: "图片",
    quote: "引用",
    divider: "分割",
    button: "按钮"
  }[type];
}

function richBlockSummary(block: RichContentBlockItem): string {
  const action = richBlockHasAction(block) ? ` · ${richBlockActionLabel(block)}` : "";
  if (block.type === "heading") return `${block.title || "未命名标题"}${action}`;
  if (block.type === "paragraph" || block.type === "quote") return `${block.text || "未填写内容"}${action}`;
  if (block.type === "image") return `${block.caption || block.imageUrl || "未选择图片"}${action}`;
  if (block.type === "button") return `${block.buttonText || "按钮"} · ${richBlockActionLabel(block)}`;
  return "内容分割线";
}

function richBlockHasAction(block: RichContentBlockItem): boolean {
  return block.type !== "divider" && Boolean(block.actionTargetType && block.actionTargetType !== "none");
}

function richBlockActionLabel(block: RichContentBlockItem): string {
  const option = actionTargetOptions().find((item) => item.value === block.actionTargetType);
  if (block.actionTargetType === "page") return `${option?.label || "打开页面"}：${pageTargetOptions().find((item) => item.value === block.targetPageKey)?.label || block.targetPageKey || "未选择"}`;
  if (block.actionTargetType === "conference" || block.actionTargetType === "registration") return `${option?.label || "会议"}：${conferenceSelectOptions().find((item) => item.value === block.targetConferenceId)?.label || "未选择"}`;
  if (block.actionTargetType === "product") return `${option?.label || "商品"}：${productSelectOptions().find((item) => item.value === block.targetProductId)?.label || "未选择"}`;
  if (block.actionTargetType === "product-category") return `${option?.label || "商品分类"}：${productCategorySelectOptions().find((item) => item.value === block.targetProductCategoryId)?.label || "未选择"}`;
  if (block.actionTargetType === "coupon") return `${option?.label || "券活动"}：${couponCampaignSelectOptions().find((item) => item.value === block.targetCouponCampaignId)?.label || "未选择"}`;
  if (block.actionTargetType === "external-h5") return `${option?.label || "外部 H5"}：${block.externalUrl || "未填写"}`;
  if (block.actionTargetType === "external-miniapp") return `${option?.label || "外部小程序"}：${block.externalMiniappAppId || "未填写"}`;
  if (block.actionTargetType === "phone") return `${option?.label || "电话"}：${block.phone || "未填写"}`;
  if (block.actionTargetType === "copy") return `${option?.label || "复制"}：${block.copyText || "未填写"}`;
  return option?.label || "无跳转";
}

function htmlToPlainText(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function imageUrlsFromHtml(value: string): string[] {
  const urls: string[] = [];
  value.replace(/<img\b[^>]*\bsrc\s*=\s*(['"])(.*?)\1[^>]*>/gi, (_match, _quote: string, src: string) => {
    const url = src.trim();
    if (/^https?:\/\//i.test(url) && !urls.includes(url)) urls.push(url);
    return "";
  });
  return urls;
}

function entryActionLabel(entry: EntryConfigItem): string {
  const option = actionTargetOptions().find((item) => item.value === entry.actionTargetType);
  if (entry.actionTargetType === "page") return `${option?.label || "打开页面"}：${pageTargetOptions().find((item) => item.value === entry.targetPageKey)?.label || entry.targetPageKey || "未选择"}`;
  if (entry.actionTargetType === "conference" || entry.actionTargetType === "registration") return `${option?.label || "会议"}：${conferenceSelectOptions().find((item) => item.value === entry.targetConferenceId)?.label || "未选择"}`;
  if (entry.actionTargetType === "product") return `${option?.label || "商品"}：${productSelectOptions().find((item) => item.value === entry.targetProductId)?.label || "未选择"}`;
  if (entry.actionTargetType === "product-category") return `${option?.label || "商品分类"}：${productCategorySelectOptions().find((item) => item.value === entry.targetProductCategoryId)?.label || "未选择"}`;
  if (entry.actionTargetType === "coupon") return `${option?.label || "券活动"}：${couponCampaignSelectOptions().find((item) => item.value === entry.targetCouponCampaignId)?.label || "未选择"}`;
  if (entry.actionTargetType === "external-h5") return `${option?.label || "外部 H5"}：${entry.externalUrl || "未填写"}`;
  if (entry.actionTargetType === "external-miniapp") return `${option?.label || "外部小程序"}：${entry.externalMiniappAppId || "未填写"}`;
  if (entry.actionTargetType === "phone") return `${option?.label || "电话"}：${entry.phone || "未填写"}`;
  if (entry.actionTargetType === "copy") return `${option?.label || "复制"}：${entry.copyText || "未填写"}`;
  return option?.label || "无跳转";
}

function defaultQuickEntries(): string[] {
  return ["会议报名｜Registration｜｜page｜conference-list", "我的报名｜My tickets｜｜page｜my-registrations", "商城｜Shop｜｜page｜mall"];
}

function defaultServiceEntries(): string[] {
  return ["我的报名｜查看报名与凭证｜｜page｜my-registrations", "商城订单｜查看商品订单｜｜page｜mall-orders", "发票申请｜提交和查看发票｜｜invoice｜", "联系客服｜复制客服信息｜｜copy｜请联系会务组"];
}

function isEntryConfigRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStandardEntryConfigItem(value: unknown): value is EntryConfigItem {
  return (
    isEntryConfigRecord(value) &&
    typeof value.id === "string" &&
    typeof value.enabled === "boolean" &&
    typeof value.sort === "number" &&
    typeof value.title === "string" &&
    typeof value.actionTargetType === "string"
  );
}

function isImageField(field: ConfigField): boolean {
  return ["imageUrl", "images", "coverUrl", "iconUrl", "logoUrl", "backgroundImageUrl", "heroImageUrl"].includes(field.key);
}

function isFontField(field: ConfigField): boolean {
  return ["fontAssetUrl", "titleFontAssetUrl"].includes(field.key);
}

function isVideoField(componentType: string, field: ConfigField): boolean {
  return componentType === "video" && field.key === "url";
}

function isDownloadListField(componentType: string, field: ConfigField): boolean {
  return componentType === "download-list" && field.key === "items";
}

function isMaterialSelectableField(componentType: string, field: ConfigField): boolean {
  return isImageField(field) || isFontField(field) || isVideoField(componentType, field) || isDownloadListField(componentType, field);
}

function materialPickerButtonText(componentType: string, field: ConfigField): string {
  if (isFontField(field)) return "选择字体文件";
  if (isVideoField(componentType, field)) return "选择视频素材";
  if (isDownloadListField(componentType, field)) return "添加资料文件";
  return field.kind === "list" ? "从素材库添加图片" : "应用素材库";
}

function materialSpecKeyForField(componentType: string, field: ConfigField): MaterialSpecKey | undefined {
  if (isFontField(field)) return "fontFile";
  if (componentType === "video" && field.key === "url") return "videoFile";
  if (componentType === "download-list" && field.key === "items") return "downloadFile";
  if (componentType === "testimonial-list" && field.key === "items") return "testimonialAvatar";
  if (componentType === "sponsor-wall" && field.key === "sponsors") return "sponsorLogo";
  if (field.kind === "rich-blocks") return "contentImage";
  if (!isImageField(field)) return undefined;
  if (componentType === "fixed-business-template" && field.key === "heroImageUrl") return "heroImage";
  if (componentType === "hero") return "heroImage";
  if (componentType === "hero-banner") return "heroImage";
  if (componentType === "login-card" && field.key === "logoUrl") return "topTitleLogo";
  if (componentType === "quick-icon-grid" && field.key === "iconUrl") return "tabbarIcon";
  if (componentType === "member-promo-banner") return "heroImage";
  if (componentType === "task-progress-card" && field.key === "iconUrl") return "tabbarIcon";
  if (componentType === "image-promo-card") return "contentImage";
  if (componentType === "rich-content-block") return "contentImage";
  if (componentType === "carousel") return "carouselImage";
  if (componentType === "image-grid") return "imageGrid";
  if (componentType === "text-image") return "contentImage";
  if (componentType === "video" || componentType === "live-card") return field.key === "coverUrl" ? "conferenceHeader" : "videoFile";
  if (componentType === "sponsor-wall") return "sponsorLogo";
  return field.key === "images" ? "imageGrid" : "contentImage";
}

async function openMaterialPicker(component: EditableComponent, field: ConfigField) {
  materialTarget.value = { component, field };
  materialPageTarget.value = null;
  materialEntryTarget.value = null;
  materialRichBlockTarget.value = null;
  materialVisible.value = true;
  await loadMaterials();
}

async function openPageMetaImagePicker(key: keyof PageMetaForm = "shareImageUrl") {
  materialTarget.value = null;
  materialPageTarget.value = key;
  materialEntryTarget.value = null;
  materialRichBlockTarget.value = null;
  materialVisible.value = true;
  await loadMaterials();
}

async function openEntryMaterialPicker(component: EditableComponent, entry: EntryConfigItem, key: "iconUrl" | "dynamicIconUrl") {
  materialTarget.value = null;
  materialPageTarget.value = null;
  materialEntryTarget.value = { component, entry, key };
  materialRichBlockTarget.value = null;
  materialVisible.value = true;
  await loadMaterials();
}

async function openRichBlockMaterialPicker(component: EditableComponent, block: RichContentBlockItem) {
  materialTarget.value = null;
  materialPageTarget.value = null;
  materialEntryTarget.value = null;
  materialRichBlockTarget.value = { component, block };
  materialVisible.value = true;
  await loadMaterials();
}

async function loadMaterials() {
  materialLoading.value = true;
  try {
    const response = await listMaterials({ page: 1, pageSize: 80, keyword: materialKeyword.value, enabled: true });
    materialAssets.value = response.items.filter((asset) => {
      if (!asset.enabled) return false;
      if (materialPickerKind.value === "font") return isFontAsset(asset);
      if (materialPickerKind.value === "video") return isVideoAsset(asset);
      if (materialPickerKind.value === "file") return isDocumentAsset(asset) || isImageAsset(asset);
      return isImageAsset(asset);
    });
  } finally {
    materialLoading.value = false;
  }
}

function chooseMaterial(asset: MaterialAsset) {
  if (materialRichBlockTarget.value) {
    materialRichBlockTarget.value.block.imageUrl = asset.url;
    setConfig(materialRichBlockTarget.value.component, "blocks", [...richBlocksFor(materialRichBlockTarget.value.component)]);
    materialVisible.value = false;
    materialRichBlockTarget.value = null;
    ElMessage.success("已应用图文图片");
    return;
  }
  if (materialEntryTarget.value) {
    materialEntryTarget.value.entry[materialEntryTarget.value.key] = asset.url;
    setConfig(materialEntryTarget.value.component, "items", [...entryItemsFor(materialEntryTarget.value.component)]);
    materialVisible.value = false;
    materialEntryTarget.value = null;
    ElMessage.success("已应用入口图标");
    return;
  }
  if (materialPageTarget.value) {
    pageMeta[materialPageTarget.value] = asset.url;
    const isLogo = materialPageTarget.value === "navLogoUrl" || materialPageTarget.value === "navLogoDynamicUrl";
    materialVisible.value = false;
    materialPageTarget.value = null;
    ElMessage.success(isLogo ? "已应用顶部 Logo" : "已应用分享封面");
    return;
  }
  const target = materialTarget.value;
  if (!target) return;
  if (target.field.kind === "list") {
    const current = target.component.config[target.field.key];
    const list = Array.isArray(current) ? current.map(String) : [];
    const value = isDownloadListField(target.component.type, target.field) ? `${asset.name}｜${asset.url}` : asset.url;
    setConfig(target.component, target.field.key, [...list, value]);
  } else {
    setConfig(target.component, target.field.key, asset.url);
  }
  materialVisible.value = false;
  if (isFontField(target.field)) {
    installPreviewFonts();
  }
  ElMessage.success(materialAppliedMessage(target.component.type, target.field));
}

function isImageAsset(asset: MaterialAsset) {
  return asset.fileType.startsWith("image/") || /\.(png|apng|jpe?g|webp|gif|svg)(\?|$)/i.test(asset.url);
}

function isFontAsset(asset: MaterialAsset) {
  return asset.fileType.startsWith("font/") || /\.(ttf|otf|woff2?)(\?|$)/i.test(asset.url);
}

function isVideoAsset(asset: MaterialAsset) {
  return asset.fileType.startsWith("video/") || /\.(mp4|mov|m4v)(\?|$)/i.test(asset.url);
}

function isDocumentAsset(asset: MaterialAsset) {
  return asset.fileType === "application/pdf" || /\.(pdf)(\?|$)/i.test(asset.url);
}

function materialAppliedMessage(componentType: string, field: ConfigField): string {
  if (isFontField(field)) return "已应用字体文件";
  if (isVideoField(componentType, field)) return "已应用视频素材";
  if (isDownloadListField(componentType, field)) return "已添加资料文件";
  return "已应用素材图片";
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

function componentPlatformText(type: string): string {
  const status = componentSupport(type).status;
  if (status === "supported") return "后台预览 / H5 / 小程序";
  if (status === "basic") return "基础支持，发布前真机核对";
  if (status === "planned") return "规划中，暂不建议发布";
  return "未纳入用户端支持矩阵";
}

function componentRenderHint(type: string): string {
  if (type === "fixed-business-template") return "历史整页模板打开编辑器时会自动展开为可配置组件";
  if (["hero-banner", "quick-icon-grid", "login-card", "rich-text", "conference-schedule", "mall-product-grid"].includes(type)) {
    return "已接入跨端视觉协议，按 P9 DSL 进入用户端渲染";
  }
  const support = componentSupport(type);
  if (support.status === "supported") return "保存后写入 P9 DSL，用户端由 CMS Visual Renderer 展示";
  if (support.status === "basic") return "基础支持组件，发布验收时需重点核对";
  return "请替换为支持矩阵内组件后再发布";
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
    return "该组件暂不支持小程序/H5展示，发布会被阻止，请先隐藏或替换为已支持组件。";
  }
  if (isConferenceDetailPage() && isRegistrationCtaType(component.type)) {
    return "会议详情页已有固定底部报名按钮，该 CMS 报名按钮在用户端详情页会隐藏，避免重复 CTA。";
  }
  if (support.status === "basic") {
    return "该组件为基础支持，请发布前在 H5 和小程序预览中核对内容字段。";
  }
  return "";
}

function isConferenceDetailPage(): boolean {
  const page = selectedPage.value;
  return Boolean(page && (page.pageKey === "conference-detail" || ["CONFERENCE_DETAIL", "CONFERENCE_DETAIL_TEMPLATE", "CONFERENCE_DETAIL_PAGE"].includes(page.pageType)));
}

function isRegistrationCtaType(type: string): boolean {
  return REGISTRATION_CTA_TYPES.includes(type);
}

function isRenderableSupport(type: string): boolean {
  return ADDABLE_SUPPORT_STATUSES.includes(componentSupport(type).status);
}

function presetIcon(type: string) {
  const value = type.toLowerCase();
  if (/(hero|banner|image|carousel|poster|sponsor)/.test(value)) return Picture;
  if (/(grid|icon|navigation|entry|menu|benefit)/.test(value)) return Grid;
  if (/(conference|schedule|calendar|agenda|countdown|location)/.test(value)) return Calendar;
  if (/(product|mall|cart|recommend)/.test(value)) return ShoppingCart;
  if (/(member|user|login|profile|speaker|guest)/.test(value)) return User;
  if (/(registration|ticket|coupon|credential|checkin)/.test(value)) return Tickets;
  if (/(order|payment|invoice|price|refund|aftersale)/.test(value)) return CreditCard;
  if (/(video|live)/.test(value)) return VideoCamera;
  if (/(download|file|material)/.test(value)) return Files;
  if (/(contact|service|assistant|faq)/.test(value)) return ChatDotRound;
  if (/(notice|announcement)/.test(value)) return Bell;
  if (/(button|action|link)/.test(value)) return Link;
  if (/(text|article|rich|content|guide)/.test(value)) return Document;
  return Menu;
}

function thumbClass(type: string): string {
  if (type === "hero") return "is-hero";
  if (type === "carousel" || type === "image-grid") return "is-carousel";
  if (type === "conference-list" || type === "conference-tabs" || type === "conference-schedule") return "is-conference";
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
    name: { type: String, required: true },
    userMode: { type: String as () => "guest" | "member", default: "member" }
  },
  setup(props) {
    const selfComponent = getCurrentInstance()?.type as Component;
    const value = (key: string, fallback = "") => {
      const raw = String(props.item.config[key] ?? "").trim();
      if (["title", "subtitle", "description", "text"].includes(key) && isTechnicalPreviewText(raw, props.item.type, props.name)) return fallback;
      return raw || fallback;
    };
    const list = (key: string) => (Array.isArray(props.item.config[key]) ? (props.item.config[key] as unknown[]).map(String) : []);
    const textStyle = () => buildPreviewTextStyle(props.item);
    const titleStyle = () => buildPreviewTitleStyle(props.item);
    const parsedList = (key: string) => list(key).map(splitPreviewLine).filter((item) => item.length > 0);
    const entryItems = () => normalizeEntryItems(props.item.config.items, props.item.type).filter((entry) => entry.enabled !== false);
    const richBlocks = () => normalizeRichBlocks(props.item.config.blocks, props.item).filter((block) => block.enabled !== false);
    const richPreviewBlockClass = (block: RichContentBlockItem) => ["preview-rich-content__block", `is-${block.type}`, richBlockHasAction(block) ? "is-clickable" : ""];
    const richPreviewBlockTitle = (block: RichContentBlockItem) => richBlockHasAction(block) ? richBlockActionLabel(block) : "";
    type PreviewNode = ReturnType<typeof h> | string;
    const wrapRichPreviewBlock = (block: RichContentBlockItem, children: PreviewNode | PreviewNode[]) =>
      h("div", { class: richPreviewBlockClass(block), title: richPreviewBlockTitle(block) }, children);
    const richContentPreview = () =>
      h("div", { class: previewRichContentClass(props.item), style: previewRichContentStyle(props.item) }, richBlocks().map((block) => {
        const alignStyle = { textAlign: block.align || "left" };
        if (block.type === "heading") return wrapRichPreviewBlock(block, h("strong", { class: "preview-rich-content__heading", style: { ...titleStyle(), ...alignStyle } }, block.title || "图文标题"));
        if (block.type === "paragraph") return wrapRichPreviewBlock(block, h("p", { class: "preview-rich-content__paragraph", style: { ...textStyle(), ...alignStyle } }, block.text || "请填写正文内容"));
        if (block.type === "quote") return wrapRichPreviewBlock(block, h("blockquote", { class: "preview-rich-content__quote", style: { ...textStyle(), ...alignStyle } }, block.text || "请填写重点提示"));
        if (block.type === "image") {
          const imageChildren: PreviewNode[] = [
            block.imageUrl ? h("img", { src: block.imageUrl, alt: block.caption || "", style: previewRichImageStyle(props.item, block) }) : h("div", { class: "preview-rich-content__image-empty", style: previewRichImageStyle(props.item, block) }, "请选择图片")
          ];
          if (block.caption) imageChildren.push(h("figcaption", block.caption));
          return wrapRichPreviewBlock(block, h("figure", { class: "preview-rich-content__figure" }, imageChildren));
        }
        if (block.type === "button") return wrapRichPreviewBlock(block, h("button", { class: "preview-rich-content__button" }, block.buttonText || "查看详情"));
        return wrapRichPreviewBlock(block, h("div", { class: "preview-rich-content__divider" }));
      }));
    const meetings = () =>
      (previewContextConferences.value.length > 0 ? previewContextConferences.value : sampleConferences).map((item, index) => ({
        id: item.id,
        title: item.title,
        summary: "summary" in item && typeof item.summary === "string" ? item.summary : summaryFallbackText(props.item),
        image: readConferenceCover(item),
        location: item.location || "会议中心",
        startAt: item.startAt,
        endAt: "endAt" in item && typeof item.endAt === "string" ? item.endAt : item.startAt,
        time: formatPreviewDate(item.startAt),
        registrationCount: registrationCountForPreview(item, props.item, index)
      }));
    const fixedKind = () => normalizeFixedTemplateKind(value("templateKey", "home"));
    const fixedTemplatePreview = (): ReturnType<typeof h> => {
      const kind = fixedKind();
      const expanded = expandLegacyCmsTemplate(props.item).map((item, index): EditableComponent => ({
        id: `${item.id}:preview:${index}`,
        type: item.type,
        enabled: item.enabled,
        sortOrder: index,
        config: deepCloneConfig(item.config)
      }));
      return h("div", { class: ["preview-fixed-template", `is-${kind}`] }, expanded.map((item): ReturnType<typeof h> =>
        h(selfComponent, { item, name: presetName(item.type), userMode: props.userMode })
      ));
    };
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
      if (type === "fixed-business-template") return fixedTemplatePreview();
      if (type === "hero") {
        const showContent = !booleanConfig(props.item, "imageOnly", false) && booleanConfig(props.item, "showContent", true);
        return h("div", { class: ["preview-hero-card", booleanConfig(props.item, "imageOnly", false) ? "is-image-only" : ""], style: previewHeroCardStyle(props.item) }, [
          value("imageUrl")
            ? h("img", { src: value("imageUrl"), alt: "主视觉横幅", style: previewImageModeStyle(props.item) })
            : h("div", { class: "preview-hero-empty" }),
          showContent && booleanConfig(props.item, "showOverlay", true) ? h("div", { class: "preview-hero-card__shade" }) : null,
          showContent
            ? h("div", { class: "preview-hero-card__copy" }, [
                h("span", value("kicker", "会议报名")),
                h("strong", { style: titleStyle() }, value("title", "选择会议，完成报名缴费")),
                h("p", { style: textStyle() }, value("description", "查看会议安排、选择报名规格，支付成功后自动生成参会记录。")),
                booleanConfig(props.item, "showButton", true) ? h("button", value("buttonText", "立即报名")) : null
              ])
            : null
        ]);
      }
      if (type === "hero-banner") {
        const showTitle = booleanConfig(props.item, "showTitle", true);
        const showSubtitle = booleanConfig(props.item, "showSubtitle", true);
        const showDescription = booleanConfig(props.item, "showDescription", Boolean(value("description")));
        const showCopy = !booleanConfig(props.item, "imageOnly", false) && Boolean((showTitle && value("title")) || (showSubtitle && value("subtitle")) || (showDescription && value("description")) || value("buttonText") || value("secondaryButtonText"));
        const contentAlign = value("contentAlign", "left");
        const verticalAlign = value("verticalAlign", "bottom");
        return h("div", { class: ["preview-home-hero", `is-${contentAlign}`, `is-${verticalAlign}`], style: previewHomeHeroStyle(props.item) }, [
          value("imageUrl") ? h("img", { src: value("imageUrl"), alt: "顶部主视觉", style: previewImageModeStyle(props.item) }) : null,
          showCopy && booleanConfig(props.item, "showOverlay", true) ? h("div", { class: "preview-home-hero__shade" }) : null,
          showCopy
            ? h("div", { class: "preview-home-hero__copy", style: { textAlign: contentAlign, alignItems: contentAlign === "center" ? "center" : contentAlign === "right" ? "flex-end" : "flex-start", justifyContent: verticalAlign === "top" ? "flex-start" : verticalAlign === "center" ? "center" : "flex-end" } }, [
                showSubtitle && value("subtitle") ? h("span", value("subtitle")) : null,
                showTitle && value("title") ? h("strong", { style: { ...titleStyle(), display: undefined, color: value("textColor", "#f8faf8") } }, value("title")) : null,
                showDescription && value("description") ? h("p", { style: { ...textStyle(), color: value("textColor", "#f8faf8") } }, value("description")) : null,
                h("div", { class: "preview-home-hero__actions" }, [
                  value("buttonText") ? h("button", value("buttonText")) : null,
                  value("secondaryButtonText") ? h("button", { class: "is-secondary" }, value("secondaryButtonText")) : null
                ])
              ])
            : null
        ]);
      }
      if (type === "login-card") {
        const loggedIn = props.userMode === "member";
        const logo = loggedIn ? SAMPLE_USER_CONTEXT.avatarUrl : value("logoUrl");
        return h("div", { class: previewSectionClass(props.item, "preview-login-card"), style: previewSectionStyle(props.item) }, [
          logo ? h("img", { class: "preview-login-card__avatar", src: logo, alt: "" }) : h("span", { class: "preview-login-card__avatar" }, loggedIn ? SAMPLE_USER_CONTEXT.nickname.slice(0, 1) : "观"),
          h("div", { class: "preview-login-card__copy" }, [
            h("strong", { style: titleStyle() }, loggedIn ? value("loggedInTitle", `欢迎回来，${SAMPLE_USER_CONTEXT.nickname}`) : value("title", "欢迎来到观潮会集")),
            h("small", { style: textStyle() }, loggedIn ? value("loggedInSubtitle", "查看报名、订单、待参会和会员权益") : value("subtitle", "欢迎光临，请登录成为会员，查看会议排期与报名权益")),
            loggedIn ? h("span", { class: "preview-login-card__status" }, `${SAMPLE_USER_CONTEXT.memberLevel} · ${SAMPLE_USER_CONTEXT.phone}`) : null
          ]),
          h("button", loggedIn ? value("loggedInButtonText", "个人中心") : value("buttonText", "立即登录"))
        ]);
      }
      if (type === "quick-icon-grid" || type === "service-shortcut-card") {
        return h("div", { class: previewSectionClass(props.item, "preview-entry-grid"), style: previewSectionStyle(props.item) }, [
          h("div", { class: "preview-module-head", style: previewModuleHeadStyle(props.item) }, [
            h("div", [
              h("strong", { style: titleStyle() }, value("title", type === "quick-icon-grid" ? "快捷入口" : "服务中心")),
              value("subtitle") ? h("small", { style: buildPreviewSubtitleStyle(props.item) }, value("subtitle")) : null
            ]),
            booleanConfig(props.item, "showMore", false) ? h("span", value("moreText", "查看更多")) : null
          ]),
          h("div", { class: previewEntryGridClass(props.item), style: previewGridColumnsStyle(props.item) }, entryItems().map((entry) =>
            h("div", { class: previewEntryTileClass(props.item, entry), style: previewEntryTileStyle(props.item, entry) }, [
              entry.dynamicIconUrl || entry.iconUrl
                ? h("img", { src: entry.dynamicIconUrl || entry.iconUrl, alt: entry.title, style: previewEntryIconStyle(props.item) })
                : h("span", { style: previewEntryIconStyle(props.item) }, builtinIconLabel(entry)),
              h("b", { style: previewEntryTitleStyle(entry) }, entry.title),
              entry.subtitle && booleanConfig(props.item, "showSubtitle", true) ? h("small", { style: previewEntrySubtitleStyle(entry) }, entry.subtitle) : null
            ])
          ))
        ]);
      }
      if (type === "member-promo-banner") {
        return h("div", { class: "preview-promo-banner", style: previewPanelStyle(props.item) }, [
          value("imageUrl") ? h("img", { src: value("imageUrl"), alt: "" }) : null,
          h("div", [
            h("strong", { style: titleStyle() }, value("title", "会员权益")),
            h("p", { style: textStyle() }, value("subtitle", "查看会员价和专属权益")),
            h("small", value("description", "会员价以创建订单时后端计价为准。"))
          ]),
          h("button", value("buttonText", "查看会员中心"))
        ]);
      }
      if (type === "event-card-carousel") {
        return h("div", { class: previewSectionClass(props.item, "preview-event-carousel"), style: previewSectionStyle(props.item) }, [
          h("strong", { style: titleStyle() }, value("title", "精选会议")),
          h("div", { class: "preview-event-carousel__rail" }, meetings().slice(0, numberValue(props.item, "limit", 6)).map((meeting) =>
            h("div", { class: `preview-event-card is-${value("cardSize", "large")}` }, [
              meeting.image ? h("img", { src: meeting.image, alt: meeting.title }) : h("span", { class: "preview-event-card__empty" }, meeting.title.slice(0, 1) || "会"),
              h("b", meeting.title),
              h("small", meeting.location),
              h("button", detailButtonText(props.item))
            ])
          ))
        ]);
      }
      if (type === "task-progress-card") {
        const current = numberValue(props.item, "current", 0);
        const target = Math.max(1, numberValue(props.item, "target", 8));
        return h("div", { class: previewSectionClass(props.item, "preview-task-card"), style: previewSectionStyle(props.item) }, [
          h("div", { class: "preview-task-card__head" }, [
            value("iconUrl") ? h("img", { src: value("iconUrl"), alt: "" }) : h("span", "任"),
            h("div", [h("strong", { style: titleStyle() }, value("title", "任务进度")), h("small", value("subtitle", "完成任务领取权益"))]),
            h("b", `${current}/${target}`)
          ]),
          h("div", { class: "preview-task-card__bar" }, h("i", { style: { width: `${Math.min(100, Math.round((current / target) * 100))}%` } })),
          h("p", { style: textStyle() }, value("ruleText", "完成 8 项任务可领取权益"))
        ]);
      }
      if (type === "image-promo-card" || type === "rich-content-block") {
        if (type === "rich-content-block") return richContentPreview();
        return h("div", { class: previewSectionClass(props.item, type === "image-promo-card" ? "preview-image-promo" : "preview-rich-block"), style: previewSectionStyle(props.item) }, [
          value("imageUrl") ? h("img", { class: "preview-cover", src: value("imageUrl"), alt: "" }) : null,
          h("strong", { style: titleStyle() }, value("title", type === "image-promo-card" ? "活动推荐" : "品牌故事")),
          h("p", { style: textStyle() }, value(type === "image-promo-card" ? "subtitle" : "content", type === "image-promo-card" ? "自定义活动卡片" : "请在后台填写图文内容。")),
          value("buttonText") ? h("button", { class: "preview-detail-button" }, value("buttonText")) : null
        ]);
      }
      if (type === "conference-list") {
        const limit = numberValue(props.item, "limit", 10);
        return h("div", { class: previewSectionClass(props.item), style: previewSectionStyle(props.item) }, [
          h("strong", { style: titleStyle() }, value("title", "可报名会议")),
          ...meetings()
            .slice(0, limit)
            .map((meeting) =>
              h("div", { class: previewMeetingClass(props.item, "preview-meeting"), style: previewMeetingStyle(props.item) }, [
                booleanConfig(props.item, "showCover", true) && meeting.image
                  ? h("img", { class: previewCoverClass(props.item, "preview-meeting-cover"), style: previewCoverStyle(props.item), src: meeting.image, alt: meeting.title })
                  : booleanConfig(props.item, "showCover", true)
                    ? h("span", { class: `${previewCoverClass(props.item, "preview-meeting-cover")} is-empty`, style: previewCoverStyle(props.item) }, meeting.title.slice(0, 1) || "会")
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
        return h("div", { class: previewSectionClass(props.item), style: previewSectionStyle(props.item) }, [
          h("strong", { style: titleStyle() }, value("title", "会议分类切换")),
          h("div", { class: "preview-tabs" }, nextTabs.map((item, index) => h("span", { class: index === 0 ? "active" : "" }, item))),
          ...meetings()
            .slice(0, 2)
            .map((meeting) =>
              h("div", { class: previewMeetingClass(props.item, "preview-mini-meeting"), style: previewMeetingStyle(props.item) }, [
                booleanConfig(props.item, "showCover", true) && meeting.image
                  ? h("img", { class: previewCoverClass(props.item, "preview-mini-meeting-cover"), style: previewCoverStyle(props.item), src: meeting.image, alt: meeting.title })
                  : booleanConfig(props.item, "showCover", true)
                    ? h("span", { class: `${previewCoverClass(props.item, "preview-mini-meeting-cover")} is-empty`, style: previewCoverStyle(props.item) }, meeting.title.slice(0, 1) || "会")
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
      if (type === "conference-schedule") {
        const limit = numberValue(props.item, "limit", 8);
        const rows = meetings().slice(0, Math.max(1, limit));
        const months = previewScheduleMonths(rows);
        const activeMonth = months[0]?.key || "";
        const categories = list("categories").length > 0 ? list("categories") : ["全部", "闭门会", "论坛", "沙龙", "参访", "私董会"];
        const activeCategory = categories[0] || "全部";
        const filteredRows = rows
          .filter((meeting) => !activeMonth || previewScheduleMonthKey(meeting.startAt) === activeMonth)
          .filter((meeting) => activeCategory === "全部" || previewScheduleTag(meeting, props.item) === activeCategory || meeting.title.includes(activeCategory) || meeting.summary.includes(activeCategory))
          .slice(0, Math.max(1, limit));
        return h("div", { class: previewSectionClass(props.item, "preview-schedule"), style: previewSectionStyle(props.item) }, [
          h("div", { class: "preview-schedule-months" }, [
            h("div", { class: "preview-schedule-months__rail" }, months.map((month, index) =>
              h("span", { class: index === 0 ? "active" : "" }, [h("small", month.year), h("b", month.label)])
            )),
            booleanConfig(props.item, "showCalendarButton", true) ? h("button", { class: "preview-schedule-calendar" }, value("calendarText", "日历")) : null
          ]),
          h("div", { class: "preview-schedule-categories" }, categories.map((category, index) =>
            h("span", { class: index === 0 ? "active" : "" }, category)
          )),
          ...(filteredRows.length > 0
            ? filteredRows.map((meeting, index) =>
                h("div", { class: "preview-schedule-card" }, [
                  h("div", { class: "preview-schedule-card__date" }, [
                    h("b", previewScheduleDay(meeting.startAt)),
                    h("span", previewScheduleWeekday(meeting.startAt)),
                    h("small", meeting.location)
                  ]),
                  h("div", { class: "preview-schedule-card__body" }, [
                    h("span", { class: "preview-schedule-card__tag" }, previewScheduleTag(meeting, props.item)),
                    h("strong", meeting.title),
                    h("small", meeting.summary || summaryFallbackText(props.item)),
                    h("p", `时间：${previewScheduleTime(meeting.startAt, meeting.endAt)} ｜ 已报名 ${meeting.registrationCount} 人`)
                  ]),
                  h("button", schedulePreviewActionText(meeting, props.item))
                ])
              )
            : [h("div", { class: "preview-empty" }, "暂无该月份会议")])
        ]);
      }
      if (type === "registration-button" || type === "floating-registration-button") {
        return h("button", { class: "preview-button", style: textStyle() }, value("text", "立即报名"));
      }
      if (type.startsWith("credential-")) {
        const title = value("title", credentialPreviewTitle(type));
        const cardClass = ["preview-credential-card", `is-${value("cardStyle", "standard")}`];
        if (type === "credential-header") {
          return h("div", { class: cardClass }, [
            h("span", { class: "preview-credential-kicker" }, value("statusText", "报名成功")),
            h("strong", { style: titleStyle() }, "行业增长大会"),
            h("small", "报名号：REG20260618ZE0QJ7")
          ]);
        }
        if (type === "credential-qr") {
          return h("div", { class: cardClass }, [
            h("strong", { style: titleStyle() }, title),
            h("div", { class: "preview-credential-qr" }, Array.from({ length: 25 }).map((_, index) => h("i", { class: index % 3 === 0 || index % 7 === 0 ? "is-dark" : "" }))),
            h("p", { style: textStyle() }, value("description", "工作人员可扫码完成签到核销。"))
          ]);
        }
        if (type === "credential-conference-info") {
          return credentialInfoPreview(cardClass, title, [
            ["时间", "2026-08-18 09:00 - 2026-08-18 17:30"],
            ["地点", "上海会议中心"],
            ["票种", "标准票"]
          ], titleStyle(), textStyle());
        }
        if (type === "credential-attendee-info") {
          return credentialInfoPreview(cardClass, title, [
            ["姓名", "张三"],
            ["手机号", "138****8000"],
            ["公司", "未填写"],
            ["微信", booleanConfig(props.item, "showWechatUser", true) ? "微信用户 · 头像已同步" : "已隐藏微信用户"]
          ], titleStyle(), textStyle());
        }
        if (type === "credential-payment-info") {
          return credentialInfoPreview(cardClass, title, [
            ["支付金额", "¥0.01"],
            ["支付状态", "支付成功"],
            ["支付渠道", "微信支付"],
            ["订单号", "REG20260618ZE0QJ7"]
          ], titleStyle(), textStyle());
        }
        if (type === "credential-form-summary") {
          return credentialInfoPreview(cardClass, title, [
            ["姓名", "张三"],
            ["手机号", "138****8000"],
            ["公司", value("emptyText", "暂无补充报名字段")]
          ], titleStyle(), textStyle());
        }
        if (type === "credential-checkin-info") {
          return credentialInfoPreview(cardClass, title, [
            ["签到状态", "待签到"],
            ["签到时间", "暂无"]
          ], titleStyle(), textStyle());
        }
        if (type === "credential-actions") {
          return h("div", { class: [...cardClass, "preview-credential-actions"] }, [
            h("button", value("checkinText", "去签到")),
            h("button", value("groupText", "加入会议客户群")),
            h("button", value("agendaText", "查看议程")),
            h("button", value("guideText", "参会指南")),
            h("button", value("contactText", "联系客服")),
            h("button", value("calendarText", "添加到日历"))
          ]);
        }
      }
      if (type === "speaker-cards") {
        const items = parsedList("speakers");
        return h("div", { class: previewSectionClass(props.item), style: previewSectionStyle(props.item) }, [
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
        return h("div", { class: previewSectionClass(props.item), style: previewSectionStyle(props.item) }, [
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
        return h("div", { class: previewSectionClass(props.item), style: previewSectionStyle(props.item) }, [
          h("strong", { style: titleStyle() }, value("title", "距离开始")),
          h("div", { class: "preview-countdown" }, ["天", "时", "分", "秒"].map((item, index) => h("span", [h("b", index === 0 ? "00" : "12"), h("small", item)])))
        ]);
      }
      if (type === "map-contact") {
        return h("div", { class: previewSectionClass(props.item), style: previewSectionStyle(props.item) }, [
          h("strong", { style: titleStyle() }, value("title", "会场与联系")),
          h("p", { style: textStyle() }, value("address", "会议地址待公布")),
          value("phone") ? h("button", { class: "preview-outline-button" }, `联系会务组：${value("phone")}`) : null
        ]);
      }
      if (type === "sponsor-wall") {
        const items = list("sponsors");
        return h("div", { class: previewSectionClass(props.item), style: previewSectionStyle(props.item) }, [
          h("strong", { style: titleStyle() }, value("title", "合作伙伴")),
          h("div", { class: "preview-sponsors" }, (items.length > 0 ? items : ["合作伙伴"]).map((item) => h("span", item)))
        ]);
      }
      if (type === "faq") {
        const items = parsedList("items");
        return h("div", { class: previewSectionClass(props.item), style: previewSectionStyle(props.item) }, [
          h("strong", { style: titleStyle() }, value("title", "常见问题")),
          h("div", { class: "preview-faq" }, (items.length > 0 ? items : [["常见问题", "答案待补充"]]).map((item) =>
            h("div", [h("b", item[0] || "常见问题"), item[1] ? h("span", item.slice(1).join(" ")) : null])
          ))
        ]);
      }
      if (type === "stats-grid") {
        const rows = value("dataSource") === "current-user"
          ? [
              [String(SAMPLE_USER_CONTEXT.registrationCount), "我的报名"],
              [String(SAMPLE_USER_CONTEXT.orderCount), "我的订单"],
              [String(SAMPLE_USER_CONTEXT.pendingConferenceCount), "待参会"],
              [String(SAMPLE_USER_CONTEXT.couponCount), "优惠券"]
            ]
          : list("items").map((item) => {
              const [statValue, ...labels] = item.split(/[｜|]/).map((part) => part.trim());
              return [statValue || item, labels.join(" · ")];
            });
        return h("div", { class: [previewSectionClass(props.item, "preview-stats-module"), `is-${value("cardStyle", "split")}`], style: previewSectionStyle(props.item) }, [
          value("title") || value("subtitle")
            ? h("div", { class: "preview-stats-module__intro" }, [
                value("title") ? h("strong", { style: titleStyle() }, value("title")) : null,
                value("subtitle") ? h("small", value("subtitle")) : null
              ])
            : null,
          h("div", { class: "preview-stats", style: { gridTemplateColumns: `repeat(${Math.min(4, Math.max(2, numberValue(props.item, "columns", 2)))}, minmax(0, 1fr))` } }, rows.map(([statValue, label]) =>
            h("span", [h("b", statValue), label ? h("small", label) : null])
          ))
        ]);
      }
      if (type === "user-profile-card") {
        const loggedIn = props.userMode === "member";
        return h("div", { class: [previewSectionClass(props.item, "preview-member-profile"), `is-${value("cardStyle", "brand")}`], style: previewSectionStyle(props.item) }, [
          value("imageUrl") ? h("img", { class: "preview-member-profile__background", src: value("imageUrl"), alt: "" }) : null,
          h("span", { class: "preview-member-profile__avatar" }, loggedIn ? SAMPLE_USER_CONTEXT.nickname.slice(0, 1) : "登"),
          h("div", { class: "preview-member-profile__copy" }, [
            h("div", [
              h("strong", loggedIn ? SAMPLE_USER_CONTEXT.nickname : value("title", "登录后查看资料")),
              loggedIn ? h("i", SAMPLE_USER_CONTEXT.memberLevel) : null
            ]),
            h("small", loggedIn ? `${SAMPLE_USER_CONTEXT.phone} · ${value("loggedInDescription", "查看会议报名与会员权益")}` : value("description", "登录后展示头像、昵称、手机号和会员等级"))
          ]),
          h("button", loggedIn ? value("buttonText", "编辑资料") : value("loginButtonText", "立即登录"))
        ]);
      }
      if (type === "membership-benefits") {
        const benefits = list("items").length > 0 ? list("items") : ["优先获取会议排期", "会员专享报名通道", "尊享活动与服务特权"];
        return h("div", { class: "preview-membership-benefits", style: value("imageUrl") ? { backgroundImage: `url(${value("imageUrl")})` } : {} }, [
          h("div", { class: "preview-membership-benefits__head" }, [
            h("div", [h("strong", value("title", "观潮会集会员权益")), value("subtitle") ? h("small", value("subtitle")) : null]),
            h("button", value("buttonText", "查看权益"))
          ]),
          h("div", { class: "preview-membership-benefits__items" }, benefits.map((item, index) => h("span", [h("b", String(index + 1)), h("small", item)])))
        ]);
      }
      if (type === "mall-product-grid") {
        const configuredCategories = list("categories");
        const categories = configuredCategories.length > 0 ? configuredCategories : ["全部", "文创周边", "办公用品", "伴手礼"];
        const limit = Math.max(1, numberValue(props.item, "limit", 4));
        const configuredProducts = productOptions.value.slice(0, limit).map((product) => ({
          id: product.id,
          title: product.title,
          subtitle: product.subtitle || "",
          coverImageUrl: product.coverImageUrl || "",
          priceCent: Math.min(...product.skus.map((sku) => sku.priceCent).filter((price) => Number.isFinite(price)))
        }));
        const products = configuredProducts.length > 0 ? configuredProducts : [
          { id: "sample-notebook", title: "观潮会集商务笔记本", subtitle: "", coverImageUrl: "", priceCent: 6800 },
          { id: "sample-mug", title: "品牌马克杯", subtitle: "", coverImageUrl: "", priceCent: 5800 },
          { id: "sample-gift", title: "会议伴手礼礼盒", subtitle: "", coverImageUrl: "", priceCent: 16800 },
          { id: "sample-pen", title: "金属签字笔", subtitle: "", coverImageUrl: "", priceCent: 8800 }
        ].slice(0, limit);
        const columns = Math.min(4, Math.max(2, numberValue(props.item, "columns", 2)));
        return h("div", { class: [previewSectionClass(props.item, "preview-mall-products"), `is-${value("layoutMode", "grid")}`], style: previewSectionStyle(props.item) }, [
          h("div", { class: "preview-mall-products__head" }, [
            value("title") ? h("strong", { style: titleStyle() }, value("title")) : null,
            booleanConfig(props.item, "showMoreButton", false) ? h("small", value("moreButtonText", "查看更多")) : null
          ]),
          h("div", { class: "preview-mall-products__categories" }, categories.map((item, index) => h("span", { class: index === 0 ? "active" : "" }, item.split(/[｜|]/)[0]))),
          h("div", { class: "preview-mall-products__grid", style: { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } }, products.map((product) =>
            h("div", { class: ["preview-product-card", `is-${value("cardStyle", "elevated")}`] }, [
              booleanConfig(props.item, "showImage", true)
                ? product.coverImageUrl ? h("img", { src: product.coverImageUrl, alt: product.title }) : h("span", { class: "preview-product-card__image-empty" }, product.title.slice(0, 1))
                : null,
              h("div", { class: "preview-product-card__body" }, [
                h("b", product.title),
                product.subtitle && booleanConfig(props.item, "showSubtitle", false) ? h("small", product.subtitle) : null,
                h("div", [
                  booleanConfig(props.item, "showPrice", true) ? h("strong", Number.isFinite(product.priceCent) ? `¥${(product.priceCent / 100).toFixed(0)}` : "暂无价格") : null,
                  booleanConfig(props.item, "showCartButton", true) ? h("button", "+") : null
                ])
              ])
            ])
          ))
        ]);
      }
      if (type === "dual-track-tags") {
        const primary = list("primaryItems");
        const secondary = list("secondaryItems");
        const rows = [
          { title: value("primaryTitle", "五大增量生态"), items: primary.length > 0 ? primary : ["自然", "银发", "赛事", "研学", "情绪"], button: value("primaryButtonText") },
          { title: value("secondaryTitle", "五大垂类赛道"), items: secondary.length > 0 ? secondary : ["学前", "科创", "舞蹈", "美术", "自主学习"], button: value("secondaryButtonText") }
        ];
        return h("div", { class: previewSectionClass(props.item, "preview-track-tags"), style: previewSectionStyle(props.item) }, rows.map((row) =>
          h("div", { class: "preview-track-tags__row" }, [
            h("strong", { style: titleStyle() }, row.title),
            h("div", { class: "preview-track-tags__chips" }, row.items.map((item) => h("span", { style: textStyle() }, item))),
            row.button ? h("button", [row.button, h("span", "›")]) : null
          ])
        ));
      }
      if (type === "tag-filter") {
        const tags = list("items").map((item) => splitPreviewLine(item)[0] || item).filter(Boolean);
        return h("div", { class: previewSectionClass(props.item), style: previewSectionStyle(props.item) }, [
          value("title") ? h("strong", { style: titleStyle() }, value("title")) : null,
          h("div", { class: "preview-tag-list" }, tags.map((item, index) => h("span", { class: index === 0 ? "active" : "", style: textStyle() }, item)))
        ]);
      }
      if (type === "ticket-price-list" || type === "process-steps" || type === "download-list" || type === "testimonial-list") {
        return h("div", { class: previewSectionClass(props.item), style: previewSectionStyle(props.item) }, [
          h("strong", { style: titleStyle() }, value("title", props.name)),
          h("div", { class: "preview-list" }, list("items").map((item) => h("span", { style: textStyle() }, item)))
        ]);
      }
      if (type === "text-image") {
        return richContentPreview();
      }
      if (type === "image-grid" || type === "carousel") {
        if (type === "carousel") {
          const images = list("images");
          return h("div", { class: ["preview-carousel", booleanConfig(props.item, "fullBleed", true) ? "is-full-bleed" : ""], style: previewCarouselStyle(props.item) }, images[0]
            ? h("img", { src: images[0], alt: "", style: previewImageModeStyle(props.item) })
            : h("span", "暂无轮播图片"));
        }
        return h("div", { class: "preview-image-grid" }, list("images").map((item) => h("img", { src: item, alt: "" })));
      }
      if (type === "notice") {
        return h("div", { class: ["preview-notice", `is-${value("displayStyle", "elegant")}`], style: { ...textStyle(), textAlign: value("textAlign", "left") } }, [
          booleanConfig(props.item, "showIcon", true) ? h("span", { class: "preview-notice__icon" }, value("iconText", "讯")) : null,
          h("span", value("text", "报名开放中"))
        ]);
      }
      if (type === "promotion-bar") {
        const background = value("backgroundColor");
        return h("div", { class: "preview-notice preview-link-bar", style: { ...textStyle(), ...(background ? { background } : {}) } }, [
          h("span", value("iconText", "▰")),
          h("strong", { style: titleStyle() }, value("title") || value("text", "五大增量生态 × 五大垂类赛道")),
          h("small", [value("buttonText", "查看详情"), booleanConfig(props.item, "showArrow", true) ? " ›" : ""])
        ]);
      }
      if (type === "rich-text" || type === "safe-html") {
        return richContentPreview();
      }
      if (type === "divider") return h("div", { class: "preview-divider" });
      if (type === "spacer") return h("div", { style: { height: `${numberValue(props.item, "height", 24)}px` } });
      return h("div", { class: previewSectionClass(props.item), style: previewSectionStyle(props.item) }, [h("strong", { style: titleStyle() }, props.name), h("p", { style: textStyle() }, value("text", "组件内容预览"))]);
    };
  }
});

function isTechnicalPreviewText(value: string, type: string, displayName: string): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  const candidates = new Set([
    type.toLowerCase(),
    displayName.trim().toLowerCase(),
    type.replace(/-/g, " ").toLowerCase(),
    `ds-${type}`.toLowerCase()
  ]);
  return candidates.has(normalized) || /^(ds|cms)-[a-z0-9-]+$/.test(normalized);
}

function credentialPreviewTitle(type: string): string {
  return {
    "credential-header": "报名成功",
    "credential-qr": "电子报名凭证",
    "credential-conference-info": "会议信息",
    "credential-attendee-info": "参会人信息",
    "credential-payment-info": "支付信息",
    "credential-form-summary": "报名表单摘要",
    "credential-checkin-info": "签到信息",
    "credential-actions": "操作按钮"
  }[type] ?? "报名凭证";
}

function credentialInfoPreview(className: string[], title: string, rows: Array<[string, string]>, titleStyle: Record<string, string | undefined>, textStyle: Record<string, string | undefined>) {
  return h("div", { class: className }, [
    h("strong", { style: titleStyle }, title),
    h("div", { class: "preview-credential-lines" }, rows.map(([label, value]) =>
      h("span", [h("small", label), h("b", { style: textStyle }, value)])
    ))
  ]);
}

const sampleConferences = [
  {
    id: "sample-1",
    title: "行业增长大会",
    summary: "增长案例与实战方法",
    coverImage: "",
    location: "上海会议中心",
    startAt: "2026-08-18T09:00:00.000Z",
    endAt: "2026-08-18T12:00:00.000Z"
  },
  {
    id: "sample-2",
    title: "数字运营峰会",
    summary: "数字化运营与组织增长",
    coverImage: "",
    location: "深圳",
    startAt: "2026-09-06T09:00:00.000Z",
    endAt: "2026-09-06T17:00:00.000Z"
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
    display: booleanConfig(component, "showTitle", true) ? undefined : "none",
    color,
    fontSize: `${Math.max(6, fontSize)}px`,
    textAlign: align,
    fontFamily: fontFamilyValue(String(component.config.titleFontFamily ?? component.config.fontFamily ?? "system"), component, customFontKey),
    fontWeight: String(component.config.titleFontWeight || (component.config.titleFontFamily === "bold-sans" ? "800" : "800"))
  };
}

function buildPreviewSubtitleStyle(component: EditableComponent) {
  return {
    display: booleanConfig(component, "showTitle", true) ? undefined : "none",
    color: String(component.config.subtitleTextColor || "#637083"),
    fontSize: `${Math.max(6, numberValue(component, "subtitleFontSize", 22))}px`,
    textAlign: String(component.config.titleTextAlign ?? component.config.textAlign ?? "left")
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
      flexBasis: `${size.width}px`,
      objectFit: previewObjectFit(component.config.cardImageMode)
    };
  }
  return {
    height: `${numberValue(component, "cardImageHeight", 120)}px`,
    borderRadius: `${numberValue(component, "cardRadius", 8)}px`,
    objectFit: previewObjectFit(component.config.cardImageMode)
  };
}

function previewHeroCardStyle(component: EditableComponent) {
  return {
    minHeight: `${Math.max(132, Math.round(numberValue(component, "height", 430) / 2.25))}px`
  };
}

function previewHomeHeroStyle(component: EditableComponent) {
  return {
    minHeight: `${Math.max(150, Math.round(numberValue(component, "height", 420) / 2.35))}px`,
    borderRadius: `${numberValue(component, "radius", adminRadiusPx(component) * 2) / 2}px`,
    background: String(component.config.backgroundColor || "var(--preview-primary)")
  };
}

function previewPanelStyle(component: EditableComponent) {
  const layout = previewModuleLayoutStyle(component);
  if (previewComponentContainerStyle(component) === "transparent") {
    return {
      background: "transparent",
      borderColor: "transparent",
      boxShadow: "none",
      ...layout
    };
  }
  return {
    background: String(component.config.backgroundColor || ""),
    borderRadius: `${adminRadiusPx(component)}px`,
    ...layout
  };
}

function previewModuleLayoutStyle(component: EditableComponent) {
  const style: Record<string, string> = {};
  const minHeight = numberValue(component, "moduleHeight", 0);
  const opacity = numberValue(component, "moduleOpacity", 100);
  const marginTop = numberValue(component, "moduleSpacingTop", 0);
  if (minHeight > 0) style.minHeight = `${Math.round(minHeight / 2)}px`;
  if (opacity >= 0 && opacity < 100) style.opacity = String(Math.max(0, Math.min(100, opacity)) / 100);
  if (marginTop > 0) style.marginTop = `${Math.round(marginTop / 2)}px`;
  return style;
}

function previewComponentContainerStyle(component: EditableComponent): "card" | "transparent" {
  const value = String(component.config.contentBackgroundStyle || component.config.containerStyle || "");
  if (value === "transparent") return "transparent";
  if (value === "card") return "card";
  return isRichContentComponentType(component.type) ? "transparent" : "card";
}

function previewSectionClass(component: EditableComponent, ...extra: string[]): string[] {
  return [
    "preview-section",
    previewComponentContainerStyle(component) === "transparent" ? "is-transparent" : "",
    booleanConfig(component, "fullBleed", false) ? "is-full-bleed" : "",
    ...extra
  ].filter(Boolean);
}

function previewSectionStyle(component: EditableComponent) {
  return previewPanelStyle(component);
}

function previewGridColumnsStyle(component: EditableComponent) {
  const columns = Math.min(5, Math.max(2, Number(component.config.columns) || adminModuleTokens(component)?.columns || 3));
  const gap = Math.max(2, Math.round(numberValue(component, "cardGap", adminSpacingPx(component) * 2) / 2));
  if (component.config.layoutMode === "scroll" || component.config.layoutMode === "list") {
    return {
      display: "flex",
      ...(component.config.layoutMode === "list" ? { flexDirection: "column" } : {}),
      gap: `${gap}px`
    };
  }
  return {
    display: "grid",
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: `${gap}px`
  };
}

function previewModuleHeadStyle(component: EditableComponent) {
  return {
    textAlign: String(component.config.titleTextAlign ?? "left"),
    marginBottom: `${numberValue(component, "titleBottomGap", 18)}px`
  };
}

function previewEntryGridClass(component: EditableComponent): string[] {
  const layout = component.config.layoutMode === "scroll" ? "is-scroll" : component.config.layoutMode === "list" ? "is-list" : "";
  return ["preview-entry-grid__items", layout].filter(Boolean);
}

function previewEntryTileClass(component: EditableComponent, entry: EntryConfigItem): string[] {
  const style = entry.cardStyle || String(component.config.cardStyle || adminModuleTokens(component)?.cardStyle || "soft");
  return ["preview-entry-tile", `is-${style}`, component.config.layoutMode === "list" ? "is-list" : ""].filter(Boolean);
}

function previewEntryTileStyle(component: EditableComponent, entry: EntryConfigItem) {
  const isTransparentContainer = previewComponentContainerStyle(component) === "transparent";
  const background = entry.backgroundColor || String(component.config.cardBackground || "");
  return {
    borderRadius: `${numberValue(component, "cardRadius", adminRadiusPx(component) * 2) / 2}px`,
    ...(background ? { background } : isTransparentContainer ? { background: "transparent", borderColor: "transparent", boxShadow: "none" } : {}),
    color: entry.textColor || String(component.config.textColor || "")
  };
}

function previewEntryIconStyle(component: EditableComponent) {
  const iconSize = component.config.iconSize || adminModuleTokens(component)?.iconSize || "large";
  const size = iconSize === "small" ? 30 : iconSize === "xlarge" ? 52 : 40;
  return {
    width: `${size}px`,
    height: `${size}px`
  };
}

function adminModuleContract(component: EditableComponent): ModuleRenderContract | null {
  return getModuleRenderContractForVisualComponent(component.type, "adminPreview");
}

function adminModuleTokens(component: EditableComponent) {
  return adminModuleContract(component)?.designTokens;
}

function adminRadiusPx(component: EditableComponent): number {
  const preset = String(component.config.radiusPreset || adminModuleTokens(component)?.radiusPreset || "md");
  if (preset === "sm") return 8;
  if (preset === "lg") return 16;
  return 12;
}

function adminSpacingPx(component: EditableComponent): number {
  const preset = String(component.config.spacingPreset || adminModuleTokens(component)?.spacingPreset || "standard");
  if (preset === "compact") return 5;
  if (preset === "relaxed") return 12;
  return 7;
}

function previewEntryTitleStyle(entry: EntryConfigItem) {
  return entry.textColor ? { color: entry.textColor } : {};
}

function previewEntrySubtitleStyle(entry: EntryConfigItem) {
  return entry.textColor ? { color: entry.textColor, opacity: "0.72" } : {};
}

function builtinIconLabel(entry: EntryConfigItem): string {
  const map: Record<string, string> = {
    conference: "会",
    registration: "报",
    order: "单",
    shop: "商",
    member: "员",
    invoice: "票",
    service: "客"
  };
  return map[entry.builtinIcon] || entry.title.slice(0, 1) || "入";
}

function previewCarouselStyle(component: EditableComponent) {
  return {
    height: `${Math.max(88, Math.round(numberValue(component, "height", 320) / 2.35))}px`
  };
}

function previewImageModeStyle(component: EditableComponent) {
  return {
    objectFit: previewObjectFit(component.config.imageMode)
  };
}

function previewRichContentClass(component: EditableComponent): string[] {
  return [
    "preview-section",
    "preview-rich-content",
    booleanConfig(component, "fullBleed", false) ? "is-full-bleed" : "",
    previewRichContentContainerStyle(component) === "card" ? "is-card" : "is-transparent",
    previewRichContentImageOnly(component) ? "is-image-stack" : ""
  ].filter(Boolean);
}

function previewRichContentStyle(component: EditableComponent) {
  const card = previewRichContentContainerStyle(component) === "card";
  const gap = numberValue(component, "blockGap", previewRichContentImageOnly(component) ? 0 : 18);
  const padding = numberValue(component, "contentPadding", 0);
  return {
    gap: `${Math.max(0, Math.round(gap / 2))}px`,
    padding: `${Math.max(0, Math.round(padding / 2))}px`,
    ...previewModuleLayoutStyle(component),
    ...(card ? {} : { background: "transparent", boxShadow: "none", border: "0" })
  };
}

function previewRichContentContainerStyle(component: EditableComponent): string {
  const value = String(component.config.contentBackgroundStyle || component.config.containerStyle || "");
  return value === "card" ? "card" : "transparent";
}

function previewRichContentImageOnly(component: EditableComponent): boolean {
  const blocks = normalizeRichBlocks(component.config.blocks, component).filter((block) => block.enabled !== false && block.type !== "divider");
  return blocks.length > 0 && blocks.every((block) => block.type === "image");
}

function previewRichImageStyle(component: EditableComponent, block: RichContentBlockItem) {
  const radius = numberValue(component, "imageRadius", previewRichContentImageOnly(component) ? 0 : 18);
  return {
    borderRadius: `${Math.max(0, Math.round(radius / 2))}px`,
    objectFit: previewObjectFit(block.imageMode)
  };
}

function previewObjectFit(value: unknown): "fill" | "cover" | "contain" {
  if (value === "contain" || value === "widthFix") return "contain";
  if (value === "aspectFill") return "cover";
  return "fill";
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

function previewScheduleMonths(items: Array<{ startAt?: string }>): Array<{ key: string; year: string; label: string }> {
  const lookup = new Map<string, { key: string; year: string; label: string }>();
  items.forEach((item) => {
    const date = previewDate(item.startAt);
    if (!date) return;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!lookup.has(key)) {
      lookup.set(key, { key, year: String(date.getFullYear()), label: `${date.getMonth() + 1} 月` });
    }
  });
  return Array.from(lookup.values()).slice(0, 6);
}

function previewScheduleMonthKey(value: string | undefined): string {
  const date = previewDate(value);
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "";
}

function previewScheduleTag(meeting: { title: string; summary?: string }, component: EditableComponent): string {
  const categories = Array.isArray(component.config.categories) ? (component.config.categories as unknown[]).map(String).filter((item) => item && item !== "全部") : [];
  return categories.find((category) => meeting.title.includes(category) || meeting.summary?.includes(category)) || categories[0] || "会议";
}

function previewScheduleDay(value: string | undefined): string {
  const date = previewDate(value);
  return date ? String(date.getDate()).padStart(2, "0") : "--";
}

function previewScheduleWeekday(value: string | undefined): string {
  const date = previewDate(value);
  if (!date) return "待定";
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
}

function previewScheduleTime(startAt: string | undefined, endAt: string | undefined): string {
  const start = previewDate(startAt);
  const end = previewDate(endAt);
  if (!start) return "时间待定";
  const startText = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
  if (!end) return startText;
  return `${startText}-${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
}

function previewDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function schedulePreviewActionText(meeting: { startAt?: string; endAt?: string }, component: EditableComponent): string {
  if (!booleanConfig(component, "showAppointmentButton", true)) return detailButtonText(component);
  const now = Date.now();
  const start = previewDate(meeting.startAt)?.getTime();
  const end = previewDate(meeting.endAt)?.getTime();
  if (Number.isFinite(end) && typeof end === "number" && now > end) return detailButtonText(component);
  if (Number.isFinite(start) && typeof start === "number" && now < start) {
    const value = component.config.appointmentButtonText;
    return typeof value === "string" && value.trim() ? value.trim() : "提前预约";
  }
  return detailButtonText(component);
}

function splitPreviewLine(value: string): string[] {
  return value.split(/[\n|｜,，;；]+/).map((item) => item.trim()).filter(Boolean);
}

function splitPreviewEntryLine(value: string): string[] {
  return value.split(/[|｜]/).map((item) => item.trim());
}

function looksLikePreviewImage(value: string): boolean {
  return /^https?:\/\//i.test(value) || /\.(png|jpe?g|webp|gif|svg|apng)(\?|$)/i.test(value);
}
</script>

<style scoped src="./pages.css"></style>
