export interface RegistrationStockCounters {
  stock?: number | null;
  soldCount?: number | null;
  lockedStock?: number | null;
}

export function remainingRegistrationStock(sku: RegistrationStockCounters): number {
  return Math.max(
    readNonNegativeInteger(sku.stock) - readNonNegativeInteger(sku.soldCount) - readNonNegativeInteger(sku.lockedStock),
    0
  );
}

function readNonNegativeInteger(value: number | null | undefined): number {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}
