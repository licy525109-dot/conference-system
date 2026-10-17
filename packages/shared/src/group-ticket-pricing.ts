export interface GroupTicketPricing {
  version: 1;
  mode?: "PER_PERSON" | "PACKAGE";
  minQuantity: number;
  minPayableAmountCent: number;
  tiers: Array<{ minQuantity: number; unitPriceCent: number }>;
  packages?: Array<{ quantity: number; totalAmountCent: number }>;
}

export interface GroupTicketPriceSnapshot {
  rules: GroupTicketPricing;
  baseUnitPriceCent: number;
  appliedMinQuantity: number;
  perPersonRemainderCent?: number;
}

const MAX_AMOUNT_CENT = 2147483647;

function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${label}必须是 ${min} 至 ${max} 的整数`);
  }
  return value;
}

export function parseGroupTicketPricing(value: unknown, baseUnitPriceCent?: number): GroupTicketPricing | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("团体票规则格式不正确");
  const input = value as Record<string, unknown>;
  if (input.version !== 1) throw new Error("团体票规则版本不支持");
  const minQuantity = integer(input.minQuantity, 2, 1000, "团体票最低人数");
  const minPayableAmountCent = integer(input.minPayableAmountCent, 0, MAX_AMOUNT_CENT, "最低实付金额（分）");
  if (input.mode !== undefined && input.mode !== "PER_PERSON" && input.mode !== "PACKAGE") throw new Error("团体票计价方式不支持");
  if (input.mode === "PACKAGE") {
    if (!Array.isArray(input.tiers) || input.tiers.length) throw new Error("整团套餐不能同时配置人均阶梯价");
    if (!Array.isArray(input.packages) || input.packages.length < 1 || input.packages.length > 20) throw new Error("整团套餐须配置 1 至 20 个人数档");
    let previousQuantity = minQuantity - 1;
    const packages = input.packages.map((value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("整团套餐格式不正确");
      const item = value as Record<string, unknown>;
      const quantity = integer(item.quantity, minQuantity, 1000, "套餐人数");
      const totalAmountCent = integer(item.totalAmountCent, quantity, MAX_AMOUNT_CENT, "套餐总价（分）");
      if (quantity <= previousQuantity) throw new Error("套餐人数必须从小到大填写，不能重复");
      if (totalAmountCent < minPayableAmountCent) throw new Error("套餐总价不能低于最低实付金额");
      previousQuantity = quantity;
      return { quantity, totalAmountCent };
    });
    if (packages[0].quantity !== minQuantity) throw new Error("套餐最低人数必须与首档套餐人数一致");
    if (baseUnitPriceCent !== undefined && baseUnitPriceCent !== Math.floor(packages[0].totalAmountCent / packages[0].quantity)) throw new Error("套餐参考人均价格与首档套餐不一致");
    return { version: 1, mode: "PACKAGE", minQuantity, minPayableAmountCent, tiers: [], packages };
  }
  if (input.packages !== undefined && (!Array.isArray(input.packages) || input.packages.length)) throw new Error("人均计价不能同时配置整团套餐");
  if (!Array.isArray(input.tiers) || input.tiers.length > 20) throw new Error("人数阶梯最多配置 20 项");
  let previousQuantity = minQuantity - 1;
  let previousPrice = baseUnitPriceCent === undefined ? MAX_AMOUNT_CENT : integer(baseUnitPriceCent, 1, MAX_AMOUNT_CENT, "团体票人均基础价格（分）");
  const tiers = input.tiers.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("人数阶梯格式不正确");
    const item = value as Record<string, unknown>;
    const quantity = integer(item.minQuantity, minQuantity, 1000, "阶梯人数");
    const unitPriceCent = integer(item.unitPriceCent, 1, MAX_AMOUNT_CENT, "阶梯人均价格（分）");
    if (quantity <= previousQuantity) throw new Error("阶梯人数必须从小到大填写，不能重复");
    if (unitPriceCent > previousPrice) throw new Error("人数增加时，人均价格不能高于上一档价格");
    previousQuantity = quantity;
    previousPrice = unitPriceCent;
    return { minQuantity: quantity, unitPriceCent };
  });
  return { version: 1, minQuantity, minPayableAmountCent, tiers };
}

export function calculateGroupTicketPrice(baseUnitPriceCent: number, quantity: number, value: unknown) {
  const rules = parseGroupTicketPricing(value, baseUnitPriceCent);
  integer(quantity, 1, MAX_AMOUNT_CENT, "购票人数");
  integer(baseUnitPriceCent, 0, MAX_AMOUNT_CENT, "票价（分）");
  if (rules && quantity < rules.minQuantity) throw new Error(`该团体票至少 ${rules.minQuantity} 人起购，请增加同一票种的人数`);
  if (rules?.mode === "PACKAGE") {
    const selected = rules.packages!.find(item => item.quantity === quantity);
    if (!selected) throw new Error(`请选择已配置的套餐人数：${rules.packages!.map(item => item.quantity).join("、")} 人`);
    const groupPricingSnapshot: GroupTicketPriceSnapshot = {
      rules, baseUnitPriceCent, appliedMinQuantity: quantity,
      perPersonRemainderCent: selected.totalAmountCent % quantity
    };
    return { unitPriceCent: Math.floor(selected.totalAmountCent / quantity), subtotalCent: selected.totalAmountCent, groupPricingSnapshot };
  }
  const tier = rules?.tiers.filter(item => quantity >= item.minQuantity).at(-1);
  const unitPriceCent = tier?.unitPriceCent ?? baseUnitPriceCent;
  const subtotalCent = unitPriceCent * quantity;
  if (!Number.isSafeInteger(subtotalCent) || subtotalCent > MAX_AMOUNT_CENT) throw new Error("票种总金额超过支持上限，请分单购买");
  const groupPricingSnapshot: GroupTicketPriceSnapshot | undefined = rules ? {
    rules,
    baseUnitPriceCent,
    appliedMinQuantity: tier?.minQuantity ?? rules.minQuantity
  } : undefined;
  return { unitPriceCent, subtotalCent, ...(groupPricingSnapshot ? { groupPricingSnapshot } : {}) };
}
