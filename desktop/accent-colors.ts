export const ACCENT_COLORS = {
  ember: "Ember",
  ochre: "Ochre",
  pine: "Pine",
  harbor: "Harbor blue",
  plum: "Plum",
} as const;

export type AccentColor = keyof typeof ACCENT_COLORS;
export const DEFAULT_ACCENT: AccentColor = "ember";

export function isAccentColor(value: unknown): value is AccentColor {
  return typeof value === "string" && Object.hasOwn(ACCENT_COLORS, value);
}
