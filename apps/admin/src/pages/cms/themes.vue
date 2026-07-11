<template>
  <section class="admin-page theme-page">
    <AdminPageHeader title="主题配置" eyebrow="页面装修" subtitle="统一设置前台页面的颜色、背景、按钮、卡片与品牌标识。">
      <template #actions>
        <el-button @click="resetDefault">恢复默认</el-button>
        <el-button type="primary" :loading="saving" @click="save">发布主题</el-button>
      </template>
    </AdminPageHeader>

    <section class="theme-shell">
      <div class="data-panel theme-form-panel">
        <div class="theme-form-intro">
          <div>
            <div class="panel-title">主题控制台</div>
            <p class="page-subtitle">支持按页面应用主题，也能一键应用到所有页面。</p>
          </div>
          <span class="theme-badge">{{ form.themeApplyMode === "all" ? "全部页面" : `已选 ${appliedPageNames.length} 个页面` }}</span>
        </div>

        <el-form :model="form" label-width="112px" class="theme-form">
          <el-collapse v-model="expandedThemeSections" class="theme-collapse">
          <el-collapse-item title="页面模块" name="page-modules">
          <section class="form-section">
            <div class="section-head">
              <strong>应用页面</strong>
              <span>支持单页、多页选择，以及全部页面一键应用。</span>
            </div>
            <el-form-item label="应用方式">
              <el-radio-group v-model="form.themeApplyMode">
                <el-radio-button label="all">全部页面</el-radio-button>
                <el-radio-button label="selected">指定页面</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="form.themeApplyMode === 'selected'" label="目标页面">
              <el-select v-model="form.themeApplyPageKeys" multiple filterable collapse-tags collapse-tags-tooltip placeholder="选择页面">
                <el-option v-for="page in pageOptions" :key="page.value" :label="page.label" :value="page.value" />
              </el-select>
              <div class="apply-row">
                <el-button link type="primary" @click="applyToAllPages">一键应用全部页面</el-button>
                <span>{{ appliedPageNames.join("、") || "暂未选择页面" }}</span>
              </div>
            </el-form-item>
          </section>
          </el-collapse-item>

          <el-collapse-item title="主题色 / 按钮 / 卡片" name="colors">
          <section class="form-section">
            <div class="section-head">
              <strong>基础色彩</strong>
              <span>控制前台主色、辅助色、卡片、按钮和整体层次。</span>
            </div>
            <el-form-item label="配色方案">
              <div class="palette-grid">
                <button
                  v-for="palette in palettePresets"
                  :key="palette.name"
                  type="button"
                  class="palette-card"
                  :class="{ active: form.visualPreset === palette.values.visualPreset }"
                  @click="applyPalette(palette)"
                >
                  <span class="palette-swatches">
                    <i v-for="color in palette.colors" :key="color" :style="{ background: color }" />
                  </span>
                  <strong>{{ palette.name }}</strong>
                  <small>{{ palette.subtitle }}</small>
                </button>
              </div>
            </el-form-item>
            <el-form-item label="主色"><div class="color-row"><el-color-picker v-model="form.primaryColor" /><el-input v-model="form.primaryColor" /></div></el-form-item>
            <el-form-item label="辅助色"><div class="color-row"><el-color-picker v-model="form.secondaryColor" /><el-input v-model="form.secondaryColor" /></div></el-form-item>
            <el-form-item label="强调色"><div class="color-row"><el-color-picker v-model="form.accentColor" /><el-input v-model="form.accentColor" /></div></el-form-item>
            <el-form-item label="背景色"><div class="color-row"><el-color-picker v-model="form.backgroundColor" /><el-input v-model="form.backgroundColor" /></div></el-form-item>
            <el-form-item label="卡片背景"><div class="color-row"><el-color-picker v-model="form.cardBackground" /><el-input v-model="form.cardBackground" /></div></el-form-item>
            <el-form-item label="圆角"><el-input-number v-model="form.radius" :min="0" :max="32" /></el-form-item>
            <el-form-item label="按钮风格">
              <el-select v-model="form.buttonStyle">
                <el-option label="实心" value="solid" />
                <el-option label="描边" value="outline" />
                <el-option label="柔和" value="soft" />
              </el-select>
            </el-form-item>
            <el-form-item label="阴影强度">
              <el-select v-model="form.shadow">
                <el-option label="无" value="none" />
                <el-option label="柔和" value="soft" />
                <el-option label="明显" value="strong" />
              </el-select>
            </el-form-item>
            <el-form-item label="标题字号"><el-input-number v-model="form.titleFontSize" :min="28" :max="64" /></el-form-item>
            <el-form-item label="横幅风格">
              <el-select v-model="form.bannerStyle">
                <el-option label="干净" value="clean" />
                <el-option label="图片" value="image" />
                <el-option label="强调" value="accent" />
                <el-option label="沉浸铺满" value="immersive" />
                <el-option label="互动浮层" value="interactive" />
              </el-select>
            </el-form-item>
          </section>
          </el-collapse-item>

          <el-collapse-item title="品牌信息" name="brand">
          <section class="form-section">
            <div class="section-head">
              <strong>后台品牌</strong>
              <span>控制后台左上角文案、浏览器标题和图标。</span>
            </div>
            <el-form-item label="后台名称"><el-input v-model="form.adminBrandTitle" /></el-form-item>
            <el-form-item label="后台副标题"><el-input v-model="form.adminBrandSubtitle" /></el-form-item>
            <el-form-item>
              <template #label>后台图标<MaterialSpecHelp spec-key="adminBrandIcon" /></template>
              <div class="field-row">
                <el-input v-model="form.adminBrandLogoUrl" placeholder="建议 96x96 PNG/SVG，适配深色侧栏" />
                <el-button @click="openMaterialPicker('adminBrandLogoUrl', 'image')">应用素材库</el-button>
              </div>
            </el-form-item>
            <el-form-item label="浏览器标题"><el-input v-model="form.browserTitle" /></el-form-item>
            <el-form-item>
              <template #label>浏览器图标<MaterialSpecHelp spec-key="favicon" /></template>
              <div class="field-row">
                <el-input v-model="form.browserIconUrl" placeholder="建议 32x32 或 64x64 ICO/PNG/SVG" />
                <el-button @click="openMaterialPicker('browserIconUrl', 'image')">应用素材库</el-button>
              </div>
            </el-form-item>
          </section>
          </el-collapse-item>

          <el-collapse-item title="背景设置" name="background">
          <section class="form-section">
            <div class="section-head">
              <strong>背景效果</strong>
              <span>背景模式互斥，仅当前选择的模式会在用户端生效。</span>
            </div>
            <el-form-item label="背景模式">
              <el-select v-model="form.backgroundMode">
                <el-option label="纯色" value="solid" />
                <el-option label="渐变" value="gradient" />
                <el-option label="动态渐变" value="dynamic-gradient" />
                <el-option label="背景图片" value="image" />
                <el-option label="视频背景" value="video" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="usesGradient" label="渐变起点"><div class="color-row"><el-color-picker v-model="form.backgroundGradientFrom" /><el-input v-model="form.backgroundGradientFrom" /></div></el-form-item>
            <el-form-item v-if="usesGradient" label="渐变终点"><div class="color-row"><el-color-picker v-model="form.backgroundGradientTo" /><el-input v-model="form.backgroundGradientTo" /></div></el-form-item>
            <el-form-item v-if="form.backgroundMode === 'image'">
              <template #label>背景图片<MaterialSpecHelp spec-key="backgroundImage" /></template>
              <div class="field-row">
                <el-input v-model="form.backgroundImageUrl" placeholder="建议 1920x1080 或 1440x900，JPG/WebP" />
                <el-button @click="openMaterialPicker('backgroundImageUrl', 'image')">应用素材库</el-button>
              </div>
            </el-form-item>
            <el-form-item v-if="form.backgroundMode === 'video'">
              <template #label>背景视频<MaterialSpecHelp spec-key="backgroundVideo" /></template>
              <div class="field-row">
                <el-input v-model="form.backgroundVideoUrl" placeholder="建议 MP4/H.264，720p 或 1080p，5-15 秒" />
                <el-button @click="openMaterialPicker('backgroundVideoUrl', 'video')">应用素材库</el-button>
              </div>
              <p class="form-help">H5 和小程序端均使用静音循环播放；无法播放时会自动显示背景封面。</p>
            </el-form-item>
            <el-form-item v-if="form.backgroundMode === 'video'">
              <template #label>视频封面<MaterialSpecHelp spec-key="backgroundImage" /></template>
              <div class="field-row">
                <el-input v-model="form.backgroundVideoPosterUrl" placeholder="视频加载失败或未自动播放时展示，建议 1920x1080 JPG/WebP" />
                <el-button @click="openMaterialPicker('backgroundVideoPosterUrl', 'image')">应用素材库</el-button>
              </div>
            </el-form-item>
            <el-form-item v-if="form.backgroundMode === 'video'" label="视频遮罩">
              <el-select v-model="form.backgroundVideoOverlayMode">
                <el-option label="无遮罩" value="none" />
                <el-option label="轻微遮罩" value="light" />
                <el-option label="中等遮罩" value="medium" />
                <el-option label="强遮罩" value="strong" />
                <el-option label="自定义" value="custom" />
              </el-select>
              <p class="form-help">默认使用轻微遮罩，保证背景可见且不压住正文。</p>
            </el-form-item>
            <el-form-item v-if="form.backgroundMode === 'video' && form.backgroundVideoOverlayMode === 'custom'" label="遮罩透明度">
              <el-slider v-model="form.backgroundVideoOverlayOpacity" :min="0" :max="0.7" :step="0.01" show-input />
            </el-form-item>
            <el-form-item v-if="form.backgroundMode === 'dynamic-gradient'" label="动态预设">
              <el-radio-group v-model="form.backgroundDynamicPattern">
                <el-radio-button label="flow">流动</el-radio-button>
                <el-radio-button label="ripple">涟漪</el-radio-button>
                <el-radio-button label="float">漂浮</el-radio-button>
                <el-radio-button label="zoom">缩放</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="form.backgroundMode === 'dynamic-gradient'" label="动态密度"><el-slider v-model="form.backgroundDynamicDensity" :min="10" :max="100" /></el-form-item>
            <el-form-item v-if="form.backgroundMode === 'dynamic-gradient'" label="变化速度"><el-slider v-model="form.backgroundDynamicSpeed" :min="6" :max="40" /></el-form-item>
            <el-form-item v-if="form.backgroundMode === 'dynamic-gradient'" label="渐变角度"><el-slider v-model="form.backgroundGradientAngle" :min="0" :max="360" /></el-form-item>
            <el-form-item label="底部过滤"><el-switch v-model="form.backgroundBottomFilter" active-text="开启" inactive-text="关闭" /></el-form-item>
            <el-form-item label="应用位置">
              <el-radio-group v-model="form.backgroundApplyTo">
                <el-radio-button label="header">仅头部</el-radio-button>
                <el-radio-button label="body">头部和正文</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </section>
          </el-collapse-item>

          <el-collapse-item title="视频 / 开屏设置" name="splash">
          <section class="form-section">
            <div class="section-head">
              <strong>启动视频</strong>
              <span>用于小程序进入首页前的全屏品牌视频，可按频率控制展示。</span>
            </div>
            <el-form-item label="启用启动页">
              <el-switch v-model="form.splashEnabled" active-text="开启" inactive-text="关闭" />
            </el-form-item>
            <el-form-item v-if="form.splashEnabled">
              <template #label>启动视频<MaterialSpecHelp spec-key="backgroundVideo" /></template>
              <div class="field-row">
                <el-input v-model="form.splashVideoUrl" placeholder="建议 MP4/H.264，5-15 秒" />
                <el-button @click="openMaterialPicker('splashVideoUrl', 'video')">应用素材库</el-button>
              </div>
            </el-form-item>
            <el-form-item v-if="form.splashEnabled">
              <template #label>启动封面<MaterialSpecHelp spec-key="backgroundImage" /></template>
              <div class="field-row">
                <el-input v-model="form.splashPosterUrl" placeholder="视频未加载完成时展示，建议 1080x1920 或 750x1334" />
                <el-button @click="openMaterialPicker('splashPosterUrl', 'image')">应用素材库</el-button>
              </div>
            </el-form-item>
            <el-form-item v-if="form.splashEnabled" label="展示频率">
              <el-select v-model="form.splashFrequency">
                <el-option label="每次进入首页" value="every_time" />
                <el-option label="每天一次" value="daily" />
                <el-option label="每个版本一次" value="version" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="form.splashEnabled" label="倒计时秒数">
              <el-input-number v-model="form.splashCountdownSeconds" :min="1" :max="15" />
            </el-form-item>
            <el-form-item v-if="form.splashEnabled" label="允许跳过">
              <el-switch v-model="form.splashAllowSkip" active-text="允许" inactive-text="不允许" />
            </el-form-item>
            <el-form-item v-if="form.splashEnabled && form.splashAllowSkip" label="跳过文案">
              <el-input v-model="form.splashSkipText" placeholder="跳过" />
            </el-form-item>
            <el-form-item v-if="form.splashEnabled" label="底部文案">
              <el-switch v-model="form.splashShowBottomText" active-text="显示" inactive-text="隐藏" />
            </el-form-item>
            <el-form-item v-if="form.splashEnabled && form.splashShowBottomText" label="文案内容">
              <el-input v-model="form.splashBottomText" placeholder="欢迎进入会务小程序" />
            </el-form-item>
            <el-form-item v-if="form.splashEnabled && form.splashShowBottomText" label="文案样式">
              <el-select v-model="form.splashBottomTextStyle">
                <el-option label="亮色居中" value="light" />
                <el-option label="暗色居中" value="dark" />
                <el-option label="胶囊底色" value="pill" />
              </el-select>
            </el-form-item>
          </section>
          </el-collapse-item>
          </el-collapse>
        </el-form>
      </div>

      <div class="data-panel theme-preview-panel">
        <div class="preview-head">
          <div>
            <div class="panel-title">实时预览</div>
            <p class="page-subtitle">实际小程序预览效果：背景、卡片、按钮和应用范围都在手机页面内部展示。</p>
          </div>
          <el-radio-group v-model="previewPageKey" size="small">
            <el-radio-button v-for="page in previewPageOptions" :key="page.value" :label="page.value">{{ page.label }}</el-radio-button>
          </el-radio-group>
        </div>

        <div class="preview-stage" :style="previewStageStyle">
          <div class="preview-phone">
            <div class="preview-phone__status">
              <span>9:41</span>
              <span>{{ previewApplied ? "已应用" : "未应用" }}</span>
            </div>
            <div class="preview-phone__screen">
              <div class="preview-nav">{{ previewPageLabel }}</div>
              <div class="preview-body" :style="previewBodyStyle">
                <ThemeDynamicBackgroundPreview
                  v-if="previewApplied && form.backgroundMode === 'dynamic-gradient' && form.backgroundApplyTo !== 'header'"
                  :theme="form"
                />
                <video
                  v-if="previewApplied && form.backgroundMode === 'video' && form.backgroundVideoUrl"
                  class="preview-video"
                  :src="form.backgroundVideoUrl"
                  :poster="form.backgroundVideoPosterUrl"
                  autoplay
                  muted
                  loop
                  playsinline
                  webkit-playsinline
                />
                <div v-if="previewApplied && form.backgroundMode === 'video' && form.backgroundVideoUrl" class="preview-video-overlay" :style="{ opacity: previewVideoOverlayOpacity }" />
                <section class="preview-hero" :style="previewHeroStyle">
                  <ThemeDynamicBackgroundPreview
                    v-if="previewApplied && form.backgroundMode === 'dynamic-gradient' && form.backgroundApplyTo === 'header'"
                    :theme="form"
                  />
                  <div class="preview-hero__copy">
                    <span>{{ previewPageLabel }}</span>
                    <strong>{{ previewHeroTitle }}</strong>
                    <p>{{ previewHeroText }}</p>
                  </div>
                  <button class="preview-primary-button">{{ previewCtaText }}</button>
                </section>

                <section class="preview-card preview-card--list">
                  <div class="preview-card__head">
                    <strong>{{ previewSectionTitle }}</strong>
                    <small>{{ previewApplied ? "当前页面已命中主题" : "当前页面未命中主题，将回退默认主题" }}</small>
                  </div>
                  <div class="preview-conference-list">
                    <article v-for="item in previewConferenceCards" :key="item.title" class="preview-conference-card">
                      <div class="preview-conference-card__cover" />
                      <div class="preview-conference-card__body">
                        <strong>{{ item.title }}</strong>
                        <p>{{ item.summary }}</p>
                        <span>{{ item.meta }}</span>
                      </div>
                      <button class="preview-detail-button">查看详情</button>
                    </article>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <el-dialog v-model="materialVisible" title="选择素材" width="820px">
      <div class="material-picker">
        <div class="material-picker__head">
          <el-input v-model="materialKeyword" clearable placeholder="搜索素材名称" @keyup.enter="loadMaterials" />
          <el-button :loading="materialLoading" @click="loadMaterials">搜索</el-button>
        </div>
        <el-empty v-if="!materialLoading && materialAssets.length === 0" description="暂无匹配素材" />
        <div v-else class="material-grid">
          <button v-for="asset in materialAssets" :key="asset.id" class="material-card" @click="chooseMaterial(asset)">
            <img v-if="asset.fileType.startsWith('image/')" :src="asset.url" :alt="asset.name" />
            <span v-else class="video-thumb">视频</span>
            <strong>{{ asset.name }}</strong>
            <small>{{ asset.usage || "通用素材" }}</small>
          </button>
        </div>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import MaterialSpecHelp from "../../components/MaterialSpecHelp.vue";
