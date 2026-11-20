import { tilePatterns, type TilePattern } from "./tilePatterns";

/** Small bitmap glyphs stay independent of font metrics and align to the map grid. */
const arrow = [
  "0001000",
  "0001100",
  "1111110",
  "1111111",
  "1111110",
  "0001100",
  "0001000",
];

const diagonalArrow = [
  "0011111",
  "0001111",
  "0011111",
  "0111111",
  "1111101",
  "1111000",
  "0110000",
];

export function appendTileArrow(
  target: CanvasPath,
  character: string,
  x: number,
  y: number,
  size: number,
) {
  const diagonal = "↗↘↙↖".includes(character);
  const turns = Math.max(0, (diagonal ? "↗↘↙↖" : "→↓←↑").indexOf(character));
  const bitmap = diagonal ? diagonalArrow : arrow;
  const pixel = size / 7;

  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 7; column++) {
      if (bitmap[row][column] !== "1") continue;

      let dx = column - 3;
      let dy = row - 3;

      for (let turn = 0; turn < turns; turn++) {
        [dx, dy] = [-dy, dx];
      }

      target.rect(x + (dx - 0.5) * pixel, y + (dy - 0.5) * pixel, pixel, pixel);
    }
  }
}

/** Bitmap textures, like the shaded block characters in a terminal tileset. */
export function appendTrackTile(
  target: CanvasPath,
  x: number,
  y: number,
  size: number,
  pattern: TilePattern = "checker",
) {
  const bitmap = tilePatterns[pattern];
  const pixel = size / 6;

  for (let row = 0; row < 6; row++) {
    for (let column = 0; column < 6; column++) {
      if (bitmap[row][column] !== "1") continue;

      target.rect(
        x - size / 2 + column * pixel,
        y - size / 2 + row * pixel,
        pixel * 0.85,
        pixel * 0.85,
      );
    }
  }
}
