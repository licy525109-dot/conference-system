import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_EXTERNAL_CHECKIN_APPEARANCE, EXTERNAL_CHECKIN_COLOR_PRESETS, checkinContrast, externalCheckinAppearanceStyle, parseExternalCheckinAppearance } from "./external-checkin-appearance";

describe("external check-in appearance contract", () => {
  it("provides backward-compatible defaults and independent settings", () => {
    const original = parseExternalCheckinAppearance({});
    assert.deepEqual(original, DEFAULT_EXTERNAL_CHECKIN_APPEARANCE);
    const changed = parseExternalCheckinAppearance({ pageTitle: "  外部会议  ", submitText: "立即签到", primaryColor: "#ABCDEF", ignoredCss: "display:none" });
    assert.equal(changed.pageTitle, "外部会议"); assert.equal(changed.primaryColor, "#abcdef");
    assert.equal(Object.hasOwn(changed, "ignoredCss"), false);
    assert.equal(original.submitText, "确认签到");
  });
  it("rejects arbitrary CSS, external asset URLs, invalid enums and excessive text", () => {
    for (const value of [null, [], ""]) assert.throws(() => parseExternalCheckinAppearance(value));
    for (const input of [
      { primaryColor: "url(https://example.com)" }, { backgroundColor: "red;display:none" }, { textColor: "#fff" },
      { logoAssetId: "https://example.com/a.png" }, { coverAssetId: "../a" }, { layout: ["card"] }, { titleAlign: "right" }, { fontSize: "huge" },
      { cornerRadius: -1 }, { cornerRadius: 1.5 }, { cornerRadius: 29 }, { submitText: " " }, { successMessage: "" },
      { pageTitle: "字".repeat(121) }, { introText: "字".repeat(1001) }
    ]) assert.throws(() => parseExternalCheckinAppearance(input));
  });
  it("prevents illegible body text and maintains button contrast across themes", () => {
    assert.throws(() => parseExternalCheckinAppearance({ textColor: "#ffffff" }), /看清/);
    assert.throws(() => parseExternalCheckinAppearance({ surfaceColor: "#223c31" }), /看清/);
    for (const preset of EXTERNAL_CHECKIN_COLOR_PRESETS) {
      const appearance = parseExternalCheckinAppearance(preset);
      assert.ok(checkinContrast(appearance.textColor, appearance.surfaceColor) >= 4.5);
    }
    for (const primaryColor of ["#ffffff", "#000000", "#777777", "#ffff00", "#205c42"]) {
      const style = externalCheckinAppearanceStyle(parseExternalCheckinAppearance({ primaryColor }));
      assert.ok(checkinContrast(style["--checkin-on-primary"], primaryColor) >= 4.5);
    }
  });
});