import ThemeDynamicBackgroundPreview from "../../components/ThemeDynamicBackgroundPreview.vue";
import { getTheme, listMaterials, listPages, updateTheme } from "../../services/admin";
import type { MaterialAsset, PageTemplate, ThemeConfig } from "../../services/types";

interface PalettePreset {
  name: string;
  subtitle: string;
  colors: string[];
  values: Partial<ThemeConfig>;
}

const DEFAULT_THEME: ThemeConfig = {
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
  adminBrandTitle: "会务运营平台",
  adminBrandSubtitle: "报名、支付与页面配置中心",
  adminBrandLogoUrl: "",
  browserTitle: "会务运营平台",
  browserIconUrl: "",
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
  themeApplyPageKeys: [],
  splashEnabled: false,
  splashVideoUrl: "",
  splashPosterUrl: "",
  splashCountdownSeconds: 5,
  splashAllowSkip: true,
  splashSkipText: "跳过",
  splashFrequency: "daily",
  splashShowBottomText: true,
  splashBottomText: "欢迎进入会务小程序",
  splashBottomTextStyle: "light"
};

const palettePresets: PalettePreset[] = [
  {
    name: "Conference Calm",
    subtitle: "商务会议、发布会、标准会务",
    colors: ["#315d7d", "#3a8f79", "#b58b47", "#f5f7f6"],
    values: {
      visualPreset: "business-blue",
      primaryColor: "#315d7d",
      secondaryColor: "#3a8f79",
      accentColor: "#b58b47",
      backgroundColor: "#f5f7f6",
      cardBackground: "#ffffff",
      backgroundGradientFrom: "#fbfcfb",
      backgroundGradientTo: "#edf3f0",
      bannerStyle: "immersive",
      shadow: "soft"
    }
  },
  {
    name: "Tech Black Gold",
    subtitle: "科技峰会、闭门会、高端论坛",
    colors: ["#090b10", "#d6b56d", "#6ca8ff", "#111722"],
    values: {
      visualPreset: "tech-black-gold",
      primaryColor: "#d6b56d",
      secondaryColor: "#6ca8ff",
      accentColor: "#b88cff",
      backgroundColor: "#090b10",
      cardBackground: "#111722",
      backgroundGradientFrom: "#090b10",
      backgroundGradientTo: "#1e293b",
      bannerStyle: "interactive",
      shadow: "strong"
    }
  },
  {
    name: "Fresh Green",
    subtitle: "生态会、文旅会、轻商务活动",
    colors: ["#263b2e", "#86a36e", "#b68e55", "#f4f5ec"],
    values: {
      visualPreset: "fresh-green",
      primaryColor: "#263b2e",
      secondaryColor: "#86a36e",
      accentColor: "#b68e55",
      backgroundColor: "#f4f5ec",
      cardBackground: "#ffffff",
      backgroundGradientFrom: "#f7f8f0",
      backgroundGradientTo: "#eef2e5",
      bannerStyle: "clean",
      shadow: "soft"
    }
  },
  {
    name: "Summit Red",
    subtitle: "大会、招商会、品牌峰会",
    colors: ["#b4232a", "#c78b37", "#d8582f", "#fff8f3"],
    values: {
      visualPreset: "summit-red",
      primaryColor: "#b4232a",
      secondaryColor: "#c78b37",
      accentColor: "#d8582f",
      backgroundColor: "#fff8f3",
      cardBackground: "#ffffff",
      backgroundGradientFrom: "#fff8f3",
      backgroundGradientTo: "#fbe7e8",
      bannerStyle: "accent",
      shadow: "soft"
    }
  },
  {
    name: "Education Vitality",
    subtitle: "培训、课程、教育大会",
    colors: ["#3b82f6", "#22c55e", "#f59e0b", "#f7faff"],
    values: {
      visualPreset: "education-vitality",
      primaryColor: "#3b82f6",
      secondaryColor: "#22c55e",
      accentColor: "#f59e0b",
      backgroundColor: "#f7faff",
      cardBackground: "#ffffff",
      backgroundGradientFrom: "#f7faff",
      backgroundGradientTo: "#eef6ff",
      bannerStyle: "interactive",
      shadow: "soft"
    }
  }
];

