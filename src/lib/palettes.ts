export const PALETTE_IDS = [
  "amber",
  "sage",
  "ocean",
  "rose",
  "lavender",
] as const;

export type Palette = (typeof PALETTE_IDS)[number];

export function isPalette(value: unknown): value is Palette {
  return typeof value === "string" && PALETTE_IDS.some((id) => id === value);
}
