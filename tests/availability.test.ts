import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAvailability } from "@/lib/availability";

test("T11 — busy maps to capacity_paused: no ETA, no ordering, cart retained", () => {
  const a = deriveAvailability({ storeStatus: "busy", settingsHydrated: true, serviceable: true });
  assert.equal(a.state, "capacity_paused");
  assert.equal(a.showEta, false);
  assert.equal(a.canOrder, false);
  assert.match(a.body, /cart saved/i);
});

test("T12 — closed shows only the operator-supplied line, never an invented time", () => {
  const def = deriveAvailability({ storeStatus: "opening_soon", settingsHydrated: true });
  assert.equal(def.state, "closed");
  assert.doesNotMatch(def.body, /\d{1,2}(:\d{2})?\s*(am|pm|baje)/i);
  const custom = deriveAvailability({ storeStatus: "opening_soon", settingsHydrated: true, customMessage: "Kal subah 7 baje se" });
  assert.equal(custom.body, "Kal subah 7 baje se");
});

test("T13 — unknown while settings are not loaded", () => {
  const a = deriveAvailability({ storeStatus: "open", settingsHydrated: false });
  assert.equal(a.state, "unknown");
  assert.equal(a.showEta, false);
});

test("open store + unserviceable pincode → unserviceable; open + serviceable → open with ETA allowed", () => {
  assert.equal(deriveAvailability({ storeStatus: "open", settingsHydrated: true, serviceable: false }).state, "unserviceable");
  const open = deriveAvailability({ storeStatus: "open", settingsHydrated: true, serviceable: true });
  assert.equal(open.state, "open");
  assert.equal(open.showEta, true);
  assert.equal(open.canOrder, true);
  // No pincode yet is still "open" (browsing), the checkout enforces the area.
  assert.equal(deriveAvailability({ storeStatus: "open", settingsHydrated: true, serviceable: null }).state, "open");
});

test("store status wins over pincode", () => {
  assert.equal(deriveAvailability({ storeStatus: "busy", settingsHydrated: true, serviceable: false }).state, "capacity_paused");
});
