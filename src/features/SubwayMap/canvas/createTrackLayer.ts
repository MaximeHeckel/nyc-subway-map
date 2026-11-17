import type { SubwayModel } from "../model/createSubwayModel";
import type { Viewport } from "../types";
import { CELL_SIZE, FONT_SCALE, TRACK_OPACITY } from "../constants";
import { appendSegment, strokeWidth } from "./glyphs";

export function createTrackLayer() {
  const trackPaths = new Map<string, Path2D>();
  let trackSettings = "";

  function draw(
    ctx: CanvasRenderingContext2D,
    model: SubwayModel,
    view: Viewport,
  ) {
    const { scale, offsetX, offsetY } = view;
    const asciiRevision = model.revision;
    const asciiCells = model.cells;
    const settings = `${scale}:${offsetX}:${offsetY}:${asciiRevision}`;
    const fontSize = scale * FONT_SCALE;

    if (settings !== trackSettings) {
      trackSettings = settings;
      trackPaths.clear();

      for (const cell of asciiCells) {
        const color =
          cell.colors[
            ((cell.point[0] + cell.point[1]) / CELL_SIZE) % cell.colors.length
          ];

        if (!trackPaths.has(color)) {
          trackPaths.set(color, new Path2D());
        }
        appendSegment(
          trackPaths.get(color)!,
          cell.char,
          offsetX + cell.point[0] * scale,
          offsetY + cell.point[1] * scale,
          fontSize,
        );
      }
    }
    ctx.globalAlpha = TRACK_OPACITY;
    ctx.lineWidth = strokeWidth(fontSize);
    ctx.lineCap = "butt";

    for (const [color, path] of trackPaths) {
      ctx.strokeStyle = color;
      ctx.stroke(path);
    }
  }

  return {
    draw,
    get paths() {
      return trackPaths;
    },
    get revision() {
      return trackSettings;
    },
    destroy: () => trackPaths.clear(),
  };
}
