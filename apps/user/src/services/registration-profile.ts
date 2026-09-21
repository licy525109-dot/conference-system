import { ensureAuthenticatedUser } from "./auth";
import { registrationProfileReady } from "../utils/registration-identity";

let profileCheck: Promise<boolean> | null = null;

export async function ensureRegistrationProfile(): Promise<boolean> {
  if (profileCheck) return profileCheck;
  profileCheck = checkProfile().finally(() => { profileCheck = null; });
  return profileCheck;
}

async function checkProfile(): Promise<boolean> {
  const user = await ensureAuthenticatedUser({ force: true });
  if (registrationProfileReady(user)) return true;
  const pages = getCurrentPages();
  if (pages[pages.length - 1]?.route !== "pages/account/profile") {
    await new Promise<void>((resolve, reject) => uni.navigateTo({
      url: "/pages/account/profile", success: () => resolve(),
      fail: () => reject(new Error("资料页暂时无法打开，请稍后重试"))
    }));
  }
  return false;
}

export class RegistrationProfileRequiredError extends Error {
  constructor() { super("请完善本人资料后继续支付"); this.name = "RegistrationProfileRequiredError"; }
}
