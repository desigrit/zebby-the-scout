import { getLocalModel } from "./local-model-catalog.ts";
import type { LocalModelDownloads } from "./local-model-downloads.ts";
import type { LocalModelEngine } from "./local-model-engine.ts";

export async function deleteDownloadedModel(id: string, options: {
  engine: Pick<LocalModelEngine, "busy" | "modelId" | "stop">;
  downloads: Pick<LocalModelDownloads, "remove">;
  confirm: (dialog: ReturnType<typeof modelDeleteDialog>) => Promise<boolean>;
}) {
  const model = getLocalModel(id);
  if (options.engine.busy) throw new Error("Wait for local analysis to finish, then delete the model.");
  if (!await options.confirm(modelDeleteDialog(model.name))) return false;
  // A queued analysis could start while the native dialog is open.
  if (options.engine.busy) throw new Error("Wait for local analysis to finish, then delete the model.");
  if (options.engine.modelId === id) await options.engine.stop();
  await options.downloads.remove(id);
  return true;
}

export function modelDeleteDialog(name: string) {
  return { type: "question" as const, title: "Delete downloaded model", message: `Delete ${name} from this computer?`,
    detail: "Your saved plans, applications, resumes, and Ollama models will be kept. You can download this model again later.",
    buttons: ["Cancel", "Delete model"], defaultId: 0, cancelId: 0, noLink: true };
}
