import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "../src/index.js";

test("module loads", () => {
  assert.equal(typeof redactSecrets, "function");
});
