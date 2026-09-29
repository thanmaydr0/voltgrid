import assert from "node:assert/strict";
import test from "node:test";
import { offlineAppDataService, offlineAuthService } from "../lib/services/offline";

test("offline auth clearly reports unavailable without inventing an account", async () => {
  assert.deepEqual(await offlineAuthService.getCurrentUser(), {
    status: "unavailable",
    code: "not-configured",
    message: "Account services are not configured. Public previews and chain reads remain available.",
  });
  assert.equal((await offlineAuthService.requestEmailLink({ email: "user@example.test", redirectTo: "/account" })).status, "unavailable");
  assert.equal((await offlineAuthService.signOut()).status, "unavailable");
});

test("offline app data never reports writes or reads as successful", async () => {
  assert.equal((await offlineAppDataService.readPreferences()).status, "unavailable");
  assert.equal((await offlineAppDataService.savePreferences({ displayName: null, defaultScenario: "sunny", compactNavigation: false })).status, "unavailable");
  assert.equal((await offlineAppDataService.listHouseDrafts()).status, "unavailable");
  assert.equal((await offlineAppDataService.listSavedDays()).status, "unavailable");
});
