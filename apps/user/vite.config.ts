import { defineConfig, loadEnv, type Plugin } from "vite";
import uniPlugin from "@dcloudio/vite-plugin-uni";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const uni = "default" in uniPlugin ? uniPlugin.default : uniPlugin;
const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, "../..");
const miniProgramDistDir = resolve(configDir, "dist/build/mp-weixin");
const productionApiBaseUrl = "https://guanchaohuiji.com/api";
const forbiddenProductionBuildPatterns = [/localhost/i, /127\.0\.0\.1/, /192\.168/, /:3000/, /vConsole/i];
const textFileExtensions = new Set([".js", ".json", ".wxml", ".wxss", ".map", ".txt"]);

export default defineConfig(({ mode }) => {
  const envDir = mode === "production" ? configDir : repoRoot;
  const env = loadEnv(mode, envDir, "VITE_");
  const enableVConsole = env.VITE_ENABLE_VCONSOLE === "true" || process.env.VITE_ENABLE_VCONSOLE === "true";

  if (mode === "production") {
    assertProductionApiBaseUrl("user", env.VITE_API_BASE_URL);
    assertProductionApiBaseUrl("mp-weixin", env.VITE_MP_WEIXIN_API_BASE_URL);
  }

  return {
    envDir,
    resolve: {
      alias: {
        "@conference/business-modules": resolve(repoRoot, "business-modules/src/index.ts"),
        "@conference/design-system": resolve(repoRoot, "design-system/index.ts"),
        "@conference/dsl-runtime": resolve(repoRoot, "runtime/src/index.ts"),
        "@conference/module-compiler": resolve(repoRoot, "module-compiler/src/index.ts"),
        "@conference/render-governor": resolve(repoRoot, "render-governor/src/index.ts")
      }
    },
    plugins: [uni(), configureMiniProgramProductionBuild(enableVConsole)]
  };
});

function configureMiniProgramProductionBuild(enableVConsole: boolean): Plugin {
  return {
    name: "conference-mp-production-config",
    closeBundle() {
      const appJsonPath = resolve(miniProgramDistDir, "app.json");
      if (!existsSync(appJsonPath)) {
        return;
      }

      const appJson = JSON.parse(readFileSync(appJsonPath, "utf8")) as Record<string, unknown>;
      appJson.debug = enableVConsole;
      writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
      verifyMiniProgramProductionBuild(enableVConsole);
    }
  };
}

function verifyMiniProgramProductionBuild(enableVConsole: boolean): void {
  const files = listTextFiles(miniProgramDistDir);
  const contents = files.map((filePath) => ({
    filePath,
    content: readFileSync(filePath, "utf8")
  }));

  const hasProductionApiBaseUrl = contents.some((file) => file.content.includes(productionApiBaseUrl));
  if (!hasProductionApiBaseUrl) {
    throw new Error(`mp-weixin build must include ${productionApiBaseUrl}`);
  }

  const forbiddenHit = contents.find((file) => forbiddenProductionBuildPatterns.some((pattern) => pattern.test(file.content)));
  if (forbiddenHit) {
    throw new Error(`mp-weixin production build contains a forbidden local URL in ${forbiddenHit.filePath}`);
  }

  if (!enableVConsole && readAppJsonDebug() !== false) {
    throw new Error("mp-weixin production build must not enable app.json debug by default");
  }
}

function assertProductionApiBaseUrl(appName: string, value: string | undefined): void {
  const apiBaseUrl = value?.trim();
  if (!apiBaseUrl) {
    throw new Error(`${appName} production build requires API_BASE_URL=${productionApiBaseUrl}`);
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

function readAppJsonDebug(): unknown {
  const appJsonPath = resolve(miniProgramDistDir, "app.json");
  const appJson = JSON.parse(readFileSync(appJsonPath, "utf8")) as Record<string, unknown>;
  return appJson.debug;
}

function listTextFiles(dirPath: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dirPath)) {
    const entryPath = resolve(dirPath, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      files.push(...listTextFiles(entryPath));
      continue;
    }

    const extension = entryPath.slice(entryPath.lastIndexOf("."));
    if (textFileExtensions.has(extension)) {
      files.push(entryPath);
    }
  }
  return files;
}
