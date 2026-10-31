import "reflect-metadata";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it, TestContext } from "node:test";
import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { signJwt } from "../auth/jwt";
import { PrismaService } from "../prisma.service";
import { AdminAccessController } from "./admin-access.controller";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthService } from "./admin-auth.service";
import { AdminConferenceWorkspaceController } from "./admin-conference-workspace.controller";
import { AdminExportsController } from "./admin-exports.controller";
import { AdminFinanceController } from "./admin-finance.controller";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminManagementController } from "./admin-management.controller";
import { AdminPaymentMerchantsController } from "./admin-payment-merchants.controller";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { ADMIN_PERMISSION_CODES } from "./admin-permissions";
import { AllowConferenceScopedAdmin, CONFERENCE_SCOPED_ACCESS, requireConferenceGrant, SCOPED_ADMIN_PERMISSIONS } from "./conference-scope";
import { CurrentAdmin, RequestWithCurrentAdmin } from "./current-admin";

const admin: CurrentAdmin = {
  id: "scope-admin", username: "scope-admin", displayName: null,
  conferenceScopeMode: "ASSIGNED", conferenceIds: ["granted"], permissions: ["*"]
};

describe("conference grant policy", () => {
  it("allows only the explicit grant for an assigned admin despite wildcard permissions", () => {
    assert.doesNotThrow(() => requireConferenceGrant(admin, "granted"));
    assert.throws(() => requireConferenceGrant(admin, "foreign"), ForbiddenException);
    assert.throws(() => requireConferenceGrant(admin, ""), ForbiddenException);
  });

  it("denies missing or empty grant lists, including missing scope mode", () => {
    for (const actor of [
      { ...admin, conferenceIds: [] }, { ...admin, conferenceIds: undefined },
      { ...admin, conferenceIds: undefined, conferenceScopeMode: undefined }
    ]) assert.throws(() => requireConferenceGrant(actor, "granted"), ForbiddenException);
  });

  it("allows explicit ALL scope without requiring individual grants", () => {
    assert.doesNotThrow(() => requireConferenceGrant({ ...admin, conferenceScopeMode: "ALL", conferenceIds: [] }, "foreign"));
  });
});

describe("AdminJwtAuthGuard scoped route admission", () => {
  for (const controller of [AdminManagementController, AdminExportsController, AdminFinanceController,
    AdminAccessController, AdminPaymentMerchantsController]) {
    it(`default-denies all existing ${controller.name} routes despite broad role permissions`, async () => {
      const handlers = Object.entries(Object.getOwnPropertyDescriptors(controller.prototype))
        .filter(([, descriptor]) => typeof descriptor.value === "function" && Reflect.hasMetadata(PATH_METADATA, descriptor.value));
      assert.ok(handlers.length > 0);
      for (const permissions of [[...ADMIN_PERMISSION_CODES], ["*"]]) {
        const guard = guardFor({ ...admin, permissions });
        for (const [name, descriptor] of handlers) {
          const { context } = httpContext(controller, descriptor.value);
          await assert.rejects(() => guard.canActivate(context), ForbiddenException, `${controller.name}.${name}`);
        }
      }
    });
  }

  it("also default-denies an authenticated legacy session with missing scope mode", async () => {
    const { context } = httpContext(AdminManagementController, AdminManagementController.prototype.listConferences);
    await assert.rejects(() => guardFor({ ...admin, conferenceScopeMode: undefined }).canActivate(context), ForbiddenException);
  });

  it("allows an explicit ALL-scope admin to use existing admin routes", async () => {
    const actor = { ...admin, conferenceScopeMode: "ALL" as const };
    const { context, request } = httpContext(AdminManagementController, AdminManagementController.prototype.listConferences);
    assert.equal(await guardFor(actor).canActivate(context), true);
    assert.equal(request.currentAdmin, actor);
  });

  it("honors the workspace class marker and preserves both authentication and permission guards", async () => {
    const controller = AdminConferenceWorkspaceController;
    assert.equal(Reflect.getMetadata(CONFERENCE_SCOPED_ACCESS, controller), true);
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, controller), [AdminJwtAuthGuard, AdminPermissionGuard]);
    const { context, request } = httpContext(controller, controller.prototype.conferences);
    assert.equal(await guardFor(admin).canActivate(context), true);
    assert.equal(request.currentAdmin, admin);
  });

  it("honors the auth/me handler marker without opening sibling routes", async () => {
    assert.equal(Reflect.getMetadata(CONFERENCE_SCOPED_ACCESS, AdminAuthController), undefined);
    const me = httpContext(AdminAuthController, AdminAuthController.prototype.me);
    assert.equal(await guardFor(admin).canActivate(me.context), true);
    const sibling = httpContext(AdminAuthController, () => undefined);
    await assert.rejects(() => guardFor(admin).canActivate(sibling.context), ForbiddenException);
  });

  it("supports the allow decorator on an individual handler", async () => {
    class Controller {
      @AllowConferenceScopedAdmin()
      allowed() {}
      denied() {}
    }
    assert.equal(await guardFor(admin).canActivate(httpContext(Controller, Controller.prototype.allowed).context), true);
    await assert.rejects(() => guardFor(admin).canActivate(httpContext(Controller, Controller.prototype.denied).context), ForbiddenException);
  });

  it("requires a valid bearer token even on a marked workspace route", async () => {
    let lookups = 0;
    const guard = new AdminJwtAuthGuard({ getCurrentAdminFromToken: async () => {
      lookups += 1;
      return admin;
    } } as unknown as AdminAuthService);
    for (const authorization of [undefined, "", "Basic test", "Bearer", "bearer test"]) {
      const { context, request } = httpContext(AdminConferenceWorkspaceController,
        AdminConferenceWorkspaceController.prototype.conferences, authorization);
      request.headers.authorization = authorization;
      await assert.rejects(() => guard.canActivate(context), UnauthorizedException);
      assert.equal(request.currentAdmin, undefined);
    }
    assert.equal(lookups, 0);
  });

  it("does not bypass role permissions merely because a route allows scoped admins", async () => {
    const permissionGuard = new AdminPermissionGuard(new Reflector());
    const { context } = httpContext(AdminConferenceWorkspaceController, AdminConferenceWorkspaceController.prototype.conferences);
    assert.equal(await guardFor({ ...admin, permissions: [] }).canActivate(context), true);
    assert.throws(() => permissionGuard.canActivate(context), ForbiddenException);
  });

  it("requires both registration:view and registration:export for the marked export route", async () => {
    const permissionGuard = new AdminPermissionGuard(new Reflector());
    for (const permissions of [["registration:view"], ["registration:export"], ["registration:view", "registration:export"]]) {
      const { context } = httpContext(AdminConferenceWorkspaceController, AdminConferenceWorkspaceController.prototype.export);
      await guardFor({ ...admin, permissions }).canActivate(context);
      if (permissions.length === 2) assert.equal(permissionGuard.canActivate(context), true);
      else assert.throws(() => permissionGuard.canActivate(context), ForbiddenException);
    }
  });
});

