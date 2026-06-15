#!/usr/bin/env node

/*
 * Example only. Do not commit a real appid private key or private key file.
 * Install miniprogram-ci in a safe local/CI context before running this script.
 */

const fs = require("node:fs");
const path = require("node:path");

function requireEnv(name, fallback = "") {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function loadMiniprogramCi() {
  try {
    return require("miniprogram-ci");
  } catch (error) {
    throw new Error("miniprogram-ci is not installed. Install it in CI or a local safe directory before running this template.");
  }
}

async function main() {
  const ci = loadMiniprogramCi();
  const appid = requireEnv("MP_APPID");
  const privateKeyPath = requireEnv("MP_PRIVATE_KEY_PATH");
  const projectPath = path.resolve(requireEnv("MP_PROJECT_PATH", "apps/user/dist/build/mp-weixin"));
  const version = requireEnv("MP_VERSION", `0.0.0-${new Date().toISOString().slice(0, 10)}`);
  const desc = requireEnv("MP_DESC", "conference-system preview build");
  const mode = (process.env.MP_CI_MODE || "preview").toLowerCase();

  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(`MP_PRIVATE_KEY_PATH does not exist: ${privateKeyPath}`);
  }
  if (!fs.existsSync(projectPath)) {
    throw new Error(`MP_PROJECT_PATH does not exist: ${projectPath}. Build mp-weixin first.`);
  }

  const project = new ci.Project({
    appid,
    type: "miniProgram",
    projectPath,
    privateKeyPath,
    ignores: ["node_modules/**/*"]
  });

  if (mode === "upload") {
    if (process.env.MP_CONFIRM_UPLOAD !== "YES") {
      throw new Error("Upload mode requires MP_CONFIRM_UPLOAD=YES. Prefer preview for first runs.");
    }
    await ci.upload({
      project,
      version,
      desc,
      setting: {
        es6: true,
        minify: true
      }
    });
    console.log(`Mini Program upload completed: ${version}`);
    return;
  }

  if (mode !== "preview") {
    throw new Error(`Unsupported MP_CI_MODE: ${mode}. Use preview or upload.`);
  }

  await ci.preview({
    project,
    version,
    desc,
    setting: {
      es6: true,
      minify: true
    },
    qrcodeFormat: process.env.MP_QRCODE_FORMAT || "terminal",
    qrcodeOutputDest: process.env.MP_QRCODE_OUTPUT || undefined
  });
  console.log(`Mini Program preview completed: ${version}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
