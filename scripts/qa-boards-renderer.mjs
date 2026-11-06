import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function checkBoardsRenderer(page, nav) {
  const output = path.resolve(".impeccable/review"); await mkdir(output, { recursive: true });
  await page.evaluate(() => {
    let state = { filePath: "OneDrive/Work-boards.sqlite", filename: "Work-boards.sqlite", dirty: false, error: "", boards: [], progress: [] };
    const listeners = new Set(), publish = () => { for (const listener of listeners) listener(structuredClone(state)); };
    window.boardsQA = { get: () => state, set: change => { state = { ...state, ...change }; publish(); }, checks: [], reviews: [], failedAdd: false };
    Object.assign(window.desktop, {
      boardsState: async () => structuredClone(state), onBoardsChanged: listener => { listeners.add(listener); return () => listeners.delete(listener); },
      addBoards: async inputs => {
        if (window.boardsQA.failedAdd) throw new Error("This board link is already saved.");
        const added = inputs.map((input, index) => ({ ...input, id: String(state.boards.length + index), revision: 1, lastCheckedAt: "", lastCheckId: 0, newCount: 0, totalCount: 0, error: "", createdAt: "2026-11-04T12:00:00Z" }));
        state.boards.push(...added);
        state.progress = added.map(board => ({ boardId: board.id, requestId: board.id, phase: "queued", message: "Waiting to check" }));
        publish(); return state;
      },
      updateBoard: async (id, input) => { Object.assign(state.boards.find(board => board.id === id), input); publish(); return state; },
      removeBoard: async id => { state.boards = state.boards.filter(board => board.id !== id); publish(); return state; },
      checkBoards: async ids => { window.boardsQA.checks.push(ids || state.boards.map(board => board.id));
        state.progress = (ids || state.boards.map(board => board.id)).map(boardId => ({ boardId, requestId: boardId, phase: "reading", message: "Reading page 2" })); publish(); return state; },
      cancelBoardCheck: async id => { state.progress = state.progress.filter(entry => entry.boardId !== id); publish(); return true; },
      markBoardReviewed: async (id, through) => { window.boardsQA.reviews.push({ id, through }); state.boards.find(board => board.id === id).newCount = 0; publish(); return state; },
      retryBoardsSave: async () => { state.dirty = false; state.error = ""; publish(); return state; },
      saveBoardsRecovery: async () => { state.dirty = false; state.error = ""; publish(); return state; },
    });
  });
  async function capture(name) {
    await page.evaluate(async () => { await document.fonts.ready;
      await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))); });
    assert.equal(await page.locator(".desktop-workspace").evaluate(element => element.scrollWidth > element.clientWidth), false, name + " has no horizontal overflow");
    if (process.env.ZEBBY_CAPTURE_BOARDS === "1") await page.screenshot({ path: path.join(output, name + ".png") });
  }
  await nav.getByRole("button", { name: "Boards", exact: true }).click();
  await page.locator(".boards-title").getByText("BETA", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add your first boards" }).click();
  const links = page.getByRole("textbox", { name: "Board links", exact: true });
  await links.fill("https://slack.com/careers/dept/product\nhttps://jobs.uber.com/en/jobs/?team=Product&countries=United+States\nhttps://www.metacareers.com/jobsearch/?q=Product%20Manager");
  const instructions = page.getByRole("textbox", { name: "Tracking instructions (optional)" });
  const seniorRoles = "Look for Senior or Principal Product Manager roles only.";
  await instructions.fill(seniorRoles);
  await page.getByText("These instructions apply to each link above.", { exact: false }).waitFor();
  await capture("boards-add");
  const pasted = await links.inputValue();
  page.once("dialog", dialog => dialog.dismiss()); await page.getByRole("button", { name: "Add boards", exact: true }).click();
  assert.equal(await links.inputValue(), pasted, "Add boards preserves an existing draft when cancelled");
  page.once("dialog", dialog => dialog.dismiss()); await page.keyboard.press("Control+n");
  assert.equal(await links.inputValue(), pasted, "Ctrl+N preserves an existing draft when cancelled");
  page.once("dialog", dialog => dialog.dismiss()); await nav.getByRole("button", { name: "Settings", exact: true }).click();
  assert.equal(await links.isVisible(), true, "Cancelling navigation preserves the board draft");
  await page.evaluate(() => { window.boardsQA.failedAdd = true; }); await page.getByRole("button", { name: "Add and check" }).click();
  await page.getByRole("alert").filter({ hasText: "already saved" }).waitFor(); assert.ok((await links.inputValue()).includes("slack.com"));
  assert.equal(await instructions.inputValue(), seniorRoles);
  await page.evaluate(() => { window.boardsQA.failedAdd = false; }); await page.getByRole("button", { name: "Add and check" }).click();
  await page.locator(".board-row").nth(2).waitFor(); assert.equal(await page.locator(".board-row").count(), 3);
  assert.equal(await page.locator(".board-row").getByText(seniorRoles, { exact: true }).count(), 3);
  assert.equal(await page.getByText("Indexing", { exact: true }).count(), 3, "Queued first scans show Indexing");
  assert.equal(await page.locator(".board-match-total").count(), 0, "Unfinished first scans never show a misleading zero");
  await capture("boards-indexing");
  const third = page.getByRole("article", { name: "Meta", exact: true });
  await third.getByRole("button", { name: "Cancel check" }).click();
  await third.getByText("Not indexed", { exact: true }).waitFor();
  await third.getByRole("button", { name: "Check for updates" }).click();
  await third.getByText("Indexing", { exact: true }).waitFor();
  await page.evaluate(() => window.boardsQA.set({ progress: [], boards: window.boardsQA.get().boards.map((board, index) => ({ ...board,
    instructions: index === 0 ? board.instructions : "",
    lastCheckedAt: "2026-11-04T16:30:00Z", lastCheckId: 10 + index, totalCount: 20, newCount: index === 0 ? 4 : 0,
    error: index === 2 ? "The board's results did not finish loading. The last successful check is unchanged." : "" })) }));
  const first = page.getByRole("article", { name: "Slack", exact: true }); await first.getByText("4 new listings", { exact: true }).waitFor();
  assert.equal(await page.locator(".board-match-total").count(), 3, "Every board shows coverage, including boards without instructions");
  await first.getByRole("button", { name: "Edit Slack board" }).click();
  assert.equal(await instructions.inputValue(), seniorRoles);
  await instructions.fill("Look under the Product heading for product manager roles.");
  await page.getByText("Changing the link or instructions starts a new baseline on the next check.").waitFor();
  const company = page.getByRole("textbox", { name: "Company name (optional)" });
  await company.fill("Slack Product"); page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Edit Uber board" }).click();
  assert.equal(await company.inputValue(), "Slack Product", "Editing another row cannot silently replace a draft");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await first.getByText(seniorRoles, { exact: true }).waitFor();
  await first.getByText("20 listings checked · 20 match your instructions").waitFor();
  await capture("boards-desktop-light"); await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
  await capture("boards-desktop-dark"); await page.setViewportSize({ width: 790, height: 620 }); await capture("boards-compact-dark");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; }); await capture("boards-compact-light");
  await page.setViewportSize({ width: 1550, height: 850 });
  for (const platform of ["win32", "darwin"]) {
    await page.evaluate(platform => { window.modelQA.setDatabase({ platform }); }, platform);
    await nav.getByRole("button", { name: "Boards", exact: true }).click();
    await first.waitFor();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await capture("boards-" + platform + "-" + theme);
    }
  }
  await page.evaluate(() => { window.modelQA.setDatabase({ platform: "win32" }); document.documentElement.dataset.theme = "light"; });
  await nav.getByRole("button", { name: "Boards", exact: true }).click();
  await first.getByRole("button", { name: "Mark as reviewed" }).click();
  assert.deepEqual(await page.evaluate(() => window.boardsQA.reviews), [{ id: "0", through: 10 }]); await first.getByText("No new listings").waitFor();
  await first.getByRole("button", { name: "Check for updates" }).click(); await first.getByText("Reading page 2").waitFor();
  await first.getByText("20 listings checked · 20 match your instructions").waitFor();
  assert.equal(await first.getByRole("button", { name: "Edit Slack board" }).isEnabled(), false); await capture("boards-checking");
  await first.getByRole("button", { name: "Cancel check" }).click(); await first.getByRole("button", { name: "Check for updates" }).waitFor();
  await first.getByText("20 listings checked · 20 match your instructions").waitFor();
  await first.getByRole("button", { name: "Check for updates" }).click();
  await page.evaluate(() => window.boardsQA.set({ progress: [], boards: window.boardsQA.get().boards.map((board, index) => ({ ...board,
    totalCount: [19, 1, 0][index], newCount: [2, 1, 0][index], error: "", lastCheckId: 20 + index, lastCheckedAt: "2026-11-05T16:30:00Z" })) }));
  await first.getByText("2 new listings", { exact: true }).waitFor(); await first.getByText("19 listings checked · 19 match your instructions").waitFor();
  const second = page.getByRole("article", { name: "Uber", exact: true });
  await second.getByText("1 new listing", { exact: true }).waitFor(); await second.getByText("1 listings checked · 1 tracked").waitFor();
  await third.getByText("0 listings checked · 0 tracked").waitFor(); await capture("boards-updated-counts");
  await page.evaluate(() => window.boardsQA.set({ dirty: true, error: "Boards changes are saved on this computer. Use Retry save when OneDrive is ready." }));
  await page.locator(".boards-save-pending").waitFor();
  assert.equal(await first.getByRole("button", { name: "Check for updates" }).isEnabled(), false); await capture("boards-recovery");
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await page.locator(".boards-save-pending").waitFor({ state: "hidden" });
  assert.equal(await first.getByRole("button", { name: "Check for updates" }).isEnabled(), true);
  await page.getByRole("button", { name: "Check all", exact: true }).click(); assert.equal((await page.evaluate(() => window.boardsQA.get().progress)).length, 3);
  await page.evaluate(() => window.boardsQA.set({ progress: [] }));
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  const syncHint = page.getByText("Quit Zebby and let both files sync before switching computers.", { exact: true });
  await syncHint.waitFor();
  await capture("boards-settings-spacing");
  await nav.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("main", { name: "Plan", exact: true }).waitFor();
}
