/** Six-pixel tiles repeat cleanly across neighboring map cells. */
export const tilePatterns = {
  checker: ["101010", "010101", "101010", "010101", "101010", "010101"],
  dots: ["000000", "011000", "011000", "000000", "000011", "000011"],
  horizontal: ["000000", "111111", "000000", "000000", "111111", "000000"],
  vertical: ["010010", "010010", "010010", "010010", "010010", "010010"],
  forward: ["100100", "001001", "010010", "100100", "001001", "010010"],
  backward: ["100100", "010010", "001001", "100100", "010010", "001001"],
  bricks: ["111111", "100000", "100000", "111111", "000100", "000100"],
  waves: ["000000", "110001", "001110", "000000", "110001", "001110"],
  crosses: ["000000", "001000", "011100", "001000", "000000", "000000"],
  diamonds: ["001000", "010100", "100010", "010100", "001000", "000000"],
  frame: ["000000", "011110", "010010", "010010", "011110", "000000"],
  weave: ["110110", "110110", "001001", "110110", "110110", "001001"],
} as const;

export type TilePattern = keyof typeof tilePatterns;

// Explicit assignments stay stable when services are filtered or reordered.
// Services sharing a color use different textures.
export const routeTilePatterns: Readonly<Record<string, TilePattern>> = {
  "1": "dots",
  "2": "forward",
  "3": "bricks",
  "4": "vertical",
  "5": "waves",
  "6": "crosses",
  "7": "diamonds",
  A: "forward",
  C: "checker",
  E: "horizontal",
  B: "dots",
  D: "backward",
  F: "bricks",
  M: "frame",
  G: "weave",
  J: "horizontal",
  Z: "vertical",
  L: "waves",
  N: "checker",
  Q: "diamonds",
  R: "vertical",
  W: "crosses",
  ST: "frame",
  SF: "dots",
  SR: "backward",
  SIR: "weave",
};

export function getRouteTilePattern(routeId: string): TilePattern {
  return routeTilePatterns[routeId] ?? "checker";
}
