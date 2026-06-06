import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RequestWithCurrentUser } from "./current-user";

interface RequestWithHeaders extends RequestWithCurrentUser {
  headers?: {
    authorization?: string;
  };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const token = parseBearerToken(request.headers?.authorization);
    if (!token) {
      throw new UnauthorizedException("Bearer token is required");
    }

    request.currentUser = await this.authService.getCurrentUserFromToken(token);
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
