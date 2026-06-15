import { SetMetadata } from "@nestjs/common";

export const REQUIRED_ADMIN_PERMISSIONS = "requiredAdminPermissions";

export function RequireAdminPermissions(...permissions: string[]) {
  return SetMetadata(REQUIRED_ADMIN_PERMISSIONS, permissions);
}
