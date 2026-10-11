import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, type CodRow } from "@/lib/hooks/use-cod";

const row = (p: Partial<CodRow> & { id: string }): CodRow => ({
  order_id: "o-" + p.id,
  rider_id: "r1",
  rider_name: "Ravi",
  expected_paise: 10000,
  collected_paise: null,
  remitted_paise: null,
  outstanding_paise: 0,
  collection_variance_paise: 0,
  collected_at: null,
  remitted_at: null,
  ...p,
});

test("COD summary: out-for-delivery is pending, delivered is outstanding, settled drops out", () => {
  const rows = [
    row({ id: "a", collected_paise: 10000, collected_at: "2026-10-11T10:00:00Z", outstanding_paise: 10000 }),
    row({ id: "b", collected_paise: 9500, collected_at: "2026-10-11T11:00:00Z", outstanding_paise: 9500, collection_variance_paise: -500 }),
    row({ id: "c" }), // still riding
    row({ id: "d", collected_paise: 10000, collected_at: "2026-10-10T10:00:00Z", remitted_paise: 10000, remitted_at: "2026-10-10T20:00:00Z", outstanding_paise: 0 }),
    row({ id: "e", rider_id: "r2", rider_name: "Sunil", collected_paise: 5000, collected_at: "2026-10-11T12:00:00Z", outstanding_paise: 5000 }),
  ];
  const s = summarize(rows);
  assert.equal(s.length, 2);
  assert.equal(s[0].riderName, "Ravi"); // most outstanding first
  assert.equal(s[0].outstandingPaise, 19500);
  assert.deepEqual(s[0].openRows.map((r) => r.id), ["a", "b"]);
  assert.equal(s[0].pendingPaise, 10000);
  assert.deepEqual(s[0].pendingRows.map((r) => r.id), ["c"]);
  assert.equal(s[1].outstandingPaise, 5000);
});
