export interface WechatProfileSummary {
  phone?: string | null;
  wechatNickname?: string | null;
  wechatAvatarUrl?: string | null;
}

export interface WechatProfilePromptOptions {
  force?: boolean;
}

export function shouldAutoCheckWechatProfile(token: string | null | undefined): boolean {
  return !String(token || "").trim();
}

export function isProfilePromptOwnerActive(ownerPage: unknown, pages: readonly unknown[]): boolean {
  return ownerPage !== null && ownerPage !== undefined && pages[pages.length - 1] === ownerPage;
}

export function isWechatProfileComplete(profile: WechatProfileSummary | null | undefined): boolean {
  return Boolean(
    String(profile?.phone || "").trim()
    && String(profile?.wechatNickname || "").trim()
    && String(profile?.wechatAvatarUrl || "").trim()
  );
}

export function shouldOpenWechatProfilePrompt(
  profile: WechatProfileSummary | null | undefined,
  options?: WechatProfilePromptOptions
): boolean {
  return options?.force === true || !isWechatProfileComplete(profile);
}
