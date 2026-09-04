import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { assertPublicDnsResolution, assertPublicHttpUrl, assertPublicResolvedAddresses } from "./public-outbound-fetch";

describe("public outbound URL validation", () => {
  it("allows ordinary public HTTPS URLs", () => {
    assert.equal(assertPublicHttpUrl("https://cdn.example.com/image.png").hostname, "cdn.example.com");
  });

  it("blocks loopback, private, link-local, and internal hostnames", () => {
    for (const value of [
      "http://127.0.0.1:3000/admin",
      "http://10.0.0.2/secret",
      "http://169.254.169.254/latest/meta-data",
      "http://192.168.1.2/file",
      "http://service.internal/status",
      "http://[::1]/status"
    ]) {
      assert.throws(() => assertPublicHttpUrl(value), BadRequestException);
    }
  });

  it("rejects a public-looking hostname when DNS resolves to a private address", async () => {
    assert.throws(() => assertPublicResolvedAddresses(["93.184.216.34", "10.0.0.8"]), BadRequestException);
    assert.throws(() => assertPublicResolvedAddresses(["203.0.113.8"]), BadRequestException);
    await assert.rejects(
      () => assertPublicDnsResolution(new URL("https://does-not-resolve.invalid/file")),
      BadRequestException
    );
  });
});
