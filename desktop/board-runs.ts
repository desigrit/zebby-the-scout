import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BOARD_EXPLORER_VERSION, boardReaderSettingsSchema, defaultBoardReaderSettings,
  explorationActionSchema, explorationCandidateSchema, type BoardReaderSettings } from "../shared/board-exploration";
import type { Board, BoardRunPreview, BoardRunSummary } from "../shared/boards";
import type { BoardCheckpoint } from "./board-thorough";
import { writeProfileSettings } from "./settings-persistence";

const step = z.object({ action: explorationActionSchema, target: z.object({ name: z.string().max(300), role: z.string().max(60),
  kind: z.string().max(30), href: z.string().max(4000) }).optional() });
const checkpointSchema = z.object({ version: z.literal(BOARD_EXPLORER_VERSION), id: z.string().uuid(), boardId: z.string(),
  workspace: z.string(), revision: z.number().int(), baseCheckId: z.number().int().nonnegative().default(0), url: z.string().url(), provider: z.string(), model: z.string(), account: z.string(),
  instructions: z.string().max(2000), status: z.enum(["reading", "paused", "incomplete", "complete"]), pass: z.enum(["collect", "audit"]),
  calls: z.number().int().nonnegative(), reused: z.number().int().nonnegative(), steps: z.array(step).max(240), recipe: z.array(step).max(240),
  jobs: z.array(explorationCandidateSchema).max(10000), verifiedPass: z.array(explorationCandidateSchema).max(10000),
  updatedAt: z.string().datetime(), startedAt: z.string().datetime(), message: z.string().max(4000),
});
function read(file: string) { try { const text = readFileSync(file, "utf8"); return text.length <= 40_000_000 ? JSON.parse(text) : null; } catch { return null; } }

/** Recovery is profile-local. Older runs stay on disk and never change the Boards schema. */
export class BoardRuns {
  settings: BoardReaderSettings;
  private loaded = new Map<string, BoardCheckpoint | null>();
  constructor(private profile: string) {
    const settings = boardReaderSettingsSchema.safeParse(read(path.join(profile, "board-reader.json")));
    this.settings = settings.success ? settings.data : { ...defaultBoardReaderSettings };
  }
  async configure(value: unknown) {
    const settings = boardReaderSettingsSchema.parse(value);
    await writeProfileSettings(path.join(this.profile, "board-reader.json"), JSON.stringify(settings));
    this.settings = settings;
  }
  private key(workspace: string, id: string) { return createHash("sha256").update(JSON.stringify([path.resolve(workspace), id])).digest("hex"); }
  private folder(workspace: string, id: string) { return path.join(this.profile, "board-runs", this.key(workspace, id)); }
  latest(workspace: string, board: Board): BoardCheckpoint | null {
    if (!workspace) return null;
    const key = this.key(workspace, board.id);
    if (!this.loaded.has(key)) {
      const folder = this.folder(workspace, board.id), index = z.string().uuid().safeParse(read(path.join(folder, "latest.json")));
      const result = index.success ? checkpointSchema.safeParse(read(path.join(folder, index.data + ".json"))) : null;
      const checkpoint = result?.success ? result.data as BoardCheckpoint : null;
      if (checkpoint?.status === "reading") { checkpoint.status = "paused"; checkpoint.message = "The app closed before this check finished. Resume when ready"; }
      this.loaded.set(key, checkpoint);
    }
    const checkpoint = this.loaded.get(key);
    if (checkpoint && checkpoint.status !== "complete" && board.lastCheckId > checkpoint.baseCheckId) return null;
    return checkpoint && checkpoint.workspace === workspace && checkpoint.boardId === board.id && checkpoint.revision === board.revision &&
      checkpoint.url === board.url && checkpoint.instructions === board.instructions ? checkpoint : null;
  }
  async save(checkpoint: BoardCheckpoint) {
    checkpointSchema.parse(checkpoint);
    const folder = this.folder(checkpoint.workspace, checkpoint.boardId);
    await mkdir(folder, { recursive: true });
    await writeProfileSettings(path.join(folder, checkpoint.id + ".json"), JSON.stringify(checkpoint));
    await writeProfileSettings(path.join(folder, "latest.json"), JSON.stringify(checkpoint.id));
    this.loaded.set(this.key(checkpoint.workspace, checkpoint.boardId), checkpoint);
  }
  summary(workspace: string, board: Board): BoardRunSummary | null {
    const run = this.latest(workspace, board);
    if (!run || run.status === "complete") return null;
    return { boardId: board.id, status: run.status, found: run.jobs.length, modelCalls: run.calls - run.reused, message: run.message,
      updatedAt: run.updatedAt, canResume: run.status !== "reading", criteriaPending: Boolean(board.instructions) };
  }
  preview(workspace: string, board: Board): BoardRunPreview | null {
    const summary = this.summary(workspace, board), run = this.latest(workspace, board);
    return summary && run ? { summary, listings: run.jobs } : null;
  }
}
