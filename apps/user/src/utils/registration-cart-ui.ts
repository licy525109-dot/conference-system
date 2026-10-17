import type { CartRegistrationItem } from "../services/cart";
import { formatCent } from "./money";

export function registrationCartState(item: CartRegistrationItem) {
  const isGroup = Boolean(item.sku.groupPricingJson);
  const isPackage = item.sku.groupPricingJson?.mode === "PACKAGE";
  const pricingError = item.pricingError || "";
  return {
    isGroup,
    pricingError,
    canSelect: !pricingError,
    canEditQuantity: !isGroup && !pricingError,
    quantityLabel: isPackage ? `${item.quantity}人套餐` : `${item.quantity}人团体票`,
    // The server subtotal includes package remainder cents and per-person tiers.
    priceLabel: pricingError ? "暂不可计价" : `¥${formatCent(item.subtotalCent)}${isPackage ? '/团' : ''}`
  };
}

export function registrationCartSelectionError(items: CartRegistrationItem[], selectedIds: string[]): string {
  for (const id of selectedIds) {
    const item = items.find(entry => entry.id === id);
    if (!item) return "购物车报名项已更新，请刷新后重试";
    if (item.pricingError) return item.pricingError;
  }
  return "";
}