const previewFallbackPages = [
  { value: "home", label: "首页" },
  { value: "conference-detail", label: "会议详情" },
  { value: "my-registrations", label: "我的报名" }
];

const form = reactive<ThemeConfig>({ ...DEFAULT_THEME });
const pages = ref<PageTemplate[]>([]);
const saving = ref(false);
const materialVisible = ref(false);
const materialLoading = ref(false);
const materialKeyword = ref("");
const materialAssets = ref<MaterialAsset[]>([]);
const materialTarget = ref<{ key: keyof ThemeConfig; kind: "image" | "video" } | null>(null);
const previewPageKey = ref("home");
const expandedThemeSections = ref(["page-modules", "colors", "brand", "background", "splash"]);

const pageOptions = computed(() =>
  pages.value.map((page) => ({
    value: page.pageKey,
    label: page.title
  }))
);

const previewPageOptions = computed(() => (pageOptions.value.length > 0 ? pageOptions.value.slice(0, 6) : previewFallbackPages));
const previewPageLabel = computed(() => previewPageOptions.value.find((item) => item.value === previewPageKey.value)?.label ?? "首页");
const appliedPageNames = computed(() => {
  const lookup = new Map(pageOptions.value.map((item) => [item.value, item.label]));
  return (form.themeApplyPageKeys ?? []).map((key) => lookup.get(key) ?? key);
});
const previewApplied = computed(() => form.themeApplyMode !== "selected" || (form.themeApplyPageKeys ?? []).includes(previewPageKey.value));
const usesGradient = computed(() => form.backgroundMode === "gradient" || form.backgroundMode === "dynamic-gradient");
const previewVideoOverlayOpacity = computed(() => String(resolveVideoOverlayOpacity(form)));
const previewStageStyle = computed(() => ({
  "--theme-primary": form.primaryColor,
  "--theme-secondary": form.secondaryColor,
  "--theme-accent": form.accentColor,
  "--theme-bg": form.backgroundColor,
  "--theme-card": form.cardBackground,
  "--theme-radius": `${form.radius}px`,
  "--theme-title": `${form.titleFontSize}px`,
  "--theme-shadow": shadowValue(form.shadow)
}));
const previewBodyStyle = computed(() => ({
  background: previewApplied.value && form.backgroundMode === "dynamic-gradient" ? form.backgroundColor : previewApplied.value ? previewBackground.value : "#f5f7fb",
  backgroundImage: previewApplied.value && form.backgroundMode === "video" && form.backgroundVideoPosterUrl ? `url("${form.backgroundVideoPosterUrl}")` : undefined,
  backgroundPosition: previewApplied.value && form.backgroundMode === "video" && form.backgroundVideoPosterUrl ? "center" : undefined,
  backgroundSize: previewApplied.value && form.backgroundMode === "video" && form.backgroundVideoPosterUrl ? "cover" : "cover"
}));
const previewHeroStyle = computed(() => {
  if (!previewApplied.value) return {};
  if (form.backgroundApplyTo === "header") {
    return {
      background: form.backgroundMode === "dynamic-gradient" ? form.backgroundColor : previewBackground.value
    };
  }
  return {};
});
const previewBackground = computed(() => {
  if (form.backgroundMode === "image" && form.backgroundImageUrl) {
    const overlay = form.backgroundBottomFilter === false ? "" : "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(245,247,251,0.88)), ";
    return `${overlay}url("${form.backgroundImageUrl}") center / cover`;
  }
  if (form.backgroundMode === "dynamic-gradient") {
    return form.backgroundColor;
  }
  if (form.backgroundMode === "gradient") {
    return `linear-gradient(135deg, ${form.backgroundGradientFrom}, ${form.backgroundGradientTo})`;
  }
  return form.backgroundColor;
});
const previewHeroTitle = computed(() => {
  if (previewPageKey.value === "conference-detail") return "峰会详情与报名安排";
  if (previewPageKey.value === "my-registrations") return "我的报名与状态查看";
  return "会议首页与报名导览";
});
const previewHeroText = computed(() => {
  if (previewPageKey.value === "conference-detail") return "查看时间、地点、票种与报名说明，快速完成参会决策。";
  if (previewPageKey.value === "my-registrations") return "聚合订单状态、参会记录和报名结果，信息查看更清晰。";
  return "展示主视觉、活动亮点和可报名会议列表，适合作为用户进入后的第一屏。";
});
const previewCtaText = computed(() => (previewPageKey.value === "my-registrations" ? "查看记录" : "立即报名"));
const previewSectionTitle = computed(() => (previewPageKey.value === "conference-detail" ? "会议信息" : "会议列表"));
const previewConferenceCards = computed(() =>
  previewPageKey.value === "conference-detail"
    ? [
        { title: "时间安排", summary: "2026-08-01 09:30 入场签到，10:00 正式开场。", meta: "主论坛 + 闭门会" },
        { title: "会场地点", summary: "上海世博会展中心 2 号馆，支持现场签到。", meta: "地铁直达 · 停车指引" }
      ]
    : [
        { title: "示例会议 2", summary: "围绕行业趋势、嘉宾分享与报名转化设计首页节奏。", meta: "北京 · 6 月 8 日" },
        { title: "会议报名缴费 MVP 示例会议", summary: "主视觉、时间地点和报名入口信息层次更清晰。", meta: "上海 · 8 月 1 日" }
      ]
);

