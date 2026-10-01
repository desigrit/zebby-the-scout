import type { BrowserWindowConstructorOptions } from "electron";

export type Appearance = "auto" | "dark" | "light";
export const TITLEBAR_HEIGHT = 44;

export function windowColors(appearance: Appearance | undefined, systemDark: boolean) {
  const dark = appearance === "dark" || (appearance !== "light" && systemDark);
  return dark
    ? { background: "#1d1f24", foreground: "#f0f1f4" }
    : { background: "#f4f5f7", foreground: "#23252a" };
}

export function nativeWindowShell(platform: NodeJS.Platform, appearance: Appearance | undefined, systemDark: boolean):
  Pick<BrowserWindowConstructorOptions, "backgroundColor" | "titleBarStyle" | "titleBarOverlay" | "trafficLightPosition"> {
  const colors = windowColors(appearance, systemDark);
  return {
    backgroundColor: colors.background,
    titleBarStyle: platform === "darwin" ? "hiddenInset" : "hidden",
    titleBarOverlay: platform === "darwin" ? { height: TITLEBAR_HEIGHT }
      : { height: TITLEBAR_HEIGHT, color: colors.background, symbolColor: colors.foreground },
    ...(platform === "darwin" ? { trafficLightPosition: { x: 18, y: 16 } } : {}),
  };
}
