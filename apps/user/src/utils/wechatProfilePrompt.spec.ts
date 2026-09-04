import assert from "node:assert/strict";
import test from "node:test";
import { isProfilePromptOwnerActive, shouldAutoCheckWechatProfile } from "./wechatProfilePrompt";

test("profile prompt only auto-checks without an existing login token", () => {
  assert.equal(shouldAutoCheckWechatProfile(""), true);
  assert.equal(shouldAutoCheckWechatProfile(null), true);
  assert.equal(shouldAutoCheckWechatProfile("existing-token"), false);
});

test("profile prompt events only reach the currently visible page owner", () => {
  const hiddenPage = {};
  const activePage = {};

  assert.equal(isProfilePromptOwnerActive(activePage, [hiddenPage, activePage]), true);
  assert.equal(isProfilePromptOwnerActive(hiddenPage, [hiddenPage, activePage]), false);
  assert.equal(isProfilePromptOwnerActive(null, [activePage]), false);
});
