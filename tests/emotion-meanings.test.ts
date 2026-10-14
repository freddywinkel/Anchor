import assert from "node:assert/strict";
import { test } from "node:test";
import { EMOTION_OPTIONS } from "../src/lib/emotions.ts";
import { EMOTION_MEANINGS } from "../src/lib/emotionMeanings.ts";

test("ieder aangeboden emotiewoord heeft precies één ingevulde betekenis", () => {
  assert.equal(new Set(EMOTION_OPTIONS).size, EMOTION_OPTIONS.length);
  assert.deepEqual(
    Object.keys(EMOTION_MEANINGS).sort(),
    [...EMOTION_OPTIONS].sort(),
  );
  for (const label of EMOTION_OPTIONS) {
    const meaning = EMOTION_MEANINGS[label];
    assert.equal(typeof meaning, "string", `${label}: tekstuele uitleg`);
    assert.ok(meaning.trim(), `${label}: uitleg is niet leeg`);
    assert.notEqual(
      meaning.trim(),
      label,
      `${label}: uitleg gaat verder dan het emotiewoord`,
    );
  }
});
