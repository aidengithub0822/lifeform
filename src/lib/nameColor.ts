// Shared between the admin API route (server) and every place a username
// renders (client) — kept in one place so the "reserved" value can never
// drift between the two.

/** A special name_color value that renders as an animated rainbow gradient
 * instead of a flat color (see .lf-dev-name in globals.css). The admin API
 * route refuses to grant this value to anyone other than the developer
 * setting it on their OWN account — see src/app/api/admin/users/[userId]/route.ts. */
export const RESERVED_DEV_COLOR = "gradient:dev";

/** A small curated palette dev mode can hand out — keeps colors readable
 * against the app's dark background instead of an unrestricted color picker
 * producing something illegible. */
export const NAME_COLOR_PRESETS = [
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
];

export function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}
