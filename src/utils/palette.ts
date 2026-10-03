export interface PlayerTheme {
  id: string;
  label: string;
  hex: string;
  deep: string;
  soft: string;
  ink: string;
}

/** Seat order matches the four-player board: top-left, top-right, bottom-right, bottom-left. */
export const PLAYER_THEMES: PlayerTheme[] = [
  { id: "yellow", label: "زرد", hex: "#f0c400", deep: "#b8860b", soft: "#ffe56a", ink: "#3d2e00" },
  { id: "blue", label: "آبی", hex: "#1f7ae0", deep: "#0d4e9c", soft: "#8ec2ff", ink: "#041833" },
  { id: "green", label: "سبز", hex: "#2fae3f", deep: "#176b24", soft: "#8be09a", ink: "#04210c" },
  { id: "red", label: "قرمز", hex: "#e23b32", deep: "#9d1c16", soft: "#ff9b96", ink: "#3b0907" },
  { id: "orange", label: "نارنجی", hex: "#f08a12", deep: "#a35208", soft: "#ffc56a", ink: "#3b2204" },
  { id: "purple", label: "بنفش", hex: "#8b4dff", deep: "#5b21b6", soft: "#d4b8ff", ink: "#2e1065" },
];

export function themeFor(seat: number): PlayerTheme {
  return PLAYER_THEMES[seat % PLAYER_THEMES.length];
}

export function faDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}
