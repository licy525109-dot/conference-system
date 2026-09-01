export const WECHAT_PAY_DESCRIPTION_MAX_BYTES = 127;

export function buildWechatPayDescription(prefix: string, title: string, orderNo: string): string {
  const normalizedPrefix = normalizePart(prefix);
  const normalizedTitle = normalizePart(title) || "商品";
  const normalizedOrderNo = normalizePart(orderNo);
  const leading = normalizedPrefix ? `${normalizedPrefix}-` : "";
  const trailing = normalizedOrderNo ? `-${normalizedOrderNo}` : "";
  const fixedBytes = Buffer.byteLength(`${leading}${trailing}`, "utf8");

  if (fixedBytes >= WECHAT_PAY_DESCRIPTION_MAX_BYTES) {
    return truncateUtf8ByBytes(`${leading}${normalizedTitle}${trailing}`, WECHAT_PAY_DESCRIPTION_MAX_BYTES);
  }

  const truncatedTitle = truncateUtf8ByBytes(
    normalizedTitle,
    WECHAT_PAY_DESCRIPTION_MAX_BYTES - fixedBytes
  );
  return `${leading}${truncatedTitle}${trailing}`;
}

export function truncateUtf8ByBytes(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;

  const output: string[] = [];
  let usedBytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (usedBytes + characterBytes > maxBytes) break;
    output.push(character);
    usedBytes += characterBytes;
  }
  return output.join("");
}

function normalizePart(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
