import { FONT_SCALE } from "../constants";
import { glyphFont } from "./glyphs";
import { pixelRatio } from "./utils";
import type { SubwayOptions } from "../types";
import { appendTrackTile } from "./tileGlyphs";

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
  stride: number;
  occupied: Set<string>;
  revision: number;
  visualStyle: SubwayOptions["visualStyle"];
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
        stride,
        occupied,
        revision,
        visualStyle,
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
        stride,
        cellSize,
        dpr,
        visualStyle,
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
        brush.fillStyle = visualStyle === "tiles" ? "#477a9b" : "#829094";

        const pitch = cellSize * scale * zoom;

        if (pitch <= 0) {
          return;
        }

        const originX = panX + offsetX * zoom;
        const originY = panY + offsetY * zoom;
        const firstColumn = Math.floor(-originX / pitch / stride) * stride;
        const lastColumn = Math.ceil((width - originX) / pitch);
        const firstRow = Math.floor(-originY / pitch / stride) * stride;
        const lastRow = Math.ceil((height - originY) / pitch);

        for (let row = firstRow; row <= lastRow; row += stride) {
          for (
            let column = firstColumn;
            column <= lastColumn;
            column += stride
          ) {
            if (occupied.has(`${column * cellSize},${row * cellSize}`))
              continue;
            // Deterministic world-cell selection: no sparkling or shuffling on pan.
            const hash =
              (Math.imul(column, 73856093) ^ Math.imul(row, 19349663)) >>> 0;
            const choice = hash % 20;

            if (visualStyle === "tiles") {
              if (choice < 12) continue;

              const x = originX + column * pitch;
              const y = originY + row * pitch;
              brush.globalAlpha = choice === 19 ? 0.12 : 0.045;
              brush.fillRect(x - pitch / 2, y - pitch / 2, pitch, pitch);
              brush.globalAlpha = 0.13;
              brush.beginPath();
              appendTrackTile(brush, x, y, pitch);
              brush.fill();
              continue;
            }

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