describe("AdminAuthService conference scope hydration", { concurrency: false }, () => {
  it("intersects a broad role with scoped permissions and loads only explicit conference grants", async context => {
    const { auth, token, state } = authFixture(context);
    const current = await auth.getCurrentAdminFromToken(token);
    assert.equal(current.conferenceScopeMode, "ASSIGNED");
    assert.deepEqual(current.conferenceIds, ["granted"]);
    assert.deepEqual(current.permissions, state.permissions.filter(permission => SCOPED_ADMIN_PERMISSIONS.includes(permission)));
    for (const forbidden of ["*", "payment-merchant:manage", "finance:view", "refund:write", "system:account", "order:delete"]) {
      assert.equal(current.permissions!.includes(forbidden), false, `${forbidden} must not survive scope hydration`);
    }
  });

  it("fails closed to ASSIGNED with no grants if the scope row is absent", async context => {
    const { auth, token, state } = authFixture(context);
    state.scope = null;
    const current = await auth.getCurrentAdminFromToken(token);
    assert.equal(current.conferenceScopeMode, "ASSIGNED");
    assert.deepEqual(current.conferenceIds, []);
    assert.throws(() => requireConferenceGrant(current, "granted"), ForbiddenException);
  });

  it("keeps full role permissions only for explicit ALL scope", async context => {
    const { auth, token, state } = authFixture(context);
    state.scope!.conferenceScopeMode = "ALL";
    state.scope!.conferenceGrants = [];
    const current = await auth.getCurrentAdminFromToken(token);
    assert.equal(current.conferenceScopeMode, "ALL");
    assert.deepEqual(current.permissions, state.permissions);
  });

  it("rechecks grants and mode on every token authentication rather than retaining old authorization", async context => {
    const { auth, token, state } = authFixture(context);
    assert.deepEqual((await auth.getCurrentAdminFromToken(token)).conferenceIds, ["granted"]);
    state.scope!.conferenceGrants = [];
    const revoked = await auth.getCurrentAdminFromToken(token);
    assert.deepEqual(revoked.conferenceIds, []);
    assert.throws(() => requireConferenceGrant(revoked, "granted"), ForbiddenException);
    state.enabled = false;
    await assert.rejects(() => auth.getCurrentAdminFromToken(token), UnauthorizedException);
  });
});

function guardFor(actor: CurrentAdmin) {
  return new AdminJwtAuthGuard({ getCurrentAdminFromToken: async (token: string) => {
    assert.equal(token, "unit-test-token");
    return actor;
  } } as unknown as AdminAuthService);
}

function httpContext(controller: Function, handler: Function, authorization: string | undefined = "Bearer unit-test-token") {
  const request: RequestWithCurrentAdmin & { headers: { authorization?: string } } = { headers: { authorization } };
  const context = {
    getClass: () => controller, getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request })
  } as unknown as ExecutionContext;
  return { context, request };
}

function authFixture(context: TestContext) {
  const originalSecret = process.env.JWT_SECRET;
  const secret = randomBytes(32).toString("hex");
  process.env.JWT_SECRET = secret;
  context.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  const state: {
    enabled: boolean; permissions: string[];
    scope: { conferenceScopeMode: "ALL" | "ASSIGNED"; conferenceGrants: { conferenceId: string }[] } | null;
  } = {
    enabled: true, permissions: [...ADMIN_PERMISSION_CODES, "*"],
    scope: { conferenceScopeMode: "ASSIGNED", conferenceGrants: [{ conferenceId: "granted" }] }
  };
  const prisma = { adminUser: { async findUnique(args: { where: { id: string }; select: { conferenceScopeMode?: boolean } }) {
    assert.equal(args.where.id, admin.id);
    if (args.select.conferenceScopeMode) return structuredClone(state.scope);
    return { id: admin.id, username: admin.username, displayName: null, enabled: state.enabled };
  } } };
  const access = { getAdminPermissions: async () => [...state.permissions] };
  const auth = new AdminAuthService(prisma as unknown as PrismaService, access as unknown as AdminAccessService);
  const now = Math.floor(Date.now() / 1000);
  const token = signJwt({ sub: admin.id, openid: null, type: "admin", iat: now, exp: now + 60 }, secret);
  return { auth, token, state };
}
