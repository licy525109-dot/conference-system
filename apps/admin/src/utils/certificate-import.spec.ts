import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultCertificateConfig } from "@conference/shared";
import { defaultCertificateMapping, mapCertificateRows, readCertificateSheet } from "./certificate-import";
test("certificate sheet supports quoted CSV, same names, and custom fields", () => {
  const c = defaultCertificateConfig(); c.customFields = [{ key: "level", label: "等级" }];
  const sheet = readCertificateSheet('姓名,单位,证书编号,发证资格,等级\n同名,"单位,甲",001,是,A\n同名,单位乙,002,否,B');
  const mapped = mapCertificateRows(sheet, defaultCertificateMapping(sheet[0], c), c, "default");
  assert.equal(mapped.length, 2); assert.equal(mapped[0].organization, "单位,甲"); assert.equal(mapped[0].certificateNo, "001"); assert.equal(mapped[0].eligible, true); assert.equal(mapped[1].eligible, false); assert.equal(mapped[0].custom.level, "A");
});
test("certificate import requires mapping and explicit eligibility values", () => {
  const c = defaultCertificateConfig(); const sheet = readCertificateSheet('姓名,发证资格\n测试,错误值');
  assert.throws(() => mapCertificateRows(sheet, {}, c, "default"));
  assert.throws(() => mapCertificateRows(sheet, defaultCertificateMapping(sheet[0], c), c, "default"));
});
