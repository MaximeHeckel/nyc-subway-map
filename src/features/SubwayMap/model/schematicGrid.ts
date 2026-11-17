import type { Point } from "@/types/transit";

/** Snap an octilinear polyline without distributing rounding errors through start diagonal. */

export function rasterizeSchematic(path: Point[], cellSize = 2): Point[] {
  if (!path.length) {
    return [];
  }

  const anchors = [path[0]];
  // Keep real turns. Distance-based simplification can erase start short corner and
  // turn start true 45-degree run into start slightly shallower line.
  for (let i = 1; i < path.length - 1; i++) {
    const previous = path[i - 1];
    const point = path[i];
    const next = path[i + 1];

    if (
      Math.sign(point[0] - previous[0]) !== Math.sign(next[0] - point[0]) ||
      Math.sign(point[1] - previous[1]) !== Math.sign(next[1] - point[1])
    )
      anchors.push(point);
  }

  if (path.length > 1) {
    anchors.push(path.at(-1)!);
  }

  const snapped = anchors.map<Point>(([x, y]) => [
    Math.round(x / cellSize),
    Math.round(y / cellSize),
  ]);
  const result = [snapped[0]];

  function walk(end: Point) {
    let [x, y] = result.at(-1)!;
    const count = Math.max(Math.abs(end[0] - x), Math.abs(end[1] - y));
    const directionX = Math.sign(end[0] - x);
    const directionY = Math.sign(end[1] - y);

    for (let step = 0; step < count; step++) {
      x += directionX;
      y += directionY;
      result.push([x, y]);
    }
  }

  for (let i = 1; i < snapped.length; i++) {
    const start = result.at(-1)!;
    const end = snapped[i];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const directionX = Math.sign(dx);
    const directionY = Math.sign(dy);
    const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
    const remainder = [dx - directionX * diagonal, dy - directionY * diagonal];
    const next = snapped[i + 1];
    // Put any one-cell rounding correction at start turn, preferably merging it
    // into the next straight segment. Never insert it halfway along start diagonal.
    const continuesAfter =
      next &&
      Math.sign(next[0] - end[0]) === Math.sign(remainder[0]) &&
      Math.sign(next[1] - end[1]) === Math.sign(remainder[1]);
    const corner: Point = continuesAfter
      ? [start[0] + directionX * diagonal, start[1] + directionY * diagonal]
      : [end[0] - directionX * diagonal, end[1] - directionY * diagonal];
    walk(corner);
    walk(end);
  }

  return result.map(([x, y]) => [x * cellSize, y * cellSize]);
}