onMounted(async () => {
  const [active, pageResponse] = await Promise.all([getTheme(), listPages().catch(() => ({ items: [] as PageTemplate[] }))]);
  pages.value = pageResponse.items;
  Object.assign(form, active.config);
  if (previewPageOptions.value.length > 0) {
    previewPageKey.value = previewPageOptions.value[0].value;
  }
});

function resetDefault() {
  Object.assign(form, DEFAULT_THEME);
}

function applyPalette(palette: PalettePreset) {
  Object.assign(form, palette.values);
}

function applyToAllPages() {
  form.themeApplyMode = "all";
  form.themeApplyPageKeys = [];
}

async function save() {
  const validationMessage = await validateBackgroundBeforeSave();
  if (validationMessage) {
    ElMessage.error(validationMessage);
    return;
  }
  saving.value = true;
  try {
    const active = await updateTheme({ config: { ...form, themeApplyPageKeys: [...(form.themeApplyPageKeys ?? [])] } });
    Object.assign(form, active.config);
    ElMessage.success("主题已发布");
  } finally {
    saving.value = false;
  }
}

async function openMaterialPicker(key: keyof ThemeConfig, kind: "image" | "video") {
  materialTarget.value = { key, kind };
  materialVisible.value = true;
  await loadMaterials();
}

