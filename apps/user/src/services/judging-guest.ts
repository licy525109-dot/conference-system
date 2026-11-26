import { request, requestWithBearer } from "./request";
import type {
  Answers,
  GuestDesk,
  GuestIdentification,
  JudgingGuidance,
  JudgingLook,
  ScoreReceipt
} from "@conference/shared";

export function guestScoring(event: string, code: string) {
  const path = "/judging/" + encodeURIComponent(event) + "/entry/" + encodeURIComponent(code);
  const storageKey = "judging_guest:" + event + ":" + code;
  let ticket = "";
  try {
    ticket = String(uni.getStorageSync(storageKey) || "");
  } catch {}
  function remember(next: string) {
    ticket = next;
    try {
      if (next) uni.setStorageSync(storageKey, next);
      else uni.removeStorageSync(storageKey);
    } catch {}
  }
  return {
    signedIn: () => Boolean(ticket),
    remember,
    info: () =>
      request<{ title: string; rehearsal: boolean; look: JudgingLook; guidance?: JudgingGuidance }>(path, {
        auth: false
      }),
    identify: (name: string, number?: string) =>
      request<GuestIdentification>(path + "/identify", {
        method: "POST",
        auth: false,
        data: { name, number }
      }),
    desk: (session?: string) =>
      requestWithBearer<GuestDesk>(
        path + "/desk" + (session ? "?session=" + encodeURIComponent(session) : ""),
        ticket,
        {}
      ),
    submit: (session: string, data: { answers: Answers; formVersion: number }) =>
      requestWithBearer<ScoreReceipt>(path + "/sessions/" + encodeURIComponent(session) + "/submit", ticket, {
        method: "POST",
        data
      })
  };
}
