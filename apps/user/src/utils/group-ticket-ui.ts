import { parseGroupTicketPricing, type GroupTicketPricing } from "@conference/shared";
import type { RegistrationSku } from "../services/conference";
import type { QuoteResponse } from "../services/registration";
import { formatCent } from "./money";
import { remainingRegistrationStock } from "./registration-stock";

export function groupTicketRuleLabels(rules: GroupTicketPricing, baseUnitPriceCent: number): string[] {
  const payableLabels = rules.minPayableAmountCent > 0
    ? [`订单实付至少${formatCent(rules.minPayableAmountCent)}元（优惠后）`] : [];
  if (rules.mode === "PACKAGE") {
    return [
      ...(rules.packages ?? []).map(item => packagePriceLabel(item.quantity, item.totalAmountCent)),
      "仅可选择以上固定人数套餐，不支持拆分或拼购",
      ...payableLabels
    ];
  }
  return [
    `${rules.minQuantity}人起购`,
    `基础价 ${formatCent(baseUnitPriceCent)}元每人`,
    ...rules.tiers.map(tier => `满${tier.minQuantity}人每人${formatCent(tier.unitPriceCent)}元`),
    "同一票种按人数计价，达标价适用于该票种所有人",
    ...payableLabels
  ];
}

type QuotedTicket = NonNullable<QuoteResponse["items"]>[number];

export function ticketPriceLabel(sku: RegistrationSku, quantity = 0, quoted?: QuotedTicket): string {
  const rules = quoted?.groupPricingSnapshot?.rules ?? sku.groupPricingJson;
  if (rules?.mode === "PACKAGE") {
    if (quoted) return packagePriceLabel(quoted.quantity, quoted.subtotalCent);
    const selected = quantity > 0 ? rules.packages?.find(item => item.quantity === quantity) : rules.packages?.[0];
    return selected ? packagePriceLabel(selected.quantity, selected.totalAmountCent) : "请选择已配置套餐";
  }
  if (rules) return `${quoted ? '' : '基础价 '}${formatCent(quoted?.unitPriceCent ?? sku.priceCent)}元每人`;
  return `¥${formatCent(quoted?.unitPriceCent ?? sku.priceCent)}`;
}

// Used only for coupon availability filtering, never as an order or payable amount.
export function ticketCatalogAmountCent(sku: RegistrationSku, quantity: number): number {
  if (sku.groupPricingJson?.mode === "PACKAGE") {
    return sku.groupPricingJson.packages?.find(item => item.quantity === quantity)?.totalAmountCent ?? 0;
  }
  return sku.priceCent * quantity;
}

export function ticketSelectorDisplaySku(sku: RegistrationSku, orderCapacity?: number | null): RegistrationSku {
  const state = ticketQuantityState(sku, orderCapacity);
  if (!sku.groupPricingJson) return sku;
  const firstPackage = state.rules?.mode === "PACKAGE" ? state.rules.packages?.[0] : undefined;
  // This copy is presentation-only: the existing selector renders priceCent verbatim.
  return {
    ...sku,
    ...(firstPackage ? { priceCent: firstPackage.totalAmountCent, name: `${sku.name}（${firstPackage.quantity}人/团起）` } : {}),
    description: [sku.description, ...state.labels, state.unavailableMessage].filter(Boolean).join("；")
  };
}

function packagePriceLabel(quantity: number, totalAmountCent: number): string {
  return `${quantity}人套餐 ¥${formatCent(totalAmountCent)}/团`;
}

