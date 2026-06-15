<template>
  <section class="admin-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">主题配置</h1>
        <p class="page-subtitle">发布后小程序页面会读取主题色、圆角、按钮和卡片样式。</p>
      </div>
      <div class="inline-actions">
        <el-button @click="resetDefault">恢复默认</el-button>
        <el-button type="primary" :loading="saving" @click="save">发布主题</el-button>
      </div>
    </div>

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
          </el-select>
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
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { getTheme, updateTheme } from "../../services/admin";
import type { ThemeConfig } from "../../services/types";

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
  bannerStyle: "clean"
};

const form = reactive<ThemeConfig>({ ...DEFAULT_THEME });
const saving = ref(false);

const previewStyle = computed(() => ({
  "--theme-primary": form.primaryColor,
  "--theme-secondary": form.secondaryColor,
  "--theme-accent": form.accentColor,
  "--theme-bg": form.backgroundColor,
  "--theme-card": form.cardBackground,
  "--theme-radius": `${form.radius}px`,
  "--theme-title": `${form.titleFontSize}px`,
  "--theme-shadow": form.shadow === "none" ? "none" : form.shadow === "strong" ? "0 16px 36px rgba(15, 23, 42, 0.18)" : "0 8px 20px rgba(15, 23, 42, 0.08)"
}));

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
</style>
