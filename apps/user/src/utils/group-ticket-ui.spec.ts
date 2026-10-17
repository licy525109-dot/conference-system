import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { RegistrationSku } from "../services/conference";

// tsx maps the shared alias to its CommonJS source barrel when run inside apps/user.
const { groupTicketPayableError, groupTicketRuleLabels, initializeTicketQuantities, selectedTicketQuantityError, stepTicketQuantity, ticketCatalogAmountCent, ticketPriceLabel, ticketQuantityState, ticketSelectorDisplaySku } = createRequire(import.meta.url)("./group-ticket-ui") as typeof import("./group-ticket-ui");

const group: RegistrationSku = {
  id: "group", name: "团体票", description: null, priceCent: 10000,
  stock: 30, soldCount: 2, lockedStock: 3,
  groupPricingJson: {
    version: 1, minQuantity: 3, minPayableAmountCent: 20000,
    tiers: [{ minQuantity: 5, unitPriceCent: 8000 }, { minQuantity: 10, unitPriceCent: 6001 }]
  }
};
const regular: RegistrationSku = { ...group, id: "regular", name: "普通票", groupPricingJson: null };
const packageTicket: RegistrationSku = {
  ...group, id: "package", name: "套餐票", priceCent: 280000,
  groupPricingJson: {
    version: 1, mode: "PACKAGE", minQuantity: 5, minPayableAmountCent: 1000000, tiers: [],
    packages: [{ quantity: 5, totalAmountCent: 1400001 }, { quantity: 8, totalAmountCent: 2000003 }, { quantity: 12, totalAmountCent: 2800001 }]
  }
};

test("group selection jumps from zero to minimum and minimum back to zero", () => {
  assert.equal(stepTicketQuantity(group, 0, 1), 3);
  assert.equal(stepTicketQuantity(group, 3, -1), 0);
  assert.equal(stepTicketQuantity(group, 3, 1), 4);
  assert.equal(stepTicketQuantity(group, 4, -1), 3);
  assert.equal(stepTicketQuantity(group, 1, 1), 3);
  assert.equal(stepTicketQuantity(group, 1, -1), 0);
  assert.equal(stepTicketQuantity(group, 0, -1), 0);
});

test("ordinary and legacy tickets retain single-person increments", () => {
  for (const sku of [regular, { ...regular, groupPricingJson: undefined }]) {
    assert.equal(stepTicketQuantity(sku, 0, 1), 1);
    assert.equal(stepTicketQuantity(sku, 1, -1), 0);
    assert.deepEqual(ticketQuantityState(sku).labels, []);
  }
});

test("stock subtracts locked/sold inventory and cannot select a partial group", () => {
  assert.equal(ticketQuantityState(group).maximum, 25);
  assert.equal(stepTicketQuantity(group, 25, 1), 25);
  const insufficient = { ...group, stock: 7 };
  assert.match(ticketQuantityState(insufficient).unavailableMessage, /不足3人起购/);
  assert.equal(stepTicketQuantity(insufficient, 0, 1), 0);
  assert.equal(stepTicketQuantity({ ...group, stock: 8 }, 0, 1), 3);
});

test("explicit SKU and remaining order limits both constrain selection", () => {
  assert.equal(stepTicketQuantity({ ...group, maxQuantity: 4 }, 4, 1), 4);
  assert.equal(stepTicketQuantity(group, 4, 1, 4), 4);
  assert.equal(stepTicketQuantity(group, 0, 1, 2), 0);
  assert.equal(stepTicketQuantity({ ...group, maxQuantity: 2 }, 0, 1), 0);
  assert.match(ticketQuantityState(group, 2).unavailableMessage, /上限不足3人/);
  assert.equal(stepTicketQuantity(group, 0, 1, 0), 0);
});

test("initial selection uses the correct minimum and refresh preserves intentional deselection", () => {
  assert.deepEqual(initializeTicketQuantities([group, regular], "group", {}, false), { group: 3, regular: 0 });
  assert.deepEqual(initializeTicketQuantities([group, regular], "group", { group: 0, regular: 2 }, true), { group: 0, regular: 2 });
  assert.deepEqual(initializeTicketQuantities([group, regular], "group", { group: 5, regular: 2 }, true), { group: 5, regular: 2 });
  assert.deepEqual(initializeTicketQuantities([{ ...group, stock: 7 }], "group", {}, false), { group: 0 });
  assert.deepEqual(initializeTicketQuantities([group], "group", {}, false, 2), { group: 0 });
});

test("refresh normalizes changed minimum, stock, and total order cap without leaving sub-minimum groups", () => {
  assert.deepEqual(initializeTicketQuantities([group], "group", { group: 1 }, true), { group: 3 });
  assert.deepEqual(initializeTicketQuantities([{ ...group, stock: 9 }], "group", { group: 5 }, true), { group: 4 });
  assert.deepEqual(initializeTicketQuantities([{ ...group, stock: 7 }], "group", { group: 5 }, true), { group: 0 });
  assert.deepEqual(initializeTicketQuantities([group, regular], "group", { group: 5, regular: 3 }, true, 6), { group: 5, regular: 1 });
});

