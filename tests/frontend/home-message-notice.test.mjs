import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

const require = createRequire(new URL("../../apps/user/package.json", import.meta.url));
const vue = require("vue");
const ts = require("typescript");
const { parse, compileTemplate } = require("vue/compiler-sfc");
const file = new URL("../../apps/user/src/components/ui/HomeMessageNotice.vue", import.meta.url);
const { descriptor } = parse(readFileSync(file, "utf8"));
const compiled = ts.transpileModule(`${descriptor.scriptSetup.content}\nexport const state = { authenticated, unreadCount, visible, refresh, openMessages, dismiss };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function setup(t, initialToken, getCount, storage = new Map()) {
  let token = initialToken;
  let unmount;
  let requests = 0;
  const events = new Map();
  const navigations = [];
  const exports = {};
  runInNewContext(compiled, {
    exports, Date, defineExpose() {},
    uni: {
      $on: (name, listener) => events.set(name, listener),
      $off: (name, listener) => { assert.equal(events.get(name), listener); events.delete(name); },
      reLaunch: input => navigations.push(input.url),
      getStorageSync: key => storage.get(key),
      setStorageSync: (key, value) => storage.set(key, value)
    },
    require(id) {
      if (id === "vue") return { ...vue, onMounted: fn => fn(), onUnmounted: fn => { unmount = fn; } };
      if (id.endsWith("/session")) return { getToken: () => token, getStoredUser: () => ({ id: token }) };
      if (id.endsWith("/user-notifications")) return {
        getMyNotifications: async unreadOnly => {
          assert.equal(unreadOnly, true);
          requests += 1;
          const result = await getCount();
          return { unreadCount: result.count, items: result.items || Array.from({ length: result.count }, (_, id) => ({ id: String(id), readAt: null })) };
        }
      };
      throw new Error(`Unexpected dependency: ${id}`);
    }
  });
  t.after(() => unmount());
  return {
    ...exports.state, events, navigations,
    setToken: value => { token = value; events.get("auth:changed")(); },
    get requests() { return requests; }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function settle() { await new Promise(resolve => setImmediate(resolve)); }

test("homepage leads with CMS content, not an injected conference overview", () => {
  const page = readFileSync(new URL("../../apps/user/src/pages/index/index.vue", import.meta.url), "utf8");
  assert.match(page, /<HomeMessageNotice ref="homeMessages"/);
  assert.ok(page.indexOf("<HomeMessageNotice") < page.indexOf("<PageRenderer"));
  assert.doesNotMatch(page, /HomeConferenceOverview|getMyAttendance|nextPublicConference/);
  assert.doesNotMatch(descriptor.scriptSetup.content, /conference|attendance|ensureLogin/);
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: file.pathname, id: "home-message" }).errors, []);
});

test("visitors do not fetch private data or get a login prompt", async t => {
  const state = setup(t, "", () => { throw new Error("Visitor must not fetch"); });
  await state.refresh();
  assert.equal(state.authenticated.value, false);
  assert.equal(state.requests, 0);
});

test("only unread messages show a dismissible homepage notice; zero unread shows nothing", async t => {
  let count = 3;
  const state = setup(t, "account-a", async () => ({ count }));
  await settle();
  assert.equal(state.authenticated.value, true);
  assert.equal(state.unreadCount.value, 3);
  assert.equal(state.visible.value, true);
  assert.match(descriptor.template.content, /v-if="authenticated && visible && unreadCount > 0"/);
  await state.refresh();
  assert.equal(state.requests, 1);
  count = 0;
  state.events.get("notifications:changed")();
  await settle();
  assert.equal(state.unreadCount.value, 0);
  assert.equal(state.visible.value, false);
  state.openMessages();
  assert.deepEqual(state.navigations, ["/pages/notifications/index"]);
});

test("late responses cannot leak a previous account's unread badge after switching or logout", async t => {
  const old = deferred();
  let calls = 0;
  const state = setup(t, "account-a", () => ++calls === 1 ? old.promise : Promise.resolve({ count: 2 }));
  state.setToken("account-b");
  await settle();
  old.resolve({ count: 9 });
  await settle();
  assert.equal(state.unreadCount.value, 2);
  state.setToken("");
  assert.equal(state.authenticated.value, false);
  assert.equal(state.unreadCount.value, 0);
  assert.equal(state.visible.value, false);
});

test("dismissed messages stay quiet after remount, while a new message shows again", async t => {
  const storage = new Map();
  let items = [{ id: "first", readAt: null }];
  const response = async () => ({ count: items.length, items });
  const first = setup(t, "user-a", response, storage);
  await settle();
  first.dismiss();
  assert.equal(first.visible.value, false);
  const next = setup(t, "user-a", response, storage);
  await settle();
  assert.equal(next.visible.value, false);
  items = [{ id: "second", readAt: null }, ...items];
  await next.refresh(true);
  assert.equal(next.visible.value, true);
  assert.deepEqual(Array.from(storage.keys()), ["home_notice_dismissed:user-a"]);
});

test("notice dismissal is isolated by account and is not a message read mutation", async t => {
  const state = setup(t, "user-a", async () => ({ count: 1 }));
  await settle();
  state.dismiss();
  await state.refresh(true);
  assert.equal(state.visible.value, false);
  assert.equal(state.unreadCount.value, 1);
  state.setToken("user-b");
  await settle();
  assert.equal(state.visible.value, true);
});

test("reading messages during an in-flight refresh schedules one fresh badge read", async t => {
  const old = deferred();
  let calls = 0;
  const state = setup(t, "account-a", () => ++calls === 1 ? old.promise : Promise.resolve({ count: 0 }));
  state.events.get("notifications:changed")();
  state.events.get("notifications:changed")();
  old.resolve({ count: 1 });
  await settle();
  assert.equal(state.requests, 2);
  assert.equal(state.unreadCount.value, 0);
});

test("a failed badge request does not throw or replace the public homepage", async t => {
  const state = setup(t, "account-a", () => Promise.reject(new Error("offline")));
  await settle();
  assert.equal(state.authenticated.value, true);
  assert.equal(state.unreadCount.value, 0);
  await state.refresh();
  assert.equal(state.requests, 2);
});
