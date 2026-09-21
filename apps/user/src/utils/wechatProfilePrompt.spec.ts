import assert from "node:assert/strict";
import test from "node:test";
import {
  isProfilePromptOwnerActive,
  isWechatProfileComplete,
  shouldAutoCheckWechatProfile,
  shouldOpenWechatProfilePrompt
} from "./wechatProfilePrompt";

test("page switches never trigger an automatic login or profile prompt", () => {
  assert.equal(shouldAutoCheckWechatProfile(""), false);
  assert.equal(shouldAutoCheckWechatProfile(null), false);
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
    realName: "测试嘉宾",
    phoneVerifiedAt: "2026-09-21T00:00:00Z",
    phone: "13800138000",
    wechatNickname: "观潮用户",
    wechatAvatarUrl: "https://example.com/avatar.jpg"
  };

  assert.equal(isWechatProfileComplete(completeProfile), true);
  assert.equal(shouldOpenWechatProfilePrompt(completeProfile), false);
  assert.equal(shouldOpenWechatProfilePrompt(completeProfile, { force: true }), true);
});

test("a default name avatar is enough, but an unverified contact phone is not", () => {
  assert.equal(isWechatProfileComplete({ realName: "嘉宾", phone: "13800138000", phoneVerifiedAt: "2026-09-21" }), true);
  assert.equal(isWechatProfileComplete({ realName: "嘉宾", phone: "13800138000" }), false);
});

test("automatic profile prompts open only for genuinely missing fields", () => {
  assert.equal(isWechatProfileComplete(null), false);
  assert.equal(shouldOpenWechatProfilePrompt({
    phone: "13800138000",
    wechatNickname: " ",
    wechatAvatarUrl: "https://example.com/avatar.jpg"
  }), true);
});
