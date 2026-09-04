import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findForbiddenProductionArtifact } from "../../scripts/production-artifact-scan";

describe("production artifact scan", () => {
  it("does not mistake the VConsole environment guard for an embedded debugger", () => {
    const compiledGuard = 'if (env.VITE_ENABLE_VCONSOLE === "true") throw new Error("VITE_ENABLE_VCONSOLE must be disabled")';
    assert.equal(findForbiddenProductionArtifact(compiledGuard), null);
  });

  it("detects actual local API URLs", () => {
    assert.equal(findForbiddenProductionArtifact('const api = "http://localhost:3001/api"')?.label, "a local or private API URL");
    assert.equal(findForbiddenProductionArtifact('const api = "https://192.168.1.20/api"')?.label, "a local or private API URL");
  });

  it("detects an embedded VConsole runtime while allowing the production API", () => {
    assert.equal(findForbiddenProductionArtifact("new VConsole()")?.label, "a VConsole runtime");
    assert.equal(findForbiddenProductionArtifact('const api = "https://guanchaohuiji.com/api"'), null);
  });
});
