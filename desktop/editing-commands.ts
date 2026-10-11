type Input = { type: string; key: string; control: boolean; meta: boolean; alt: boolean; shift: boolean };
export function editingCommand(input: Input, platform: string): "undo" | "redo" | "cut" | "copy" | "paste" | "pasteAndMatchStyle" | "selectAll" | undefined {
  const mac = platform === "darwin";
  if (input.type !== "keyDown" || !(mac ? input.meta && !input.control : input.control && !input.meta)) return;
  const key = input.key.toLowerCase();
  if (mac && key === "v" && input.shift) return "pasteAndMatchStyle";
  if (input.alt) return;
  if (key === "z") return input.shift ? "redo" : "undo";
  if (!mac && key === "y") return "redo";
  // macOS needs explicit editing commands when the app has no Edit menu.
  // Windows already provides standard clipboard shortcuts in text controls.
  if (mac && !input.shift) return ({ x: "cut", c: "copy", v: "paste", a: "selectAll" } as const)[key as "x" | "c" | "v" | "a"];
}
