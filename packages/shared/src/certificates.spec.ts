import assert from "node:assert/strict";
import { test } from "node:test";
import { certificateEligible, certificatePreviewPerson, defaultCertificateConfig, normalizeCertificateLookup, validateCertificateConfig } from "./certificates";

test("certificate preview uses the complete real number or the configured numbering format", () => {
  const c = defaultCertificateConfig(); c.numberPrefix = "XZJYDH-";
  assert.equal(certificatePreviewPerson(c).certificateNo, "XZJYDH-000000000001");
  const actual = { name: "测试人员", organization: "", role: "", certificateNo: "XZJYDH-205F5D3ED5B8", custom: {} };
  assert.equal(certificatePreviewPerson(c, actual), actual);
  assert.equal(certificatePreviewPerson(c, actual).certificateNo, actual.certificateNo);
});

test("certificate validation names the exact setting, template and text field", () => {
  const c = defaultCertificateConfig();
  assert.throws(() => validateCertificateConfig({ ...c, numberPrefix: "" }), /基本信息 → 自动编号前缀：文字须为1 至 32 字符/);
  assert.throws(() => validateCertificateConfig({ ...c, numberPrefix: "X".repeat(33) }), /自动编号前缀/);
  c.templates[0].fields[2].label = "编号"; c.templates[0].fields[2].text = "X".repeat(1001);
  assert.throws(() => validateCertificateConfig(c), /证书模板「参会证明」：文字「编号」：字段前缀：文字须为不超过 1000 字符/);
  c.templates[0].fields[2].text = ""; c.templates[0].fields[0].text = "\u0001";
  assert.throws(() => validateCertificateConfig(c), /文字「title」：固定文字/);
  c.templates[0].fields[0].text = "参会证明"; c.queryFields[0].label = "";
  assert.throws(() => validateCertificateConfig(c), /查询条件第 1 项：显示名称/);
});

test("certificate config preserves zero coordinates, false switches, and multiple templates", () => {
  const c = defaultCertificateConfig(); c.templates[0].fields[0].x = 0; c.templates[0].fields[0].y = 0; c.allowRepeatDownload = false;
  c.templates.push({ ...structuredClone(c.templates[0]), id: "speaker", name: "讲师证书" });
  const parsed = validateCertificateConfig(c);
  assert.equal(parsed.templates[0].fields[0].x, 0); assert.equal(parsed.templates[0].fields[0].y, 0); assert.equal(parsed.allowRepeatDownload, false); assert.equal(parsed.templates.length, 2);
});
test("certificate config rejects ambiguous schema, unknown fields, and invalid ranges", () => {
  const c = defaultCertificateConfig();
  assert.throws(() => validateCertificateConfig({ ...c, queryFields: [] }));
  assert.throws(() => validateCertificateConfig({ ...c, queryFields: [{ key: "password", label: "x", required: true }] }));
  assert.throws(() => validateCertificateConfig({ ...c, startsAt: "2026-11-04T10:00:00", endsAt: null }));
  assert.throws(() => validateCertificateConfig({ ...c, startsAt: "2026-11-05T10:00:00+08:00", endsAt: "2026-11-04T10:00:00+08:00" }));
  const copy = structuredClone(c); copy.templates[0].fields[0].size = Number.NaN; assert.throws(() => validateCertificateConfig(copy));
});
test("certificate custom query and visual conditions use declared fields", () => {
  const c = defaultCertificateConfig(); c.customFields = [{ key: "level", label: "审核等级" }]; c.queryFields.push({ key: "custom.level", label: "等级", required: false });
  c.eligibility = { mode: "conditions", match: "all", conditions: [{ field: "custom.level", operator: "in", value: "A，B" }, { field: "organization", operator: "notEmpty", value: "" }] };
  const parsed = validateCertificateConfig(c), person = { name: "同名", organization: "单位", role: "", certificateNo: "001", custom: { level: "A" } };
  assert.equal(certificateEligible(parsed, person, false), true);
  assert.equal(certificateEligible(parsed, { ...person, custom: { level: "C" } }, true), false);
  parsed.eligibility.match = "any"; assert.equal(certificateEligible(parsed, { ...person, custom: { level: "C" } }, false), true);
});
test("approved and all qualification modes are separate from lookup normalization", () => {
  const c = defaultCertificateConfig(), p = { name: "同名", organization: "", role: "", certificateNo: "001", custom: {} };
  assert.equal(certificateEligible(c, p, false), false); c.eligibility.mode = "all"; assert.equal(certificateEligible(c, p, false), true);
  assert.equal(normalizeCertificateLookup("  Jane\t Doe  "), "Jane Doe"); assert.equal(normalizeCertificateLookup("e\u0301"), "é");
});
test("legacy font fallback lists are preserved and executable CSS is rejected", () => {
  const c = defaultCertificateConfig(); c.templates[0].fontFamily = "KaiTi, serif";
  assert.equal(validateCertificateConfig(c).templates[0].fontFamily, "KaiTi, serif");
  c.templates[0].fontFamily = "serif; background:url(x)"; assert.throws(() => validateCertificateConfig(c));
});