async function loadMaterials() {
  materialLoading.value = true;
  try {
    const response = await listMaterials({ page: 1, pageSize: 80, keyword: materialKeyword.value, enabled: true });
    const target = materialTarget.value;
    materialAssets.value = response.items.filter((asset) => {
      if (!target) return false;
      return target.kind === "video"
        ? asset.fileType === "video/mp4" || /\.mp4(\?|$)/i.test(asset.url)
        : asset.fileType.startsWith("image/") || /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(asset.url);
    });
  } finally {
    materialLoading.value = false;
  }
}

function chooseMaterial(asset: MaterialAsset) {
  const target = materialTarget.value;
  if (!target) return;
  form[target.key] = asset.url;
  materialVisible.value = false;
  ElMessage.success("已应用素材");
}

function shadowValue(value: string | undefined): string {
  if (value === "none") return "none";
  if (value === "strong") return "0 20px 48px rgba(15, 23, 42, 0.18)";
  return "0 10px 28px rgba(15, 23, 42, 0.1)";
}

async function validateBackgroundBeforeSave(): Promise<string | null> {
  if (form.backgroundMode === "video") {
    const url = String(form.backgroundVideoUrl || "").trim();
    if (!url) return "背景视频模式必须填写 MP4 视频 URL";
    if (!/\.mp4(\?|$)/i.test(url)) return "背景视频仅支持 MP4 地址";
    const accessMessage = await validateAssetHead(url, "背景视频");
    if (accessMessage) return accessMessage;
  }
  if (form.splashEnabled) {
    const videoUrl = String(form.splashVideoUrl || "").trim();
    const posterUrl = String(form.splashPosterUrl || "").trim();
    if (!videoUrl && !posterUrl) return "启用启动页后，请至少配置启动视频或启动封面";
    if (videoUrl && !/\.mp4(\?|$)/i.test(videoUrl)) return "启动视频仅支持 MP4 地址";
    if (videoUrl) {
      const accessMessage = await validateAssetHead(videoUrl, "启动视频");
      if (accessMessage) return accessMessage;
    }
  }
  return null;
}

