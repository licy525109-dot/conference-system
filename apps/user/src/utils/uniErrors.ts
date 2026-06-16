export function readUniErrMsg(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null || !("errMsg" in error)) {
    return fallback;
  }

  const errMsg = (error as { errMsg?: unknown }).errMsg;
  return typeof errMsg === "string" && errMsg.trim() ? errMsg : fallback;
}
