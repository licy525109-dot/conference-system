import assert from "node:assert/strict";
import test from "node:test";
import { createQrMatrix } from "./qr";
test("existing QR component can render the versioned single-attendee credential", () => {
  const payload = `CONF_REG:${"r".repeat(25)}:REG20260921EXAMPLE:${"s".repeat(22)}:123:${"a".repeat(25)}`;
  const matrix = createQrMatrix(payload);
  assert.equal(matrix.length, 45);
  assert.ok(matrix.every(row => row.length === 45));
  const pixels = matrix.flat();
  assert.ok(pixels.filter(Boolean).length > 400);
  assert.ok(pixels.filter(value => !value).length > 400);
});
