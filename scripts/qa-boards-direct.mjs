import assert from "node:assert/strict";
import { onlineAnalysis } from "../desktop/online-analysis.ts";
import { boardModelContract, validatedBoardExtraction } from "../shared/boards.ts";

const input = { task: "roles", criteria: "Only Product Managers in Product.",
  candidates: [{ id: "l0", url: "https://example.org/jobs/1", title: "Product Manager", department: "Product", text: "Product Manager" },
    { id: "l1", url: "https://example.org/jobs/2", title: "Account Executive", department: "Sales", text: "Account Executive" }] };
for (const [model, key] of [["gpt-6-luna", process.env.OPENAI_API_KEY], ["claude-haiku-5-5", process.env.ANTHROPIC_API_KEY]]) {
  assert.ok(key, "The provider key for " + model + " is missing.");
  const { result } = await onlineAnalysis({ model, key, input, kind: "board_extract", ...boardModelContract(input),
    thinkingLevel: "low", maxOutputTokens: 1024 });
  assert.deepEqual(validatedBoardExtraction(result, input), { decisions: { l0: true, l1: false } });
  console.log("Direct Boards request passed for", model);
}
