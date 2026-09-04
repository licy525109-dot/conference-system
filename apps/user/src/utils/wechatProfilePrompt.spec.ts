import assert from "node:assert/strict";
import test from "node:test";
import {
  isProfilePromptOwnerActive,
  isWechatProfileComplete,
  shouldAutoCheckWechatProfile,
  shouldOpenWechatProfilePrompt
} from "./wechatProfilePrompt";

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

test("automatic profile prompts stay closed when the profile is complete", () => {
  const completeProfile = {
    phone: "13800138000",
    wechatNickname: "观潮用户",
    wechatAvatarUrl: "https://example.com/avatar.jpg"
  };

  assert.equal(isWechatProfileComplete(completeProfile), true);
  assert.equal(shouldOpenWechatProfilePrompt(completeProfile), false);
  assert.equal(shouldOpenWechatProfilePrompt(completeProfile, { force: true }), true);
});

test("automatic profile prompts open only for genuinely missing fields", () => {
  assert.equal(isWechatProfileComplete(null), false);
  assert.equal(shouldOpenWechatProfilePrompt({
    phone: "13800138000",
    wechatNickname: " ",
    wechatAvatarUrl: "https://example.com/avatar.jpg"
  }), true);
});
