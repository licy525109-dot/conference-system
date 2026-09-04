import assert from "node:assert/strict";
import test from "node:test";
import { shouldRecoverAuthentication } from "./auth-recovery";

test("recovers one authenticated request after a 401 response", () => {
  assert.equal(shouldRecoverAuthentication({
    statusCode: 401,
    authEnabled: true,
    alreadyRetried: false,
    path: "/notifications/my"
  }), true);
});

test("does not loop, recover public requests, or recover non-auth failures", () => {
  assert.equal(shouldRecoverAuthentication({
    statusCode: 401,
    authEnabled: true,
    alreadyRetried: true,
    path: "/notifications/my"
  }), false);
  assert.equal(shouldRecoverAuthentication({
    statusCode: 401,
    authEnabled: false,
    alreadyRetried: false,
    path: "/notifications/my"
  }), false);
  assert.equal(shouldRecoverAuthentication({
    statusCode: 401,
    authEnabled: true,
    alreadyRetried: false,
    path: "/auth/wechat/login"
  }), false);
  assert.equal(shouldRecoverAuthentication({
    statusCode: 500,
    authEnabled: true,
    alreadyRetried: false,
    path: "/notifications/my"
  }), false);
});
