import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const maxPackageBytes = 2 * 1024 * 1024;
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(appRoot, "dist/build/mp-weixin");
const appJson = JSON.parse(readFileSync(resolve(outputRoot, "app.json"), "utf8"));
const subPackageRoots = (Array.isArray(appJson.subPackages) ? appJson.subPackages : [])
  .flatMap((item) => typeof item?.root === "string" && item.root.trim()
    ? [item.root.replace(/^\/+|\/+$/g, "")]
    : [])
  .sort((left, right) => right.length - left.length);
const packageSizes = new Map([["main", 0]]);

for (const root of subPackageRoots) {
  packageSizes.set(root, 0);
}

for (const filePath of listFiles(outputRoot)) {
  const relativePath = relative(outputRoot, filePath).split("\\").join("/");
  const owner = subPackageRoots.find((root) => relativePath.startsWith(`${root}/`)) ?? "main";
  packageSizes.set(owner, (packageSizes.get(owner) ?? 0) + statSync(filePath).size);
}

const report = [...packageSizes.entries()]
  .map(([name, bytes]) => `${name} ${(bytes / 1024).toFixed(2)} KiB`)
  .join(", ");
console.info(`[mp-weixin] final package sizes: ${report}`);

const oversized = [...packageSizes.entries()].find(([, bytes]) => bytes > maxPackageBytes);
if (oversized) {
  const [name, bytes] = oversized;
  throw new Error(`mp-weixin package ${name} is ${(bytes / 1024).toFixed(2)} KiB, exceeding the 2048 KiB limit`);
}

function listFiles(dirPath) {
  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = resolve(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}