async function validateAssetHead(url: string, label: string): Promise<string | null> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) return `${label}无法访问 (${response.status})`;
  } catch {
    return `${label} URL 无法访问，请检查地址或上传到素材管理`;
  }
  return null;
}

function resolveVideoOverlayOpacity(config: ThemeConfig): number {
  const mode = String(config.backgroundVideoOverlayMode || "light");
  if (mode === "none") return 0;
  if (mode === "medium") return 0.22;
  if (mode === "strong") return 0.38;
  if (mode === "custom") return Math.max(0, Math.min(0.7, Number(config.backgroundVideoOverlayOpacity) || 0));
  return 0.08;
}

</script>

<style scoped>
.theme-shell {
  display: grid;
  grid-template-columns: minmax(420px, 1.05fr) minmax(360px, 0.95fr);
  gap: 20px;
}

.theme-form-panel,
.theme-preview-panel {
  min-height: 760px;
  padding: 20px;
}

.theme-form-intro,
.preview-head,
.section-head,
.apply-row,
.field-row,
.color-row,
.material-picker__head {
  display: flex;
  gap: 12px;
}

.theme-form-intro,
.preview-head {
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}

.theme-badge {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(20, 99, 255, 0.1);
  color: var(--admin-color-primary);
  font-size: 12px;
  font-weight: 700;
}

