import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { CONFERENCE_SCOPED_ACCESS } from "./conference-scope";
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
    if (request.currentAdmin.conferenceScopeMode !== "ALL" &&
        !Reflect.getMetadata(CONFERENCE_SCOPED_ACCESS, context.getHandler()) &&
        !Reflect.getMetadata(CONFERENCE_SCOPED_ACCESS, context.getClass())) {
      throw new ForbiddenException("会议授权账号请使用授权会议工作台");
    }
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
