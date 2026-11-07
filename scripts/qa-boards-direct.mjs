import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { onlineAnalysis } from "../desktop/online-analysis.ts";
import { boardModelContract, validatedBoardExtraction } from "../shared/boards.ts";

const { input, expected } = JSON.parse(process.env.ZEBBY_QA_FIGMA_SAMPLE ||
  await readFile(new URL("../qa-output/boards-reader/figma-sample.json", import.meta.url), "utf8"));
assert.ok(Object.values(expected).includes(true) && Object.values(expected).includes(false));
async function verifiedRead(model, key, input, maxOutputTokens) {
  let last;
  // Match the scanner's bounded retry for invalid or interrupted responses.
  // Expected titles, criteria and navigation are asserted after validation.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { result } = await onlineAnalysis({ model, key, input, kind: "board_extract", ...boardModelContract(input),
        thinkingLevel: "low", maxOutputTokens });
      return validatedBoardExtraction(result, input);
    } catch (error) {
      last = error;
      if (attempt === 0) console.log("Retrying provider verification for", model, input.task);
    }
  }
  throw last;
}
for (const [model, key] of [["gpt-6-luna", process.env.OPENAI_API_KEY], ["claude-haiku-5-5", process.env.ANTHROPIC_API_KEY]]) {
  assert.ok(key, "The provider key for " + model + " is missing.");
  assert.deepEqual(await verifiedRead(model, key, input, 1024), { decisions: expected });
  console.log("Live Figma Product instructions passed for", model);
  if (process.env.ZEBBY_QA_VISUAL_SAMPLE) {
    const visual = JSON.parse(process.env.ZEBBY_QA_VISUAL_SAMPLE);
    const result = await verifiedRead(model, key, visual.input, 8192);
    assert.deepEqual(result.listings.map(item => item.id).sort(), visual.expected.listingIds.slice().sort());
    assert.equal(result.nextControlId, visual.expected.nextControlId);
    assert.ok(result.listings.every(item => /Senior Product Manager/i.test(item.title)));
    assert.equal(result.expectedTotal, 2); assert.equal(result.empty, false);
    console.log("Visual board titles and unlabeled navigation passed for", model);
  }
  if (process.env.ZEBBY_QA_THOROUGH_SAMPLE) {
    const sample = JSON.parse(process.env.ZEBBY_QA_THOROUGH_SAMPLE);
    const result = await verifiedRead(model, key, sample.input, 8192);
    assert.deepEqual(result.listings.map(item => item.id).sort(), sample.expected.listingIds.slice().sort());
    assert.ok(result.listings.every(item => /Senior Product Manager/i.test(item.title)));
    console.log("Thorough page coverage and bounded actions passed for", model);
  }
}
