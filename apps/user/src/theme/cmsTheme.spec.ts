import assert from "node:assert/strict";
import test from "node:test";
import { createCmsThemeVars, resolveCmsTheme } from "./cmsTheme";
import type { ThemeConfig } from "../services/cms";

test("Guanchao theme uses flat gold controls and readable neutral surfaces", () => {
  const theme = resolveCmsTheme({ visualPreset: "guanchao-premium" } as ThemeConfig);
  assert.equal(theme.colors.primary, "#987627");
  assert.equal(theme.gradients.cta, theme.colors.primary);
  assert.equal(theme.gradients.card, "#FFFFFF");
  assert.equal(theme.colors.textPrimary, "#20252C");
  assert.equal(theme.radius.lg, 8);
  assert.equal(theme.shadow.md, "none");
});
test("explicit brand colors remain configurable without reintroducing a two-tone CTA", () => {
  const theme = createCmsThemeVars({ visualPreset: "guanchao-premium", primaryColor: "#a3842b", secondaryColor: "#00ff00" } as ThemeConfig);
  assert.equal(theme["--cms-primary"], "#a3842b");
  assert.equal(theme["--cms-gradient-cta"], "#a3842b");
});
test("other configured presets keep their existing treatment", () => {
  const theme = resolveCmsTheme({ visualPreset: "summit-red", primaryColor: "#B4232A" } as ThemeConfig);
  assert.equal(theme.colors.primary, "#B4232A");
  assert.match(theme.gradients.cta, /linear-gradient/);
});
