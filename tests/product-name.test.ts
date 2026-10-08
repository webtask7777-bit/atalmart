import { test } from "node:test";
import assert from "node:assert/strict";
import { familyName, siblingKey, packagingType, sellableName } from "@/lib/product-name";

test("familyName strips the trailing size bracket only", () => {
  assert.equal(familyName("Amul Taaza Milk (500 ml)"), "Amul Taaza Milk");
  assert.equal(familyName("Aashirvaad Atta Pouch (1 kg)"), "Aashirvaad Atta Pouch");
  assert.equal(familyName("Amul Taaza Tetrapack (1 L)"), "Amul Taaza Tetrapack");
  assert.equal(familyName("Maggi Pack of 4 (280 g)"), "Maggi");
  assert.equal(familyName("Devbhog Shrikhand"), "Devbhog Shrikhand");
  assert.equal(familyName("Lays (Magic Masala)"), "Lays (Magic Masala)", "non-size brackets survive");
});

test("siblingKey also drops the packaging word", () => {
  assert.equal(siblingKey("Aashirvaad Atta Pouch (1 kg)"), siblingKey("Aashirvaad Atta Bag (5 kg)"));
  assert.equal(packagingType("Aashirvaad Atta Pouch (1 kg)"), "Pouch");
  assert.equal(packagingType("Amul Taaza Milk (500 ml)"), null);
});

test("sellableName never doubles the pack", () => {
  assert.equal(sellableName("Amul Taaza Milk (500 ml)", "1 L"), "Amul Taaza Milk (1 L)");
  assert.equal(sellableName("Amul Taaza Milk (500 ml)", "500 ml"), "Amul Taaza Milk (500 ml)");
  assert.equal(sellableName("Amul Taaza Milk 1L", "1 L"), "Amul Taaza Milk 1L");
  assert.equal(sellableName("Devbhog Shrikhand", ""), "Devbhog Shrikhand");
});
