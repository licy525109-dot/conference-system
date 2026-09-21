import assert from "node:assert/strict";
import test from "node:test";
import { getPageLoadFeedback, isRecoverableConnectionFailure } from "./page-load-feedback";

const fallback = "会议暂时无法读取";

test("confirmed offline uses a calm connection message instead of a program failure", () => {
  for (const error of [null, new Error("unavailable"), { errMsg: "request:fail" }]) {
    const state = getPageLoadFeedback(error, "offline", fallback);
    assert.equal(state.kind, "offline");
    assert.equal(state.title, "网络未连接");
    assert.equal(state.tone, "network");
    assert.match(state.message, /Wi-Fi.*移动网络/);
    assert.match(state.message, /自动加载/);
    assert.doesNotMatch(state.title + state.message, /加载失败|程序错误/);
  }
});

test("connection failure does not claim the device is offline without evidence", () => {
  for (const network of ["online", "unknown"] as const) {
    for (const errMsg of ["request:fail", "request:fail ERR_NAME_NOT_RESOLVED", "request:fail ssl hand shake error"]) {
      const state = getPageLoadFeedback({ errMsg }, network, fallback);
      assert.equal(state.kind, "connection");
      assert.notEqual(state.title, "网络未连接");
      assert.doesNotMatch(state.message, /ssl|ERR_NAME|request:fail/);
    }
  }
});

test("timeouts are distinct from disconnection and HTTP failures", () => {
  for (const errMsg of ["request:fail timeout", "connection timed out"]) {
    assert.equal(getPageLoadFeedback({ errMsg }, "online", fallback).kind, "timeout");
  }
  assert.equal(getPageLoadFeedback({ statusCode: 504, errMsg: "timeout" }, "online", fallback).kind, "server");
});

test("HTTP errors and local exceptions are not disguised as guest network problems", () => {
  for (const statusCode of [401, 403, 404, 429]) {
    const state = getPageLoadFeedback({ statusCode }, "online", fallback);
    assert.equal(state.kind, "other");
    assert.equal(state.message, fallback);
  }
  for (const statusCode of [500, 502, 503]) {
    assert.equal(getPageLoadFeedback({ statusCode }, "online", fallback).title, "服务暂时繁忙");
  }
  const state = getPageLoadFeedback(new TypeError("bad data"), "online", fallback);
  assert.equal(state.kind, "other");
  assert.equal(state.message, fallback);
});

test("reconnect recovery is limited to connection failures", () => {
  for (const kind of ["offline", "connection", "timeout"] as const) assert.equal(isRecoverableConnectionFailure(kind), true);
  for (const kind of ["server", "other"] as const) assert.equal(isRecoverableConnectionFailure(kind), false);
});
