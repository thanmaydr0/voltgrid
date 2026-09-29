import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthCallbackUrl,
  getSafeReturnPath,
  isAllowedAuthRedirect,
} from "../lib/supabase/redirects";
import {
  normalizeDayId,
  normalizeEvmAddress,
  validateDraft,
  validateSavedDay,
} from "../lib/supabase/validation";
import { toSupabaseFailure } from "../lib/supabase/errors";

test("auth callback paths stay same-origin and reject open redirects", () => {
  assert.equal(getSafeReturnPath("/settings?tab=account"), "/settings?tab=account");
  assert.equal(getSafeReturnPath("https://attacker.example/"), "/");
  assert.equal(getSafeReturnPath("//attacker.example/"), "/");
  assert.equal(getSafeReturnPath("/\\attacker"), "/");

  const callback = buildAuthCallbackUrl("http://localhost:3000", "/settings?tab=account");
  assert.equal(isAllowedAuthRedirect(callback, "http://localhost:3000"), true);
  assert.equal(isAllowedAuthRedirect(callback, "http://127.0.0.1:3000"), false);
  assert.equal(isAllowedAuthRedirect("https://attacker.example/auth/callback?next=%2F", "http://localhost:3000"), false);
});

test("data validators normalize chain references and reject unsafe shapes", () => {
  assert.equal(normalizeEvmAddress("0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD"), "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
  assert.equal(normalizeDayId(`0x${"A".repeat(64)}`), `0x${"a".repeat(64)}`);

  const draft = {
    draftId: "00000000-0000-4000-8000-0000000000aa",
    label: "Home draft",
    solarEnabled: true,
    batteryEnabled: true,
    batteryCapacityWh: 1000,
    updatedAtISO: "2026-09-29T00:00:00.000Z",
  } as const;
  assert.doesNotThrow(() => validateDraft(draft));
  assert.throws(() => validateDraft({ ...draft, batteryEnabled: false }), /battery capacity/i);

  const savedDay = {
    dayId: `0x${"a".repeat(64)}` as `0x${string}`,
    chainId: 91562037,
    marketAddress: `0x${"b".repeat(40)}` as `0x${string}`,
    scenario: "sunny" as const,
    seed: "validator-test",
    savedAtISO: "2026-09-29T00:00:00.000Z",
  };
  assert.doesNotThrow(() => validateSavedDay(savedDay));
  assert.throws(() => validateSavedDay({ ...savedDay, chainId: 0 }), /chain id/i);
});

test("account outage and expired-session errors remain actionable without hiding public mode", () => {
  assert.deepEqual(toSupabaseFailure(new Error("Failed to fetch"), "saved day read"), {
    status: "error",
    code: "network-error",
    message: "Account saved day read could not reach Supabase. Check your connection and retry.",
  });
  assert.equal(toSupabaseFailure(new Error("JWT expired"), "preference read").code, "session-expired");
});
