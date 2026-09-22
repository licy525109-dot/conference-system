import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
const require = createRequire(new URL("../../apps/user/package.json", import.meta.url));
const vue = require("vue");
const ts = require("typescript");
const { parse } = require("vue/compiler-sfc");
const read = path => readFileSync(new URL(`../../apps/user/src/${path}`, import.meta.url), "utf8");
const claim = parse(read("pages/account/claim.vue")).descriptor;
const compiled = ts.transpileModule(`${claim.scriptSetup.content}\nexport const state = { token, claim };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function setup(query) {
  const exports = {}; let loginCalls = 0; let claimCalls = 0;
  runInNewContext(compiled, { exports,
    uni: { hideShareMenu() {}, showModal() {}, redirectTo() {} },
    require(id) {
      if (id === "vue") return vue;
      if (id === "@dcloudio/uni-app") return { onLoad: fn => fn(query) };
      if (id.endsWith("registration-profile")) return { ensureRegistrationProfile: async () => { loginCalls++; return true; } };
      if (id.endsWith("guest-profiles")) return { claimGuestIdentity: async () => { claimCalls++; } };
      if (id.endsWith("request")) return { ApiRequestError: Error };
      if (id.endsWith("navigation")) return { goHome() {} };
      throw new Error(id);
    }
  });
  return { ...exports.state, get loginCalls() { return loginCalls; }, get claimCalls() { return claimCalls; } };
}
test("member and attendance pages expose no public claim entry", () => {
  for (const path of ["pages/member/center.vue", "pages/account/attendance.vue"]) {
    const page = read(path);
    assert.doesNotMatch(page, /goClaim|pages\/account\/claim|我的参会资格|领取参会资格/);
    assert.match(page, /我的参会/);
  }
  assert.doesNotMatch(claim.template.content, /<input/);
});
test("missing or malformed invitations never trigger login or claim", async () => {
  for (const token of [undefined, "", "short", "x".repeat(44), "<script>", "x".repeat(42) + "/"]) {
    const state = setup({ token });
    await state.claim();
    assert.equal(state.token.value, "");
    assert.equal(state.loginCalls, 0);
    assert.equal(state.claimCalls, 0);
  }
});
test("a private invitation only claims after an explicit tap and profile verification", async () => {
  const state = setup({ token: "a".repeat(43) });
  assert.equal(state.loginCalls, 0);
  await state.claim();
  assert.equal(state.loginCalls, 1);
  assert.equal(state.claimCalls, 1);
});
test("profile edit button is a native grid item, not a custom component host", () => {
  const source = read("components/cms-visual/component-renderers/CmsMemberProfileRenderer.vue");
  assert.match(source, /<button class="cms-member-profile__button"/);
  assert.match(source, /grid-column: 1 \/ -1/);
  assert.doesNotMatch(source, /<wd-button|white-space: nowrap/);
});
