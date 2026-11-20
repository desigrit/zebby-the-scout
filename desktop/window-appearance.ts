import type { BrowserWindowConstructorOptions } from "electron";
import { DEFAULT_ACCENT, THEME_CANVAS, type AccentColor } from "./accent-colors.ts";

export type Appearance = "auto" | "dark" | "light";
export const TITLEBAR_HEIGHT = 44;

export function windowColors(appearance: Appearance | undefined, systemDark: boolean, theme: AccentColor = DEFAULT_ACCENT) {
  const dark = appearance === "dark" || (appearance !== "light" && systemDark);
  return { background: THEME_CANVAS[theme][dark ? "dark" : "light"], foreground: dark ? "#f2f0ec" : "#302c29" };
}

export function nativeWindowShell(platform: NodeJS.Platform, appearance: Appearance | undefined, systemDark: boolean, theme: AccentColor = DEFAULT_ACCENT):
  Pick<BrowserWindowConstructorOptions, "backgroundColor" | "titleBarStyle" | "titleBarOverlay" | "trafficLightPosition"> {
  const colors = windowColors(appearance, systemDark, theme);
  return {
    backgroundColor: colors.background,
    titleBarStyle: platform === "darwin" ? "hiddenInset" : "hidden",
    titleBarOverlay: platform === "darwin" ? { height: TITLEBAR_HEIGHT }
      : { height: TITLEBAR_HEIGHT, color: colors.background, symbolColor: colors.foreground },
    ...(platform === "darwin" ? { trafficLightPosition: { x: 18, y: 16 } } : {}),
  };
}
