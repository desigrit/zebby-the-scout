import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { onlineAnalysis } from "../desktop/online-analysis.ts";
import { boardModelContract, validatedBoardExtraction } from "../shared/boards.ts";

const { input, expected } = JSON.parse(process.env.ZEBBY_QA_FIGMA_SAMPLE ||
  await readFile(new URL("../qa-output/boards-reader/figma-sample.json", import.meta.url), "utf8"));
assert.ok(Object.values(expected).includes(true) && Object.values(expected).includes(false));
for (const [model, key] of [["gpt-6-luna", process.env.OPENAI_API_KEY], ["claude-haiku-5-5", process.env.ANTHROPIC_API_KEY]]) {
  assert.ok(key, "The provider key for " + model + " is missing.");
  const { result } = await onlineAnalysis({ model, key, input, kind: "board_extract", ...boardModelContract(input),
    thinkingLevel: "low", maxOutputTokens: 1024 });
  assert.deepEqual(validatedBoardExtraction(result, input), { decisions: expected });
  console.log("Live Figma Product instructions passed for", model);
  if (process.env.ZEBBY_QA_VISUAL_SAMPLE) {
    const visual = JSON.parse(process.env.ZEBBY_QA_VISUAL_SAMPLE);
    const read = await onlineAnalysis({ model, key, input: visual.input, kind: "board_extract", ...boardModelContract(visual.input),
      thinkingLevel: "low", maxOutputTokens: 8192 });
    const result = validatedBoardExtraction(read.result, visual.input);
    assert.deepEqual(result.listings.map(item => item.id).sort(), visual.expected.listingIds.slice().sort());
    assert.equal(result.nextControlId, visual.expected.nextControlId);
    assert.ok(result.listings.every(item => /Senior Product Manager/i.test(item.title)));
    assert.equal(result.expectedTotal, 2); assert.equal(result.empty, false);
    console.log("Visual board titles and unlabeled navigation passed for", model);
  }
}
