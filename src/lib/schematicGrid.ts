import type { Point } from "./types";

/** Snap an octilinear polyline without distributing rounding errors through a diagonal. */
export function rasterizeSchematic(path: Point[], cellSize = 2): Point[] {
  if (!path.length) return [];
  const anchors = [path[0]];
  // Keep real turns. Distance-based simplification can erase a short corner and
  // turn a true 45-degree run into a slightly shallower line.
  for (let i = 1; i < path.length - 1; i++) {
    const before = path[i - 1],
      point = path[i],
      after = path[i + 1];
    if (
      Math.sign(point[0] - before[0]) !== Math.sign(after[0] - point[0]) ||
      Math.sign(point[1] - before[1]) !== Math.sign(after[1] - point[1])
    )
      anchors.push(point);
  }
  if (path.length > 1) anchors.push(path.at(-1)!);
  const snapped = anchors.map<Point>(([x, y]) => [
    Math.round(x / cellSize),
    Math.round(y / cellSize),
  ]);
  const out = [snapped[0]];

  function walk(end: Point) {
    let [x, y] = out.at(-1)!;
    const count = Math.max(Math.abs(end[0] - x), Math.abs(end[1] - y));
    const sx = Math.sign(end[0] - x),
      sy = Math.sign(end[1] - y);
    for (let step = 0; step < count; step++) {
      x += sx;
      y += sy;
      out.push([x, y]);
    }
  }

  for (let i = 1; i < snapped.length; i++) {
    const a = out.at(-1)!,
      b = snapped[i];
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const sx = Math.sign(dx),
      sy = Math.sign(dy);
    const diagonal = Math.min(Math.abs(dx), Math.abs(dy));
    const remainder = [dx - sx * diagonal, dy - sy * diagonal];
    const next = snapped[i + 1];
    // Put any one-cell rounding correction at a turn, preferably merging it
    // into the next straight segment. Never insert it halfway along a diagonal.
    const continuesAfter =
      next &&
      Math.sign(next[0] - b[0]) === Math.sign(remainder[0]) &&
      Math.sign(next[1] - b[1]) === Math.sign(remainder[1]);
    const corner: Point = continuesAfter
      ? [a[0] + sx * diagonal, a[1] + sy * diagonal]
      : [b[0] - sx * diagonal, b[1] - sy * diagonal];
    walk(corner);
    walk(b);
  }
  return out.map(([x, y]) => [x * cellSize, y * cellSize]);
}
