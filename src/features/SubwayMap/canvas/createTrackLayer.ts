import type { SubwayModel } from "../model/createSubwayModel";
import type { SubwayOptions, Viewport } from "../types";
import { CELL_SIZE, FONT_SCALE, TRACK_OPACITY } from "../constants";
import { appendSegment, strokeWidth } from "./glyphs";
import { appendTrackTile } from "./tileGlyphs";
import { getRouteTilePattern } from "./tilePatterns";

export function createTrackLayer() {
  const trackPaths = new Map<string, Path2D>();
  const tileBases = new Map<string, Path2D>();
  let trackSettings = "";

  function draw(
    ctx: CanvasRenderingContext2D,
    model: SubwayModel,
    view: Viewport,
    visualStyle: SubwayOptions["visualStyle"] = "ascii",
  ) {
    const { scale, offsetX, offsetY } = view;
    const asciiRevision = model.revision;
    const asciiCells = model.cells;
    const tiles = visualStyle === "tiles";
    const settings = `${scale}:${offsetX}:${offsetY}:${asciiRevision}:${visualStyle}`;
    const fontSize = scale * FONT_SCALE;

    if (settings !== trackSettings) {
      trackSettings = settings;
      trackPaths.clear();
      tileBases.clear();

      for (const cell of asciiCells) {
        const column = cell.point[0] / CELL_SIZE;
        const row = cell.point[1] / CELL_SIZE;
        // World coordinates keep shared-track textures stable while panning.
        // Hash both axes so diagonal corridors also show all their services.
        const hash =
          (Math.imul(column, 73856093) ^ Math.imul(row, 19349663)) >>> 0;
        const routeId = cell.routeIds[hash % cell.routeIds.length];
        const color = tiles
          ? model.phosphor[routeId]
          : cell.colors[(column + row) % cell.colors.length];

        if (!trackPaths.has(color)) {
          trackPaths.set(color, new Path2D());
          tileBases.set(color, new Path2D());
        }

        const x = offsetX + cell.point[0] * scale;
        const y = offsetY + cell.point[1] * scale;

        if (tiles) {
          const size = CELL_SIZE * scale;
          tileBases.get(color)!.rect(x - size / 2, y - size / 2, size, size);
          appendTrackTile(
            trackPaths.get(color)!,
            x,
            y,
            size,
            getRouteTilePattern(routeId),
          );
        } else {
          appendSegment(trackPaths.get(color)!, cell.char, x, y, fontSize);
        }
      }
    }

    if (tiles) {
      for (const [color, path] of trackPaths) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.12;
        ctx.fill(tileBases.get(color)!);
        ctx.globalAlpha = 0.65;
        ctx.fill(path);
      }

      return;
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
    destroy() {
      trackPaths.clear();
      tileBases.clear();
    },
  };
}