test("selection validation keeps minimum quantities scoped to each SKU", () => {
  assert.match(selectedTicketQuantityError([group, regular], { group: 2, regular: 10 }), /团体票至少3人起购/);
  assert.equal(selectedTicketQuantityError([group, regular], { group: 3, regular: 1 }, 4), "");
  assert.match(selectedTicketQuantityError([group, regular], { group: 3, regular: 2 }, 4), /最多4人/);
  assert.match(selectedTicketQuantityError([group], { group: 26 }), /超出可购人数/);
  assert.match(selectedTicketQuantityError([group], { group: 3.5 }), /起购/);
  assert.match(selectedTicketQuantityError([group], { removed: 3 }), /票种已更新/);
});

test("malformed or unsupported rules fail closed instead of silently becoming ordinary tickets", () => {
  const malformed = { ...group, groupPricingJson: { ...group.groupPricingJson, version: 2 } } as unknown as RegistrationSku;
  assert.match(ticketQuantityState(malformed).unavailableMessage, /规则暂不可用/);
  assert.equal(stepTicketQuantity(malformed, 0, 1), 0);
});

test("labels explicitly describe per-person base, same-SKU all-person tiers, and final order floor", () => {
  assert.deepEqual(groupTicketRuleLabels(group.groupPricingJson!, group.priceCent), [
    "3人起购", "基础价 100.00元每人", "满5人每人80.00元", "满10人每人60.01元",
    "同一票种按人数计价，达标价适用于该票种所有人", "订单实付至少200.00元（优惠后）"
  ]);
});

test("zero payable floors add no label in either mode while a one-cent floor remains visible", () => {
  for (const rules of [group.groupPricingJson!, { ...group.groupPricingJson!, mode: "PER_PERSON" as const }, packageTicket.groupPricingJson!]) {
    const otherLabels = groupTicketRuleLabels(rules, group.priceCent).filter(label => !label.startsWith("订单实付至少"));
    assert.deepEqual(groupTicketRuleLabels({ ...rules, minPayableAmountCent: 0 }, group.priceCent), otherLabels);
    assert.deepEqual(groupTicketRuleLabels({ ...rules, minPayableAmountCent: 1 }, group.priceCent), [...otherLabels, "订单实付至少0.01元（优惠后）"]);
  }
});

test("minimum payable validates the final order total without adding floors or increasing charge", () => {
  const second = { ...group.groupPricingJson!, minPayableAmountCent: 30000 };
  assert.equal(groupTicketPayableError([group.groupPricingJson, second], 30000), "");
  assert.match(groupTicketPayableError([group.groupPricingJson, second], 29999), /订单实付至少300.00元/);
  assert.equal(groupTicketPayableError([null, undefined], 0), "");
  assert.equal(groupTicketPayableError([{ ...second, minPayableAmountCent: 0 }], 0), "");
});

test("package steps visit only configured headcounts, including zero, never repeated bundles", () => {
  assert.equal(stepTicketQuantity(packageTicket, 0, 1), 5);
  assert.equal(stepTicketQuantity(packageTicket, 5, 1), 8);
  assert.equal(stepTicketQuantity(packageTicket, 8, 1), 12);
  assert.equal(stepTicketQuantity(packageTicket, 12, 1), 12);
  assert.equal(stepTicketQuantity(packageTicket, 12, -1), 8);
  assert.equal(stepTicketQuantity(packageTicket, 8, -1), 5);
  assert.equal(stepTicketQuantity(packageTicket, 5, -1), 0);
  assert.equal(stepTicketQuantity(packageTicket, 0, -1), 0);
});

test("package maximum snaps to the largest configured tier within stock, SKU and order caps", () => {
  assert.equal(ticketQuantityState({ ...packageTicket, stock: 12 }).maximum, 5);
  assert.equal(stepTicketQuantity({ ...packageTicket, stock: 12 }, 5, 1), 5);
  assert.equal(ticketQuantityState({ ...packageTicket, maxQuantity: 11 }).maximum, 8);
  assert.equal(stepTicketQuantity(packageTicket, 8, 1, 11), 8);
  assert.equal(stepTicketQuantity(packageTicket, 0, 1, 4), 0);
  assert.match(ticketQuantityState({ ...packageTicket, stock: 9 }).unavailableMessage, /不足5人套餐/);
});

test("package initialization and refresh never leave an unconfigured headcount", () => {
  assert.deepEqual(initializeTicketQuantities([packageTicket], "package", {}, false), { package: 5 });
  assert.deepEqual(initializeTicketQuantities([packageTicket], "package", { package: 8 }, true), { package: 8 });
  assert.deepEqual(initializeTicketQuantities([packageTicket], "package", { package: 0 }, true), { package: 0 });
  assert.deepEqual(initializeTicketQuantities([packageTicket], "package", { package: 10 }, true), { package: 8 });
  assert.deepEqual(initializeTicketQuantities([packageTicket], "package", { package: 8 }, true, 7), { package: 5 });
  assert.deepEqual(initializeTicketQuantities([packageTicket], "package", { package: 8 }, true, 4), { package: 0 });
});

