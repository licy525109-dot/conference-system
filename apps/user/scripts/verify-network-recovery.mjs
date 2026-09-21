import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const vue = require("vue");
const output = new URL("../dist/build/mp-weixin/", import.meta.url);

function load(relative, dependencies = {}) {
  const exports = {};
  runInNewContext(readFileSync(new URL(relative, output), "utf8"), {
    exports,
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    }
  }, { filename: fileURLToPath(new URL(relative, output)) });
  return exports;
}

const feedback = load("utils/page-load-feedback.js");

function harness(initial = "online") {
  const hooks = {};
  let state = initial;
  let listener = null;
  let count = 0;
  let deferredProbe = null;
  let deferProbe = false;
  const loading = vue.ref(false);
  const scope = vue.effectScope();
  const network = {
    readNetworkState(callback) { if (deferProbe) deferredProbe = callback; else callback(state); },
    watchNetworkState(callback) { listener = callback; return () => { listener = null; }; }
  };
  const vendor = { ...vue };
  for (const name of ["onShow", "onHide", "onUnload", "onUnmounted"]) vendor[name] = callback => { hooks[name] = callback; };
  const module = load("composables/usePageNetwork.js", {
    "../common/vendor.js": vendor,
    "../utils/page-load-feedback.js": feedback,
    "../services/network.js": network
  });
  const page = scope.run(() => module.usePageNetwork(() => { count += 1; }, loading));
  return {
    page, loading, hooks,
    get count() { return count; },
    emit(next) { state = next; listener?.(next); },
    deferNextProbe() { deferProbe = true; },
    finishProbe(next) { deferredProbe?.(next); },
    dispose() { hooks.onUnmounted(); scope.stop(); }
  };
}

async function settle() { await vue.nextTick(); await Promise.resolve(); await vue.nextTick(); }

test("compiled WeChat adapter reports flight mode and removes the exact listener", () => {
  let listener;
  const native = load("services/network.js", { "../common/vendor.js": { index: {
    getNetworkType({ success }) { success({ networkType: "none" }); },
    onNetworkStatusChange(callback) { listener = callback; },
    offNetworkStatusChange(callback) { assert.equal(callback, listener); listener = null; }
  } } });
  let state;
  native.readNetworkState(value => { state = value; });
  assert.equal(state, "offline");
  const stop = native.watchNetworkState(value => { state = value; });
  listener({ isConnected: true, networkType: "wifi" });
  assert.equal(state, "online");
  stop();
  assert.equal(listener, null);
});

test("initial offline state recovers once and ignores duplicate online events", async () => {
  const h = harness("offline");
  try {
    h.hooks.onShow();
    assert.equal(h.page.offline.value, true);
    assert.equal(h.page.feedback.value.title, "网络未连接");
    assert.equal(h.count, 0);
    h.emit("online"); h.emit("online"); await settle();
    assert.equal(h.count, 1);
  } finally { h.dispose(); }
});

test("reconnection during an existing load waits and does not start concurrent requests", async () => {
  const h = harness();
  try {
    h.hooks.onShow(); h.loading.value = true;
    h.emit("offline"); h.emit("online"); await settle();
    assert.equal(h.count, 0);
    h.loading.value = false; await settle();
    assert.equal(h.count, 1);
  } finally { h.dispose(); }
});

test("hidden and unloaded pages do not reload; returning to a failed page can recover", async () => {
  const h = harness("offline");
  try {
    h.hooks.onShow(); h.hooks.onHide(); h.emit("online"); await settle();
    assert.equal(h.count, 0);
    h.hooks.onShow(); await settle(); assert.equal(h.count, 1);
    h.emit("offline"); h.emit("online"); h.hooks.onUnload(); await settle();
    assert.equal(h.count, 1);
  } finally { h.dispose(); }
});

test("old network probes cannot overwrite a newer disconnect event", () => {
  const h = harness();
  try {
    h.deferNextProbe(); h.hooks.onShow(); h.emit("offline"); h.finishProbe("online");
    assert.equal(h.page.offline.value, true);
  } finally { h.dispose(); }
});

test("server failures do not become network retries and a transport failure can recover", async () => {
  const h = harness();
  try {
    h.hooks.onShow(); h.page.reportFailure({ statusCode: 503 }, "服务错误");
    h.emit("online"); await settle(); assert.equal(h.count, 0);
    h.page.reportFailure({ errMsg: "request:fail timeout" }, "请求超时");
    h.emit("online"); await settle(); assert.equal(h.count, 1);
  } finally { h.dispose(); }
});
