import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RequestWithCurrentAdmin } from "./current-admin";
import { REQUIRED_ADMIN_PERMISSIONS } from "./require-permissions.decorator";

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_ADMIN_PERMISSIONS, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithCurrentAdmin>();
    const permissions = request.currentAdmin?.permissions ?? [];
    if (permissions.includes("*") || required.every((permission) => permissions.includes(permission))) {
      return true;
    }

    throw new ForbiddenException("当前账号无权访问该功能");
  }
}
