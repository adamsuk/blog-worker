import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAllowedOrigin, wwwVariant } from "../cors.js";

const UI = "https://sradams.co.uk";

test("wwwVariant maps apex <-> www", () => {
  assert.equal(wwwVariant("https://sradams.co.uk"), "https://www.sradams.co.uk");
  assert.equal(wwwVariant("https://www.sradams.co.uk"), "https://sradams.co.uk");
  assert.equal(wwwVariant("not a url"), null);
});

test("allows the UI origin and its www variant", () => {
  assert.equal(resolveAllowedOrigin(UI, UI), UI);
  assert.equal(
    resolveAllowedOrigin("https://www.sradams.co.uk", UI),
    "https://www.sradams.co.uk"
  );
});

test("allows Pages previews and Codespaces", () => {
  for (const o of [
    "https://sradams-co-uk-content.pages.dev",
    "https://abc123.sradams-co-uk-content.pages.dev",
    "https://my-space-3000.app.github.dev",
  ]) {
    assert.equal(resolveAllowedOrigin(o, UI), o);
  }
});

test("falls back to the UI URL for anything else", () => {
  for (const o of [
    "",
    null,
    "https://www.sradams.co.uk.evil.com",
    "https://evilsradams.co.uk",
    "http://www.sradams.co.uk",
    "https://www.www.sradams.co.uk",
  ]) {
    assert.equal(resolveAllowedOrigin(o, UI), UI);
  }
});
