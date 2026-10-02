import type { BrowserWindowConstructorOptions } from "electron";

export type Appearance = "auto" | "dark" | "light";
export const TITLEBAR_HEIGHT = 44;

export function windowColors(appearance: Appearance | undefined, systemDark: boolean) {
  const dark = appearance === "dark" || (appearance !== "light" && systemDark);
  return dark
    ? { background: "#24201e", foreground: "#f2f0ec" }
    : { background: "#f8f6f3", foreground: "#302c29" };
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
