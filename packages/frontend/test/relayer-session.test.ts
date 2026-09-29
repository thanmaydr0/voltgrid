import assert from "node:assert/strict";
import test from "node:test";
import { clearRelayerSession, readRelayerSession, storeRelayerSession } from "../lib/relayer";

test("relayer bearer stays in memory and expired sessions are discarded", () => {
  const session = { address: `0x${"a".repeat(40)}`, accessToken: "short-lived-test-token", expiresAt: Date.now() + 60_000 };
  storeRelayerSession(session);
  assert.deepEqual(readRelayerSession(), session);
  storeRelayerSession({ ...session, expiresAt: Date.now() - 1 });
  assert.equal(readRelayerSession(), null);
  clearRelayerSession();
});
