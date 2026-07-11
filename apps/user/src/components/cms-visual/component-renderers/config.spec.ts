import assert from "node:assert/strict";
import test from "node:test";
import type { CmsComponent } from "@/services/cms";
import { booleanConfig, normalizeStats, stringListConfig } from "./config";

function component(config: Record<string, unknown>): CmsComponent {
  return { id: "test", type: "stats-grid", enabled: true, sortOrder: 0, config };
}

test("current-user stats use runtime context values", () => {
  const rows = normalizeStats(component({ dataSource: "current-user" }), {
    registrationCount: 6,
    orderCount: 3,
    pendingConferenceCount: 2,
    couponCount: 4
  });
  assert.deepEqual(rows.map((item) => [item.value, item.label]), [
    ["6", "我的报名"],
    ["3", "我的订单"],
    ["2", "待参会"],
    ["4", "优惠券"]
  ]);
});

test("static stats support operator-friendly value and label lines", () => {
  const rows = normalizeStats(component({ items: ["1500+｜头部创始人", "20+|覆盖城市业态"] }));
  assert.deepEqual(rows.map((item) => [item.value, item.label]), [
    ["1500+", "头部创始人"],
    ["20+", "覆盖城市业态"]
  ]);
});

test("form values normalize booleans and newline lists", () => {
  const target = component({ visible: "false", categories: "全部\n办公用品\n伴手礼" });
  assert.equal(booleanConfig(target, "visible", true), false);
  assert.deepEqual(stringListConfig(target, "categories"), ["全部", "办公用品", "伴手礼"]);
});
