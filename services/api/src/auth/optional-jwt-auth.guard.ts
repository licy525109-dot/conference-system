import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { RequestWithCurrentUser } from "./current-user";

interface RequestWithHeaders extends RequestWithCurrentUser {
  headers?: {
    authorization?: string;
  };
}

@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const token = parseBearerToken(request.headers?.authorization);
    if (token) {
      try {
        request.currentUser = await this.authService.getCurrentUserFromToken(token);
      } catch {
        request.currentUser = undefined;
      }
    }
    return true;
  }
}

function parseBearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  return scheme === "Bearer" && token ? token : null;
}
