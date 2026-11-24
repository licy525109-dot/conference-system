import { ApiRequestError, request, requestWithBearer } from "./request";
import type { Answers, ScoringView, ScoreReceipt } from "@conference/shared";
const sessionKey = "judging_rehearsal_staff";
let token = "";
export function rehearsalToken(): string {
  // #ifdef H5
  try {
    return sessionStorage.getItem(sessionKey) || token;
  } catch {}
  // #endif
  return token;
}
export function setRehearsalToken(next: string) {
  token = next;
  // #ifdef H5
  try {
    if (next) sessionStorage.setItem(sessionKey, next);
    else sessionStorage.removeItem(sessionKey);
  } catch {}
  // #endif
}
export async function signIntoRehearsal(username: string, password: string) {
  const session = await request<{ token: string; admin: { permissions?: string[] } }>("/admin/auth/login", {
    method: "POST",
    auth: false,
    data: { username, password }
  });
  const p = session.admin.permissions || [];
  if (!p.includes("*") && (!p.includes("judging:view") || !p.includes("judging:floor")))
    throw new Error("此账号没有现场收分权限");
  setRehearsalToken(session.token);
}
export async function rehearsalScore(event: string, session: string, judge: string): Promise<ScoringView>;
export async function rehearsalScore(
  event: string,
  session: string,
  judge: string,
  data: { answers: Answers; formVersion: number }
): Promise<ScoreReceipt>;
export async function rehearsalScore(
  event: string,
  session: string,
  judge: string,
  data?: { answers: Answers; formVersion: number }
) {
  const path =
    "/admin/judging/" +
    encodeURIComponent(event) +
    "/sessions/" +
    encodeURIComponent(session) +
    "/rehearsal/" +
    encodeURIComponent(judge);
  try {
    return await requestWithBearer<ScoringView | ScoreReceipt>(path, rehearsalToken(), {
      method: data ? "POST" : "GET",
      data
    });
  } catch (e) {
    if (e instanceof ApiRequestError && e.statusCode === 401) setRehearsalToken("");
    throw e;
  }
}
