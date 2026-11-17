import { FONT_SCALE } from "../constants";
import { glyphFont } from "./glyphs";
import { pixelRatio } from "./utils";

interface BackdropOptions {
  width: number;
  height: number;
  scale: number;
  zoom: number;
  panX: number;
  panY: number;
  offsetX: number;
  offsetY: number;
  cellSize: number;
  occupied: Set<string>;
  revision: number;
}

/** Sparse punctuation on the same lattice as the route characters. */

export function createAsciiBackdrop() {
  const image = document.createElement("canvas");
  let previousKey = "";

  return {
    draw(
      ctx: CanvasRenderingContext2D,
      {
        width,
        height,
        scale,
        zoom,
        panX,
        panY,
        offsetX,
        offsetY,
        cellSize,
        occupied,
        revision,
      }: BackdropOptions,
    ) {
      const dpr = pixelRatio();
      const key = [
        width,
        height,
        scale,
        zoom,
        panX,
        panY,
        offsetX,
        offsetY,
        revision,
        dpr,
      ].join(":");

      if (key !== previousKey) {
        previousKey = key;
        image.width = Math.max(1, Math.round(width * dpr));
        image.height = Math.max(1, Math.round(height * dpr));
        const brush = image.getContext("2d")!;
        brush.setTransform(dpr, 0, 0, dpr, 0, 0);
        brush.textAlign = "center";
        brush.textBaseline = "middle";
        brush.font = glyphFont(scale * zoom * FONT_SCALE);
        brush.fillStyle = "#829094";

        const pitch = cellSize * scale * zoom;

        if (pitch <= 0) {
          return;
        }

        const originX = panX + offsetX * zoom;
        const originY = panY + offsetY * zoom;
        const firstColumn = Math.floor(-originX / pitch);
        const lastColumn = Math.ceil((width - originX) / pitch);
        const firstRow = Math.floor(-originY / pitch);
        const lastRow = Math.ceil((height - originY) / pitch);

        for (let row = firstRow; row <= lastRow; row++) {
          for (let column = firstColumn; column <= lastColumn; column++) {
            if (occupied.has(`${column * cellSize},${row * cellSize}`))
              continue;
            // Deterministic world-cell selection: no sparkling or shuffling on pan.
            const hash =
              (Math.imul(column, 73856093) ^ Math.imul(row, 19349663)) >>> 0;
            const choice = hash % 20;

            if (choice < 8) {
              continue;
            }

            const character = choice === 19 ? "+" : choice === 18 ? ":" : "·";
            brush.globalAlpha = character === "·" ? 0.11 : 0.065;
            brush.fillText(
              character,
              originX + column * pitch,
              originY + row * pitch,
            );
          }
        }
      }
      ctx.drawImage(image, 0, 0, width, height);
    },
    destroy() {
      image.width = image.height = 1;
    },
  };
}