test("package selection rejects unlisted sizes even when divisible into multiple configured packages", () => {
  assert.equal(selectedTicketQuantityError([packageTicket], { package: 8 }), "");
  assert.match(selectedTicketQuantityError([packageTicket], { package: 10 }), /仅可选择已配置人数/);
  assert.match(selectedTicketQuantityError([packageTicket, regular], { package: 6, regular: 2 }), /仅可选择已配置人数/);
  assert.match(selectedTicketQuantityError([packageTicket], { package: 12 }, 11), /最多11人/);
});

test("package labels show exact whole-group totals, not the rounded reference unit price", () => {
  const labels = groupTicketRuleLabels(packageTicket.groupPricingJson!, packageTicket.priceCent);
  assert.deepEqual(labels, [
    "5人套餐 ¥14000.01/团", "8人套餐 ¥20000.03/团", "12人套餐 ¥28000.01/团",
    "仅可选择以上固定人数套餐，不支持拆分或拼购", "订单实付至少10000.00元（优惠后）"
  ]);
  assert.ok(labels.every(label => !label.includes("每人") && !label.includes("基础价")));
  assert.equal(ticketPriceLabel(packageTicket), "5人套餐 ¥14000.01/团");
  assert.equal(ticketPriceLabel(packageTicket, 8), "8人套餐 ¥20000.03/团");
  assert.equal(ticketPriceLabel(packageTicket, 10), "请选择已配置套餐");
});

test("snapshot package mode uses server subtotal exactly even when it cannot divide by headcount", () => {
  const quoted = {
    skuId: "package", skuName: "套餐票", quantity: 8, unitPriceCent: 250000, subtotalCent: 2000003,
    groupPricingSnapshot: { rules: packageTicket.groupPricingJson!, baseUnitPriceCent: 280000, appliedMinQuantity: 8, perPersonRemainderCent: 3 }
  };
  assert.notEqual(quoted.unitPriceCent * quoted.quantity, quoted.subtotalCent);
  assert.equal(ticketPriceLabel(packageTicket, 8, quoted), "8人套餐 ¥20000.03/团");
  assert.equal(ticketPriceLabel({ ...packageTicket, groupPricingJson: null }, 8, quoted), "8人套餐 ¥20000.03/团");
  assert.equal(ticketPriceLabel(packageTicket, 8, { ...quoted, subtotalCent: 1999999 }), "8人套餐 ¥19999.99/团");
});

test("package quote labels never multiply member unit prices or add remainder cents to the server subtotal", () => {
  const quoted = {
    skuId: "package", skuName: "套餐票", quantity: 5, unitPriceCent: 280000, subtotalCent: 1400001,
    memberUnitPriceCent: 252000, memberSubtotalCent: 1260001, memberDiscountAmountCent: 140000,
    groupPricingSnapshot: { rules: packageTicket.groupPricingJson!, baseUnitPriceCent: 280000, appliedMinQuantity: 5, perPersonRemainderCent: 1 }
  };
  assert.notEqual(quoted.memberUnitPriceCent * quoted.quantity, quoted.memberSubtotalCent);
  assert.notEqual(quoted.unitPriceCent * quoted.quantity, quoted.subtotalCent);
  assert.equal(ticketPriceLabel(packageTicket, 5, quoted), "5人套餐 ¥14000.01/团");
});

test("detail selector presentation shows package total without mutating the public SKU reference price", () => {
  const displayed = ticketSelectorDisplaySku(packageTicket);
  assert.equal(displayed.priceCent, 1400001);
  assert.match(displayed.name, /5人\/团起/);
  assert.match(displayed.description!, /8人套餐 ¥20000.03\/团/);
  assert.equal(packageTicket.priceCent, 280000);
  assert.equal(displayed.groupPricingJson, packageTicket.groupPricingJson);
});

test("coupon threshold amounts retain non-divisible cents without changing ordinary ticket behavior", () => {
  assert.equal(ticketCatalogAmountCent(packageTicket, 5), 1400001);
  assert.equal(ticketCatalogAmountCent(packageTicket, 8), 2000003);
  assert.equal(ticketCatalogAmountCent(packageTicket, 10), 0);
  assert.equal(ticketCatalogAmountCent(group, 5), 50000);
  assert.equal(ticketCatalogAmountCent(regular, 2), 20000);
});

test("explicit PER_PERSON remains compatible with the legacy omitted mode", () => {
  const explicit = { ...group, groupPricingJson: { ...group.groupPricingJson!, mode: "PER_PERSON" as const } };
  assert.equal(stepTicketQuantity(explicit, 3, 1), 4);
  assert.deepEqual(groupTicketRuleLabels(explicit.groupPricingJson, explicit.priceCent), groupTicketRuleLabels(group.groupPricingJson!, group.priceCent));
  assert.equal(ticketPriceLabel(explicit), "基础价 100.00元每人");
});
