import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { generatePublicId } from "../lib/booking/publicId.js";

describe("generatePublicId", () => {
  test("segue o formato AGD-XXXXXXXX", () => {
    const id = generatePublicId();
    assert.match(id, /^AGD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  test("não repete em várias gerações seguidas (baixíssima chance de colisão)", () => {
    const ids = new Set(Array.from({ length: 200 }, () => generatePublicId()));
    assert.equal(ids.size, 200);
  });
});
