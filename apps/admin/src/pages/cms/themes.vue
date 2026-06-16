<template>
  <section class="admin-page">
    <AdminPageHeader title="主题配置" eyebrow="页面装修" subtitle="发布后小程序页面会读取主题色、圆角、按钮和卡片样式。">
      <template #actions>
        <el-button @click="resetDefault">恢复默认</el-button>
        <el-button type="primary" :loading="saving" @click="save">发布主题</el-button>
      </template>
    </AdminPageHeader>

    <section class="data-panel theme-grid">
      <el-form :model="form" label-width="120px">
        <el-form-item label="主色"><el-color-picker v-model="form.primaryColor" /><el-input v-model="form.primaryColor" /></el-form-item>
        <el-form-item label="辅助色"><el-color-picker v-model="form.secondaryColor" /><el-input v-model="form.secondaryColor" /></el-form-item>
        <el-form-item label="强调色"><el-color-picker v-model="form.accentColor" /><el-input v-model="form.accentColor" /></el-form-item>
        <el-form-item label="背景色"><el-color-picker v-model="form.backgroundColor" /><el-input v-model="form.backgroundColor" /></el-form-item>
        <el-form-item label="卡片背景"><el-color-picker v-model="form.cardBackground" /><el-input v-model="form.cardBackground" /></el-form-item>
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
        <el-divider content-position="left">后台品牌与浏览器</el-divider>
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
        <el-divider content-position="left">页面背景</el-divider>
        <el-form-item label="背景模式">
          <el-select v-model="form.backgroundMode">
            <el-option label="纯色" value="solid" />
            <el-option label="渐变" value="gradient" />
            <el-option label="动态渐变" value="dynamic-gradient" />
            <el-option label="背景图片" value="image" />
            <el-option label="视频背景" value="video" />
          </el-select>
        </el-form-item>
        <el-form-item label="渐变起点"><el-color-picker v-model="form.backgroundGradientFrom" /><el-input v-model="form.backgroundGradientFrom" /></el-form-item>
        <el-form-item label="渐变终点"><el-color-picker v-model="form.backgroundGradientTo" /><el-input v-model="form.backgroundGradientTo" /></el-form-item>
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
      </el-form>

      <div class="theme-preview" :style="previewStyle">
        <div class="preview-hero">
          <span>会议报名</span>
          <strong>主题预览</strong>
          <p>这里展示发布到小程序后的主色、背景、卡片和按钮风格。</p>
        </div>
        <div class="preview-card">
          <strong>会议卡片</strong>
          <p>后台发布主题后，小程序刷新即可应用。</p>
          <button>立即报名</button>
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
import { getTheme, listMaterials, updateTheme } from "../../services/admin";
import type { MaterialAsset, ThemeConfig } from "../../services/types";

const DEFAULT_THEME: ThemeConfig = {
  primaryColor: "#2452a8",
  secondaryColor: "#14b8a6",
  accentColor: "#f59e0b",
  backgroundColor: "#f5f7fb",
  cardBackground: "#ffffff",
  radius: 8,
  buttonStyle: "solid",
  shadow: "soft",
  titleFontSize: 42,
  bannerStyle: "clean",
  adminBrandTitle: "会议运营后台",
  adminBrandSubtitle: "会议业务运营中心",
  adminBrandLogoUrl: "",
  browserTitle: "会议后台",
  browserIconUrl: "",
  backgroundMode: "solid",
  backgroundGradientFrom: "#f5f7fb",
  backgroundGradientTo: "#eef7f5",
  backgroundImageUrl: "",
  backgroundVideoUrl: "",
  backgroundDynamicDensity: 40,
  backgroundDynamicSpeed: 18,
  backgroundBottomFilter: true,
  backgroundApplyTo: "body"
};

const form = reactive<ThemeConfig>({ ...DEFAULT_THEME });
const saving = ref(false);
const materialVisible = ref(false);
const materialLoading = ref(false);
const materialKeyword = ref("");
const materialAssets = ref<MaterialAsset[]>([]);
const materialTarget = ref<{ key: keyof ThemeConfig; kind: "image" | "video" } | null>(null);

const previewStyle = computed(() => ({
  "--theme-primary": form.primaryColor,
  "--theme-secondary": form.secondaryColor,
  "--theme-accent": form.accentColor,
  "--theme-bg": form.backgroundColor,
  "--theme-card": form.cardBackground,
  "--theme-radius": `${form.radius}px`,
  "--theme-title": `${form.titleFontSize}px`,
  "--theme-shadow": form.shadow === "none" ? "none" : form.shadow === "strong" ? "0 16px 36px rgba(15, 23, 42, 0.18)" : "0 8px 20px rgba(15, 23, 42, 0.08)",
  background: previewBackground.value
}));

const previewBackground = computed(() => {
  if (form.backgroundMode === "image" && form.backgroundImageUrl) return `linear-gradient(180deg, rgba(245,247,251,0.2), rgba(245,247,251,0.88)), url("${form.backgroundImageUrl}") center / cover`;
  if (form.backgroundMode === "dynamic-gradient") return `linear-gradient(135deg, ${form.backgroundGradientFrom}, ${form.backgroundGradientTo})`;
  if (form.backgroundMode === "gradient") return `linear-gradient(180deg, ${form.backgroundGradientFrom}, ${form.backgroundGradientTo})`;
  return form.backgroundColor;
});

onMounted(async () => {
  const active = await getTheme();
  Object.assign(form, active.config);
});

function resetDefault() {
  Object.assign(form, DEFAULT_THEME);
}

async function save() {
  saving.value = true;
  try {
    const active = await updateTheme({ config: { ...form } });
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
</script>

<style scoped>
.theme-grid {
  display: grid;
  grid-template-columns: minmax(360px, 0.8fr) minmax(320px, 1fr);
  gap: 24px;
}

.theme-preview {
  min-height: 520px;
  padding: 24px;
  border-radius: 24px;
  background: var(--theme-bg);
}

.preview-hero {
  padding: 24px;
  border-radius: var(--theme-radius);
  background: linear-gradient(135deg, var(--theme-primary), var(--theme-secondary));
  color: #ffffff;
  box-shadow: var(--theme-shadow);
}

.preview-hero span,
.preview-hero strong {
  display: block;
}

.preview-hero strong {
  margin-top: 8px;
  font-size: var(--theme-title);
  line-height: 1.15;
}

.preview-card {
  margin-top: 18px;
  padding: 20px;
  border-radius: var(--theme-radius);
  background: var(--theme-card);
  box-shadow: var(--theme-shadow);
}

.preview-card button {
  min-height: 38px;
  padding: 0 18px;
  border: 0;
  border-radius: var(--theme-radius);
  background: var(--theme-primary);
  color: #ffffff;
  font-weight: 700;
}

.field-row {
  display: flex;
  gap: 8px;
  width: 100%;
}

.material-picker__head {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
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
</style>