.theme-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.theme-collapse {
  display: grid;
  gap: 12px;
  border: 0;
}

.theme-collapse :deep(.el-collapse-item) {
  overflow: hidden;
  border: 1px solid var(--admin-color-border);
  border-radius: 14px;
  background: #ffffff;
}

.theme-collapse :deep(.el-collapse-item__header) {
  height: auto;
  min-height: 52px;
  padding: 0 16px;
  border-bottom-color: var(--admin-color-border);
  color: var(--admin-color-text);
  font-weight: 900;
}

.theme-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: 0;
}

.theme-collapse :deep(.el-collapse-item__content) {
  padding: 0;
}

.form-section {
  padding: 18px;
  border: 0;
  border-radius: 0;
  background: #ffffff;
}

.section-head {
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
}

.section-head strong {
  color: var(--admin-color-text);
  font-size: 15px;
}

.section-head span,
.apply-row span {
  color: var(--admin-color-muted);
  font-size: 12px;
}

.apply-row {
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-top: 8px;
}

.palette-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.palette-card {
  padding: 10px 12px;
  border: 1px solid var(--admin-color-border);
  border-radius: 12px;
  background: #f8fbff;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.palette-card:hover,
.palette-card.active {
  border-color: var(--admin-color-primary);
  box-shadow: 0 12px 28px rgba(20, 99, 255, 0.12);
  transform: translateY(-1px);
}

.palette-card strong {
  display: block;
  margin-top: 8px;
  color: var(--admin-color-text);
}

.palette-card small {
  display: block;
  margin-top: 4px;
  color: var(--admin-color-muted);
  font-size: 11px;
  line-height: 1.35;
}

.palette-swatches {
  display: flex;
  gap: 6px;
}

.palette-swatches i {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.color-row {
  align-items: center;
  width: 100%;
}

.color-row :deep(.el-input),
.field-row :deep(.el-input),
.field-row :deep(.el-select) {
  flex: 1;
}

.preview-stage {
  position: relative;
  min-height: 700px;
  overflow: hidden;
  border-radius: 24px;
  padding: 24px;
  background: #eef3f8;
}

.preview-video {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-video-overlay {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: #f5f7fb;
  pointer-events: none;
}

.preview-phone {
  position: relative;
  z-index: 1;
  width: min(100%, 360px);
  margin: 0 auto;
  padding: 14px;
  border-radius: 32px;
  background: rgba(16, 24, 40, 0.9);
  box-shadow: 0 28px 60px rgba(15, 23, 42, 0.26);
}

.preview-phone__status {
  display: flex;
  justify-content: space-between;
  padding: 6px 10px 12px;
  color: #ffffff;
  font-size: 12px;
}

.preview-phone__screen {
  overflow: hidden;
  border-radius: 24px;
  background: #ffffff;
}

.preview-nav {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(15, 23, 42, 0.06);
  text-align: center;
  font-size: 17px;
  font-weight: 800;
}

.preview-body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  background: #f5f7fb;
  overflow: hidden;
}

.preview-hero,
.preview-card {
  position: relative;
  z-index: 1;
  border-radius: 22px;
}

.preview-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  overflow: hidden;
  background: linear-gradient(135deg, var(--theme-primary), var(--theme-secondary));
  color: #ffffff;
  box-shadow: var(--theme-shadow);
}

.preview-hero__copy,
.preview-primary-button {
  position: relative;
  z-index: 1;
}

.preview-hero__copy span,
.preview-hero__copy strong,
.preview-hero__copy p {
  display: block;
}

.preview-hero__copy span {
  font-size: 13px;
  font-weight: 700;
  opacity: 0.88;
}

.preview-hero__copy strong {
  margin-top: 6px;
  font-size: 26px;
  line-height: 1.1;
}

.preview-hero__copy p {
  margin: 10px 0 0;
  font-size: 13px;
  line-height: 1.55;
  opacity: 0.9;
}

.preview-primary-button,
.preview-detail-button {
  border: 0;
  font-weight: 800;
}

.preview-primary-button {
  align-self: flex-start;
  min-width: 98px;
  min-height: 46px;
  padding: 0 16px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.18);
  color: #ffffff;
}

