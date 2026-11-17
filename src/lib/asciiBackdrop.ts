interface BackdropOptions {
  w: number;
  h: number;
  scale: number;
  zoom: number;
  panX: number;
  panY: number;
  ox: number;
  oy: number;
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
        w,
        h,
        scale,
        zoom,
        panX,
        panY,
        ox,
        oy,
        cellSize,
        occupied,
        revision,
      }: BackdropOptions,
    ) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const key = [w, h, scale, zoom, panX, panY, ox, oy, revision, dpr].join(
        ":",
      );
      if (key !== previousKey) {
        previousKey = key;
        image.width = Math.max(1, Math.round(w * dpr));
        image.height = Math.max(1, Math.round(h * dpr));
        const brush = image.getContext("2d")!;
        brush.setTransform(dpr, 0, 0, dpr, 0, 0);
        brush.textAlign = "center";
        brush.textBaseline = "middle";
        brush.font = `bold ${scale * zoom * 2.65}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        brush.fillStyle = "#829094";

        const pitch = cellSize * scale * zoom;
        if (pitch <= 0) return;
        const originX = panX + ox * zoom;
        const originY = panY + oy * zoom;
        const firstColumn = Math.floor(-originX / pitch);
        const lastColumn = Math.ceil((w - originX) / pitch);
        const firstRow = Math.floor(-originY / pitch);
        const lastRow = Math.ceil((h - originY) / pitch);

        for (let row = firstRow; row <= lastRow; row++) {
          for (let column = firstColumn; column <= lastColumn; column++) {
            if (occupied.has(`${column * cellSize},${row * cellSize}`))
              continue;
            // Deterministic world-cell selection: no sparkling or shuffling on pan.
            const hash =
              (Math.imul(column, 73856093) ^ Math.imul(row, 19349663)) >>> 0;
            const choice = hash % 20;
            if (choice < 8) continue;
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
      ctx.drawImage(image, 0, 0, w, h);
    },
    destroy() {
      image.width = image.height = 1;
    },
  };
}
