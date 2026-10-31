import { ForbiddenException, SetMetadata } from "@nestjs/common";
import { CurrentAdmin } from "./current-admin";

export const CONFERENCE_SCOPED_ACCESS = "conference-scoped-admin-access";
export const AllowConferenceScopedAdmin = () => SetMetadata(CONFERENCE_SCOPED_ACCESS, true);
export const SCOPED_ADMIN_PERMISSIONS = ["conference:view", "conference:write", "registration:view", "registration:write", "registration:export", "order:view", "checkin:view", "checkin:write"];

export function requireConferenceGrant(admin: CurrentAdmin, conferenceId: string) {
  if (admin.conferenceScopeMode !== "ALL" && !admin.conferenceIds?.includes(conferenceId)) {
    throw new ForbiddenException("无权访问该会议");
  }
}
