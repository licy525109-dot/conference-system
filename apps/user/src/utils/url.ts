const HTTPS_URL_PATTERN = /^https:\/\/[^/\s?#]+(?:[/?#][^\s]*)?$/i;

export function isHttpsUrl(value: string): boolean {
  return HTTPS_URL_PATTERN.test(value.trim());
}
