import { test } from "node:test";
import assert from "node:assert/strict";
import { expandQueryTerms, matchProductType, rankSearchResults, searchScore, matchesQuery } from "@/lib/search-rank";

const P = (id: string, name: string, subcategory: string | null, extra: Partial<{ description: string; name_hi: string; stock: number }> = {}) => ({
  id, name, subcategory, stock: 10, description: null, name_hi: null, ...extra,
});

const CATALOGUE = [
  P("1", "Wagh Bakri Instant Masala Tea", "Tea", { description: "Just add hot milk" }),
  P("2", "Toblerone Milk Chocolate", "Chocolates"),
  P("3", "Amul Buffalo Ghee 500ml", "Ghee", { description: "Made from buffalo milk" }),
  P("4", "Amul Lassi (1 L)", "Curd & Yogurt", { description: "Sweet milk drink" }),
  P("5", "Devbhog Shrikhand", "Khova & Cream", { description: "Made from fresh milk curd" }),
  P("6", "Devbhog Elaichi Flavoured Milk", "Milk"),
  P("7", "Amul Taaza Milk (500 ml)", "Milk", { name_hi: "अमूल ताज़ा दूध" }),
  P("8", "Mother Dairy Toned Milk", "Milk", { name_hi: "मदर डेयरी टोंड दूध" }),
  P("9", "Amul Gold Milk (1 L)", "Milk", { stock: 0 }),
  P("10", "Nestle Milkmaid", "Khova & Cream"),
];

test("T14 — generic milk intent: ordinary milk first, derivatives later, description-only last", () => {
  for (const q of ["milk", "doodh", "दूध", "Milk "]) {
    const ranked = rankSearchResults(CATALOGUE, q).map((p) => p.id);
    const top = ranked.slice(0, 2);
    assert.ok(top.includes("7") && top.includes("8"), `${q}: ordinary milk leads (${ranked.join(",")})`);
    assert.ok(ranked.indexOf("6") > ranked.indexOf("8"), `${q}: flavoured milk after plain milk`);
    assert.ok(ranked.indexOf("6") < ranked.indexOf("2"), `${q}: flavoured milk before milk chocolate`);
    assert.ok(ranked.indexOf("5") > ranked.indexOf("10"), `${q}: shrikhand (description only) after Milkmaid (name)`);
    assert.equal(ranked[ranked.length - 1], "9", `${q}: out-of-stock milk sinks to the end`);
  }
});

test("exact named-product queries still find their own product first", () => {
  assert.equal(rankSearchResults(CATALOGUE, "Devbhog Shrikhand")[0].id, "5");
  assert.equal(rankSearchResults(CATALOGUE, "toblerone")[0].id, "2");
  assert.equal(rankSearchResults(CATALOGUE, "lassi")[0].id, "4");
});

test("aliases expand both ways and are capped", () => {
  assert.deepEqual(expandQueryTerms("दूध"), ["दूध", "milk", "doodh", "dudh"]);
  assert.deepEqual(expandQueryTerms("milk"), ["milk", "दूध", "doodh", "dudh"]);
  assert.ok(expandQueryTerms("milk").includes("दूध"));
  assert.deepEqual(expandQueryTerms("haldiram bhujia"), ["haldiram bhujia"]);
  assert.equal(matchProductType("Dahi")?.key, "curd");
  assert.equal(matchProductType("milk chocolate"), null);
});

test("matchesQuery mirrors the server ILIKE across name, name_hi and description", () => {
  assert.ok(matchesQuery(CATALOGUE[6], "दूध"));
  assert.ok(matchesQuery(CATALOGUE[6], "doodh"), "alias reaches the English name");
  assert.ok(matchesQuery(CATALOGUE[0], "milk"), "description match");
  assert.ok(!matchesQuery(CATALOGUE[1], "ghee"));
});

test("score tiers", () => {
  assert.equal(searchScore(CATALOGUE[6], "milk"), 0);
  assert.equal(searchScore(CATALOGUE[5], "milk"), 0.5);
  assert.equal(searchScore(CATALOGUE[1], "milk"), 1);
  assert.equal(searchScore(CATALOGUE[9], "milk"), 2, "'Milkmaid' is a substring, not a word");
  assert.equal(searchScore(CATALOGUE[0], "milk"), 3);
});
