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

          <section class="form-section">
            <div class="section-head">
              <strong>后台品牌</strong>
              <span>控制后台左上角文案、浏览器标题和图标。</span>
            </div>
            <el-form-item label="后台名称"><el-input v-model="form.adminBrandTitle" /></el-form-item>
            <el-form-item label="后台副标题"><el-input v-model="form.adminBrandSubtitle" /></el-form-item>
            <el-form-item label="后台图标">
              <div class="field-row">
                <el-input v-model="form.adminBrandLogoUrl" placeholder="可从素材库选择" />
                <el-button @click="openMaterialPicker('adminBrandLogoUrl', 'image')">应用素材库</el-button>
              </div>
            </el-form-item>
            <el-form-item label="浏览器标题"><el-input v-model="form.browserTitle" /></el-form-item>
            <el-form-item label="浏览器图标">
              <div class="field-row">
                <el-input v-model="form.browserIconUrl" placeholder="可从素材库选择 favicon 图片" />
                <el-button @click="openMaterialPicker('browserIconUrl', 'image')">应用素材库</el-button>
              </div>
            </el-form-item>
          </section>

          <section class="form-section">
            <div class="section-head">
              <strong>背景效果</strong>
              <span>支持纯色、渐变、动态渐变、图片和视频背景，并可控制作用区域。</span>
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
            <el-form-item label="渐变起点"><div class="color-row"><el-color-picker v-model="form.backgroundGradientFrom" /><el-input v-model="form.backgroundGradientFrom" /></div></el-form-item>
            <el-form-item label="渐变终点"><div class="color-row"><el-color-picker v-model="form.backgroundGradientTo" /><el-input v-model="form.backgroundGradientTo" /></div></el-form-item>
            <el-form-item label="背景图片">
              <div class="field-row">
                <el-input v-model="form.backgroundImageUrl" placeholder="可从素材库选择" />
                <el-button @click="openMaterialPicker('backgroundImageUrl', 'image')">应用素材库</el-button>
              </div>
            </el-form-item>
            <el-form-item label="背景视频">
              <div class="field-row">
                <el-input v-model="form.backgroundVideoUrl" placeholder="可从素材库选择 MP4" />
                <el-button @click="openMaterialPicker('backgroundVideoUrl', 'video')">应用素材库</el-button>
              </div>
            </el-form-item>
            <el-form-item label="动态密度"><el-slider v-model="form.backgroundDynamicDensity" :min="10" :max="100" /></el-form-item>
            <el-form-item label="变化速度"><el-slider v-model="form.backgroundDynamicSpeed" :min="6" :max="40" /></el-form-item>
            <el-form-item label="底部过滤"><el-switch v-model="form.backgroundBottomFilter" active-text="开启" inactive-text="关闭" /></el-form-item>
            <el-form-item label="应用位置">
              <el-radio-group v-model="form.backgroundApplyTo">
                <el-radio-button label="header">仅头部</el-radio-button>
                <el-radio-button label="body">头部和正文</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </section>
        </el-form>
      </div>

      <div class="data-panel theme-preview-panel">
        <div class="preview-head">
          <div>
            <div class="panel-title">实时预览</div>
            <p class="page-subtitle">切换页面查看当前主题是否命中，以及背景、卡片、按钮的实际效果。</p>
          </div>
          <el-radio-group v-model="previewPageKey" size="small">
            <el-radio-button v-for="page in previewPageOptions" :key="page.value" :label="page.value">{{ page.label }}</el-radio-button>
          </el-radio-group>
        </div>

        <div class="preview-stage" :class="{ 'is-dynamic-bg': form.backgroundMode === 'dynamic-gradient' }" :style="previewStageStyle">
          <video
            v-if="form.backgroundMode === 'video' && form.backgroundVideoUrl"
            class="preview-video"
            :src="form.backgroundVideoUrl"
            autoplay
            muted
            loop
          />
          <div class="preview-phone">
            <div class="preview-phone__status">
              <span>9:41</span>
              <span>{{ previewApplied ? "已应用" : "未应用" }}</span>
            </div>
            <div class="preview-phone__screen">
              <div class="preview-nav">{{ previewPageLabel }}</div>
              <div class="preview-body">
                <section class="preview-hero" :style="previewHeroStyle">
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
  backgroundDynamicDensity: 40,
  backgroundDynamicSpeed: 18,
  backgroundBottomFilter: true,
  backgroundApplyTo: "body",
  themeApplyMode: "all",
  themeApplyPageKeys: []
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
const previewStageStyle = computed(() => ({
  "--theme-primary": form.primaryColor,
  "--theme-secondary": form.secondaryColor,
  "--theme-accent": form.accentColor,
  "--theme-bg": form.backgroundColor,
  "--theme-card": form.cardBackground,
  "--theme-radius": `${form.radius}px`,
  "--theme-title": `${form.titleFontSize}px`,
  "--theme-shadow": shadowValue(form.shadow),
  background: previewApplied.value ? previewBackground.value : "#f5f7fb",
  animationDuration: `${Math.max(6, Number(form.backgroundDynamicSpeed) || 18)}s`,
  backgroundSize: `${dynamicSize.value}% ${dynamicSize.value}%`
}));
const previewHeroStyle = computed(() => {
  if (!previewApplied.value) return {};
  if (form.backgroundApplyTo === "header") {
    return {
      background: previewBackground.value,
      backgroundSize: `${dynamicSize.value}% ${dynamicSize.value}%`
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
    return dynamicGradient(form);
  }
  if (form.backgroundMode === "gradient") {
    return `linear-gradient(135deg, ${form.backgroundGradientFrom}, ${form.backgroundGradientTo})`;
  }
  return form.backgroundColor;
});
const dynamicSize = computed(() => Math.max(150, 440 - (Number(form.backgroundDynamicDensity) || 40) * 2.4));
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
        ? asset.fileType.startsWith("video/") || /\.(mp4|mov|m4v)(\?|$)/i.test(asset.url)
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

function dynamicGradient(config: ThemeConfig): string {
  const from = config.backgroundGradientFrom || config.backgroundColor;
  const to = config.backgroundGradientTo || config.secondaryColor;
  const density = Math.max(10, Math.min(100, Number(config.backgroundDynamicDensity) || 40));
  const scale = Math.max(22, Math.round(density / 1.7));
  const overlay = config.backgroundBottomFilter === false ? "" : "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(245,247,246,0.68)), ";
  return `${overlay}radial-gradient(circle at 12% 18%, ${hexAlpha(config.primaryColor, 0.42)} 0, transparent ${scale}%), radial-gradient(circle at 86% 18%, ${hexAlpha(config.secondaryColor, 0.38)} 0, transparent ${scale + 12}%), radial-gradient(circle at 48% 76%, ${hexAlpha(config.accentColor, 0.34)} 0, transparent ${scale + 18}%), radial-gradient(circle at 68% 42%, ${hexAlpha(config.primaryColor, 0.2)} 0, transparent ${scale + 8}%), linear-gradient(135deg, ${from} 0%, ${to} 62%, ${hexAlpha(config.accentColor, 0.2)} 140%)`;
}

function hexAlpha(value: string | undefined, alpha: number): string {
  const color = String(value || "#315d7d").trim();
  if (/^rgba?\(/i.test(color)) return color;
  if (!/^#[0-9a-f]{6}$/i.test(color)) return `rgba(49, 93, 125, ${alpha})`;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

.form-section {
  padding: 18px;
  border: 1px solid var(--admin-color-border);
  border-radius: 14px;
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
  background: var(--theme-bg);
}

.preview-stage.is-dynamic-bg {
  animation: themePreviewMove 18s ease-in-out infinite alternate;
}

.preview-stage.is-dynamic-bg::before {
  content: "";
  position: absolute;
  inset: -18%;
  z-index: 0;
  background:
    radial-gradient(circle at 20% 30%, color-mix(in srgb, var(--theme-primary) 42%, transparent), transparent 18%),
    radial-gradient(circle at 80% 20%, color-mix(in srgb, var(--theme-secondary) 34%, transparent), transparent 22%),
    radial-gradient(circle at 55% 82%, color-mix(in srgb, var(--theme-accent) 30%, transparent), transparent 24%);
  filter: blur(10px);
  animation: themePreviewFloat 9s ease-in-out infinite alternate;
}

.preview-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  background: #f5f7fb;
}

.preview-hero,
.preview-card {
  border-radius: 22px;
}

.preview-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  background: linear-gradient(135deg, var(--theme-primary), var(--theme-secondary));
  color: #ffffff;
  box-shadow: var(--theme-shadow);
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

@keyframes themePreviewMove {
  from {
    background-position: 0% 0%;
  }
  to {
    background-position: 100% 70%;
  }
}

@keyframes themePreviewFloat {
  from {
    transform: translate3d(-3%, -2%, 0) scale(1);
  }
  to {
    transform: translate3d(4%, 3%, 0) scale(1.08);
  }
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
