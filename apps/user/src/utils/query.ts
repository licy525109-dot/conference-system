export function stringifyQuery(params: Record<string, unknown> | undefined | null): string {
  if (!params) return "";
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "undefined" || value === null || value === "") continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.join("&");
}
