export interface PublicHomeCache<T> { version: 1; savedAt: number; value: T }
export function readFreshPublicCache<T>(raw: unknown, now = Date.now()): T | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<PublicHomeCache<T>>;
  return item.version === 1 && Number.isFinite(item.savedAt) && typeof item.savedAt === "number" && now >= item.savedAt && now - item.savedAt < 24 * 3600_000 && item.value
    ? item.value : null;
}
