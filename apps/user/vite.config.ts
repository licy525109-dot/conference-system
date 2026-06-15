import { defineConfig, loadEnv, type Plugin } from "vite";
import uniPlugin from "@dcloudio/vite-plugin-uni";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const uni = "default" in uniPlugin ? uniPlugin.default : uniPlugin;
const configDir = dirname(fileURLToPath(import.meta.url));
const miniProgramDistDir = resolve(configDir, "dist/build/mp-weixin");
const productionApiBaseUrl = "https://guanchaohuiji.com/api";
const forbiddenProductionBuildPatterns = [/localhost/i, /127\.0\.0\.1/, /192\.168/, /:3000/, /vConsole/i];
const textFileExtensions = new Set([".js", ".json", ".wxml", ".wxss", ".map", ".txt"]);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, configDir, "VITE_");
  const enableVConsole = env.VITE_ENABLE_VCONSOLE === "true" || process.env.VITE_ENABLE_VCONSOLE === "true";

  return {
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
