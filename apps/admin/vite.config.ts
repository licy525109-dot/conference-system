import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, "../..");
const productionApiBaseUrl = "https://guanchaohuiji.com/api";

export default defineConfig(({ mode }) => {
  const envDir = mode === "production" ? configDir : repoRoot;
  const env = loadEnv(mode, envDir, "VITE_");

  if (mode === "production") {
    assertProductionApiBaseUrl("admin", env.VITE_API_BASE_URL);
  }

  return {
    envDir,
    resolve: {
      alias: {
        "@conference/business-modules": resolve(repoRoot, "business-modules/src/index.ts"),
        "@conference/design-system": resolve(repoRoot, "design-system/index.ts"),
        "@conference/dsl-runtime": resolve(repoRoot, "runtime/src/index.ts"),
        "@conference/module-compiler": resolve(repoRoot, "module-compiler/src/index.ts"),
        "@conference/render-governor": resolve(repoRoot, "render-governor/src/index.ts"),
        "@conference/shared": resolve(repoRoot, "packages/shared/src/index.ts")
      }
    },
    plugins: [vue()],
    server: {
      port: 5174
    }
  };
});

function assertProductionApiBaseUrl(appName: string, value: string | undefined): void {
  const apiBaseUrl = value?.trim();
  if (!apiBaseUrl) {
    throw new Error(`${appName} production build requires VITE_API_BASE_URL=${productionApiBaseUrl}`);
  }

  if (apiBaseUrl !== productionApiBaseUrl) {
    throw new Error(`${appName} production build must use ${productionApiBaseUrl}, got ${apiBaseUrl}`);
  }

  if (isLocalOrPrivateUrl(apiBaseUrl)) {
    throw new Error(`${appName} production build must not use a local or private API URL: ${apiBaseUrl}`);
  }
}

function isLocalOrPrivateUrl(value: string): boolean {
  return /(^|\/\/)(localhost|127\.0\.0\.1|\[?::1\]?)(?::|\/|$)/i.test(value)
    || /(^|\/\/)10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::|\/|$)/.test(value)
    || /(^|\/\/)172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}(?::|\/|$)/.test(value)
    || /(^|\/\/)192\.168\.\d{1,3}\.\d{1,3}(?::|\/|$)/.test(value);
}
