import assert from "node:assert/strict";
import test from "node:test";
import { shouldRelaunchHome } from "./startupRoute";

test("keeps registered parameterless business and CMS preview routes", () => {
  for (const route of [
    "pages/cms-preview/index",
    "pages/cart/index",
    "pages/member/center",
    "pages/mall/orders",
    "pages/invoice/index",
    "pages/refund/index"
  ]) {
    assert.equal(shouldRelaunchHome(route, {}), false, route);
  }
});

test("rejects only parameterized routes that are missing required context", () => {
  assert.equal(shouldRelaunchHome("pages/conference/detail", {}), true);
  assert.equal(shouldRelaunchHome("pages/conference/detail", { id: "conference-1" }), false);
  assert.equal(shouldRelaunchHome("pages/custom/index", {}), true);
  assert.equal(shouldRelaunchHome("pages/custom/index", { pageKey: "about" }), false);
});