.preview-card {
  padding: 18px;
  background: var(--theme-card);
  box-shadow: var(--theme-shadow);
}

.preview-card__head {
  margin-bottom: 12px;
}

.preview-card__head strong,
.preview-conference-card__body strong {
  display: block;
  color: #172033;
}

.preview-card__head small,
.preview-conference-card__body p,
.preview-conference-card__body span {
  display: block;
  color: #637083;
}

.preview-card__head small {
  margin-top: 4px;
  line-height: 1.5;
}

.preview-conference-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-conference-card {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid rgba(36, 82, 168, 0.12);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(242, 247, 255, 0.9));
}

.preview-conference-card__cover {
  height: 78px;
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(36, 82, 168, 0.2), rgba(20, 184, 166, 0.12));
}

.preview-conference-card__body strong {
  font-size: 15px;
  line-height: 1.35;
}

.preview-conference-card__body p,
.preview-conference-card__body span {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
}

.preview-detail-button {
  min-width: 88px;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--theme-primary);
  color: #ffffff;
}

.field-row {
  align-items: center;
  width: 100%;
}

.form-help {
  margin: 6px 0 0;
  color: var(--admin-color-muted);
  font-size: 12px;
  line-height: 1.5;
}

.material-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.material-card {
  min-height: 148px;
  padding: 8px;
  border: 1px solid var(--admin-color-border);
  border-radius: 8px;
  background: #ffffff;
  text-align: left;
}

.material-card img,
.video-thumb {
  display: grid;
  place-items: center;
  width: 100%;
  height: 92px;
  border-radius: 6px;
  object-fit: cover;
  background: #f3f6fb;
  color: var(--admin-color-muted);
}

.material-card strong,
.material-card small {
  display: block;
  margin-top: 6px;
}

@media (max-width: 1280px) {
  .theme-shell {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .palette-grid {
    grid-template-columns: 1fr;
  }

  .preview-head,
  .theme-form-intro,
  .section-head,
  .apply-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .preview-conference-card {
    grid-template-columns: 1fr;
  }
}
</style>
