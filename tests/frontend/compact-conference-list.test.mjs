import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

const require = createRequire(new URL("../../apps/user/package.json", import.meta.url));
const ts = require("typescript");
const { parse } = require("vue/compiler-sfc");
const source = readFileSync(new URL("../../apps/user/src/components/cms-visual/CmsVisualRenderer.vue", import.meta.url), "utf8");
const { descriptor } = parse(source);
const ast = ts.createSourceFile("renderer.ts", descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true);
const names = ["stringConfig", "numberConfig", "booleanConfig", "conferenceListMeta", "registrationCountFor", "conferenceTextStyle", "conferenceListTextStyle"];
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(ast)).join("\n");
const compiled = ts.transpileModule(`${functions}\nexport { conferenceListMeta, conferenceListTextStyle };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const exports = {};
runInNewContext(compiled, { exports, formatDateTime: () => "2026-10-20 09:00", fontFamilyValue: () => "sans-serif" });
const component = config => ({ id: "list", type: "conference-list", config });
const meeting = { startsAt: "2026-10-20T01:00:00Z", location: "Test venue", registrationCount: 7 };
const plain = value => JSON.parse(JSON.stringify(value));

test("compact metadata keeps the full date and venue without exposing counts by default", () => {
  assert.deepEqual(plain(exports.conferenceListMeta(meeting, component({}), 0)), [
    { icon: "calendar", text: "2026-10-20" }, { icon: "location", text: "Test venue" }
  ]);
});

test("metadata honors hidden fields and does not render a missing venue", () => {
  assert.deepEqual(plain(exports.conferenceListMeta(meeting, component({ showTime: false, showLocation: false }), 0)), []);
  assert.deepEqual(plain(exports.conferenceListMeta({ ...meeting, location: "" }, component({ showTime: false }), 0)), []);
});

test("explicit count visibility retains the existing count modes", () => {
  const value = exports.conferenceListMeta(meeting, component({ showTime: false, showLocation: false, showRegistrationCount: true, registrationCountMode: "actual-plus-virtual", virtualRegistrationBase: 3, virtualRegistrationStep: 2 }), 1);
  assert.equal(value.length, 1);
  assert.ok(value[0].text.startsWith("12 "));
});

test("compact text stays readable while preserving configured colors and larger fonts", () => {
  assert.equal(exports.conferenceListTextStyle(component({}), "title").fontSize, "17px");
  assert.equal(exports.conferenceListTextStyle(component({}), "meta").fontSize, "14px");
  const style = exports.conferenceListTextStyle(component({ cardTitleFontSize: 40, cardTitleColor: "#987627" }), "title");
  assert.equal(style.fontSize, "20px");
  assert.equal(style.color, "#987627");
});

test("each compact row is one accessible action and uses an uncropped thumbnail", () => {
  const list = descriptor.template.content.split('component.type === \'conference-list\'')[1].split("<CmsConferenceScheduleRenderer")[0];
  assert.equal((list.match(/<button\b/g) || []).length, 1);
  assert.match(list, /role="button"/);
  assert.match(list, /tabindex="0"/);
  assert.match(list, /@click.stop="handleConferenceAction\(item, component\)"/);
  assert.match(list, /mode="aspectFit"/);
  assert.match(list, /'showSummary', false/);
  assert.doesNotMatch(list, /conference-entry__action/);
});

test("compact metadata uses a named icon wrapper and keeps keyboard-only CSS on H5", () => {
  assert.match(descriptor.template.content, /class="conference-entry__meta-icon"><wd-icon/);
  const inlineStyles = descriptor.styles.filter(style => !style.src).map(style => style.content).join("\n");
  assert.match(inlineStyles, /\.conference-entry__meta-icon\s*\{[^}]*flex: 0 0 15px/);
  assert.doesNotMatch(inlineStyles, />\s*:first-child/);
  assert.match(inlineStyles, /\/\* #ifdef H5 \*\/[\s\S]*?\.conference-entry:focus-visible[\s\S]*?\/\* #endif \*\//);
});
