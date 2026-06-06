import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AdminAuthService } from "./admin-auth.service";
import { RequestWithCurrentAdmin } from "./current-admin";

interface RequestWithHeaders extends RequestWithCurrentAdmin {
  headers?: {
    authorization?: string;
  };
}

@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const token = parseBearerToken(request.headers?.authorization);
    if (!token) {
      throw new UnauthorizedException("Admin bearer token is required");
    }

    request.currentAdmin = await this.adminAuthService.getCurrentAdminFromToken(token);
    return true;
  }
}

function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}
