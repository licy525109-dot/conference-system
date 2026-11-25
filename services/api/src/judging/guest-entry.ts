import { randomBytes, createHash } from "node:crypto";
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { Judge, GuestIdentification, GuestSeat } from "@conference/shared";
import { signJwt, verifyJwt } from "../auth/jwt";
import { key, object, str, fail } from "./validation";

export interface GuestEntry {
  code: string;
  signingKey: string;
}
export function createGuestEntry(): GuestEntry {
  return { code: randomBytes(18).toString("base64url"), signingKey: randomBytes(32).toString("hex") };
}
export function requireGuestEntry(entry: GuestEntry | undefined, code: string): GuestEntry {
  if (!entry || entry.code !== code)
    throw new NotFoundException("评分入口尚未发布或已停用，请联系现场工作人员");
  return entry;
}
export function publicSeat(j: Judge): GuestSeat {
  return { id: j.id, name: j.name, org: j.org || "", role: j.role };
}
const normalizeName = (s: string) => s.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
function subject(j: Judge) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([j.name, j.org || "", j.role, j.room]))
    .digest("hex");
  return j.id + "." + fingerprint;
}
export function identifyGuest(entry: GuestEntry, judges: Judge[], input: unknown): GuestIdentification {
  const data = object(input);
  const name = normalizeName(str(data.name, "评委姓名", 50));
  const matches = judges.filter((j) => normalizeName(j.name) === name);
  if (!matches.length)
    throw new NotFoundException("名单中未找到这个姓名，请核对报名时使用的姓名，或联系现场工作人员");
  if (matches.length > 1 && data.number == null)
    return { kind: "choose", choices: matches.map((j) => ({ id: j.id, org: j.org || "" })) };
  const number = data.number == null ? null : key(data.number, "评委编号");
  const seat = number === null ? matches[0] : matches.find((j) => j.id === number);
  if (!seat) fail("所选编号与姓名不匹配，请重新查询");
  const now = Math.floor(Date.now() / 1000);
  const ticket = signJwt(
    { sub: subject(seat), openid: null, iat: now, exp: now + 24 * 60 * 60 },
    entry.signingKey
  );
  return { kind: "ready", ticket };
}
export function guestSeat(entry: GuestEntry, judges: Judge[], ticket: string): Judge {
  const grant = ticket && ticket.length < 2048 ? verifyJwt(ticket, entry.signingKey) : null;
  if (!grant) throw new UnauthorizedException("请重新输入名单中的姓名");
  const id = grant.sub.split(".")[0];
  const seat = judges.find((j) => j.id === id);
  if (!seat || subject(seat) !== grant.sub) throw new UnauthorizedException("请重新输入名单中的姓名");
  return seat;
}
