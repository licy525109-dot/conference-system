import { ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

export function missingRegistrationProfileFields(profile: { realName?: string | null; phone?: string | null; phoneVerifiedAt?: unknown } | null) {
  const missing: string[] = [];
  if (!profile?.realName?.trim()) missing.push("realName");
  if (!profile?.phone || !profile.phoneVerifiedAt) missing.push("verifiedPhone");
  return missing;
}

export async function requireRegistrationProfile(prisma: PrismaService, userId: string): Promise<void> {
  // Enable only after the compatible mini program has been released. Never call from payment callbacks.
  if (process.env.REGISTRATION_PROFILE_REQUIRED !== "true") return;
  const profile = await prisma.user.findUnique({
    where: { id: userId }, select: { realName: true, phone: true, phoneVerifiedAt: true }
  });
  const missingFields = missingRegistrationProfileFields(profile);
  if (missingFields.length) throw new ForbiddenException({
    code: "REGISTRATION_PROFILE_REQUIRED", message: "请先完善本人姓名并验证手机号，再继续报名", missingFields
  });
}
