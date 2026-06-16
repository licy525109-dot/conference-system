import { computed, ref } from "vue";
import { DEFAULT_THEME, getAppTheme, type ThemeConfig } from "@/services/cms";
import { createCmsBackgroundStyle, createCmsThemeVars } from "@/theme/cmsTheme";

export function useCmsPageTheme(pageKey: string) {
  const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });

  const pageStyle = computed(() => ({
    ...createCmsThemeVars(theme.value),
    ...createCmsBackgroundStyle(theme.value, "body")
  }));

  const showBodyVideo = computed(
    () => theme.value.backgroundMode === "video" && Boolean(theme.value.backgroundVideoUrl) && theme.value.backgroundApplyTo !== "header"
  );
  const showBodyDynamicBackground = computed(
    () => theme.value.backgroundMode === "dynamic-gradient" && theme.value.backgroundApplyTo !== "header"
  );

  async function refreshTheme() {
    theme.value = await getAppTheme(pageKey);
  }

  return {
    theme,
    pageStyle,
    showBodyVideo,
    showBodyDynamicBackground,
    refreshTheme
  };
}
