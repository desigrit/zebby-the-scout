import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function checkBoardsRenderer(page, nav) {
  const output = path.resolve(".impeccable/review"); await mkdir(output, { recursive: true });
  await page.evaluate(() => {
    let state = { filePath: "OneDrive/Work-boards.sqlite", filename: "Work-boards.sqlite", dirty: false, error: "", boards: [], progress: [] };
    const listeners = new Set(), publish = () => { for (const listener of listeners) listener(structuredClone(state)); };
    window.boardsQA = { get: () => state, set: change => { state = { ...state, ...change }; publish(); }, checks: [], reviews: [], listingCalls: [], failedAdd: false };
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
      markBoardReviewed: async (id, through) => {
        window.boardsQA.reviews.push({ id, through });
        if (window.boardsQA.deferReview) await new Promise(resolve => { window.boardsQA.finishReview = resolve; });
        if (window.boardsQA.reviewError) throw new Error("The review could not be saved. Try again.");
        state.boards.find(board => board.id === id).newCount = 0; publish(); return state;
      },
      boardListings: async (id, checkId, filter, offset = 0) => {
        window.boardsQA.listingCalls.push({ id, filter, offset });
        if (window.boardsQA.listingError) throw new Error("The saved listings could not be opened. Try again.");
        const board = state.boards.find(item => item.id === id), count = filter === "new" ? board.newCount : filter === "matches" ? 7 : 59;
        return { checkId, total: count, offset, listings: Array.from({ length: Math.min(50, Math.max(0, count - offset)) }, (_, i) => ({
          key: String(offset + i), url: i === 0 ? "https://salesforce.wd12.myworkdayjobs.com/en-US/Slack/job/Seattle/Senior-Product-Manager--Slack_JR123" : "https://example.org/jobs/" + (offset + i),
          title: i === 0 ? "Apply" : i < 3 ? "Senior Product Manager, Commerce" : "Sr. Product Manager, Premium Content Experience",
          department: "Community Growth", location: ["San Francisco, CA", "Seattle, WA", "Irvine, CA", "Los Angeles, CA", "New York City"][i % 5],
          matches: filter === "new" || i < 7, current: true, unread: filter === "new" })) };
      },
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
  assert.equal(await page.locator(".board-row").getByText("Custom instructions", { exact: true }).count(), 3);
  assert.equal(await page.locator(".board-row").getByText(seniorRoles, { exact: true }).count(), 0);
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
  await first.getByText("Custom instructions", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.boardsQA.get().boards[0].instructions), seniorRoles, "Cancel preserves the full saved instructions");
  await first.getByText("20 listings checked", { exact: true }).waitFor();
  await page.evaluate(() => window.boardsQA.set({ boards: window.boardsQA.get().boards.map((board, index) => index === 0 ? { ...board, totalCount: 7, checkedCount: 59 } : board) }));
  await first.getByText("7 listings checked", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^View (listings|matches)$/ }).count(), 0);
  assert.equal(await page.getByText("59 listings checked", { exact: false }).count(), 0, "Only matching listings contribute to the visible count");
  assert.equal(await page.locator(".board-check-error").count(), 0);
  const incomplete = third.getByRole("button", { name: "Check incomplete", exact: true });
  const tip = page.getByRole("tooltip"), errorMessage = "The board's results did not finish loading. The last successful check is unchanged.";
  const rowHeight = await third.evaluate(element => element.getBoundingClientRect().height);
  assert.equal(await tip.count(), 0, "Error details stay hidden until requested");
  await incomplete.hover(); await tip.getByText(errorMessage, { exact: true }).waitFor();
  assert.equal(await third.evaluate(element => element.getBoundingClientRect().height), rowHeight, "Error disclosure never expands the row");
  await tip.hover(); await page.waitForTimeout(180); assert.equal(await tip.isVisible(), true, "The pointer can move into the tooltip");
  await capture("boards-tooltip-light");
  await page.keyboard.press("Escape"); await tip.waitFor({ state: "hidden" });
  await incomplete.focus(); await tip.waitFor();
  assert.equal(await incomplete.getAttribute("aria-describedby"), await tip.getAttribute("id"));
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; }); await capture("boards-tooltip-dark");
  await page.keyboard.press("Escape"); await tip.waitFor({ state: "hidden" });
  assert.equal(await incomplete.evaluate(node => node === document.activeElement), true, "Escape keeps focus on the status");
  await page.setViewportSize({ width: 790, height: 620 });
  await incomplete.click(); await tip.waitFor();
  const box = await tip.boundingBox(); assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 790 && box.y + box.height <= 620);
  await capture("boards-tooltip-compact-dark");
  assert.equal(await tip.isVisible(), true, "The tooltip remains open after focus scrolls its row into view");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; }); await capture("boards-tooltip-compact-light");
  assert.equal(await tip.isVisible(), true);
  await page.keyboard.press("Escape"); await page.setViewportSize({ width: 1550, height: 850 });
  await first.getByRole("button", { name: "4 new listings", exact: true }).click();
  const listingSection = first.getByRole("region", { name: "Slack new listings" });
  await listingSection.getByRole("link", { name: "Senior Product Manager Slack", exact: true }).waitFor();
  assert.equal(await listingSection.locator(".board-listing-items li").count(), 4);
  assert.equal(await listingSection.getByText("Apply", { exact: true }).count(), 0, "Previously saved CTA labels recover their Workday role name");
  assert.equal(await listingSection.getByRole("heading").count(), 0, "Expanded listings start directly with role rows");
  assert.equal(await listingSection.locator(".board-listings-pagination").count(), 0, "Single-page results need no range footer");
  assert.equal(await listingSection.getByRole("button", { name: /^(All checked|Matches|New)$/ }).count(), 0);
  assert.equal(await listingSection.evaluate(node => node === document.activeElement), true);
  await capture("boards-listings-light");
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; }); await capture("boards-listings-dark");
  await page.setViewportSize({ width: 790, height: 620 }); await capture("boards-listings-compact-dark");
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; }); await capture("boards-listings-compact-light");
  await page.setViewportSize({ width: 1550, height: 850 });
  await page.evaluate(() => window.boardsQA.set({ boards: window.boardsQA.get().boards.map((board, index) => index === 0 ? { ...board, newCount: 59, totalCount: 59 } : board) }));
  await listingSection.getByText("1-50 of 59", { exact: true }).waitFor();
  await listingSection.getByRole("button", { name: "Next", exact: true }).click();
  await listingSection.getByText("51-59 of 59", { exact: true }).waitFor();
  assert.equal(await listingSection.getByRole("button", { name: "Next", exact: true }).isEnabled(), false);
  await page.evaluate(() => { window.boardsQA.listingError = true;
    window.boardsQA.set({ boards: window.boardsQA.get().boards.map((board, index) => index === 0 ? { ...board, newCount: 4, totalCount: 7 } : board) }); });
  await listingSection.getByRole("alert").waitFor(); await capture("boards-listings-error");
  await page.evaluate(() => { window.boardsQA.listingError = false; });
  await listingSection.getByRole("button", { name: "Retry", exact: true }).click();
  await listingSection.getByRole("link", { name: "Senior Product Manager Slack", exact: true }).waitFor();
  await listingSection.getByRole("button", { name: "Close listings", exact: true }).click();
  assert.equal(await first.getByRole("button", { name: "4 new listings", exact: true }).evaluate(node => node === document.activeElement), true);
  assert.ok((await page.evaluate(() => window.boardsQA.listingCalls)).every(call => call.filter === "new"), "Only new matching listings are requested");
  await page.evaluate(() => window.boardsQA.set({ boards: window.boardsQA.get().boards.map((board, index) => index === 0 ? { ...board, totalCount: 20, checkedCount: undefined } : board) }));
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
  await first.getByRole("button", { name: "4 new listings", exact: true }).click(); await listingSection.waitFor();
  const review = first.getByRole("button", { name: "Mark as reviewed", exact: true });
  await review.hover(); await tip.waitFor();
  assert.equal(await tip.textContent(), "Mark as reviewed");
  const reviewBox = await review.boundingBox(), reviewTip = await tip.boundingBox();
  assert.ok(reviewTip.y + reviewTip.height < reviewBox.y, "The review tooltip appears above its icon");
  const discoveryBox = await first.locator(".board-discoveries").boundingBox();
  assert.ok(Math.abs(reviewBox.y - discoveryBox.y) < 6 && reviewBox.x > discoveryBox.x, "The review icon sits beside the discovery link");
  await capture("boards-polish-review-tooltip");
  await page.keyboard.press("Escape"); await tip.waitFor({ state: "hidden" });
  await page.evaluate(() => { window.boardsQA.deferReview = true; window.boardsQA.reviewError = true; });
  await review.click(); await first.locator('.board-review-action[aria-busy="true"] .spin').waitFor();
  assert.equal(await review.isEnabled(), false, "Repeated clicks cannot submit duplicate reviews");
  assert.equal(await first.getByRole("button", { name: "4 new listings", exact: true }).isVisible(), true, "Counts stay visible until the save succeeds");
  await capture("boards-polish-review-saving");
  await page.evaluate(() => window.boardsQA.finishReview());
  await page.getByRole("alert").filter({ hasText: "The review could not be saved" }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.board-review-action')?.disabled);
  assert.equal(await first.getByRole("button", { name: "4 new listings", exact: true }).isVisible(), true);
  assert.equal(await listingSection.isVisible(), true, "A failed review preserves the expanded listings");
  await page.evaluate(() => { window.boardsQA.reviewError = false; });
  await review.click(); await first.locator('.board-review-action[aria-busy="true"] .spin').waitFor();
  await page.evaluate(() => {
    window.boardsQA.sawReviewExit = false;
    document.addEventListener("animationstart", event => { if (event.animationName === "board-review-done") window.boardsQA.sawReviewExit = true; });
    window.boardsQA.finishReview();
  });
  await page.waitForFunction(() => window.boardsQA.sawReviewExit);
  await review.waitFor({ state: "hidden" });
  assert.deepEqual(await page.evaluate(() => window.boardsQA.reviews), [{ id: "0", through: 10 }, { id: "0", through: 10 }]); await first.getByText("No new listings").waitFor();
  await listingSection.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.id === "board-check-0");
  await capture("boards-polish-reviewed");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => { window.boardsQA.deferReview = false; window.boardsQA.sawReviewExit = false;
    window.boardsQA.set({ boards: window.boardsQA.get().boards.map((board, index) => index === 0 ? { ...board, newCount: 1 } : board) }); });
  await review.click(); await review.waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => window.boardsQA.sawReviewExit), false, "Reduced motion skips the exit animation");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await first.getByRole("button", { name: "Check for updates" }).click(); await first.getByText("Reading page 2").waitFor();
  assert.equal(await first.locator(".board-match-total").count(), 0, "Current progress replaces the old count during a recheck");
  assert.equal(await first.locator(".board-update-summary > :nth-child(2)").textContent(), "Reading page 2");
  assert.equal(await first.getByRole("button", { name: "Edit Slack board" }).isEnabled(), false); await capture("boards-checking");
  await first.getByRole("button", { name: "Cancel check" }).click(); await first.getByRole("button", { name: "Check for updates" }).waitFor();
  await first.getByText("20 listings checked", { exact: true }).waitFor();
  await first.getByRole("button", { name: "Check for updates" }).click();
  await page.evaluate(() => window.boardsQA.set({ progress: [], boards: window.boardsQA.get().boards.map((board, index) => ({ ...board,
    totalCount: [19, 1, 0][index], newCount: [2, 1, 0][index], error: "", lastCheckId: 20 + index, lastCheckedAt: "2026-11-05T16:30:00Z" })) }));
  await first.getByText("2 new listings", { exact: true }).waitFor(); await first.getByText("19 listings checked", { exact: true }).waitFor();
  const second = page.getByRole("article", { name: "Uber", exact: true });
  await second.getByText("1 new listing", { exact: true }).waitFor(); await second.getByText("1 listing checked", { exact: true }).waitFor();
  await third.getByText("0 listings checked", { exact: true }).waitFor();
  assert.equal(await third.getByRole("button", { name: /new listings?/ }).count(), 0, "Zero matches never show a discovery link");
  await capture("boards-updated-counts");
  await page.evaluate(() => window.boardsQA.set({ boards: window.boardsQA.get().boards.map((board, index) => ({ ...board,
    error: index === 0 || index === 2 ? "This careers website is temporarily unavailable. Try again later. Your last successful check is unchanged." : "",
    ...(index === 2 ? { lastCheckedAt: "", lastCheckId: 0 } : {}) })) }));
  await first.getByRole("button", { name: "2 new listings", exact: true }).waitFor();
  await first.getByRole("button", { name: "Check incomplete", exact: true }).waitFor();
  await first.getByText("19 listings checked", { exact: true }).waitFor();
  await third.getByRole("button", { name: "Check incomplete", exact: true }).waitFor();
  assert.equal(await third.locator(".board-match-total").count(), 0, "A failed first check has no successful count");
  await capture("boards-error-with-new");
  await page.evaluate(() => window.boardsQA.set({ boards: window.boardsQA.get().boards.map((board, index) => ({ ...board, error: "", lastCheckId: 20 + index, lastCheckedAt: "2026-11-05T16:30:00Z" })) }));
  await page.evaluate(() => window.boardsQA.set({ dirty: true, error: "Boards changes are saved on this computer. Use Retry save when OneDrive is ready." }));
  await page.locator(".boards-save-pending").waitFor();
  assert.equal(await first.getByRole("button", { name: "Check for updates" }).isEnabled(), false); await capture("boards-recovery");
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await page.locator(".boards-save-pending").waitFor({ state: "hidden" });
  assert.equal(await first.getByRole("button", { name: "Check for updates" }).isEnabled(), true);
  await page.getByRole("button", { name: "Check all", exact: true }).click(); assert.equal((await page.evaluate(() => window.boardsQA.get().progress)).length, 3);
  await page.evaluate(() => window.boardsQA.set({ progress: [] }));
  const savedBoards = await page.evaluate(() => structuredClone(window.boardsQA.get().boards));
  await page.evaluate(() => window.boardsQA.set({ boards: window.boardsQA.get().boards.map((board, index) => ({ ...board,
    newCount: 0, error: "", instructions: index === 0
      ? "Only track Product Manager or Senior Product Manager roles. Ignore Principal, Staff, Director, Sr Manager and Group roles. ".repeat(10).trim()
      : index === 2 ? "Look under the Product heading for product manager roles." : "" })) }));
  assert.equal(await page.locator(".board-instructions-indicator svg").count(), 0, "Instructions use a text label without an icon");
  for (const width of [1550, 1325, 1050, 790]) {
    await page.setViewportSize({ width, height: width === 790 ? 620 : 850 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.querySelector(".desktop-workspace").scrollTop = 0; }, theme);
      await capture("boards-instructions-" + width + "-" + theme);
      const heights = await page.locator(".board-row").evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
      assert.ok(Math.max(...heights) - Math.min(...heights) < 1, "Instruction length does not change row height");
      const badge = await first.locator(".board-instructions-indicator").evaluate(node => ({ background: getComputedStyle(node).backgroundColor, radius: getComputedStyle(node).borderRadius }));
      assert.notEqual(badge.background, "rgba(0, 0, 0, 0)"); assert.equal(badge.radius, "4px");
    }
  }
  await page.evaluate(() => window.boardsQA.set({ boards: window.boardsQA.get().boards.map((board, index) => ({ ...board, newCount: index === 0 ? 2 : 0 })),
    progress: [{ boardId: "1", requestId: "1", phase: "reading", message: "Finding the job results" }, { boardId: "2", requestId: "2", phase: "queued", message: "Waiting to check" }] }));
  for (const width of [1550, 1325, 1050, 790]) {
    await page.setViewportSize({ width, height: width === 790 ? 620 : 850 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.querySelector(".desktop-workspace").scrollTop = 0; }, theme);
      await capture("boards-polish-mixed-" + width + "-" + theme);
    }
  }
  await page.evaluate(() => window.boardsQA.set({ progress: [] }));
  await page.setViewportSize({ width: 1550, height: 850 });
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await first.getByRole("button", { name: "Edit Slack board" }).click();
  await capture("boards-instructions-edit");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.evaluate(boards => window.boardsQA.set({ boards }), savedBoards);
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  const syncHint = page.getByText("Quit Zebby and let both files sync before switching computers.", { exact: true });
  await syncHint.waitFor();
  await capture("boards-settings-spacing");
  await nav.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("main", { name: "Plan", exact: true }).waitFor();
}
