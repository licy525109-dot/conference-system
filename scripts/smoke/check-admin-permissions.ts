import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ADMIN_PERMISSIONS } from "../../services/api/src/admin/admin-permissions";

const root = resolve(process.env.PROJECT_ROOT || process.cwd());
const routerPath = join(root, "apps/admin/src/router/index.ts");
const apiSrc = join(root, "services/api/src");
const allowedGroups = new Set([
  "控制台",
  "会议管理",
  "订单交易",
  "营销活动",
  "通知中心",
  "企微客户群",
  "AI 知识库",
  "会员",
  "商城",
  "财务管理",
  "页面装修",
  "平台运营",
  "系统管理"
]);
const requiredPrefixes = [
  "dashboard",
  "conference",
  "registration",
  "checkin",
  "inventory",
  "order",
  "payment",
  "coupon",
  "promotion",
  "notification",
  "sms",
  "wecom",
  "ai-kb",
  "knowledge",
  "member",
  "mall",
  "finance",
  "refund",
  "invoice",
  "reconciliation",
  "wechat-bill",
  "page",
  "theme",
  "tabbar",
  "material",
  "platform",
  "system"
];

const permissionCodes = new Set(ADMIN_PERMISSIONS.map((item) => item.code));
const failures: string[] = [];
const routerSource = readFileSync(routerPath, "utf8");
const routePermissions = unique([...routerSource.matchAll(/permission:\s*"([^"]+)"/g)].map((match) => match[1]!));
const controllerPermissions = unique(
  controllerFiles(apiSrc).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(/RequireAdminPermissions\(([^)]*)\)/g)]
      .flatMap((match) => [...match[1]!.matchAll(/"([^"]+)"/g)].map((item) => item[1]!))
      .map((code) => ({ code, file: relative(root, file) }));
  })
);

for (const permission of routePermissions) {
  if (!permissionCodes.has(permission)) {
    failures.push(`Router permission is missing from ADMIN_PERMISSIONS: ${permission}`);
  }
}

for (const entry of controllerPermissions) {
  if (!permissionCodes.has(entry.code)) {
    failures.push(`Controller permission is missing from ADMIN_PERMISSIONS: ${entry.code} (${entry.file})`);
  }
}

for (const permission of ADMIN_PERMISSIONS) {
  if (!allowedGroups.has(permission.group)) {
    failures.push(`Permission has unsupported group "${permission.group}": ${permission.code}`);
  }
  const menuGroup = permissionMenuGroup(permission.code);
  if (menuGroup === "其他权限") {
    failures.push(`Main permission would fall into 其他权限 in role UI: ${permission.code}`);
  }
}

for (const prefix of requiredPrefixes) {
  if (!ADMIN_PERMISSIONS.some((permission) => permission.code.startsWith(`${prefix}:`))) {
    failures.push(`Required permission prefix has no source definition: ${prefix}:*`);
  }
}

if (failures.length > 0) {
  console.error("Admin permission check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Admin permission check passed.");
console.log(`- source permissions: ${ADMIN_PERMISSIONS.length}`);
console.log(`- router permissions: ${routePermissions.length}`);
console.log(`- controller permissions: ${controllerPermissions.length}`);
console.log(`- required prefixes: ${requiredPrefixes.length}`);

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) return controllerFiles(path);
    return name.endsWith(".controller.ts") ? [path] : [];
  });
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function permissionMenuGroup(code: string): string {
  const routeGroup = routeGroupByPermission(code);
  if (routeGroup) return routeGroup;
  if (code.startsWith("dashboard:")) return "控制台";
  if (
    code.startsWith("conference:") ||
    code.startsWith("registration:") ||
    code.startsWith("checkin:") ||
    code.startsWith("inventory:") ||
    code.startsWith("inventory-alert:")
  ) return "会议管理";
  if (code.startsWith("order:") || code.startsWith("payment:")) return "订单交易";
  if (code.startsWith("coupon:") || code.startsWith("promotion:")) return "营销活动";
  if (code.startsWith("notification:") || code.startsWith("sms:")) return "通知中心";
  if (code.startsWith("wecom:") || code.startsWith("customer-group:")) return "企微客户群";
  if (code.startsWith("ai-kb:") || code.startsWith("ai:") || code.startsWith("knowledge:")) return "AI 知识库";
  if (code.startsWith("member:")) return "会员";
  if (code.startsWith("mall:")) return "商城";
  if (code.startsWith("finance:") || code.startsWith("refund:") || code.startsWith("invoice:") || code.startsWith("reconciliation:") || code.startsWith("wechat-bill:")) return "财务管理";
  if (code.startsWith("page:") || code.startsWith("theme:") || code.startsWith("tabbar:") || code.startsWith("material:")) return "页面装修";
  if (code.startsWith("platform:")) return "平台运营";
  if (code.startsWith("system:")) return "系统管理";
  return "其他权限";
}

function routeGroupByPermission(code: string): string | null {
  const routeRegex = /\{\s*path:[\s\S]*?permission:\s*"([^"]+)"[\s\S]*?group:\s*"([^"]+)"/g;
  for (const match of routerSource.matchAll(routeRegex)) {
    if (match[1] === code) return match[2] ?? null;
  }
  return null;
}
