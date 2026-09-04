export function shouldAutoCheckWechatProfile(token: string | null | undefined): boolean {
  return !String(token || "").trim();
}

export function isProfilePromptOwnerActive(ownerPage: unknown, pages: readonly unknown[]): boolean {
  return ownerPage !== null && ownerPage !== undefined && pages[pages.length - 1] === ownerPage;
}
