import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import test from "node:test";
import { checkInvitationProxy } from "../../scripts/smoke/check-invitation-proxy.mjs";

const nginx = process.env.NGINX_BIN || "nginx";
// Baota's Nginx also loads Lua; CI uses the distribution's standard Nginx.
const moduleConfig = process.env.NGINX_LUA_PACKAGE_PATH ? `lua_package_path ${JSON.stringify(process.env.NGINX_LUA_PACKAGE_PATH)};` : "";
const currentConfig = readFileSync(new URL("../../scripts/deploy/nginx-invitation-fonts.conf", import.meta.url), "utf8");

async function withProxy(config, run) {
  const root = mkdtempSync(join(tmpdir(), "invitation-proxy-"));
  mkdirSync(join(root, "logs"));
  const upstream = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "https://admin.guanchaohuiji.com");
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Authorization,Content-Type"
      }).end();
    } else {
      response.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ statusCode: 401 }));
    }
  });
  let proxy;
  let stopped;
  let diagnostic = "";
  try {
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    const portProbe = createServer();
    portProbe.listen(0, "127.0.0.1");
    await once(portProbe, "listening");
    const proxyPort = portProbe.address().port;
    await new Promise(resolve => portProbe.close(resolve));
    const target = `http://127.0.0.1:${upstream.address().port}`;
    const file = join(root, "nginx.conf");
    writeFileSync(file, `daemon off;\npid ${root}/nginx.pid;\nerror_log ${root}/error.log;\nevents {}\nhttp {\n${moduleConfig}\naccess_log off;\nserver {\nlisten 127.0.0.1:${proxyPort};\nlocation /api/ { proxy_pass ${target}; }\n${config.replaceAll("http://127.0.0.1:3001", target)}\n}\n}\n`);
    const syntax = spawnSync(nginx, ["-p", root, "-c", file, "-t"], { encoding: "utf8" });
    assert.equal(syntax.status, 0, syntax.error?.message || syntax.stderr);
    proxy = spawn(nginx, ["-p", root, "-c", file], { stdio: ["ignore", "ignore", "pipe"] });
    proxy.stderr.on("data", chunk => { diagnostic += chunk.toString(); });
    stopped = once(proxy, "exit");
    const apiBase = `http://127.0.0.1:${proxyPort}/api`;
    for (let attempt = 0; ; attempt++) {
      try { await fetch(`${apiBase}/health`); break; }
      catch (error) { if (attempt >= 40) throw error; await setTimeout(50); }
    }
    await run(apiBase);
  } catch (error) {
    const log = join(root, "error.log");
    throw new Error(`${error.message}\n${diagnostic}\n${existsSync(log) ? readFileSync(log, "utf8") : ""}`, { cause: error });
  } finally {
    if (proxy && proxy.exitCode === null) { proxy.kill("SIGTERM"); await stopped; }
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
}

test("invitation collection GET/POST and font preflights pass through real Nginx", async () => {
  await withProxy(currentConfig, async apiBase => {
    const results = await checkInvitationProxy({ apiBase });
    assert.deepEqual(results.map(r => r.status), [204, 204, 204, 401]);
  });
});

test("deployment smoke rejects the previous trailing-slash redirect", async () => {
  const legacyConfig = currentConfig.slice(currentConfig.indexOf("location ^~"));
  await withProxy(legacyConfig, async apiBase => {
    await assert.rejects(checkInvitationProxy({ apiBase }), /expected HTTP 204 without redirect, got 301/);
  });
});
