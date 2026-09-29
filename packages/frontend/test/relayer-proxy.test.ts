import assert from "node:assert/strict";
import test from "node:test";
import { isAdminRelayerPath } from "../lib/relayer-proxy-policy";

test("public relayer proxy blocks operator paths after URL normalization", () => {
  assert.equal(isAdminRelayerPath(["v1", "admin", "reset"]), true);
  assert.equal(isAdminRelayerPath(["v1", "x", "..", "admin", "reset"]), true);
  assert.equal(isAdminRelayerPath(["v1", "auth", "challenge"]), false);
});
