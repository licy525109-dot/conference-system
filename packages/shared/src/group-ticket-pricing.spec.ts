import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateGroupTicketPrice, parseGroupTicketPricing } from "./group-ticket-pricing";

const rules = { version: 1, minQuantity: 3, minPayableAmountCent: 0, tiers: [
  { minQuantity: 5, unitPriceCent: 280000 }, { minQuantity: 10, unitPriceCent: 250000 }
] };

describe("group ticket pricing", () => {
  it("preserves normal per-person pricing", () => {
    assert.deepEqual(calculateGroupTicketPrice(318000, 2, null), { unitPriceCent: 318000, subtotalCent: 636000 });
  });
  it("enforces minimum people, applies the highest matching tier to everyone", () => {
    assert.throws(() => calculateGroupTicketPrice(300000, 2, rules), /至少 3 人/);
    for (const [quantity, unit] of [[3, 300000], [4, 300000], [5, 280000], [9, 280000], [10, 250000], [11, 250000]]) {
      const result = calculateGroupTicketPrice(300000, quantity, rules);
      assert.equal(result.unitPriceCent, unit);
      assert.equal(result.subtotalCent, unit * quantity);
      assert.equal(result.groupPricingSnapshot?.baseUnitPriceCent, 300000);
    }
  });
  it("uses fixed per-person price when there are no tiers", () => {
    assert.equal(calculateGroupTicketPrice(9999, 3, { ...rules, tiers: [] }).subtotalCent, 29997);
  });
  it("charges exact package totals only for configured party sizes", () => {
    const input = { version: 1, mode: "PACKAGE", minQuantity: 3, minPayableAmountCent: 0, tiers: [], packages: [
      { quantity: 3, totalAmountCent: 10000 }, { quantity: 5, totalAmountCent: 15002 }
    ] };
    const result = calculateGroupTicketPrice(3333, 3, input);
    assert.equal(result.subtotalCent, 10000);
    assert.equal(result.unitPriceCent, 3333);
    assert.equal(result.groupPricingSnapshot?.perPersonRemainderCent, 1);
    assert.equal(calculateGroupTicketPrice(3333, 5, input).subtotalCent, 15002);
    for (const quantity of [2, 4, 6, 10]) assert.throws(() => calculateGroupTicketPrice(3333, quantity, input));
    for (const invalid of [
      { ...input, packages: [] }, { ...input, minQuantity: 2 }, { ...input, minPayableAmountCent: 10001 },
      { ...input, packages: [{ quantity: 3, totalAmountCent: 1 }] },
      { ...input, packages: [{ quantity: 3, totalAmountCent: 100.5 }] },
      { ...input, packages: [{ quantity: 3, totalAmountCent: 100 }, { quantity: 3, totalAmountCent: 200 }] },
      { ...input, tiers: rules.tiers }, { ...input, mode: "anything" }
    ]) assert.throws(() => parseGroupTicketPricing(invalid));
    assert.throws(() => parseGroupTicketPricing(input, 1), /参考人均/);
    assert.throws(() => parseGroupTicketPricing({ ...rules, packages: input.packages }));
  });
  it("copies normalized rules rather than retaining mutable configuration", () => {
    const input = structuredClone(rules);
    const result = calculateGroupTicketPrice(300000, 5, input);
    input.tiers[0].unitPriceCent = 1;
    assert.equal(result.groupPricingSnapshot?.rules.tiers[0].unitPriceCent, 280000);
  });
  it("rejects malformed and unsafe rules", () => {
    for (const input of [[], "bad", { ...rules, version: 2 }, { ...rules, minQuantity: 1 }, { ...rules, minQuantity: 3.5 },
      { ...rules, minPayableAmountCent: -1 }, { ...rules, minPayableAmountCent: 1.5 }, { ...rules, minPayableAmountCent: 2147483648 },
      { ...rules, tiers: [{ minQuantity: 2, unitPriceCent: 100 }] },
      { ...rules, tiers: [{ minQuantity: 5, unitPriceCent: 200 }, { minQuantity: 5, unitPriceCent: 100 }] },
      { ...rules, tiers: [{ minQuantity: 10, unitPriceCent: 200 }, { minQuantity: 5, unitPriceCent: 100 }] },
      { ...rules, tiers: [{ minQuantity: 5, unitPriceCent: 0 }] },
      { ...rules, tiers: [{ minQuantity: 5, unitPriceCent: 200 }, { minQuantity: 10, unitPriceCent: 300 }] },
      { ...rules, tiers: Array.from({ length: 21 }, (_, i) => ({ minQuantity: i + 3, unitPriceCent: 100 })) }
    ]) assert.throws(() => parseGroupTicketPricing(input, 300000));
    assert.throws(() => parseGroupTicketPricing(rules, 0));
    assert.throws(() => parseGroupTicketPricing(rules, 200000), /高于上一档/);
  });
  it("rejects invalid quantity and overflowing totals before creating money values", () => {
    for (const quantity of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) assert.throws(() => calculateGroupTicketPrice(300000, quantity, rules));
    assert.throws(() => calculateGroupTicketPrice(2147483647, 2, null), /总金额/);
    assert.throws(() => calculateGroupTicketPrice(0.5, 3, null));
  });
});
