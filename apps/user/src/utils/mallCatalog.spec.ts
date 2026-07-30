import assert from "node:assert/strict";
import test from "node:test";
import type { ProductCategory } from "@/services/mall";
import { resolveMallCategoryOptions } from "./mallCatalog";

const categories: ProductCategory[] = [
  { id: "gift-id", name: "伴手礼", code: "gifts", description: null, sortOrder: 2 },
  { id: "culture-id", name: "文创周边", code: "culture", description: null, sortOrder: 1 }
];

test("binds configured labels and ids to real product categories", () => {
  assert.deepEqual(resolveMallCategoryOptions(["伴手礼｜gift-id", "文创周边"], categories), [
    { id: "gift-id", name: "伴手礼", code: "gifts" },
    { id: "culture-id", name: "文创周边", code: "culture" }
  ]);
});

test("falls back to real categories instead of exposing stale placeholder labels", () => {
  assert.deepEqual(resolveMallCategoryOptions(["培训课程", "办公用品"], categories), [
    { id: "culture-id", name: "文创周边", code: "culture" },
    { id: "gift-id", name: "伴手礼", code: "gifts" }
  ]);
});