export function ticketQuantityState(sku: RegistrationSku, orderCapacity?: number | null) {
  const capacity = Math.min(remainingRegistrationStock(sku), quantityLimit(sku.maxQuantity), quantityLimit(orderCapacity));
  let rules: GroupTicketPricing | null;
  try {
    rules = parseGroupTicketPricing(sku.groupPricingJson, sku.priceCent);
  } catch {
    return { minimum: 1, maximum: 0, packageQuantities: undefined, rules: null, labels: [], unavailableMessage: "团体票规则暂不可用，请刷新后重试" };
  }
  const minimum = rules?.minQuantity ?? 1;
  const packageQuantities = rules?.mode === "PACKAGE" ? (rules.packages ?? []).map(item => item.quantity).filter(quantity => quantity <= capacity) : undefined;
  const maximum = packageQuantities ? packageQuantities.at(-1) ?? 0 : capacity;
  const minimumLabel = rules?.mode === "PACKAGE" ? `${minimum}人套餐` : `${minimum}人起购`;
  const unavailableMessage = remainingRegistrationStock(sku) < minimum
    ? rules ? `剩余名额不足${minimumLabel}` : "已售罄"
    : maximum < minimum ? `可购人数上限不足${minimum}人` : "";
  return { minimum, maximum, packageQuantities, rules, labels: rules ? groupTicketRuleLabels(rules, sku.priceCent) : [], unavailableMessage };
}

export function stepTicketQuantity(sku: RegistrationSku, current: number, delta: -1 | 1, orderCapacity?: number | null): number {
  const { minimum, maximum, packageQuantities, unavailableMessage } = ticketQuantityState(sku, orderCapacity);
  if (unavailableMessage) return 0;
  if (packageQuantities) {
    return delta > 0 ? packageQuantities.find(quantity => quantity > current) ?? maximum
      : packageQuantities.filter(quantity => quantity < current).at(-1) ?? 0;
  }
  if (delta < 0 && current <= minimum) return 0;
  return Math.min(maximum, Math.max(minimum, current + delta));
}

export function initializeTicketQuantities(
  skus: RegistrationSku[], selectedSkuId: string, existing: Record<string, number>, initialized: boolean,
  maxTicketsPerOrder?: number | null
): Record<string, number> {
  let remaining = quantityLimit(maxTicketsPerOrder);
  return Object.fromEntries(skus.map(sku => {
    const previous = initialized ? existing[sku.id] ?? 0 : Number(sku.id === selectedSkuId);
    const state = ticketQuantityState(sku, Number.isFinite(remaining) ? remaining : undefined);
    const bounded = Math.min(state.maximum, Math.max(state.minimum, previous));
    const quantity = !Number.isSafeInteger(previous) || previous <= 0 || state.unavailableMessage
      ? 0 : state.packageQuantities ? state.packageQuantities.filter(quantity => quantity <= bounded).at(-1) ?? 0 : bounded;
    remaining -= quantity;
    return [sku.id, quantity];
  }));
}

export function selectedTicketQuantityError(skus: RegistrationSku[], quantities: Record<string, number>, maxTicketsPerOrder?: number | null): string {
  let total = 0;
  for (const [skuId, quantity] of Object.entries(quantities)) {
    if (quantity === 0) continue;
    const sku = skus.find(item => item.id === skuId);
    if (!sku) return "所选票种已更新，请刷新后重试";
    const state = ticketQuantityState(sku);
    if (state.unavailableMessage) return `${sku.name}：${state.unavailableMessage}`;
    if (!Number.isSafeInteger(quantity) || quantity < state.minimum) return `${sku.name}至少${state.minimum}人起购`;
    if (quantity > state.maximum) return `${sku.name}超出可购人数，请调整人数或刷新`;
    if (state.packageQuantities && !state.packageQuantities.includes(quantity)) return `${sku.name}仅可选择已配置人数的套餐，不支持拆分或拼购`;
    total += quantity;
  }
  return total > quantityLimit(maxTicketsPerOrder) ? `每笔订单最多${maxTicketsPerOrder}人` : "";
}

export function groupTicketPayableError(rules: Array<GroupTicketPricing | null | undefined>, payableAmountCent: number): string {
  const floor = Math.max(0, ...rules.map(rule => rule?.minPayableAmountCent ?? 0));
  return payableAmountCent < floor ? `订单实付至少${formatCent(floor)}元（优惠后），请调整人数或优惠` : "";
}

function quantityLimit(value?: number | null): number {
  return value == null ? Infinity : Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
