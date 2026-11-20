export const ACCENT_COLORS = {
  ember: "Ember",
  ochre: "Ochre",
  pine: "Pine",
  harbor: "Harbor blue",
  plum: "Plum",
} as const;

export type AccentColor = keyof typeof ACCENT_COLORS;
export const DEFAULT_ACCENT: AccentColor = "ember";

export const THEME_CANVAS: Record<AccentColor, { light: string; dark: string }> = {
  ember: { light: "#f8f6f3", dark: "#24201e" },
  ochre: { light: "#f6efdf", dark: "#292519" },
  pine: { light: "#e8f1e9", dark: "#1b2822" },
  harbor: { light: "#e8f0f6", dark: "#1c2834" },
  plum: { light: "#f3eaf1", dark: "#2b222c" },
};

export function isAccentColor(value: unknown): value is AccentColor {
  return typeof value === "string" && Object.hasOwn(ACCENT_COLORS, value);
}
